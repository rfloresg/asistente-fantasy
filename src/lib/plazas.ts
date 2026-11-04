// Beta con plazas: MAX_USUARIOS cuenta a quien tiene LaLiga conectada (el administrador no cuenta).
// Sin la variable, no hay tope.
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { laligaSessions, users } from "@/db/schema";

export const maxUsers = () => {
  const n = Number(process.env.MAX_USUARIOS);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function seats(db: Db) {
  const max = maxUsers();
  const rows = await db.select({ id: users.id }).from(laligaSessions)
    .innerJoin(users, eq(users.id, laligaSessions.userId))
    .where(and(eq(users.isAdmin, false), isNull(laligaSessions.lastError)));
  const used = rows.length;
  return { max, used, left: max === null ? null : Math.max(0, max - used) };
}

// ¿Puede conectar este usuario? Los que ya tienen sesión (aunque caducada) y el administrador, siempre.
export async function canJoin(db: Db, userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (u?.isAdmin) return true;
  const [s] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, userId));
  if (s) return true;
  const { left } = await seats(db);
  return left === null || left > 0;
}
