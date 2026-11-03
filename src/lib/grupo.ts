// Enlace firmado para activar el Espía en un grupo: solo el bot puede generarlo.
import crypto from "node:crypto";

export const APP_URL = (process.env.APP_URL ?? "https://asistente-fantasy.vercel.app").replace(/\/$/, "");
export const groupSig = (chatId: string) =>
  crypto.createHmac("sha256", process.env.SESSION_KEY ?? "dev").update(`grupo:${chatId}`).digest("base64url").slice(0, 22);
export const activateUrl = (chatId: string, title: string) =>
  `${APP_URL}/activar?chat=${encodeURIComponent(chatId)}&t=${encodeURIComponent(title.slice(0, 60))}&sig=${groupSig(chatId)}`;

// Enlace de entrada que da el bot en privado: te deja dentro de la web sin pedir nada (caduca en 15 min)
const loginSig = (tg: string, exp: string, name: string) =>
  crypto.createHmac("sha256", process.env.SESSION_KEY ?? "dev").update(`entrar:${tg}:${exp}:${name}`).digest("base64url");
export const botLoginUrl = (tg: string, name: string, next = "/conectar") => {
  const exp = String(Math.floor(Date.now() / 1000) + 15 * 60);
  const n = name.slice(0, 40);
  return `${APP_URL}/api/auth/bot?tg=${tg}&exp=${exp}&n=${encodeURIComponent(n)}&next=${encodeURIComponent(next)}&sig=${loginSig(tg, exp, n)}`;
};
export const checkBotLogin = (tg: string, exp: string, name: string, sig: string) =>
  Number(exp) > Date.now() / 1000 && sig === loginSig(tg, exp, name);
