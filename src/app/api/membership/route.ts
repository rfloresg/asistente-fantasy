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
  if (!leagueId || !["plan-on", "plan-off", "dejar"].includes(action ?? "")) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  const db = await getDb();
  const mine = and(eq(memberships.userId, user.id), eq(memberships.leagueId, leagueId));
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
