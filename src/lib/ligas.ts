// Ligas con plan guardado y la que has elegido (cookie "liga").
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { espiaPlans } from "@/db/schema";

export const LIGA_COOKIE = "liga";

export async function leagues(): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const rows = await db.select({ id: espiaPlans.leagueId, name: espiaPlans.leagueName }).from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(200);
  const seen = new Map<string, string>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r.name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function currentLeague() {
  const all = await leagues();
  const wanted = (await cookies()).get(LIGA_COOKIE)?.value;
  return { all, current: all.find((l) => l.id === wanted) ?? all[0] ?? null };
}

export async function latestPlan(leagueId: string) {
  const db = await getDb();
  const [row] = await db.select().from(espiaPlans).where(eq(espiaPlans.leagueId, leagueId)).orderBy(desc(espiaPlans.createdAt)).limit(1);
  return row ?? null;
}
