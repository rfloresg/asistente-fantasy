// Borra todo lo guardado de una liga (planes, avisos vistos, cláusulas, resúmenes).
// Uso: npm run liga:olvidar 018477470
// Antes quítala de ESPIA_LIGAS (en .env y en el secreto de GitHub), o volverá a aparecer.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { getConn } from "../src/db";
import { espiaClauses, espiaDone, espiaEvents, espiaPlans, espiaRaises, espiaState } from "../src/db/schema";

async function main() {
  const leagueId = process.argv[2]?.trim();
  if (!leagueId || !/^\d+$/.test(leagueId)) throw new Error("Uso: npm run liga:olvidar <id de la liga>");
  const { db, close } = await getConn();
  try {
    const plans = await db.delete(espiaPlans).where(eq(espiaPlans.leagueId, leagueId)).returning({ id: espiaPlans.id });
    await db.delete(espiaEvents).where(eq(espiaEvents.leagueId, leagueId));
    await db.delete(espiaState).where(eq(espiaState.leagueId, leagueId));
    await db.delete(espiaClauses).where(eq(espiaClauses.leagueId, leagueId));
    await db.delete(espiaRaises).where(eq(espiaRaises.leagueId, leagueId));
    await db.delete(espiaDone).where(eq(espiaDone.leagueId, leagueId));
    console.log(`Liga ${leagueId} borrada (${plans.length} planes y todo lo demás).`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
