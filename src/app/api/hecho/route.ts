// Botón "Hecho" de cada movimiento: lo apunta y lanza un plan nuevo, que comprueba en LaLiga si se hizo.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { espiaDone, espiaPlans } from "@/db/schema";
import { logActivity } from "@/lib/actividad";
import { dispatchPlan } from "@/lib/github";
import { doneKeyPrefix } from "@/lib/plan/plan";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const { leagueId, key } = (await req.json().catch(() => ({}))) as { leagueId?: string; key?: string };
  if (!leagueId || !key || key.length > 200) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  const db = await getDb();
  const user = await currentUser().catch(() => null);
  const full = doneKeyPrefix(user?.id ?? null) + key; // cada usuario marca lo suyo
  await db.insert(espiaDone).values({ leagueId, key: full, createdAt: new Date() })
    .onConflictDoUpdate({ target: [espiaDone.leagueId, espiaDone.key], set: { createdAt: new Date() } });
  if (user && !user.isAdmin) {
    // Para Administración: qué movimiento ha marcado (con el título del plan)
    const [plan] = await db.select({ acciones: espiaPlans.acciones, leagueName: espiaPlans.leagueName }).from(espiaPlans)
      .where(and(eq(espiaPlans.userId, user.id), eq(espiaPlans.leagueId, leagueId))).orderBy(desc(espiaPlans.createdAt)).limit(1);
    const a = plan?.acciones.find((x) => x.key === key);
    await logActivity(db, user.id, "hecho", `${a?.titulo ?? key}${plan ? ` · ${plan.leagueName}` : ""}`);
  }
  const error = await dispatchPlan(user?.id ?? null, true);
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
