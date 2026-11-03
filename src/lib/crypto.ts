// Cifrado de las sesiones de LaLiga guardadas (AES-256-GCM). La clave sale de SESSION_KEY.
import crypto from "node:crypto";

function key(): Buffer {
  const k = process.env.SESSION_KEY;
  if (!k || k.length < 16) throw new Error("Falta SESSION_KEY (al menos 16 caracteres) para cifrar las sesiones");
  return crypto.createHash("sha256").update(k).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(box: string): string {
  const [iv, tag, data] = box.split(".").map((x) => Buffer.from(x, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
