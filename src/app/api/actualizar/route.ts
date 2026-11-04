// Botón "Actualizar plan": lanza un plan nuevo. GET: hora del último plan, para saber cuándo ha llegado.
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { espiaPlans } from "@/db/schema";
import { dispatchPlan } from "@/lib/github";
import { logActivity } from "@/lib/actividad";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const liga = new URL(req.url).searchParams.get("liga");
  const db = await getDb();
  const user = await currentUser().catch(() => null);
  const conds = [liga ? eq(espiaPlans.leagueId, liga) : undefined, user ? eq(espiaPlans.userId, user.id) : undefined].filter((c) => c !== undefined);
  const q = db.select({ at: espiaPlans.createdAt }).from(espiaPlans);
  const [last] = await (conds.length ? q.where(and(...conds)) : q).orderBy(desc(espiaPlans.createdAt)).limit(1);
  return NextResponse.json({ last: last?.at ?? null });
}

export async function POST() {
  const user = await currentUser().catch(() => null);
  if (user && !user.isAdmin) await logActivity(await getDb(), user.id, "actualizar");
  const error = await dispatchPlan();
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
