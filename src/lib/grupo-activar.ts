// Enlazar un grupo de Telegram con una liga (desde el bot o desde la web). Mismas reglas en los dos sitios.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { laligaSessions, leagues, memberships, users } from "@/db/schema";

export type Activation = { ok: true; name: string } | { ok: false; error: string };

export async function activateGroup(db: Db, userId: number, leagueId: string, chat: string): Promise<Activation> {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));
  if (!m) return { ok: false, error: "Esa liga no es tuya: conéctala primero." };
  const [s] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, userId));
  if (!s || s.lastError) return { ok: false, error: "Tu sesión de LaLiga no está activa: vuelve a conectar." };
  const [l] = await db.select().from(leagues).where(eq(leagues.leagueId, leagueId));
  if (l?.groupChatId && l.groupChatId !== chat && l.groupOwnerId !== userId) return { ok: false, error: "Esa liga ya tiene el Espía en otro grupo." };
  // Otra liga que ya usaba este grupo, lo suelta
  await db.update(leagues).set({ groupChatId: null }).where(eq(leagues.groupChatId, chat));
  await db.update(leagues).set({ groupChatId: chat, groupOwnerId: userId, active: true }).where(eq(leagues.leagueId, leagueId));
  return { ok: true, name: l?.name ?? "vuestra liga" };
}

// Quién es ese Telegram y qué ligas tiene conectadas (para ofrecerle activar el grupo)
export async function telegramLeagues(db: Db, telegramId: string) {
  const [u] = await db.select().from(users).where(eq(users.telegramId, telegramId));
  if (!u) return null;
  const [s] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, u.id));
  if (!s || s.lastError) return null;
  const ls = await db.select({ id: leagues.leagueId, name: leagues.name }).from(memberships)
    .innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId)).where(eq(memberships.userId, u.id));
  return { user: u, leagues: ls.sort((a, b) => a.name.localeCompare(b.name)) };
}

export const activatedText = (name: string) =>
  `✅ <b>Espía activado</b> para <b>${name.replace(/[<>&]/g, "")}</b>.\n\nDesde ahora os cuento aquí cada fichaje, venta y cláusula, y un resumen cada mañana.`;
