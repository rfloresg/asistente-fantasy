// El Espía: publica en Telegram lo que pasa en tu liga. Solo lee, nunca toca nada.
// Uso:
//   npm run espia            avisos de actividad nueva (fichajes, ventas, cláusulas...)
//   npm run espia resumen    resumen diario (una vez al día)
//   npm run espia preview    muestra en la terminal lo que publicaría, sin enviar nada
// Config (.env o secretos de GitHub): TELEGRAM_BOT_TOKEN y
//   ESPIA_LIGAS=liga:chat,liga:chat   (varias ligas, cada una con su grupo)
//   o LIGA_ID + TELEGRAM_CHAT_ID        (una sola liga)

import "dotenv/config";
import { and, eq, inArray, max } from "drizzle-orm";
import { getConn, type Db } from "../src/db";
import { espiaEvents, espiaState, players, playerScores, playerValues } from "../src/db/schema";
import { getAccessToken } from "../src/lib/laliga/auth";
import { leagueClient, myLeagues, type Activity } from "../src/lib/espia/league";
import { activityMessage, clauseUnlocks, dailySummary, esc, unlockMessage, type Ctx } from "../src/lib/espia/messages";
import { estimateMoney, flows, parseMoney } from "../src/lib/espia/money";
import { pack, sendMessage } from "../src/lib/espia/telegram";

const mode = process.argv[2] ?? "eventos";
const MAX_AGE_H = 48; // actividad más vieja no se avisa
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

// "018477470:-5110647810,018218984:-100123" -> [{ leagueId, chatId }]
export function parseLeagues(env: NodeJS.ProcessEnv): { leagueId: string; chatId?: string }[] {
  if (env.ESPIA_LIGAS?.trim()) {
    return env.ESPIA_LIGAS.split(",").map((pair) => {
      const [leagueId, chatId] = pair.trim().split(":").map((x) => x.trim());
      return { leagueId, chatId: chatId || undefined };
    }).filter((l) => l.leagueId);
  }
  return env.LIGA_ID ? [{ leagueId: env.LIGA_ID, chatId: env.TELEGRAM_CHAT_ID }] : [];
}

async function main() {
  const leagues = parseLeagues(process.env);
  if (!leagues.length) throw new Error("Falta ESPIA_LIGAS (liga:chat,liga:chat) o LIGA_ID");
  if (mode !== "preview" && leagues.some((l) => !l.chatId)) throw new Error("Falta el chat de Telegram de alguna liga (npm run telegram:chat)");

  const { db, close } = await getConn();
  try {
    const token = await getAccessToken(db);
    const names = new Map((await myLeagues(token)).map((l) => [String(l.id), l.name?.trim()]));
    let failed = 0;
    for (const { leagueId, chatId } of leagues) {
      try {
        await runLeague(db, token, leagueId, chatId, names.get(leagueId) ?? "Tu liga");
      } catch (e) {
        failed++;
        console.error(`${leagueId}: ${String(e instanceof Error ? e.message : e)}`);
      }
    }
    if (failed) throw new Error(`${failed} liga(s) con error`);
  } finally {
    await close();
  }
}

async function runLeague(db: Db, token: string, leagueId: string, chatId: string | undefined, leagueName: string) {
  {
    const liga = leagueClient(token, leagueId);
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

      // Cláusulas que se han liberado en las últimas 48 h y no hemos avisado
      const teams = [];
      for (const st of standing) teams.push(await liga.team(String(st.team.id)));
      const unlocks = clauseUnlocks(teams, Date.now() - MAX_AGE_H * 3600e3, Date.now());
      const firstUnlocks = ![...seen].some((id) => id.startsWith("unlock:"));
      const newUnlocks = unlocks.filter((u) => !seen.has(u.key));
      if (mode === "preview" || (!firstRun && !firstUnlocks)) lines.push(...newUnlocks.map(unlockMessage));

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
      if (mode !== "preview" && (newUnlocks.length || firstUnlocks)) {
        // La primera vez solo se marcan como vistas; "unlock:init" recuerda que ya se hizo
        const silent = firstRun || firstUnlocks;
        const rows = newUnlocks.map((u) => ({ leagueId, activityId: u.key, createdAt: new Date(u.at), sentAt: silent ? null : new Date() }));
        if (firstUnlocks) rows.push({ leagueId, activityId: "unlock:init", createdAt: new Date(), sentAt: null });
        await db.insert(espiaEvents).values(rows).onConflictDoNothing();
      }
      console.log(`${leagueName}: ${fresh.length} actividades nuevas, ${lines.length} avisos${firstRun && mode !== "preview" ? " (primera vez: solo mensaje de activación)" : ""}`);
    }

    if (mode === "resumen" || mode === "preview") {
      const day = today();
      const [state] = await db.select().from(espiaState).where(eq(espiaState.leagueId, leagueId));
      if (mode === "resumen" && state?.lastSummaryDay === day && !process.env.FORCE) {
        console.log(`${leagueName}: resumen de hoy ya enviado`);
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
      // El dinero estimado solo se publica con ESPIA_DINERO=1 (en preview siempre se ve)
      const money = mode === "preview" || process.env.ESPIA_DINERO === "1" ? await estimateLeagueMoney(liga, standing) : undefined;
      const unlocksSoon = clauseUnlocks(teams, Date.now(), Date.now() + 24 * 3600e3);
      const text = dailySummary({
        leagueName, day, standing, teams, last24h, market,
        notas: new Map(notas.map((n) => [n.id, { nota: n.nota, action: n.action }])),
        ctx,
        prevPoints: state?.points ?? undefined,
        money,
        unlocksSoon,
      });
      await send(mode === "preview" ? undefined : chatId, pack(text.split("\n")));
      if (mode === "resumen") {
        const points = Object.fromEntries(standing.map((st) => [String(st.team.id), st.points]));
        await db.insert(espiaState).values({ leagueId, lastSummaryDay: day, points })
          .onConflictDoUpdate({ target: espiaState.leagueId, set: { lastSummaryDay: day, points } });
        console.log(`${leagueName}: resumen enviado`);
      }
    }
  }
}

