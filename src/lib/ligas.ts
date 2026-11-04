// Ligas del usuario que está usando la web y la que ha elegido (cookie "liga").
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { espiaPlans, leagues as leaguesT, memberships } from "@/db/schema";
import { currentUser, requireUser, viewingAs } from "@/lib/session";

export const LIGA_COOKIE = "liga";

export async function leagues(userId: number | null): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  if (userId !== null) {
    const rows = await db.select({ id: leaguesT.leagueId, name: leaguesT.name }).from(memberships)
      .innerJoin(leaguesT, eq(leaguesT.leagueId, memberships.leagueId))
      .where(and(eq(memberships.userId, userId), eq(leaguesT.active, true)));
    if (rows.length) return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Antes de los usuarios: las ligas con plan guardado
  const rows = await db.select({ id: espiaPlans.leagueId, name: espiaPlans.leagueName }).from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(200);
  const seen = new Map<string, string>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r.name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// strict: sin usuario, a la pantalla de entrar (las páginas). El layout usa strict=false (también pinta /login).
export async function currentLeague(strict = true) {
  const real = strict ? await requireUser() : await currentUser().catch(() => null);
  const viewing = await viewingAs(real);
  const user = viewing ?? real;
  const all = await leagues(user?.id ?? null);
  const wanted = (await cookies()).get(LIGA_COOKIE)?.value;
  return { user, viewing, all, current: all.find((l) => l.id === wanted) ?? all[0] ?? null };
}

// Último plan de esa liga para ese usuario (o los de antes de los usuarios)
export async function latestPlan(leagueId: string, userId?: number | null) {
  const db = await getDb();
  const who = userId == null ? isNull(espiaPlans.userId) : or(eq(espiaPlans.userId, userId), isNull(espiaPlans.userId));
  const [row] = await db.select().from(espiaPlans).where(and(eq(espiaPlans.leagueId, leagueId), who))
    .orderBy(desc(espiaPlans.createdAt)).limit(1);
  return row ?? null;
}
