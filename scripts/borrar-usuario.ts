// Borra un solo usuario (también el administrador) para probar el alta desde cero. No toca a los demás.
// Uso: npm run usuario:borrar            → lista los usuarios
//      npm run usuario:borrar -- 3       → enseña qué borraría del usuario 3
//      npm run usuario:borrar -- 3 --si  → lo borra
// Al volver a entrar por el bot, si tu Telegram es ADMIN_TELEGRAM_ID, vuelves a ser administrador.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { getConn } from "../src/db";
import { laligaSessions, leagues, memberships, users } from "../src/db/schema";
import { deleteUser } from "../src/lib/borrar";

async function main() {
  const { db, close } = await getConn();
  try {
    const id = Number(process.argv.find((a) => /^\d+$/.test(a)));
    const all = await db.select().from(users).orderBy(users.id);
    if (!id) {
      console.log("Usuarios (id · nombre · Telegram):");
      for (const u of all) console.log(`  ${u.id} · ${u.name}${u.isAdmin ? " (administrador)" : ""} · ${u.telegramId ?? "sin Telegram"}`);
      console.log("\nPara borrar uno: npm run usuario:borrar -- <id>");
      return;
    }
    const u = all.find((x) => x.id === id);
    if (!u) throw new Error(`No hay ningún usuario con id ${id}`);
    const ls = await db.select({ name: leagues.name }).from(memberships).innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId)).where(eq(memberships.userId, id));
    const owned = await db.select({ name: leagues.name }).from(leagues).where(eq(leagues.groupOwnerId, id));
    const [s] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, id));
    if (!process.argv.includes("--si")) {
      console.log(`Borraría a ${u.name}${u.isAdmin ? " (administrador)" : ""}: ${s ? "su sesión de LaLiga, " : ""}sus planes, su actividad y sus ligas (${ls.map((l) => l.name).join(", ") || "ninguna"}).`);
      if (owned.length) console.log(`El Espía de ${owned.map((l) => l.name).join(", ")} pasará a otro miembro conectado; si no hay nadie, dejará de publicar hasta que lo vuelvas a activar.`);
      console.log(`Para hacerlo: npm run usuario:borrar -- ${id} --si`);
      return;
    }
    await deleteUser(db, id);
    console.log(`Borrado ${u.name}. Escribe /start al bot para empezar como nuevo.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
