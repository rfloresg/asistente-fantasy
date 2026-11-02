// ¿Acierta la nota? Compara cada nota guardada con lo que pasó después. Uso: npm run validar
// Para tener más histórico: SCORE_DAYS=45 npm run score (recalcula notas pasadas; el estado
// de lesión es el de hoy, así que esos días son aproximados).

import "dotenv/config";
import { getConn } from "../src/db";
import { matches, playerScores, playerValues, playerWeeks } from "../src/db/schema";
import { CONFIG } from "../src/lib/nota/engine";
import { FACTORS, outcomes, report, suggestWeights, HORIZON_DAYS, NEXT_WEEKS } from "../src/lib/nota/validate";

const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const pct = (x: number | null) => (x === null ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} %`);
const n2 = (x: number | null) => (x === null ? "–" : x.toFixed(2));
const n1 = (x: number | null) => (x === null ? "–" : x.toFixed(1));
const NAMES: Record<string, string> = { nota: "Nota", f: "Forma", t: "Tendencia", p: "Pts/millón", m: "Minutos", c: "Calendario" };

async function main() {
  const { db, close } = await getConn();
  try {
    const [rows, vals, wks, mts] = await Promise.all([
      db.select().from(playerScores),
      db.select({ playerId: playerValues.playerId, day: playerValues.day, value: playerValues.value }).from(playerValues),
      db.select({ playerId: playerWeeks.playerId, week: playerWeeks.week, points: playerWeeks.points }).from(playerWeeks),
      db.select({ week: matches.week, date: matches.date, state: matches.state }).from(matches),
    ]);
    if (!rows.length) throw new Error("No hay notas guardadas. Ejecuta npm run score (o SCORE_DAYS=45 npm run score).");

    const values = new Map<string, Map<string, number>>();
    for (const v of vals) {
      if (!values.has(v.playerId)) values.set(v.playerId, new Map());
      values.get(v.playerId)!.set(v.day, v.value);
    }
    const points = new Map<string, Map<number, number>>();
    for (const w of wks) {
      if (!points.has(w.playerId)) points.set(w.playerId, new Map());
      points.get(w.playerId)!.set(w.week, w.points);
    }
    const weekStart = new Map<number, string>();
    const unfinished = new Set<number>();
    for (const m of mts) {
      const d = madridDay(m.date);
      if (!weekStart.has(m.week) || d < weekStart.get(m.week)!) weekStart.set(m.week, d);
      if (m.state !== 7) unfinished.add(m.week);
    }
    const played = new Set([...weekStart.keys()].filter((w) => !unfinished.has(w)));

    const days = [...new Set(rows.map((r) => r.day))].sort();
    const os = outcomes(rows, values, points, weekStart, played);
    const r = report(os);

    console.log(`Notas guardadas: ${rows.length} (${days.length} días, del ${days[0]} al ${days.at(-1)})`);
    console.log(`Con valor a ${HORIZON_DAYS} días: ${r.n.value} · con puntos de las ${NEXT_WEEKS} jornadas siguientes: ${r.n.points}`);
    if (r.n.value < 200) console.log("Ojo: pocos datos. Con SCORE_DAYS=45 npm run score tendrás más (aproximado).");

    console.log("\n¿Acierta cada factor? Correlación de rangos (-1 a 1; >0,1 ya ayuda, >0,3 es buena)");
    console.log("Factor        · valor a 7 días · puntos 2 jornadas");
    for (const f of FACTORS) console.log(`${NAMES[f].padEnd(13)} · ${n2(r.corr[f].value).padStart(14)} · ${n2(r.corr[f].points).padStart(17)}`);

    console.log("\nPor recomendación");
    for (const [a, g] of Object.entries(r.byAction)) {
      console.log(`${a.padEnd(9)} · ${String(g.n).padStart(6)} notas · valor ${pct(g.valueChange)} (sube el ${g.up === null ? "–" : Math.round(g.up * 100)} %) · ${n1(g.points)} pts en 2 jornadas`);
    }

    console.log("\nPor tramos de nota (de peor a mejor)");
    for (const q of r.quintiles) console.log(`nota ${String(q.from).padStart(3)}-${String(q.to).padEnd(3)} · ${String(q.n).padStart(6)} · valor ${pct(q.valueChange)} · ${n1(q.points)} pts`);

    console.log(`\nEspecular (valor esperado > valor): ${r.spec.n} casos · subió el ${r.spec.up === null ? "–" : Math.round(r.spec.up * 100)} % · error medio del esperado ${pct(r.spec.meanError)}`);

    const w = suggestWeights(r);
    console.log("\nPesos actuales :", JSON.stringify(CONFIG.weights));
    console.log("Pesos sugeridos:", w ? JSON.stringify(w) : "sin datos suficientes");
    console.log("Los pesos sugeridos son proporcionales a lo que acierta cada factor. Cámbialos en CONFIG (src/lib/nota/engine.ts) solo si hay muchos datos.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
