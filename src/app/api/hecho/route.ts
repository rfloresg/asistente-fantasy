// Botón "Hecho" de cada movimiento: lo apunta y lanza un plan nuevo, que comprueba en LaLiga si se hizo.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { espiaDone } from "@/db/schema";
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
  const error = await dispatchPlan();
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
