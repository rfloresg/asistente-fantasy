// Webhook del bot de Telegram (se configura con npm run telegram:webhook).
// Todo se hace aquí, sin pasar por la web:
// - En privado: /start te da ya el botón para entrar en LaLiga; le devuelves la página de jwt.ms y quedas conectado.
//   Luego, un botón para meter el Espía en el grupo de tu liga. /web te da un enlace para entrar en la web.
//   /opinion (o el botón "Dar mi opinión") manda lo que escribas al administrador.
//   Con MAX_USUARIOS, cuando la beta está llena no deja conectar a nadie nuevo y avisa al administrador.
// - En un grupo: al meter el bot, si quien lo mete ya está conectado, se activa solo (o elige la liga con un botón).
import { NextResponse } from "next/server";
import { getDb, type Db } from "@/db";
import { feedback } from "@/db/schema";
import { adminChat } from "@/lib/admin";
import { ConnectError, findCallback, finishConnect, startConnect } from "@/lib/conectar";
import { dispatchPlan } from "@/lib/github";
import { APP_URL, botLoginUrl } from "@/lib/grupo";
import { activateGroup, activatedText, telegramLeagues } from "@/lib/grupo-activar";
import { canJoin, seats } from "@/lib/plazas";
import { userForTelegram } from "@/lib/users";

type From = { id: number; first_name?: string; last_name?: string; username?: string };
type Chat = { id: number; type: string; title?: string };
type Update = {
  message?: { chat: Chat; text?: string; from?: From; reply_to_message?: { text?: string; from?: { is_bot?: boolean } } };
  callback_query?: { id: string; data?: string; from: From; message?: { chat: Chat; message_id: number } };
  my_chat_member?: { chat: Chat; from: From; old_chat_member?: { status?: string }; new_chat_member?: { status?: string } };
};
type Button = { text: string; url?: string; callback_data?: string };

const tg = (method: string, body: object) =>
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

const markup = (buttons: Button[][]) => (buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
const reply = (chatId: number, text: string, buttons: Button[][] = []) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...markup(buttons) });
const edit = (chatId: number, messageId: number, text: string, buttons: Button[][] = []) =>
  tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true, ...markup(buttons) });
const alert = (id: string, text: string) => tg("answerCallbackQuery", { callback_query_id: id, text, show_alert: true });

const nameOf = (f?: From) => [f?.first_name, f?.last_name].filter(Boolean).join(" ") || f?.username || "Mánager";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bot = () => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? "";
const addToGroup = (): Button => ({ text: "🕵️ Meter el Espía en el grupo de mi liga", url: `https://t.me/${bot()}?startgroup=espia` });
const webButton = (chatId: number, from?: From): Button => ({ text: "🌐 Ver mi plan en la web", url: botLoginUrl(String(chatId), nameOf(from), "/") });

const opinionButton: Button = { text: "💬 Dar mi opinión", callback_data: "opinion" };
const OPINION_ASK = "💬 Cuéntame qué tal: qué falla, qué no se entiende o qué echas de menos. Escríbelo respondiendo a este mensaje.";

const askOpinion = (chatId: number) =>
  tg("sendMessage", { chat_id: chatId, text: OPINION_ASK, reply_markup: { force_reply: true, input_field_placeholder: "Tu opinión…" } });

async function saveOpinion(db: Db, chatId: number, from: From | undefined, text: string) {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return askOpinion(chatId);
  const user = await userForTelegram(db, String(chatId), nameOf(from));
  await db.insert(feedback).values({ userId: user.id, name: user.name, text: clean, createdAt: new Date() });
  const admin = await adminChat(db);
  if (admin && admin !== String(chatId)) {
    await reply(Number(admin), `💬 <b>Opinión de ${esc(user.name)}</b>${from?.username ? ` (@${esc(from.username)})` : ""}\n\n${esc(clean)}`);
  }
  await reply(chatId, "🙌 ¡Gracias! Le ha llegado a quien lo ha montado. Si hace falta, te contesta por aquí.");
}

const CONNECT = `🕵️ <b>Asistente Fantasy</b>

Cada día te digo a quién <b>proteger</b>, por quién <b>pujar</b>, a quién <b>vender</b> y tu <b>mejor once</b>. Y en el grupo de tu liga, un Espía que cuenta cada fichaje, venta y cláusula.

<b>CONECTA TU LALIGA</b> · 1 minuto

1️⃣ Pulsa <b>Entrar en LaLiga</b> (abajo) y entra como siempre.

2️⃣ Al terminar verás una página de Microsoft que pone <b>jwt.ms</b>. Parece vacía.
⚠️ <b>NO LA CIERRES. ES NORMAL.</b>

3️⃣ <b>COMPÁRTEMELA:</b> botón compartir → <b>Telegram</b> → <b>este chat</b>.
      ¿No ves compartir? Copia la dirección y pégamela aquí.

👇 Te dejo una imagen de cómo se hace.

🔒 Tu contraseña la escribes en LaLiga: yo nunca la veo. Solo leo; nunca ficho ni vendo.`;

