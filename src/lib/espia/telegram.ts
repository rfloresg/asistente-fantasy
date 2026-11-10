// Envío a Telegram con la Bot API. Sin librerías.

const api = (method: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/bot${token}/${method}`;
};

export type UrlButton = { text: string; url: string };

export async function sendMessage(chatId: string, html: string, buttons: UrlButton[][] = []) {
  const res = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!body.ok) throw new Error(`Telegram: ${body.description ?? res.status}`);
}

// Telegram corta en 4096 caracteres: agrupamos líneas en mensajes de hasta ~3500.
export function pack(lines: string[], max = 3500): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

export async function chatsFromUpdates() {
  const res = await fetch(api("getUpdates"));
  type Chat = { id: number; title?: string; type: string };
  const body = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: { message?: { chat: Chat }; my_chat_member?: { chat: Chat } }[];
  };
  if (!body.ok) throw new Error(`Telegram: ${body.description ?? res.status}. Revisa TELEGRAM_BOT_TOKEN en .env`);
  const chats = new Map<number, string>();
  for (const u of body.result ?? []) {
    // message: /start@bot en el grupo. my_chat_member: el bot ha entrado en un grupo.
    const c = u.message?.chat ?? u.my_chat_member?.chat;
    if (c) chats.set(c.id, `${c.title ?? "chat privado"} (${c.type})`);
  }
  return chats;
}
