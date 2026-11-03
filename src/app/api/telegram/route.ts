// Webhook del bot de Telegram (se configura con npm run telegram:webhook).
// En privado: /start (bienvenida), /conectar (conectar LaLiga paso a paso), /web (entrar en la web)
//   y, si le mandas la dirección de jwt.ms, termina de conectar.
// En un grupo: /espia (botón para elegir qué liga es el grupo).
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { ConnectError, findCallback, finishConnect, startConnect } from "@/lib/conectar";
import { dispatchPlan } from "@/lib/github";
import { activateUrl, botLoginUrl } from "@/lib/grupo";
import { userForTelegram } from "@/lib/users";

type From = { id: number; first_name?: string; last_name?: string; username?: string };
type Chat = { id: number; type: string; title?: string };
type Update = {
  message?: { chat: Chat; text?: string; from?: From };
  callback_query?: { id: string; data?: string; from: From; message?: { chat: Chat } };
  my_chat_member?: { chat: Chat; new_chat_member?: { status?: string } };
};
type Button = { text: string; url?: string; callback_data?: string };

const tg = (method: string, body: object) =>
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

const reply = (chatId: number, text: string, buttons: Button[][] = []) =>
  tg("sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });

const nameOf = (f?: From) => [f?.first_name, f?.last_name].filter(Boolean).join(" ") || f?.username || "Mánager";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const WELCOME = `🕵️ <b>Asistente Fantasy</b>

Cada día te digo qué hacer en LaLiga Fantasy:
🛡️ a quién <b>proteger</b>
🛒 por quién <b>pujar</b> y cuánto
💰 a quién <b>vender</b>
📋 tu <b>mejor once</b> y el capitán

Y en el grupo de tu liga, un Espía que cuenta cada fichaje, venta y cláusula.

Para empezar, conecta tu cuenta de LaLiga 👇`;

const GUIDE = `🔐 <b>Conectar tu LaLiga</b> · tarda 1 minuto

<b>1.</b> Pulsa <b>Entrar en LaLiga</b> y entra como siempre.

<b>2.</b> Acabarás en una <b>página en blanco de Microsoft</b> (jwt.ms). Es normal: ahí va tu código.

<b>3.</b> En esa página, pulsa <b>compartir</b> (arriba) → <b>Telegram</b> → este chat.
     ¿No ves compartir? Toca <b>⋮</b> → <b>Copiar enlace</b> y pégalo aquí.

🔒 Tu contraseña la escribes en LaLiga: yo nunca la veo. Solo leo tus ligas; nunca ficho ni vendo nada.
⏱️ El botón vale 15 minutos.`;

async function sendGuide(db: Awaited<ReturnType<typeof getDb>>, chatId: number, from?: From) {
  const user = await userForTelegram(db, String(chatId), nameOf(from));
  const url = await startConnect(db, user.id);
  await reply(chatId, GUIDE, [[{ text: "🔐 Entrar en LaLiga", url }]]);
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
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      if (cq.data === "conectar" && cq.message?.chat.type === "private") await sendGuide(db, cq.message.chat.id, cq.from);
      return NextResponse.json({ ok: true });
    }

    const m = u.message;
    if (m && m.chat.type === "private") {
      const text = m.text?.trim() ?? "";
      const [first, arg] = text.split(/\s+/);
      const cmd = (first.split("@")[0] ?? "").toLowerCase();
      const startArg = cmd === "/start" ? (arg ?? "").toLowerCase() : ""; // t.me/bot?start=conectar
      if (findCallback(text)) {
        // Ha vuelto con la dirección de jwt.ms: terminamos de conectar
        const user = await userForTelegram(db, String(m.chat.id), nameOf(m.from));
        await reply(m.chat.id, "⏳ Conectando con LaLiga…");
        try {
          const out = await finishConnect(db, user.id, text);
          await dispatchPlan().catch(() => null);
          const ligas = out.leagues.map((l) => `<b>${esc(l.name)}</b>`).join(", ") || "ninguna (¿estás en alguna liga?)";
          await reply(m.chat.id,
            `✅ <b>¡Conectado!</b>\n\nTus ligas: ${ligas}\n\n📋 Estoy preparando tu primer plan: <b>te llega aquí en un minuto</b>.\n\n🕵️ ¿Quieres el Espía en el grupo de tu liga? Métame en el grupo y escribid /espia.`,
            [[{ text: "Ver mi plan en la web", url: botLoginUrl(String(m.chat.id), nameOf(m.from), "/") }]]);
        } catch (e) {
          const msg = e instanceof ConnectError ? e.message : "Algo ha fallado al guardar tu sesión. Prueba otra vez en un momento.";
          await reply(m.chat.id, `❌ ${esc(msg)}`, [[{ text: "Volver a intentarlo", callback_data: "conectar" }]]);
        }
      } else if (cmd === "/conectar" || startArg === "conectar") {
        await sendGuide(db, m.chat.id, m.from);
      } else if (cmd === "/web" || startArg === "web") {
        await reply(m.chat.id, "🌐 Tu enlace para entrar en la web. Es solo tuyo y vale 15 minutos.",
          [[{ text: "Entrar en la web", url: botLoginUrl(String(m.chat.id), nameOf(m.from), "/") }]]);
      } else if (cmd === "/start") {
        await userForTelegram(db, String(m.chat.id), nameOf(m.from));
        await reply(m.chat.id, WELCOME, [
          [{ text: "🔐 Conectar mi LaLiga", callback_data: "conectar" }],
          [{ text: "Abrir la web", url: botLoginUrl(String(m.chat.id), nameOf(m.from), "/") }],
        ]);
      } else {
        await reply(m.chat.id, "No te he entendido. Prueba con /conectar para conectar tu LaLiga o /web para entrar en la web.");
      }
    } else if (m && m.chat.type !== "private" && m.text?.trim().split(/\s|@/)[0].toLowerCase() === "/espia") {
      await reply(m.chat.id,
        "🕵️ Para activar el Espía aquí, quien conectó la liga pulsa el botón y elige cuál es.",
        [[{ text: "Elegir la liga de este grupo", url: activateUrl(String(m.chat.id), m.chat.title ?? "Grupo") }]]);
    } else if (u.my_chat_member && u.my_chat_member.chat.type !== "private" && ["member", "administrator"].includes(u.my_chat_member.new_chat_member?.status ?? "")) {
      await reply(u.my_chat_member.chat.id, "👋 ¡Hola! Escribid /espia y os contaré aquí todo lo que pasa en vuestra liga: fichajes, ventas, cláusulas y un resumen cada mañana.");
    }
  } catch {
    // Telegram reintenta si fallamos: respondemos siempre 200
  }
  return NextResponse.json({ ok: true });
}
