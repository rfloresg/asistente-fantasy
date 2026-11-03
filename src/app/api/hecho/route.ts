// Botón "Hecho" de cada movimiento: lo apunta y lanza un plan nuevo, que comprueba en LaLiga si se hizo.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { espiaDone } from "@/db/schema";
import { dispatchPlan } from "@/lib/github";

export async function POST(req: Request) {
  const { leagueId, key } = (await req.json().catch(() => ({}))) as { leagueId?: string; key?: string };
  if (!leagueId || !key || key.length > 200) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  const db = await getDb();
  await db.insert(espiaDone).values({ leagueId, key, createdAt: new Date() })
    .onConflictDoUpdate({ target: [espiaDone.leagueId, espiaDone.key], set: { createdAt: new Date() } });
  const error = await dispatchPlan();
  return error ? NextResponse.json({ error }, { status: 502 }) : NextResponse.json({ ok: true });
}
