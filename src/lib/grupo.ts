// Enlace firmado para activar el Espía en un grupo: solo el bot puede generarlo.
import crypto from "node:crypto";

export const APP_URL = (process.env.APP_URL ?? "https://asistente-fantasy.vercel.app").replace(/\/$/, "");
export const groupSig = (chatId: string) =>
  crypto.createHmac("sha256", process.env.SESSION_KEY ?? "dev").update(`grupo:${chatId}`).digest("base64url").slice(0, 22);
export const activateUrl = (chatId: string, title: string) =>
  `${APP_URL}/activar?chat=${encodeURIComponent(chatId)}&t=${encodeURIComponent(title.slice(0, 60))}&sig=${groupSig(chatId)}`;
