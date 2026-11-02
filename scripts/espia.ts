// El Espía: publica en Telegram lo que pasa en tu liga. Solo lee, nunca toca nada.
// Uso:
//   npm run espia            avisos de actividad nueva (fichajes, ventas, cláusulas...)
//   npm run espia resumen    resumen diario (una vez al día)
//   npm run espia plan       tu plan del día (qué vender, proteger, pujar, clausular). Solo a ti:
//                            se envía al chat privado ESPIA_PLAN_CHAT y se guarda para la web
//   npm run espia preview    muestra en la terminal lo que publicaría, sin enviar nada
// Config (.env o secretos de GitHub): TELEGRAM_BOT_TOKEN y
//   ESPIA_LIGAS=liga:chat,liga:chat   (varias ligas, cada una con su grupo)
//   o LIGA_ID + TELEGRAM_CHAT_ID        (una sola liga)

import "dotenv/config";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { getConn, type Db } from "../src/db";
import { espiaClauses, espiaEvents, espiaPlans, espiaRaises, espiaState, matches, players, playerScores, playerValues } from "../src/db/schema";
import { metaAlerts, nextMatchday } from "../src/lib/meta/calendario";
import { dailyPlan, planMessage } from "../src/lib/plan/plan";
import { getAccessToken } from "../src/lib/laliga/auth";
import { leagueClient, myLeagues, type Activity } from "../src/lib/espia/league";
import { activityMessage, clauseUnlocks, dailySummary, esc, unlockMessage, type Ctx } from "../src/lib/espia/messages";
import { clauseRaises, estimateTeamMoney, netByManager, parseMoney, START_MONEY } from "../src/lib/espia/money";
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
    // El dinero necesita todo el historial: se calcula una vez por liga y pasada
    let moneyMemo: ReturnType<typeof estimateLeagueMoney> | null = null;
    const getMoney = () => (moneyMemo ??= estimateLeagueMoney(db, liga, leagueId, standing));

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
      // Subidas de cláusula: se publican con ESPIA_SUBIDAS=1 (en preview siempre se ven)
      const raiseLines = await trackClauses(db, leagueId, teams, ctx);
      if (mode === "preview" || process.env.ESPIA_SUBIDAS === "1") lines.push(...raiseLines);

      // Avisos del meta: cierre de mercado y parón (una vez cada uno)
      const mts = await db.select({ week: matches.week, date: matches.date }).from(matches);
      const meta = metaAlerts(nextMatchday(mts, new Date()), new Date()).filter((m) => !seen.has(m.key));
      lines.push(...meta.map((m) => m.text));
      if (mode !== "preview" && meta.length) {
        await db.insert(espiaEvents).values(meta.map((m) => ({ leagueId, activityId: m.key, createdAt: new Date(), sentAt: new Date() }))).onConflictDoNothing();
      }

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
      const money = mode === "preview" || process.env.ESPIA_DINERO === "1" ? (await getMoney())?.byTeam : undefined;
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

    if (mode === "plan" || mode === "preview") await runPlan(db, liga, leagueId, leagueName, standing, await getMoney());
  }
}

type Liga = ReturnType<typeof leagueClient>;

