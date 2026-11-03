// Pasa lo de antes (una sola cuenta, la tuya) al modelo con usuarios. Se puede repetir sin duplicar.
// - Crea tu usuario (administrador) con tu chat privado de Telegram (ESPIA_PLAN_CHAT)
// - Copia tu sesión de LaLiga (app_secrets) a laliga_sessions, cifrada con SESSION_KEY
// - Da de alta las ligas de ESPIA_LIGAS con su grupo y te pone como dueño
// Uso: npm run usuarios:migrar   (con SESSION_KEY en el .env)

import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { getConn } from "../src/db";
import { appSecrets, espiaPlans, laligaSessions, leagues, memberships, users } from "../src/db/schema";
import { REDIRECT_URI, saveUserSession } from "../src/lib/laliga/auth";
import { parseLeagues } from "./espia";

async function main() {
  const { db, close } = await getConn();
  try {
    let [admin] = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
    if (!admin) {
      [admin] = await db.insert(users).values({
        name: process.env.ADMIN_NAME ?? "Rubén",
        telegramId: process.env.ESPIA_PLAN_CHAT || null,
        isAdmin: true,
        createdAt: new Date(),
      }).returning();
      console.log(`Usuario creado: ${admin.name} (id ${admin.id})`);
    } else {
      console.log(`Ya existía tu usuario: ${admin.name} (id ${admin.id})`);
    }

    const [hasSession] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, admin.id));
    const [legacy] = await db.select().from(appSecrets).where(eq(appSecrets.key, "laliga_refresh_token"));
    if (!hasSession && legacy) {
      await saveUserSession(db, admin.id, legacy.value, REDIRECT_URI);
      console.log("Sesión de LaLiga copiada y cifrada");
    }

    for (const { leagueId, chatId } of parseLeagues(process.env)) {
      await db.insert(leagues).values({ leagueId, name: leagueId, groupChatId: chatId ?? null, groupOwnerId: admin.id, active: true, createdAt: new Date() })
        .onConflictDoUpdate({ target: leagues.leagueId, set: { groupChatId: chatId ?? null, groupOwnerId: admin.id, active: true } });
      await db.insert(memberships).values({ userId: admin.id, leagueId, plan: true, createdAt: new Date() }).onConflictDoNothing();
      console.log(`Liga ${leagueId} → grupo ${chatId ?? "sin grupo"}`);
    }

    // Nombres de las ligas a partir de los planes guardados
    const plans = await db.select({ leagueId: espiaPlans.leagueId, name: espiaPlans.leagueName }).from(espiaPlans);
    for (const p of plans) await db.update(leagues).set({ name: p.name }).where(eq(leagues.leagueId, p.leagueId));
    await db.update(espiaPlans).set({ userId: admin.id }).where(isNull(espiaPlans.userId));
    console.log("Listo.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
