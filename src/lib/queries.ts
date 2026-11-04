import { and, asc, desc, eq, gte, inArray, max, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestRuns, players, playerScores, playerValues, playerWeeks, teams } from "@/db/schema";

export async function lastRun() {
  const db = await getDb();
  const [run] = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(1);
  return run ?? null;
}

async function lastScoreDay() {
  const db = await getDb();
  const [{ d }] = await db.select({ d: max(playerScores.day) }).from(playerScores);
  return d;
}

export async function teamNames() {
  const db = await getDb();
  const rows = await db.select({ id: teams.id, short: teams.shortName, name: teams.name }).from(teams);
  return new Map(rows.map((t) => [t.id, t.short ?? t.name]));
}

export type Order = "nota" | "forma" | "tendencia" | "valor";
export interface MarketFilter {
  pos?: number;
  action?: string;
  order?: Order;
  maxValue?: number;
  ids?: string[]; // solo estos jugadores (p. ej. tu plantilla)
  excludeIds?: string[]; // sin estos (p. ej. al buscar a quién fichar, sin los tuyos)
}

const ORDER = {
  nota: desc(playerScores.nota),
  forma: sql`coalesce(${playerScores.xp}, ${playerScores.formAvg}) desc nulls last`, // puntos esperados (o forma si no hay)
  tendencia: sql`${playerScores.pct7} desc nulls last`,
  valor: desc(playerScores.value),
};

// Mercado: todos los jugadores activos con su nota del último día.
export async function market(f: MarketFilter, limit = 60) {
  const db = await getDb();
  const day = await lastScoreDay();
  if (!day) return { day: null, rows: [] };
  const where = [eq(playerScores.day, day), ne(players.status, "out_of_league")];
  if (f.pos) where.push(eq(players.positionId, f.pos));
  if (f.action === "fichar" || f.action === "mantener" || f.action === "vender") {
    where.push(eq(playerScores.action, f.action));
  }
  if (f.maxValue) where.push(sql`${playerScores.value} <= ${f.maxValue}`);
  if (f.ids) {
    if (!f.ids.length) return { day, rows: [] };
    where.push(inArray(players.id, f.ids));
  }
  if (f.excludeIds?.length) where.push(notInArray(players.id, f.excludeIds));
  const rows = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      team: teams.shortName,
      position: players.positionId,
      status: players.status,
      s: playerScores,
    })
    .from(playerScores)
    .innerJoin(players, eq(players.id, playerScores.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(and(...where))
    .orderBy(ORDER[f.order ?? "nota"], desc(playerScores.nota))
    .limit(limit);
  return { day, rows };
}

// Ficha de un jugador: datos, nota de hoy, histórico de valor y jornadas.
export async function playerCard(id: string) {
  const db = await getDb();
  const [p] = await db
    .select({ player: players, team: teams.name })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.id, id));
  if (!p) return null;
  const day = await lastScoreDay();
  const [score] = day
    ? await db.select().from(playerScores).where(and(eq(playerScores.playerId, id), eq(playerScores.day, day)))
    : [];
  const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const values = await db
    .select({ day: playerValues.day, value: playerValues.value })
    .from(playerValues)
    .where(and(eq(playerValues.playerId, id), gte(playerValues.day, since)))
    .orderBy(asc(playerValues.day));
  const weeks = await db
    .select({ week: playerWeeks.week, points: playerWeeks.points, minutes: playerWeeks.minutes })
    .from(playerWeeks)
    .where(eq(playerWeeks.playerId, id))
    .orderBy(desc(playerWeeks.week));
  return { ...p, score: score ?? null, values, weeks };
}

// Jugadores activos para emparejar capturas.
export async function candidates() {
  const db = await getDb();
  return db
    .select({ id: players.id, nickname: players.nickname, positionId: players.positionId, teamShort: teams.shortName, teamName: teams.name })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(ne(players.status, "out_of_league"));
}

// Nota de hoy de una lista de jugadores (plantilla o mercado de tu liga).
export async function scoresFor(ids: string[]) {
  if (!ids.length) return { day: null, rows: [] };
  const db = await getDb();
  const day = await lastScoreDay();
  if (!day) return { day: null, rows: [] };
  const rows = await db
    .select({
      id: players.id,
      nickname: players.nickname,
      team: teams.shortName,
      position: players.positionId,
      status: players.status,
      s: playerScores,
    })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(playerScores, and(eq(playerScores.playerId, players.id), eq(playerScores.day, day)))
    .where(inArray(players.id, ids.slice(0, 40)));
  return { day, rows };
}
