// Lista de espera de la beta (MAX_USUARIOS): apuntar a quien llega con la beta llena y avisar
// por orden de llegada cuando queda sitio (al borrarse alguien o desde Administración).
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { laligaSessions, users, waitlist } from "@/db/schema";
import { sendMessage } from "@/lib/espia/telegram";
import { seats } from "@/lib/plazas";

export async function joinWaitlist(db: Db, userId: number) {
  await db.insert(waitlist).values({ userId, createdAt: new Date() }).onConflictDoNothing();
  const [{ n }] = await db.select({ n: count() }).from(waitlist).where(isNull(waitlist.invitedAt));
  return n; // cuántos esperan (contándole)
}

export async function waiting(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(waitlist)
    .leftJoin(laligaSessions, eq(laligaSessions.userId, waitlist.userId))
    .where(and(isNull(waitlist.invitedAt), isNull(laligaSessions.userId)));
  return n;
}

export const INVITE_TEXT = "🎉 <b>¡Hay sitio en la beta!</b>\nEscribe /conectar y en un minuto tienes tu primer plan. Las plazas vuelan: si tardas, puede que otro se adelante.";

// Avisa a tantos como plazas libres haya (o a n, si se dice), por orden de llegada
export async function inviteWaiting(db: Db, n?: number): Promise<number> {
  const { left } = await seats(db);
  const howMany = n ?? (left === null ? 50 : left);
  if (howMany <= 0) return 0;
  const next = await db.select({ userId: waitlist.userId, chat: users.telegramId }).from(waitlist)
    .innerJoin(users, eq(users.id, waitlist.userId))
    .leftJoin(laligaSessions, eq(laligaSessions.userId, waitlist.userId)) // quien ya entró por su cuenta, no
    .where(and(isNull(waitlist.invitedAt), isNull(laligaSessions.userId)))
    .orderBy(asc(waitlist.createdAt)).limit(howMany);
  let sent = 0;
  for (const w of next) {
    if (w.chat) {
      const ok = await sendMessage(w.chat, INVITE_TEXT).then(() => true).catch(() => false);
      if (!ok) continue;
      sent++;
    }
    await db.update(waitlist).set({ invitedAt: new Date() }).where(and(eq(waitlist.userId, w.userId), isNull(waitlist.invitedAt)));
  }
  return sent;
}
