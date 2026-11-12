// Lista de seguimiento en la base de datos
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { watchlist } from "@/db/schema";

export async function isFollowing(userId: number, playerId: string) {
  const db = await getDb();
  const [r] = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.playerId, playerId)));
  return !!r;
}

export async function followed(userId: number): Promise<string[]> {
  const db = await getDb();
  return (await db.select({ id: watchlist.playerId }).from(watchlist).where(eq(watchlist.userId, userId))).map((r) => r.id);
}
