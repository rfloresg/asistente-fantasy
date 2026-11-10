// Quién está usando la web.
// - fa_user: cookie firmada con el id de usuario (entrar con Telegram, fase 3)
// - si no, quien entra con APP_PASSWORD (o en local sin contraseña) es el administrador
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { touch } from "@/lib/actividad";

export const USER_COOKIE = "fa_user";
// Un año; el middleware la renueva cada día que entras, así que solo se entra una vez
export const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const USER_COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: USER_COOKIE_MAX_AGE };

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

// Para las páginas: sin usuario de verdad, a la pantalla de entrar (nunca un mensaje de administrador)
export async function requireUser(next = "/") {
  const u = await currentUser();
  if (!u) redirect(`/api/salir?next=${encodeURIComponent(next)}`);
  if (!u.isAdmin) await touch(await getDb(), u, next).catch(() => {});
  return u;
}

// El administrador puede ver la web como otro usuario (para revisar sus planes). Solo para mirar:
// las acciones (Hecho, Actualizar, Cuenta) siguen siendo suyas, y la web las esconde mientras mira.
export const VIEW_COOKIE = "ver_como";

export async function viewingAs(real: { isAdmin: boolean } | null) {
  if (!real?.isAdmin) return null;
  const id = Number((await cookies()).get(VIEW_COOKIE)?.value);
  if (!id) return null;
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}
