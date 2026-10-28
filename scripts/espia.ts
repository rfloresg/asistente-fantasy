// El Espía: publica en Telegram lo que pasa en tu liga. Solo lee, nunca toca nada.
// Uso:
//   npm run espia            avisos de actividad nueva (fichajes, ventas, cláusulas...)
//   npm run espia resumen    resumen diario (una vez al día)
//   npm run espia preview    muestra en la terminal lo que publicaría, sin enviar nada
// Config (.env o secretos de GitHub): LIGA_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import "dotenv/config";
import { and, eq, inArray, max } from "drizzle-orm";
import { getConn, type Db } from "../src/db";
import { espiaEvents, espiaState, players, playerScores, playerValues } from "../src/db/schema";
import { getAccessToken } from "../src/lib/laliga/auth";
import { leagueClient, myLeagues, type Activity } from "../src/lib/espia/league";
import { activityMessage, dailySummary, esc, type Ctx } from "../src/lib/espia/messages";
import { pack, sendMessage } from "../src/lib/espia/telegram";

const mode = process.argv[2] ?? "eventos";
const MAX_AGE_H = 48; // actividad más vieja no se avisa
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

async function buildCtx(db: Db, standing: Awaited<ReturnType<ReturnType<typeof leagueClient>["standing"]>>, acts: Activity[]): Promise<Ctx> {
  const managers = new Map<string, string>();
  for (const s of standing) {
    const name = s.team.manager?.managerName;
    if (!name) continue;
    if (s.team.manager?.id) managers.set(String(s.team.manager.id), name);
    if (s.team.managerId != null) managers.set(String(s.team.managerId), name);
  }
  const pl = await db.select({ id: players.id, nickname: players.nickname, value: players.marketValue }).from(players);
  const playersMap = new Map(pl.map((p) => [p.id, { nickname: p.nickname, value: p.value }]));

  const ids = [...new Set(acts.map((a) => String(a.playerMasterId ?? "")).filter(Boolean))];
  const vals = ids.length
    ? await db.select().from(playerValues).where(inArray(playerValues.playerId, ids))
    : [];
  const byKey = new Map(vals.map((v) => [`${v.playerId}|${v.day}`, v.value]));
  return { managers, players: playersMap, valueOn: (id, day) => byKey.get(`${id}|${day}`) };
}

async function send(chatId: string | undefined, messages: string[]) {
  if (mode === "preview" || !chatId) {
    for (const m of messages) console.log(`\n${m.replace(/<\/?b>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}`);
    return;
  }
  for (const m of messages) await sendMessage(chatId, m);
}

async function main() {
  const leagueId = process.env.LIGA_ID;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!leagueId) throw new Error("Falta LIGA_ID (sale en npm run liga:probe, p. ej. 018477470)");
  if (mode !== "preview" && !chatId) throw new Error("Falta TELEGRAM_CHAT_ID (npm run telegram:chat)");

  const { db, close } = await getConn();
  try {
    const token = await getAccessToken(db);
    const liga = leagueClient(token, leagueId);
    const leagueName = (await myLeagues(token)).find((l) => String(l.id) === leagueId)?.name?.trim() ?? "Tu liga";
    const standing = await liga.standing();

    // Actividad: hasta 3 páginas o hasta salir de las últimas 48 h
    const acts: Activity[] = [];
    for (let page = 0; page < 3; page++) {
      const batch = await liga.activity(page);
      acts.push(...batch);
      const oldest = batch.at(-1)?.createdAt;
      if (!batch.length || (oldest && Date.now() - Date.parse(oldest) > MAX_AGE_H * 3600e3)) break;
    }
    const ctx = await buildCtx(db, standing, acts);

    if (mode === "eventos" || mode === "preview") {
      const seen = new Set(
        (await db.select({ id: espiaEvents.activityId }).from(espiaEvents).where(eq(espiaEvents.leagueId, leagueId))).map((r) => r.id),
      );
      const firstRun = seen.size === 0;
      const fresh = acts
        .filter((a) => !seen.has(String(a.id)) && Date.now() - Date.parse(a.createdAt) < MAX_AGE_H * 3600e3)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const lines = fresh.flatMap((a) => activityMessage(a, ctx) ?? []);

      if (mode === "preview") {
        console.log(`== ${leagueName}: últimas actividades (${lines.length})`);
        await send(undefined, pack(lines));
      } else if (firstRun) {
        // Primera vez: no publicamos el historial, solo avisamos de que está activo
        await send(chatId, [`🕵️ <b>Espía activado</b> en ${esc(leagueName)}. Desde ahora publicaré fichajes, ventas y cláusulas, y un resumen cada mañana.`]);
      } else if (lines.length) {
        await send(chatId, pack(lines));
      }
      if (mode !== "preview" && acts.length) {
        const now = new Date();
        await db
          .insert(espiaEvents)
          .values(acts.map((a) => ({ leagueId, activityId: String(a.id), createdAt: new Date(a.createdAt), sentAt: firstRun ? null : now })))
          .onConflictDoNothing();
      }
      console.log(`${leagueName}: ${fresh.length} actividades nuevas, ${lines.length} avisos${firstRun && mode !== "preview" ? " (primera vez: solo mensaje de activación)" : ""}`);
    }

    if (mode === "resumen" || mode === "preview") {
      const day = today();
      const [state] = await db.select().from(espiaState).where(eq(espiaState.leagueId, leagueId));
      if (mode === "resumen" && state?.lastSummaryDay === day && !process.env.FORCE) {
        console.log("Resumen de hoy ya enviado");
        return;
      }
      const teams = [];
      for (const s of standing) teams.push(await liga.team(String(s.team.id)));
      const market = await liga.market();
      const [{ d }] = await db.select({ d: max(playerScores.day) }).from(playerScores);
      const ids = market.map((m) => String(m.playerMaster.id));
      const notas = d && ids.length
        ? await db.select({ id: playerScores.playerId, nota: playerScores.nota, action: playerScores.action }).from(playerScores)
            .where(and(eq(playerScores.day, d), inArray(playerScores.playerId, ids)))
        : [];
      const last24h = acts.filter((a) => Date.now() - Date.parse(a.createdAt) < 24 * 3600e3);
      const text = dailySummary({
        leagueName, day, standing, teams, last24h, market,
        notas: new Map(notas.map((n) => [n.id, { nota: n.nota, action: n.action }])),
        ctx,
      });
      await send(mode === "preview" ? undefined : chatId, pack(text.split("\n")));
      if (mode === "resumen") {
        await db.insert(espiaState).values({ leagueId, lastSummaryDay: day })
          .onConflictDoUpdate({ target: espiaState.leagueId, set: { lastSummaryDay: day } });
        console.log("Resumen enviado");
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
