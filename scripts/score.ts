// Calcula y guarda la Nota Fantasy. Uso: npm run score
//   SCORE_DAYS=30  recalcula también los 30 días anteriores (para validar)
// Ojo: el estado (lesión, sanción) es el de hoy; en días pasados no es exacto.

import "dotenv/config";
import { getTableColumns, max, sql, type SQL } from "drizzle-orm";
import { getConn } from "../src/db";
import { matches, players, playerScores, playerValues, playerWeeks } from "../src/db/schema";
import { addDays, computeScores } from "../src/lib/nota/engine";

const DAYS = Number(process.env.SCORE_DAYS ?? 1);

async function main() {
  const { db, close } = await getConn();
  try {
    const [{ last }] = await db.select({ last: max(playerValues.day) }).from(playerValues);
    if (!last) throw new Error("Sin valores. Ejecuta antes npm run ingest.");

    const [pl, vals, wks, mts] = await Promise.all([
      db.select().from(players),
      db.select().from(playerValues),
      db.select().from(playerWeeks),
      db.select().from(matches),
    ]);

    const values = new Map<string, Map<string, number>>();
    for (const v of vals) {
      if (!values.has(v.playerId)) values.set(v.playerId, new Map());
      values.get(v.playerId)!.set(v.day, v.value);
    }
    const weeks = new Map<string, Map<number, { points: number; minutes: number }>>();
    for (const w of wks) {
      if (!weeks.has(w.playerId)) weeks.set(w.playerId, new Map());
      weeks.get(w.playerId)!.set(w.week, { points: w.points, minutes: w.minutes });
    }

    const set: Record<string, SQL> = {};
    for (const [prop, col] of Object.entries(getTableColumns(playerScores))) {
      if (prop !== "playerId" && prop !== "day") set[prop] = sql.raw(`excluded."${col.name}"`);
    }

    for (let i = DAYS - 1; i >= 0; i--) {
      const asOf = addDays(last, -i);
      const scores = computeScores({ asOf, players: pl, values, weeks, matches: mts });
      for (let k = 0; k < scores.length; k += 200) {
        await db.insert(playerScores).values(scores.slice(k, k + 200))
          .onConflictDoUpdate({ target: [playerScores.playerId, playerScores.day], set });
      }
      const count = (a: string) => scores.filter((s) => s.action === a).length;
      console.log(`${asOf}: ${scores.length} notas · fichar ${count("fichar")} · vender ${count("vender")}`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
