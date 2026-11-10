// ¿Qué fuente de onces acierta más los titulares? Uso: npm run aciertos
// Necesita jornadas terminadas con onces guardados de antes del partido (se guardan solos cada día).

import "dotenv/config";
import { getConn } from "../src/db";
import { lineups, lineupsAf, matches, players, playerWeeks } from "../src/db/schema";
import { lineupAccuracy, STARTED_MIN, type Score } from "../src/lib/onces/aciertos";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "–");
const line = (name: string, s: Score) =>
  `${name.padEnd(26)} · ${String(s.n).padStart(5)} · ${pct(s.hits, s.n).padStart(8)} · ${pct(s.startersHit, s.starters).padStart(17)} · ${s.brier === null ? "–" : s.brier.toFixed(3)}`;

async function main() {
  const { db, close } = await getConn();
  try {
    const [ff, af, ms, ps, wks] = await Promise.all([
      db.select({ playerId: lineups.playerId, fetchedAt: lineups.fetchedAt, starter: lineups.starter, prob: lineups.prob }).from(lineups),
      db.select({ playerId: lineupsAf.playerId, fetchedAt: lineupsAf.fetchedAt, starter: lineupsAf.starter, prob: lineupsAf.prob }).from(lineupsAf),
      db.select({ week: matches.week, date: matches.date, localId: matches.localId, visitorId: matches.visitorId, state: matches.state }).from(matches),
      db.select({ id: players.id, teamId: players.teamId }).from(players),
      db.select({ playerId: playerWeeks.playerId, week: playerWeeks.week, minutes: playerWeeks.minutes }).from(playerWeeks),
    ]);
    const minutes = new Map<string, Map<number, number>>();
    for (const w of wks) {
      if (!minutes.has(w.playerId)) minutes.set(w.playerId, new Map());
      minutes.get(w.playerId)!.set(w.week, w.minutes);
    }
    const r = lineupAccuracy({
      sources: { "Futbol Fantasy": ff, "Analítica Fantasy": af },
      teamOf: new Map(ps.filter((p) => p.teamId).map((p) => [p.id, p.teamId!])),
      matches: ms,
      minutes,
    });
    if (!r.weeks.length) {
      console.log("Aún no hay jornadas terminadas con onces guardados de antes del partido. Vuelve después de la próxima jornada.");
      return;
    }
    console.log(`Jornadas: ${r.weeks.join(", ")} · titular = más de ${STARTED_MIN} min jugados`);
    const head = `${"Fuente".padEnd(26)} · ${"n".padStart(5)} · ${"aciertos".padStart(8)} · ${"titulares que salen".padStart(17)} · error prob.`;
    console.log(`\nCada fuente con todo lo que predijo\n${head}`);
    for (const [k, s] of Object.entries(r.alone)) console.log(line(k, s));
    console.log(`\nMismos jugadores en las dos (lo justo para comparar)\n${head}`);
    for (const [k, s] of Object.entries(r.common)) console.log(line(k, s));
    console.log(`\nUna dice titular y la otra no: ${r.disputes.n}`);
    for (const [k, n] of Object.entries(r.disputes.right)) console.log(`  acertó ${k}: ${n} (${pct(n, r.disputes.n)})`);
    console.log("\nError prob.: 0 es perfecto, 0,25 es tirar una moneda. Con pocas jornadas, no cambies nada todavía.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
