// Quién está usando la web.
// - fa_user: cookie firmada con el id de usuario (entrar con Telegram, fase 3)
// - si no, quien entra con APP_PASSWORD (o en local sin contraseña) es el administrador
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const USER_COOKIE = "fa_user";

const sign = (v: string) => crypto.createHmac("sha256", process.env.SESSION_KEY ?? "dev").update(v).digest("base64url");
export const userCookieValue = (userId: number) => `${userId}.${sign(String(userId))}`;

export async function currentUser() {
  const db = await getDb();
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (raw) {
    const [id, sig] = raw.split(".");
    if (id && sig === sign(id)) {
      const [u] = await db.select().from(users).where(eq(users.id, Number(id)));
      if (u) return u;
    }
  }
  // El middleware ya ha comprobado APP_PASSWORD: quien llega aquí sin fa_user es el administrador
  const [admin] = await db.select().from(users).where(eq(users.isAdmin, true)).orderBy(asc(users.id)).limit(1);
  return admin ?? null;
}
