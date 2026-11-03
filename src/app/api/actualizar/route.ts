// Botón "Actualizar plan": lanza un plan nuevo. GET: hora del último plan, para saber cuándo ha llegado.
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { espiaPlans } from "@/db/schema";
import { dispatchPlan } from "@/lib/github";

export async function GET(req: Request) {
  const liga = new URL(req.url).searchParams.get("liga");
  const db = await getDb();
  const q = db.select({ at: espiaPlans.createdAt }).from(espiaPlans);
  const [last] = await (liga ? q.where(eq(espiaPlans.leagueId, liga)) : q).orderBy(desc(espiaPlans.createdAt)).limit(1);
  return NextResponse.json({ last: last?.at ?? null });
}

export async function POST() {
  const error = await dispatchPlan();
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
