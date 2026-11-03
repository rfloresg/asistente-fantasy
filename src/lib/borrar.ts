// Borrar una cuenta: su sesión de LaLiga, sus planes, sus ligas y su usuario.
// Si era quien leía para un grupo, el grupo pasa a otro miembro con sesión; si no hay nadie, el Espía deja ese grupo.
import { and, eq, inArray, isNull, like, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { chatUsage, espiaDone, espiaPlans, laligaSessions, leagues, loginAttempts, memberships, users } from "@/db/schema";
import { doneKeyPrefix } from "@/lib/plan/plan";

export async function deleteUser(db: Db, userId: number) {
  const mine = await db.select({ leagueId: memberships.leagueId }).from(memberships).where(eq(memberships.userId, userId));
  const owned = await db.select({ leagueId: leagues.leagueId }).from(leagues).where(eq(leagues.groupOwnerId, userId));

  for (const { leagueId } of owned) {
    const [next] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(laligaSessions, eq(laligaSessions.userId, memberships.userId))
      .where(and(eq(memberships.leagueId, leagueId), ne(memberships.userId, userId), isNull(laligaSessions.lastError)))
      .limit(1);
    await db.update(leagues)
      .set(next ? { groupOwnerId: next.userId } : { groupOwnerId: null, groupChatId: null, active: false })
      .where(eq(leagues.leagueId, leagueId));
  }

  await db.delete(memberships).where(eq(memberships.userId, userId));
  await db.delete(espiaPlans).where(eq(espiaPlans.userId, userId));
  await db.delete(espiaDone).where(like(espiaDone.key, `${doneKeyPrefix(userId)}%`));
  await db.delete(chatUsage).where(eq(chatUsage.userId, userId));
  await db.delete(loginAttempts).where(eq(loginAttempts.userId, userId));
  await db.delete(laligaSessions).where(eq(laligaSessions.userId, userId));

  // Ligas que ya no sigue nadie y sin grupo: el Espía las deja
  const ids = mine.map((m) => m.leagueId);
  if (ids.length) {
    const still = new Set((await db.select({ leagueId: memberships.leagueId }).from(memberships).where(inArray(memberships.leagueId, ids))).map((m) => m.leagueId));
    const orphan = ids.filter((id) => !still.has(id));
    if (orphan.length) await db.update(leagues).set({ active: false }).where(and(inArray(leagues.leagueId, orphan), isNull(leagues.groupChatId)));
  }

  await db.delete(users).where(eq(users.id, userId));
}
