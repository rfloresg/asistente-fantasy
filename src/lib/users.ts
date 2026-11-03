// Usuarios que llegan por Telegram (bot o botón de la web).
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";

// Encuentra o crea el usuario de ese Telegram. Tu usuario de administrador aún sin Telegram se te asocia
// si ADMIN_TELEGRAM_ID coincide (o si ya habías entrado con la contraseña: linkAdmin)
export async function userForTelegram(db: Db, tg: string, name: string, linkAdmin = false) {
  const [found] = await db.select().from(users).where(eq(users.telegramId, tg));
  if (found) return found;
  const [admin] = await db.select().from(users).where(and(eq(users.isAdmin, true), isNull(users.telegramId))).limit(1);
  if (admin && (linkAdmin || process.env.ADMIN_TELEGRAM_ID === tg)) {
    const [u] = await db.update(users).set({ telegramId: tg }).where(eq(users.id, admin.id)).returning();
    return u;
  }
  // Si no queda administrador (por ejemplo, tras empezar de cero), lo vuelve a ser quien tenga ADMIN_TELEGRAM_ID
  const isAdmin = !!process.env.ADMIN_TELEGRAM_ID && process.env.ADMIN_TELEGRAM_ID === tg;
  const [u] = await db.insert(users).values({ name: name || "Mánager", telegramId: tg, isAdmin, createdAt: new Date() }).returning();
  return u;
}
