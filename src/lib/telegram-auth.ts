// Comprueba los datos del botón "Iniciar sesión con Telegram" (Telegram Login Widget).
// Telegram los firma con una clave que sale del token del bot: nadie más puede falsificarlos.
import crypto from "node:crypto";

export interface TelegramLogin {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

export function verifyTelegramLogin(q: Record<string, string>, botToken: string, maxAgeS = 24 * 3600): TelegramLogin | null {
  const { hash, ...data } = q;
  if (!hash || !data.id || !data.auth_date) return null;
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const mac = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (mac.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(data.auth_date) > maxAgeS) return null;
  return { ...(data as Omit<TelegramLogin, "hash">), hash };
}
