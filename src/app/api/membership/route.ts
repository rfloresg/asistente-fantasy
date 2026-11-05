// Cuenta: activar o quitar el plan privado de una liga, o dejar de seguirla.
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { leagues, memberships } from "@/db/schema";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const { leagueId, action } = (await req.json().catch(() => ({}))) as { leagueId?: string; action?: string };
  const ACTIONS = ["plan-on", "plan-off", "dejar", "money-on", "money-off", "raises-on", "raises-off", "premium-on", "premium-off", "dinero-on", "dinero-off"];
  if (!leagueId || !ACTIONS.includes(action ?? "")) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  const db = await getDb();
  if (action!.startsWith("money") || action!.startsWith("raises")) {
    // Ajustes del grupo: solo quien lo activó
    const [l] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
    if (l?.groupOwnerId !== user.id) return NextResponse.json({ error: "Solo quien activó el Espía en el grupo puede cambiarlo" }, { status: 403 });
    const on = action!.endsWith("-on");
    await db.update(leagues).set(action!.startsWith("money") ? { showMoney: on } : { showRaises: on }).where(eq(leagues.leagueId, leagueId));
    return NextResponse.json({ ok: true });
  }
  const mine = and(eq(memberships.userId, user.id), eq(memberships.leagueId, leagueId));
  if (action!.startsWith("premium")) {
    // Si la liga es Premium (con capitán): lo puede decir cualquiera que esté en ella
    const [m] = await db.select().from(memberships).where(mine);
    if (!m) return NextResponse.json({ error: "No estás en esa liga" }, { status: 403 });
    await db.update(leagues).set({ premium: action === "premium-on" }).where(eq(leagues.leagueId, leagueId));
    return NextResponse.json({ ok: true });
  }
  if (action!.startsWith("dinero")) {
    await db.update(memberships).set({ dinero: action === "dinero-on" }).where(mine);
    return NextResponse.json({ ok: true });
  }
  if (action === "dejar") {
    await db.delete(memberships).where(mine);
    // Si nadie más la sigue y no tiene grupo, se desactiva
    const [left] = await db.select().from(memberships).where(eq(memberships.leagueId, leagueId)).limit(1);
    const [l] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
    if (!left && (!l?.groupChatId || l.groupOwnerId === user.id)) {
      await db.update(leagues).set({ active: false, groupChatId: null, groupOwnerId: null }).where(eq(leagues.leagueId, leagueId));
    }
  } else {
    await db.update(memberships).set({ plan: action === "plan-on" }).where(mine);
  }
  return NextResponse.json({ ok: true });
}