// Dinero estimado por equipo: 100 M iniciales + actividad de la temporada - subidas de cláusula
// detectadas. El tuyo es el real (la API solo te deja ver el tuyo). Si algo falla, el resumen sale sin esto.
async function estimateLeagueMoney(db: Db, liga: Liga, leagueId: string, standing: Awaited<ReturnType<Liga["standing"]>>) {
  try {
    const all: Activity[] = [];
    for (let page = 0; page < 200; page++) {
      const batch = await liga.activity(page);
      const ids = new Set(all.map((a) => String(a.id)));
      if (!batch.length || batch.every((a) => ids.has(String(a.id)))) break; // fin del historial
      all.push(...batch);
      await sleep(300);
    }
    const net = netByManager(all);
    const raises = await db
      .select({ teamId: espiaRaises.teamId, cost: sql<number>`sum(${espiaRaises.cost})`.mapWith(Number) })
      .from(espiaRaises).where(eq(espiaRaises.leagueId, leagueId)).groupBy(espiaRaises.teamId);
    const spent = new Map(raises.map((r) => [r.teamId, r.cost]));
    const idsOf = (st: (typeof standing)[number]) =>
      [...new Set([st.team.manager?.id, st.team.managerId].filter((x) => x != null).map(String))];

    const byTeam = new Map<string, number>();
    let mine: { teamId: string; money: number; estimate: number } | null = null;
    for (const st of standing) {
      const teamId = String(st.team.id);
      const estimate = estimateTeamMoney(net, idsOf(st), spent.get(teamId) ?? 0);
      const real: number | null = mine ? null : parseMoney(await liga.money(teamId));
      if (real !== null) mine = { teamId, money: real, estimate };
      byTeam.set(teamId, real ?? estimate);
    }
    console.log(`Dinero: ${all.length} actividades, saldo inicial ${(START_MONEY / 1e6).toFixed(0)} M`);
    if (mine) {
      const diff = mine.money - mine.estimate;
      console.log(`  Tu dinero real ${(mine.money / 1e6).toFixed(2)} M, estimado ${(mine.estimate / 1e6).toFixed(2)} M (diferencia ${(diff / 1e6).toFixed(2)} M: subidas de cláusula anteriores u otros gastos)`);
    }
    if (mode === "preview") {
      const types = new Map<number, number>();
      for (const a of all) types.set(a.activityTypeId, (types.get(a.activityTypeId) ?? 0) + 1);
      console.log(`  Tipos en la liga: ${[...types].map(([t, n]) => `${t}×${n}`).join(" ")} · más antigua ${all.at(-1)?.createdAt ?? "?"}`);
      // Tipos que no se cuentan como dinero: ejemplo de cada uno, para saber qué son
      for (const t of types.keys()) {
        if ([1, 4, 6, 31, 32, 33].includes(t)) continue;
        const ex = all.find((a) => a.activityTypeId === t)!;
        console.log(`  Tipo ${t} (no cuenta): ${JSON.stringify(ex)}`);
      }
    }
    return { byTeam, mine };
  } catch (e) {
    console.log(`Dinero: ${String(e instanceof Error ? e.message : e)}`);
    return undefined;
  }
}

// Guarda las cláusulas de hoy y apunta las subidas (mismo jugador, mismo equipo, cláusula más alta)
async function trackClauses(db: Db, leagueId: string, teams: Awaited<ReturnType<Liga["team"]>>[], ctx: Ctx) {
  const now = teams.flatMap((t) =>
    t.players.flatMap((p) => (p.buyoutClause ? [{ playerId: String(p.playerMaster.id), teamId: String(t.id), clause: p.buyoutClause, manager: t.manager?.managerName ?? "?" }] : [])),
  );
  const prev = await db.select().from(espiaClauses).where(eq(espiaClauses.leagueId, leagueId));
  const raised = clauseRaises(prev, now);
  const lines: string[] = [];
  if (mode !== "preview") {
    if (raised.length) {
      await db.insert(espiaRaises).values(raised.map((r) => ({ leagueId, teamId: r.teamId, playerId: r.playerId, increase: r.increase, cost: r.cost, at: new Date() })));
    }
    const stamp = new Date();
    for (let k = 0; k < now.length; k += 200) {
      await db.insert(espiaClauses)
        .values(now.slice(k, k + 200).map((c) => ({ leagueId, playerId: c.playerId, teamId: c.teamId, clause: c.clause, updatedAt: stamp })))
        .onConflictDoUpdate({ target: [espiaClauses.leagueId, espiaClauses.playerId], set: { teamId: sql.raw("excluded.team_id"), clause: sql.raw("excluded.clause"), updatedAt: stamp } });
    }
  }
  for (const r of raised) {
    const who = now.find((c) => c.playerId === r.playerId)?.manager ?? "?";
    const name = ctx.players.get(r.playerId)?.nickname ?? r.playerId;
    lines.push(`🔒 <b>${esc(who)}</b> sube la cláusula de <b>${esc(name)}</b> a ${fmtM(r.clause)} (le cuesta ${fmtM(r.cost)})`);
  }
  if (raised.length) console.log(`Cláusulas: ${raised.length} subidas detectadas`);
  return lines;
}