const HELP_IMAGE = `${APP_URL}/promo/como-conectar.png`;
const sendHelp = (chatId: number, caption: string) =>
  tg("sendPhoto", { chat_id: chatId, photo: HELP_IMAGE, caption, parse_mode: "HTML" });


// /start en privado: si no estás conectado, el botón de LaLiga directamente; si lo estás, lo siguiente que toca
async function start(db: Db, chatId: number, from?: From, force = false) {
  const user = await userForTelegram(db, String(chatId), nameOf(from));
  const mine = force ? null : await telegramLeagues(db, String(chatId));
  if (mine) {
    const ligas = mine.leagues.map((l) => `<b>${esc(l.name)}</b>`).join(", ") || "ninguna";
    await reply(chatId, `✅ Ya estás conectado. Tus ligas: ${ligas}.\n\nTe mando el plan aquí a las 9:00 y a las 18:00.`, [
      [addToGroup()], [webButton(chatId, from)], [opinionButton], [{ text: "🔐 Volver a conectar", callback_data: "conectar" }],
    ]);
    return;
  }
  if (!(await canJoin(db, user.id))) {
    await reply(chatId, "🔒 <b>La beta está completa</b> ahora mismo.\n\nTe he apuntado: en cuanto haya sitio te escribo por aquí.");
    const admin = await adminChat(db);
    const { used, max } = await seats(db);
    if (admin) await reply(Number(admin), `⏳ <b>${esc(user.name)}</b> quiere entrar, pero la beta está completa (${used}/${max}). Sube MAX_USUARIOS en Vercel para dejarle.`);
    return;
  }
  const url = await startConnect(db, user.id);
  await reply(chatId, `${CONNECT}\n⏱️ El botón vale 15 minutos.`, [[{ text: "🔐 Entrar en LaLiga", url }]]);
  await sendHelp(chatId, "⚠️ <b>Cuando veas la página jwt.ms, NO la cierres: compártela conmigo.</b>");
}

