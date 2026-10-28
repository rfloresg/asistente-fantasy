// Ingesta diaria. Idempotente: la primera vez rellena toda la temporada,
// las siguientes actualiza. Uso: npm run ingest
//   INGEST_CONCURRENCY=4  peticiones a la vez (por defecto 4)
//   INGEST_LIMIT=20       solo N jugadores (para probar)

import "dotenv/config";
import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getConn } from "../src/db";
import { ingestRuns, matches, players, playerValues, playerWeeks, teams } from "../src/db/schema";
import { laliga, pool } from "../src/lib/laliga/client";
import {
  isActive,
  parseMarketValues,
  parseMatch,
  parsePlayer,
  parsePlayerWeeks,
  parseTeam,
} from "../src/lib/laliga/parse";

const CONCURRENCY = Number(process.env.INGEST_CONCURRENCY ?? 4);
const LIMIT = process.env.INGEST_LIMIT ? Number(process.env.INGEST_LIMIT) : undefined;
const SEASON_WEEKS = 38;

// set: { col: excluded.col } para todas las columnas menos la clave
function excluded(table: PgTable, keys: string[]) {
  const set: Record<string, SQL> = {};
  for (const [prop, col] of Object.entries(getTableColumns(table))) {
    if (!keys.includes(prop)) set[prop] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const t0 = Date.now();
  const { db, close } = await getConn();
  const [run] = await db.insert(ingestRuns).values({ startedAt: new Date() }).returning();
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  let errors = 0;

  try {
    // 1. Equipos
    const teamRows = (await laliga.teams()).map(parseTeam);
    await db.insert(teams).values(teamRows).onConflictDoUpdate({ target: teams.id, set: excluded(teams, ["id"]) });
    log(`equipos: ${teamRows.length}`);

    // 2. Jugadores (valor actual, puntos, estado)
    const now = new Date();
    const playerRows = (await laliga.players()).map((p) => parsePlayer(p, now));
    for (const c of chunks(playerRows, 300)) {
      await db.insert(players).values(c).onConflictDoUpdate({ target: players.id, set: excluded(players, ["id"]) });
    }
    log(`jugadores: ${playerRows.length}`);

    // 3. Calendario de toda la temporada
    const { weekNumber } = await laliga.currentWeek();
    const weeks = Array.from({ length: SEASON_WEEKS }, (_, i) => i + 1);
    const cal = await pool(weeks, CONCURRENCY, async (w) => (await laliga.calendar(w)).map((m) => parseMatch(m, w)));
    const matchRows = cal.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    errors += cal.filter((r) => r.status === "rejected").length;
    for (const c of chunks(matchRows, 300)) {
      await db.insert(matches).values(c).onConflictDoUpdate({ target: matches.id, set: excluded(matches, ["id"]) });
    }
    log(`partidos: ${matchRows.length} (jornada actual ${weekNumber})`);

    // 4. Por jugador activo: histórico de valor (con pujas) y estadísticas por jornada
    const active = playerRows.filter(isActive).slice(0, LIMIT);
    let done = 0;
    const res = await pool(active, CONCURRENCY, async (p) => {
      const [values, detail] = await Promise.all([laliga.marketValues(p.id), laliga.player(p.id)]);
      const valueRows = parseMarketValues(p.id, values);
      const weekRows = parsePlayerWeeks(detail);
      for (const c of chunks(valueRows, 500)) {
        await db.insert(playerValues).values(c)
          .onConflictDoUpdate({ target: [playerValues.playerId, playerValues.day], set: excluded(playerValues, ["playerId", "day"]) });
      }
      if (weekRows.length) {
        await db.insert(playerWeeks).values(weekRows)
          .onConflictDoUpdate({ target: [playerWeeks.playerId, playerWeeks.week], set: excluded(playerWeeks, ["playerId", "week"]) });
      }
      if (++done % 100 === 0) log(`detalle: ${done}/${active.length}`);
    });
    const failed = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    errors += failed.length;
    failed.slice(0, 5).forEach((f) => console.error("  fallo:", String(f.reason)));
    log(`detalle: ${active.length - failed.length}/${active.length} ok`);

    // Más de un 10 % de fallos = algo cambió en la API: avisar.
    const ok = failed.length <= active.length * 0.1;
    await db.update(ingestRuns)
      .set({ finishedAt: new Date(), ok, players: active.length - failed.length, errors })
      .where(eq(ingestRuns.id, run.id));
    if (!ok) throw new Error(`Demasiados fallos (${failed.length}). ¿Ha cambiado la API?`);
    log("fin");
  } catch (e) {
    await db.update(ingestRuns)
      .set({ finishedAt: new Date(), ok: false, errors, note: String(e) })
      .where(eq(ingestRuns.id, run.id));
    throw e;
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
