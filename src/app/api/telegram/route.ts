// Webhook del bot de Telegram (se configura con npm run telegram:webhook).
// - /start en privado: bienvenida y enlace a la web
// - /espia en un grupo: botón para elegir qué liga es ese grupo
import { NextResponse } from "next/server";
import { activateUrl, APP_URL } from "@/lib/grupo";

type Chat = { id: number; type: string; title?: string };
type Update = {
  message?: { chat: Chat; text?: string };
  my_chat_member?: { chat: Chat; new_chat_member?: { status?: string } };
};

async function reply(chatId: number, text: string, button?: { text: string; url: string }) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    }),
  });
}

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const u = (await req.json().catch(() => ({}))) as Update;
  try {
    const m = u.message;
    const cmd = m?.text?.trim().split(/\s|@/)[0].toLowerCase();
    if (m && m.chat.type === "private" && cmd === "/start") {
      await reply(m.chat.id,
        "🕵️ <b>Asistente Fantasy</b>\nCada día te digo qué hacer en tus ligas de LaLiga Fantasy: a quién proteger, por quién pujar, a quién vender y tu mejor once.\n\nEntra en la web con tu Telegram y conecta tu cuenta de LaLiga.",
        { text: "Abrir la web", url: `${APP_URL}/login` });
    } else if (m && m.chat.type !== "private" && cmd === "/espia") {
      await reply(m.chat.id,
        "🕵️ Para activar el Espía en este grupo, el que conectó la liga en la web pulsa aquí y elige cuál es.",
        { text: "Elegir la liga de este grupo", url: activateUrl(String(m.chat.id), m.chat.title ?? "Grupo") });
    } else if (u.my_chat_member && u.my_chat_member.chat.type !== "private" && ["member", "administrator"].includes(u.my_chat_member.new_chat_member?.status ?? "")) {
      await reply(u.my_chat_member.chat.id, "👋 Hola. Escribid /espia para que os cuente aquí todo lo que pasa en vuestra liga de LaLiga Fantasy.");
    }
  } catch {
    // Telegram reintenta si fallamos: respondemos siempre 200
  }
  return NextResponse.json({ ok: true });
}