// En un grupo: activar con las ligas de quien lo pide (quien mete el bot o quien pulsa el botón)
async function offerGroup(db: Db, chat: Chat, from: From, hello: boolean, messageId?: number) {
  const say = (text: string, buttons: Button[][] = []) => (messageId ? edit(chat.id, messageId, text, buttons) : reply(chat.id, text, buttons));
  const intro = hello ? "👋 <b>¡Hola!</b> Soy el Espía: os contaré aquí los fichajes, ventas y cláusulas de vuestra liga, y un resumen cada mañana.\n\n" : "";
  const mine = await telegramLeagues(db, String(from.id));
  if (!mine || !mine.leagues.length) {
    await say(`${intro}Para activarme, <b>quien tenga la liga conectada</b> pulsa el botón. ¿Nadie la ha conectado? Habladme por privado: es un minuto.`, [
      [{ text: "🕵️ Activar en este grupo", callback_data: "act" }],
      [{ text: "🔐 Conectar mi LaLiga", url: `https://t.me/${bot()}?start=conectar` }],
    ]);
    return;
  }
  if (mine.leagues.length === 1) {
    const out = await activateGroup(db, mine.user.id, mine.leagues[0].id, String(chat.id));
    await say(out.ok ? `${intro}${activatedText(out.name)}` : `${intro}❌ ${esc(out.error)}`);
    return;
  }
  await say(`${intro}${esc(nameOf(from))}, ¿qué liga es este grupo?`,
    mine.leagues.map((l) => [{ text: l.name, callback_data: `act:${l.id}` }]));
}

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const u = (await req.json().catch(() => ({}))) as Update;
  try {
    const db = await getDb();

    // Botones con acción (callback)
    if (u.callback_query) {
      const cq = u.callback_query;
      const msg = cq.message;
      if (cq.data === "opinion" && msg?.chat.type === "private") {
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
        await askOpinion(msg.chat.id);
      } else if (cq.data === "conectar" && msg?.chat.type === "private") {
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
        await start(db, msg.chat.id, cq.from, true);
      } else if (cq.data === "act" && msg) {
        const mine = await telegramLeagues(db, String(cq.from.id));
        if (!mine?.leagues.length) {
          await alert(cq.id, `Primero conecta tu LaLiga: abre @${bot()} en privado y pulsa Iniciar. Luego vuelve y pulsa otra vez.`);
        } else {
          await tg("answerCallbackQuery", { callback_query_id: cq.id });
          await offerGroup(db, msg.chat, cq.from, false, msg.message_id);
        }
      } else if (cq.data?.startsWith("act:") && msg) {
        const mine = await telegramLeagues(db, String(cq.from.id));
        const leagueId = cq.data.slice(4);
        if (!mine) {
          await alert(cq.id, `Primero conecta tu LaLiga hablando con @${bot()} en privado.`);
        } else {
          const out = await activateGroup(db, mine.user.id, leagueId, String(msg.chat.id));
          if (out.ok) {
            await tg("answerCallbackQuery", { callback_query_id: cq.id });
            await edit(msg.chat.id, msg.message_id, activatedText(out.name));
          } else {
            await alert(cq.id, out.error);
          }
        }
      } else {
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
      }
      return NextResponse.json({ ok: true });
    }

    const m = u.message;
    if (m && m.chat.type === "private") {
      const text = m.text?.trim() ?? "";
      const [first, arg] = text.split(/\s+/);
      const cmd = (first.split("@")[0] ?? "").toLowerCase();
      const startArg = cmd === "/start" ? (arg ?? "").toLowerCase() : "";
      if (m.reply_to_message?.from?.is_bot && m.reply_to_message.text?.startsWith(OPINION_ASK.slice(0, 20))) {
        // Respuesta al "Cuéntame qué tal"
        await saveOpinion(db, m.chat.id, m.from, text);
      } else if (cmd === "/opinion") {
        const rest = text.slice(first.length).trim();
        await (rest ? saveOpinion(db, m.chat.id, m.from, rest) : askOpinion(m.chat.id));
      } else if (findCallback(text)) {
        // Ha vuelto con la dirección de jwt.ms: terminamos de conectar
        const user = await userForTelegram(db, String(m.chat.id), nameOf(m.from));
        await reply(m.chat.id, "⏳ Conectando con LaLiga…");
        try {
          const out = await finishConnect(db, user.id, text);
          await dispatchPlan().catch(() => null);
          const ligas = out.leagues.map((l) => `<b>${esc(l.name)}</b>`).join(", ") || "ninguna (¿estás en alguna liga?)";
          await reply(m.chat.id,
            `✅ <b>¡Conectado!</b> Tus ligas: ${ligas}.\n\n📋 Tu primer plan <b>te llega aquí en un minuto</b>. Luego, cada día a las 9:00 y a las 18:00.\n\n🕵️ <b>Último paso (opcional):</b> pulsa el botón, elige el grupo de tu liga y el Espía se activa solo.`,
            [[addToGroup()], [webButton(m.chat.id, m.from)], [opinionButton]]);
        } catch (e) {
          const msg = e instanceof ConnectError ? e.message : "Algo ha fallado al guardar tu sesión. Prueba otra vez en un momento.";
          await reply(m.chat.id, `❌ ${esc(msg)}`, [[{ text: "🔐 Volver a intentarlo", callback_data: "conectar" }]]);
        }
      } else if (cmd === "/web" || startArg === "web") {
        await reply(m.chat.id, "🌐 Tu enlace para entrar en la web. Es solo tuyo y vale 15 minutos.", [[webButton(m.chat.id, m.from)]]);
      } else if (cmd === "/conectar" || startArg === "conectar") {
        await start(db, m.chat.id, m.from, true);
      } else if (cmd === "/start" || cmd === "/espia") {
        await start(db, m.chat.id, m.from);
      } else {
        // Sin conectar, casi siempre es que se ha atascado en jwt.ms (manda una captura, o escribe "no va")
        const mine = await telegramLeagues(db, String(m.chat.id));
        if (!mine) {
          await sendHelp(m.chat.id,
            "🤔 Aún no me ha llegado la página de <b>jwt.ms</b>.\n\n<b>No me mandes una captura</b>: comparte la página (o pega su dirección) en este chat, como en la imagen.\n\n¿Se te cerró o el botón caducó? Escribe /conectar y te doy otro.");
        } else {
          await reply(m.chat.id, "No te he entendido. Escribe /start y te digo qué toca, o /opinion para contarme algo.");
        }
      }
    } else if (m?.from && m.chat.type !== "private" && m.text?.trim().split(/\s|@/)[0].toLowerCase() === "/espia") {
      await offerGroup(db, m.chat, m.from, false);
    } else if (u.my_chat_member && u.my_chat_member.chat.type !== "private" && ["member", "administrator"].includes(u.my_chat_member.new_chat_member?.status ?? "")
      && !["member", "administrator"].includes(u.my_chat_member.old_chat_member?.status ?? "")) {
      // Recién metido en el grupo (a mano o con el botón del privado). El /start que manda Telegram después se ignora.
      await offerGroup(db, u.my_chat_member.chat, u.my_chat_member.from, true);
    }
  } catch {
    // Telegram reintenta si fallamos: respondemos siempre 200
  }
  return NextResponse.json({ ok: true });
}
