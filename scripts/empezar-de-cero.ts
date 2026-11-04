// Empezar de cero: borra TODOS los usuarios (también a tus amigos; para uno solo, npm run usuario:borrar) con sus sesiones de LaLiga, planes, ligas y grupos,
// como si nadie hubiera usado nunca el servicio. Lo de las ligas que ya ha visto el Espía (fichajes
// avisados, cláusulas) se queda, para que al volver a activarlo no repita avisos viejos en el grupo.
// Uso: npm run empezar-de-cero -- --si

import "dotenv/config";
import { isNull, notLike } from "drizzle-orm";
import { getConn } from "../src/db";
import { espiaDone, espiaPlans, leagues, users } from "../src/db/schema";
import { deleteUser } from "../src/lib/borrar";

async function main() {
  const { db, close } = await getConn();
  try {
    const all = await db.select({ id: users.id, name: users.name }).from(users);
    if (!process.argv.includes("--si")) {
      console.log(`Esto borra ${all.length} usuario(s): ${all.map((u) => u.name).join(", ") || "ninguno"}, con sus sesiones, planes, ligas y grupos.`);
      console.log("No se puede deshacer. Para hacerlo: npm run empezar-de-cero -- --si");
      return;
    }
    for (const u of all) await deleteUser(db, u.id);
    // Planes y "hecho" de antes de los usuarios
    await db.delete(espiaPlans).where(isNull(espiaPlans.userId));
    await db.delete(espiaDone).where(notLike(espiaDone.key, "u%:%"));
    // Ligas como nuevas: sin grupo, apagadas y con los ajustes por defecto
    await db.update(leagues).set({ active: false, groupChatId: null, groupOwnerId: null, showMoney: false, showRaises: false });
    const left = await db.select().from(users);
    console.log(`Listo: ${all.length} usuario(s) borrado(s). Quedan ${left.length}. Entra por el bot como si fueras nuevo.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
