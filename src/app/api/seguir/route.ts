// Lista de seguimiento (⭐): POST { playerId } la marca o la quita.
import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { watchlist } from "@/db/schema";
import { WATCH_MAX } from "@/lib/seguir";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero" }, { status: 401 });
  const { playerId } = (await req.json().catch(() => ({}))) as { playerId?: string };
  if (!playerId || !/^\d{1,12}$/.test(playerId)) return NextResponse.json({ error: "Falta el jugador" }, { status: 400 });
  const db = await getDb();
  const where = and(eq(watchlist.userId, user.id), eq(watchlist.playerId, playerId));
  const [had] = await db.select().from(watchlist).where(where);
  if (had) {
    await db.delete(watchlist).where(where);
    return NextResponse.json({ on: false });
  }
  const [{ n }] = await db.select({ n: count() }).from(watchlist).where(eq(watchlist.userId, user.id));
  if (n >= WATCH_MAX) return NextResponse.json({ error: `Como mucho ${WATCH_MAX} jugadores` }, { status: 400 });
  await db.insert(watchlist).values({ userId: user.id, playerId, createdAt: new Date() }).onConflictDoNothing();
  return NextResponse.json({ on: true });
}
