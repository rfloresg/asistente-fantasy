// Calcula y guarda la Nota Fantasy. Uso: npm run score
//   SCORE_DAYS=30  recalcula también los 30 días anteriores (para validar)
// Ojo: el estado (lesión, sanción) es el de hoy; en días pasados no es exacto.

import "dotenv/config";
import { getTableColumns, max, sql, type SQL } from "drizzle-orm";
import { getConn } from "../src/db";
import { lineups, lineupsAf, matches, players, playerScores, playerValues, playerWeeks } from "../src/db/schema";
import { combine, type LineupSource } from "../src/lib/onces/combine";
import { breakdown, type WeekLine } from "../src/lib/nota/breakdown";
import { addDays, computeScores } from "../src/lib/nota/engine";

const DAYS = Number(process.env.SCORE_DAYS ?? 1);

async function main() {
  const { db, close } = await getConn();
  try {
    const [{ last }] = await db.select({ last: max(playerValues.day) }).from(playerValues);
    if (!last) throw new Error("Sin valores. Ejecuta antes npm run ingest.");

    const [pl, vals, wks, mts, lus, lusAf] = await Promise.all([
      db.select().from(players),
      db.select().from(playerValues),
      db.select().from(playerWeeks),
      db.select().from(matches),
      db.select().from(lineups),
      db.select().from(lineupsAf),
    ]);

    const values = new Map<string, Map<string, number>>();
    for (const v of vals) {
      if (!values.has(v.playerId)) values.set(v.playerId, new Map());
      values.get(v.playerId)!.set(v.day, v.value);
    }
    // Cada jornada con el desglose de sus puntos (goles, asistencias, portería y lo fijo)
    const weeks = new Map<string, Map<number, WeekLine>>();
    for (const w of wks) {
      if (!weeks.has(w.playerId)) weeks.set(w.playerId, new Map());
      weeks.get(w.playerId)!.set(w.week, breakdown(w.points, w.minutes, w.stats));
    }

    const set: Record<string, SQL> = {};
    for (const [prop, col] of Object.entries(getTableColumns(playerScores))) {
      if (prop !== "playerId" && prop !== "day") set[prop] = sql.raw(`excluded."${col.name}"`);
    }

    for (let i = DAYS - 1; i >= 0; i--) {
      const asOf = addDays(last, -i);
      // Onces probables de ese día (o del anterior si hoy no se pudo leer), de las dos fuentes juntas
      const bySrc = new Map<string, Map<string, LineupSource>>();
      const put = (id: string, x: LineupSource) => { if (!bySrc.has(id)) bySrc.set(id, new Map()); bySrc.get(id)!.set(x.source, x); };
      for (const d of [addDays(asOf, -1), asOf]) {
        for (const l of lus) if (l.day === d) put(l.playerId, { source: "Futbol Fantasy", starter: l.starter, prob: l.prob });
        for (const l of lusAf) if (l.day === d) put(l.playerId, { source: "Analítica Fantasy", starter: l.starter, prob: l.prob, info: l.info });
      }
      const lineupFor = new Map<string, { starter: boolean; prob: number | null; sources: { source: string; starter: boolean; prob: number }[]; info: string | null }>();
      for (const [id, m] of bySrc) { const c = combine([...m.values()]); if (c) lineupFor.set(id, c); }
      const scores = computeScores({ asOf, players: pl, values, weeks, matches: mts, lineups: lineupFor });
      for (let k = 0; k < scores.length; k += 200) {
        await db.insert(playerScores).values(scores.slice(k, k + 200))
          .onConflictDoUpdate({ target: [playerScores.playerId, playerScores.day], set });
      }
      const count = (a: string) => scores.filter((s) => s.action === a).length;
      const withXp = scores.filter((s) => s.xp !== null).length;
      const disputes = [...lineupFor.values()].filter((l) => l.sources.length > 1 && (new Set(l.sources.map((x) => x.starter)).size > 1)).length;
      console.log(`${asOf}: ${scores.length} notas · con puntos esperados ${withXp} · fichar ${count("fichar")} · vender ${count("vender")} · con once ${lineupFor.size} (las fuentes no coinciden en ${disputes})`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
