// Apunta el bot a la web: los mensajes al bot (/start, /espia) llegan a /api/telegram.
// Uso: npm run telegram:webhook  (con TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET y APP_URL en .env)
// Ojo: después npm run telegram:chat ya no funciona (Telegram no deja usar las dos cosas).
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const app = (process.env.APP_URL ?? "https://asistente-fantasy.vercel.app").replace(/\/$/, "");

async function call(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
}

(async () => {
  if (!token || !secret) throw new Error("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET en .env");
  await call("setWebhook", { url: `${app}/api/telegram`, secret_token: secret, allowed_updates: ["message", "my_chat_member"] });
  await call("setMyCommands", { commands: [{ command: "start", description: "Qué es y cómo empezar" }, { command: "espia", description: "Activar el Espía en este grupo" }] });
  console.log(`Bot apuntado a ${app}/api/telegram`);
})().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