type Liga = ReturnType<typeof leagueClient>;

// Dinero estimado por equipo. Necesita toda la actividad de la temporada y tu dinero real
// (la API solo te deja ver el tuyo). Si algo falla, el resumen sale sin esta parte.
async function estimateLeagueMoney(liga: Liga, standing: Awaited<ReturnType<Liga["standing"]>>) {
  try {
    let mine: { teamId: string; money: number } | null = null;
    for (const st of standing) {
      const m = parseMoney(await liga.money(String(st.team.id)));
      if (m !== null) {
        mine = { teamId: String(st.team.id), money: m };
        break;
      }
    }
    if (!mine) {
      console.log("Dinero: no pude leer el tuyo, el resumen sale sin dinero estimado");
      return undefined;
    }
    const all: Activity[] = [];
    for (let page = 0; page < 200; page++) {
      const batch = await liga.activity(page);
      const ids = new Set(all.map((a) => String(a.id)));
      if (!batch.length || batch.every((a) => ids.has(String(a.id)))) break; // fin del historial
      all.push(...batch);
      await sleep(300);
    }
    const idsOf = (st: (typeof standing)[number]) =>
      [...new Set([st.team.manager?.id, st.team.managerId].filter((x) => x != null).map(String))];
    const me = standing.find((st) => String(st.team.id) === mine!.teamId)!;
    const { start, money } = estimateMoney(all, { ids: idsOf(me), money: mine.money });
    const byTeam = new Map<string, number>();
    for (const st of standing) byTeam.set(String(st.team.id), start + idsOf(st).reduce((s, id) => s + ((money.get(id) ?? start) - start), 0));
    console.log(`Dinero: ${all.length} actividades, saldo inicial calculado ${(start / 1e6).toFixed(2)} M`);
    if (mode === "preview") {
      // Desglose de tus movimientos por tipo, para comprobar el cálculo
      const myIds = new Set(idsOf(me));
      const byType = new Map<number, { n: number; total: number }>();
      for (const a of all) {
        for (const [id, x] of flows(a)) {
          if (!myIds.has(id)) continue;
          const t = byType.get(a.activityTypeId) ?? { n: 0, total: 0 };
          byType.set(a.activityTypeId, { n: t.n + 1, total: t.total + x });
        }
      }
      const types = new Map<number, number>();
      for (const a of all) types.set(a.activityTypeId, (types.get(a.activityTypeId) ?? 0) + 1);
      console.log(`  Tu dinero real: ${(mine.money / 1e6).toFixed(2)} M`);
      for (const [t, v] of byType) console.log(`  Tipo ${t}: ${v.n} movimientos, ${(v.total / 1e6).toFixed(2)} M`);
      console.log(`  Tipos en la liga: ${[...types].map(([t, n]) => `${t}×${n}`).join(" ")}`);
      const oldest = all.at(-1)?.createdAt;
      console.log(`  Actividad más antigua: ${oldest ?? "?"}`);
    }
    return byTeam;
  } catch (e) {
    console.log(`Dinero: ${String(e instanceof Error ? e.message : e)}`);
    return undefined;
  }
}

if (process.argv[1]?.endsWith("espia.ts")) main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
