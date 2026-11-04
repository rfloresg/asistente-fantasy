// Lo que hace cada usuario, para la pantalla de Administración. Nunca bloquea: si falla, no pasa nada.
import { eq, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { activity, users } from "@/db/schema";

export type Kind = "visita" | "hecho" | "pregunta" | "actualizar";
const VISIT_EVERY = 30 * 60 * 1000; // una visita cada 30 min como mucho
export const KEEP_DAYS = 30;

export async function logActivity(db: Db, userId: number, kind: Kind, detail?: string) {
  await db.insert(activity).values({ userId, kind, detail: detail?.slice(0, 500) ?? null, createdAt: new Date() }).catch(() => {});
}

// Abre una página de la web: apunta la visita si hace más de 30 min de la anterior
export async function touch(db: Db, user: { id: number; lastSeenAt: Date | null }, path?: string) {
  const now = new Date();
  if (user.lastSeenAt && now.getTime() - user.lastSeenAt.getTime() < VISIT_EVERY) return;
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id)).catch(() => {});
  await logActivity(db, user.id, "visita", path);
}

export async function pruneActivity(db: Db, now = new Date()) {
  await db.delete(activity).where(lt(activity.createdAt, new Date(now.getTime() - KEEP_DAYS * 864e5)));
}

// Días distintos (hora de Madrid) con alguna visita
export const activeDays = (dates: Date[]) => new Set(dates.map((d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }))).size;