const fmtM = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;

// Plan del día: solo para ti. Nunca va al grupo.
async function runPlan(
  db: Db, liga: Liga, leagueId: string, leagueName: string,
  standing: Awaited<ReturnType<Liga["standing"]>>, money: Awaited<ReturnType<typeof estimateLeagueMoney>>,
) {
  if (!money?.mine) {
    console.log(`${leagueName}: sin tu dinero no hay plan`);
    return;
  }
  const teams = [];
  for (const st of standing) teams.push(await liga.team(String(st.team.id)));
  const market = await liga.market();
  const myTeam = teams.find((t) => String(t.id) === money.mine!.teamId);
  if (!myTeam) throw new Error("No encuentro tu equipo");

  const ids = [...new Set([...teams.flatMap((t) => t.players.map((p) => String(p.playerMaster.id))), ...market.map((m) => String(m.playerMaster.id))])];
  const [{ d }] = await db.select({ d: max(playerScores.day) }).from(playerScores);
  const rows = d && ids.length
    ? await db.select().from(playerScores).where(and(eq(playerScores.day, d), inArray(playerScores.playerId, ids)))
    : [];
  const scores = new Map(rows.map((r) => [r.playerId, r]));
  const mts = await db.select({ week: matches.week, date: matches.date }).from(matches);
  const now = new Date();
  const rivals = teams
    .filter((t) => String(t.id) !== money.mine!.teamId)
    .map((t) => ({ teamId: String(t.id), manager: t.manager?.managerName ?? "?", money: money.byTeam.get(String(t.id)), team: t }));

  if (mode === "preview") {
    // Tus cláusulas, para comprobar el plan
    console.log(`\n  Tus cláusulas en ${leagueName}:`);
    for (const p of myTeam.players) {
      const s = scores.get(String(p.playerMaster.id));
      const lock = p.buyoutClauseLockedEndTime && Date.parse(p.buyoutClauseLockedEndTime) > now.getTime() ? `bloqueada hasta ${p.buyoutClauseLockedEndTime.slice(0, 16)}` : "abierta";
      const w = s ? Math.max(s.maxBidPlay, s.maxBidSpec ?? 0, s.value * 1.1) : null;
      console.log(`  - ${p.playerMaster.nickname}: nota ${s?.nota ?? "?"}, valor ${s ? (s.value / 1e6).toFixed(2) : "?"} M, cláusula ${((p.buyoutClause ?? 0) / 1e6).toFixed(2)} M (${lock}${p.isShielded ? ", blindado" : ""}), compensa hasta ${w ? (w / 1e6).toFixed(2) : "?"} M`);
    }
  }
  const acciones = dailyPlan({ now, myTeam, myMoney: money.mine.money, rivals, market, scores, close: nextMatchday(mts, now)?.close });
  const text = planMessage(leagueName, money.mine.money, acciones);
  const chat = process.env.ESPIA_PLAN_CHAT;
  if (mode === "preview" || !chat) {
    console.log(`\n== Plan (privado) de ${leagueName}${chat ? "" : " · sin ESPIA_PLAN_CHAT no se envía"}`);
    await send(undefined, pack(text.split("\n")));
  } else {
    await send(chat, pack(text.split("\n")));
  }
  if (mode !== "preview") {
    await db.insert(espiaPlans).values({ leagueId, leagueName, createdAt: now, myMoney: money.mine.money, acciones, scoreDay: d ?? null });
    console.log(`${leagueName}: plan con ${acciones.length} acciones`);
  }
}

if (process.argv[1]?.endsWith("espia.ts")) main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
