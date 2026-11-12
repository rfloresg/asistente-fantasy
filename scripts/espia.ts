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
import { pruneActivity } from "../src/lib/actividad";
import { premiumOf } from "../src/lib/espia/premium";
import { adminChat, digestKey, digestText, gatherDigest } from "../src/lib/admin";
import { and, desc, eq, gte, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { getConn, type Db } from "../src/db";
import { espiaClauses, espiaDone, espiaEvents, espiaPlans, espiaRaises, espiaState, leagues, matches, memberships, players, playerScores, playerValues, users } from "../src/db/schema";
import { blocks, marketPhase, metaAlerts, nextMatchday } from "../src/lib/meta/calendario";
import { applyDone, dailyPlan, planMessage, type Accion } from "../src/lib/plan/plan";
import { FRIENDS_WINDOW_H, friendClaims, type FriendPlan } from "../src/lib/plan/amigos";
import { bestLineup, lineupDisputes } from "../src/lib/plan/lineup";
import { FAIR, pastBuys, type PastBuy } from "../src/lib/plan/puja-justa";
import { BID_REMINDER_MIN, bidReminderText, hourText, marketRefresh, pendingBids } from "../src/lib/plan/mercado-hora";
import { weekSummaryPush, weekSummaryText, type WeekInput } from "../src/lib/semana";
import { planPush, pushToUser } from "../src/lib/push";
import { loadAciertos } from "../src/lib/aciertos-db";
import { madridDay, valueOn } from "../src/lib/aciertos";
import { sourcesText } from "../src/lib/onces/combine";
import type { LigaSnapshot, LineupSnapshot } from "../src/lib/plan/snapshot";
import { getAccessToken, getUserAccessToken, SessionExpired } from "../src/lib/laliga/auth";
import { doneKeyPrefix } from "../src/lib/plan/plan";
import { leagueClient, myLeagues, type Activity, type MarketItem, type Standing } from "../src/lib/espia/league";
import { activityMessage, clauseUnlocks, dailySummary, esc, unlockMessage, type Ctx } from "../src/lib/espia/messages";
import { clauseRaises, estimateTeamMoney, netByManager, parseMoney, START_MONEY } from "../src/lib/espia/money";
import { pack, sendMessage, type UrlButton } from "../src/lib/espia/telegram";
import { APP_URL } from "../src/lib/grupo";

const mode = process.argv[2] ?? "eventos";
const MAX_AGE_H = 48; // actividad más vieja no se avisa
const REMINDER_H = 4; // recordatorio privado: horas antes del cierre del mercado
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

async function send(chatId: string | undefined, messages: string[], buttons: UrlButton[][] = []) {
  if (mode === "preview" || !chatId) {
    for (const m of messages) console.log(`\n${m.replace(/<\/?b>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}`);
    return;
  }
  for (const [i, m] of messages.entries()) await sendMessage(chatId, m, i === messages.length - 1 ? buttons : []);
}

// Debajo del plan privado: abrirlo en la app (en Android abre la app instalada; si no, la web)
const appButton: UrlButton[][] = [[{ text: "📱 Abrir en la app", url: `${APP_URL}/` }]];

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

interface PlanUser { userId: number | null; chat?: string; dinero?: boolean } // null = modo antiguo (una sola cuenta)
type TokenFor = (userId: number | null) => Promise<string>;

// Ligas a recorrer: las de la tabla leagues (servicio con usuarios) o, si está vacía, ESPIA_LIGAS (modo antiguo)
async function loadTargets(db: Db) {
  // Modo antiguo (ESPIA_LIGAS) solo si nunca ha habido ligas en la tabla: si las hay aunque estén apagadas, no se usa
  const all = await db.select().from(leagues);
  const rows = all.filter((l) => l.active);
  if (all.length) {
    const ms = await db.select({ userId: memberships.userId, leagueId: memberships.leagueId, chat: users.telegramId, isAdmin: users.isAdmin, dinero: memberships.dinero })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.plan, true));
    return rows.map((l) => {
      const planUsers: PlanUser[] = ms.filter((m) => m.leagueId === l.leagueId).map((m) => ({ userId: m.userId, chat: m.chat ?? (m.isAdmin ? process.env.ESPIA_PLAN_CHAT : undefined), dinero: m.dinero }));
      return {
        leagueId: l.leagueId, name: l.name, chatId: l.groupChatId ?? undefined, reader: l.groupOwnerId ?? planUsers[0]?.userId ?? null, planUsers,
        settings: { money: l.showMoney, raises: l.showRaises },
      };
    }).filter((t) => t.reader !== null && (t.chatId || t.planUsers.length));
  }
  return parseLeagues(process.env).map(({ leagueId, chatId }) => ({
    leagueId, name: "", chatId, reader: null as number | null, planUsers: [{ userId: null, chat: process.env.ESPIA_PLAN_CHAT }] as PlanUser[],
    settings: { money: process.env.ESPIA_DINERO === "1", raises: process.env.ESPIA_SUBIDAS === "1" },
  }));
}

async function main() {
  const { db, close } = await getConn();
  try {
    const targets = await loadTargets(db);
    if (!targets.length) throw new Error("No hay ligas: conecta una en la web (Cuenta) o pon ESPIA_LIGAS");

    // Una renovación de sesión por usuario y pasada (cada renovación cambia el token guardado)
    const cache = new Map<string, Promise<string>>();
    const tokenFor: TokenFor = (userId) => {
      const k = String(userId);
      if (!cache.has(k)) cache.set(k, userId === null ? getAccessToken(db) : getUserAccessToken(db, userId));
      return cache.get(k)!;
    };

    // Si a alguien le caduca la sesión, se le avisa una vez por Telegram
    const warnExpired = async (e: unknown) => {
      if (!(e instanceof SessionExpired) || !e.firstTime || mode === "preview") return;
      const [u] = await db.select().from(users).where(eq(users.id, e.userId));
      const chat = u?.telegramId ?? (u?.isAdmin ? process.env.ESPIA_PLAN_CHAT : undefined);
      if (chat) await sendMessage(chat, "⚠️ <b>Tu sesión de LaLiga ha caducado</b>\nHasta que vuelvas a conectar no puedo hacerte el plan ni leer tus ligas. Escribe /conectar y en un minuto está.").catch(() => {});
    };
    const errors: string[] = [];
    let failed = 0;
    for (const t of targets) {
      try {
        const token = await tokenFor(t.reader);
        const name = t.name && t.name !== t.leagueId ? t.name
          : (await myLeagues(token)).find((l) => String(l.id) === t.leagueId)?.name?.trim() ?? "Tu liga";
        await runLeague(db, token, t.leagueId, t.chatId, name, t.reader, t.planUsers, tokenFor, t.settings);
      } catch (e) {
        failed++;
        await warnExpired(e);
        const msg = `${t.name || t.leagueId}: ${String(e instanceof Error ? e.message : e)}`;
        errors.push(msg);
        console.error(msg);
      }
    }
    if (mode === "resumen") await sendDigest(db).catch((e) => console.error(`parte: ${e}`));
    if (mode === "resumen") await pruneActivity(db).catch(() => {});
    if (failed) {
      await alertAdmin(db, errors);
      throw new Error(`${failed} liga(s) con error`);
    }
  } finally {
    await close();
  }
}

async function runLeague(
  db: Db, token: string, leagueId: string, chatId: string | undefined, leagueName: string,
  reader: number | null, planUsers: PlanUser[], tokenFor: TokenFor,
  settings: { money: boolean; raises: boolean },
) {
  {
    const liga = leagueClient(token, leagueId);
    if (mode === "plan" || mode === "preview") await detectPremium(db, token, leagueId).catch(() => {});
    const standing = await liga.standing();
    // El dinero necesita todo el historial: se calcula una vez por liga, usuario y pasada.
    // Con la sesión de cada uno, su dinero es el real (la API solo enseña el tuyo).
    const moneyMemo = new Map<string, ReturnType<typeof estimateLeagueMoney>>();
    const ligaFor = async (userId: number | null) => (userId === reader ? liga : leagueClient(await tokenFor(userId), leagueId));
    const moneyFor = async (userId: number | null) => {
      const k = String(userId);
      if (!moneyMemo.has(k)) moneyMemo.set(k, estimateLeagueMoney(db, await ligaFor(userId), leagueId, standing));
      return moneyMemo.get(k)!;
    };
    const getMoney = () => moneyFor(reader);
    // El plan de cada usuario de esta liga que lo tiene activado
    const runPlans = async (header?: string, only?: (u: PlanUser) => boolean) => {
      for (const u of planUsers.filter(only ?? (() => true))) {
        try {
          await runPlan(db, await ligaFor(u.userId), leagueId, leagueName, standing, await moneyFor(u.userId), acts, ctx, u, header);
        } catch (e) {
          console.error(`${leagueName}, plan del usuario ${u.userId}: ${String(e instanceof Error ? e.message : e)}`);
          if (e instanceof SessionExpired && e.firstTime && u.chat && mode !== "preview") {
            await sendMessage(u.chat, "⚠️ <b>Tu sesión de LaLiga ha caducado</b>\nHasta que vuelvas a conectar no puedo hacerte el plan. Escribe /conectar y en un minuto está.").catch(() => {});
          }
        }
      }
    };
    const groupOn = !!chatId || mode === "preview"; // sin grupo de Telegram no se publica nada en grupo

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
      // Subidas de cláusula: se publican si el dueño del grupo lo activa (en preview siempre se ven)
      const raiseLines = await trackClauses(db, leagueId, teams, ctx);
      if (mode === "preview" || settings.raises) lines.push(...raiseLines);

      // Avisos del meta: cierre de mercado y parón (una vez cada uno)
      const mts = await db.select({ week: matches.week, date: matches.date }).from(matches);
      const meta = metaAlerts(nextMatchday(mts, new Date()), new Date()).filter((m) => !seen.has(m.key));
      lines.push(...meta.map((m) => m.text));
      if (mode !== "preview" && meta.length) {
        await db.insert(espiaEvents).values(meta.map((m) => ({ leagueId, activityId: m.key, createdAt: new Date(), sentAt: new Date() }))).onConflictDoNothing();
      }

      if (mode === "eventos") {
        // Recordatorio privado unas horas antes del cierre: el plan recién calculado de cada usuario
        const next = nextMatchday(mts, new Date());
        const toClose = next ? next.close.getTime() - Date.now() : -1;
        const keyOf = (u: PlanUser) => (next ? `recordatorio:${next.week}:${u.userId ?? "yo"}` : "");
        const due = (u: PlanUser) => !!next && toClose > 0 && toClose <= REMINDER_H * 3600e3 && !!u.chat && !seen.has(keyOf(u));
        if (planUsers.some(due)) {
          const hora = next!.close.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", hour: "2-digit", minute: "2-digit" });
          await runPlans(`⏰ <b>Cierra el mercado el ${esc(hora)}</b>. Lo que te queda por hacer:`, due);
          for (const u of planUsers.filter(due)) {
            await db.insert(espiaEvents).values({ leagueId, activityId: keyOf(u), createdAt: new Date(), sentAt: new Date() }).onConflictDoNothing();
          }
        }
        await bidReminders(db, liga, leagueId, planUsers, seen).catch((e) => console.error(`${leagueName}, aviso de pujas: ${e}`));
        await refreshLiga(db, liga, leagueId, standing, teams, acts, ctx);
      }

      if (mode === "preview") {
        console.log(`== ${leagueName}: últimas actividades (${lines.length})`);
        await send(undefined, pack(lines));
      } else if (!groupOn) {
        // Liga sin grupo: solo se guardan como vistas
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

    if ((mode === "resumen" && groupOn) || mode === "preview") {
      const day = today();
      const [state] = await db.select().from(espiaState).where(eq(espiaState.leagueId, leagueId));
      if (mode === "resumen" && state?.lastSummaryDay === day && !process.env.FORCE) {
        console.log(`${leagueName}: resumen de hoy ya enviado`);
      } else {
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
      // El dinero estimado solo se publica si el dueño del grupo lo activa (en preview siempre se ve)
      const money = mode === "preview" || settings.money ? (await getMoney())?.byTeam : undefined;
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

    if (mode === "plan" || mode === "preview") await runPlans();
  }
}

type Liga = ReturnType<typeof leagueClient>;

// Parte diario para el administrador (con el resumen de la mañana), una vez al día
async function sendDigest(db: Db) {
  const key = digestKey();
  const [seen] = await db.select().from(espiaEvents).where(and(eq(espiaEvents.leagueId, "admin"), eq(espiaEvents.activityId, key)));
  if (seen) return;
  const chat = await adminChat(db);
  if (!chat) return;
  await sendMessage(chat, digestText(await gatherDigest(db)));
  await db.insert(espiaEvents).values({ leagueId: "admin", activityId: key, createdAt: new Date(), sentAt: new Date() }).onConflictDoNothing();
}

// Aviso al administrador cuando algo falla (como mucho uno cada 6 horas), p. ej. si LaLiga cambia su API
async function alertAdmin(db: Db, errors: string[]) {
  if (mode === "preview") return;
  const slot = `alerta:${new Date().toISOString().slice(0, 10)}:${Math.floor(new Date().getUTCHours() / 6)}`;
  const [seen] = await db.select().from(espiaEvents).where(and(eq(espiaEvents.leagueId, "admin"), eq(espiaEvents.activityId, slot)));
  if (seen) return;
  const chat = await adminChat(db);
  if (!chat) return;
  const list = errors.slice(0, 5).map((e) => `• ${esc(e.slice(0, 200))}`).join("\n");
  await sendMessage(chat, `🚨 <b>El Espía ha fallado</b> (${mode})\n${list}\n\nMira la pestaña Actions de GitHub.`).catch(() => {});
  await db.insert(espiaEvents).values({ leagueId: "admin", activityId: slot, createdAt: new Date(), sentAt: new Date() }).onConflictDoNothing();
}

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
      await sleep(150);
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
    return { byTeam, mine, history: all };
  } catch (e) {
    console.log(`Dinero: ${String(e instanceof Error ? e.message : e)}`);
    return undefined;
  }
}

// Ofertas pendientes por tus jugadores a la venta (si la API falla, el plan sale sin ellas)
async function myOffers(liga: Liga, market: MarketItem[], myTeamId: string, myName?: string) {
  const out = new Map<string, { money: number; expirationDate?: string }[]>();
  const mine = market.filter((m) => (m.numberOfOffers ?? 0) > 0 && m.playerTeam?.playerTeamId != null
    && (String(m.sellerTeam?.id ?? "") === myTeamId || (!!myName && m.sellerTeam?.manager?.managerName === myName)));
  for (const m of mine) {
    try {
      const offs = (await liga.offers(String(m.playerTeam!.playerTeamId))).filter((o) => !o.status || o.status === "pending");
      if (offs.length) out.set(String(m.playerMaster.id), offs.map((o) => ({ money: o.money, expirationDate: o.expirationDate })));
      if (mode === "preview") console.log(`  Ofertas por ${m.playerMaster.nickname}: ${offs.map((o) => `${(o.money / 1e6).toFixed(2)} M`).join(", ") || "ninguna pendiente"}`);
    } catch (e) {
      console.log(`  Ofertas por ${m.playerMaster.nickname}: ${String(e instanceof Error ? e.message : e)}`);
    }
    await sleep(150);
  }
  return out;
}

// Hora y media antes de que se renueve el mercado de la liga: a quien le queden pujas del último plan
async function bidReminders(db: Db, liga: Liga, leagueId: string, planUsers: PlanUser[], seen: Set<string>) {
  const now = new Date();
  const market = await liga.market();
  const refresh = marketRefresh(market, now);
  if (!refresh || refresh.getTime() - now.getTime() > BID_REMINDER_MIN * 60e3) return;
  for (const u of planUsers) {
    const key = `pujas:${refresh.toISOString()}:${u.userId ?? "yo"}`;
    if ((!u.chat && u.userId == null) || seen.has(key)) continue;
    const who = u.userId == null ? isNull(espiaPlans.userId) : eq(espiaPlans.userId, u.userId);
    const [plan] = await db.select({ acciones: espiaPlans.acciones }).from(espiaPlans)
      .where(and(eq(espiaPlans.leagueId, leagueId), who)).orderBy(desc(espiaPlans.createdAt)).limit(1);
    if (!plan) continue;
    const prefix = doneKeyPrefix(u.userId);
    const done = new Set((await db.select({ key: espiaDone.key }).from(espiaDone)
      .where(and(eq(espiaDone.leagueId, leagueId), gte(espiaDone.createdAt, new Date(now.getTime() - 48 * 3600e3))))).map((r) => r.key)
      .filter((k) => (prefix ? k.startsWith(prefix) : !/^u\d+:/.test(k))).map((k) => k.slice(prefix.length)));
    const pend = pendingBids(plan.acciones, market, done);
    await db.insert(espiaEvents).values({ leagueId, activityId: key, createdAt: now, sentAt: pend.length ? now : null }).onConflictDoNothing();
    seen.add(key);
    if (pend.length && mode !== "preview" && u.chat) await sendMessage(u.chat, bidReminderText(refresh, now, pend, esc), appButton).catch(() => {});
    if (pend.length && mode !== "preview" && u.userId != null) {
      await pushToUser(db, u.userId, {
        title: `⏳ Tu mercado se renueva ${hourText(refresh, now)}`,
        body: `Te quedan por hacer: ${pend.map((a) => a.titulo ?? a.jugador).join(" · ")}`,
        url: "/", tag: `pujas:${leagueId}`,
      }).catch(() => 0);
    }
  }
}

// Fichajes del mercado de la liga (90 días) con lo que se pagó sobre el valor de ese día: para la puja justa
async function leagueBuys(db: Db, standing: Awaited<ReturnType<Liga["standing"]>>, acts: Activity[], now: Date): Promise<PastBuy[]> {
  const since = now.getTime() - FAIR.days * 86400e3;
  const buys = acts.filter((a) => a.activityTypeId === 1 && a.playerMasterId != null && Date.parse(a.createdAt) >= since);
  if (!buys.length) return [];
  const ids = [...new Set(buys.map((a) => String(a.playerMasterId)))];
  const [vals, pls] = await Promise.all([
    db.select({ playerId: playerValues.playerId, day: playerValues.day, value: playerValues.value }).from(playerValues)
      .where(and(inArray(playerValues.playerId, ids), gte(playerValues.day, new Date(since - 2 * 86400e3).toISOString().slice(0, 10)))),
    db.select({ id: players.id, positionId: players.positionId }).from(players).where(inArray(players.id, ids)),
  ]);
  const byKey = new Map(vals.map((v) => [`${v.playerId}|${v.day}`, v.value]));
  const pos = new Map(pls.map((p) => [p.id, p.positionId]));
  const team = new Map<string, { teamId: string; manager: string }>();
  for (const st of standing) {
    for (const u of [st.team.manager?.id, st.team.managerId]) {
      if (u != null) team.set(String(u), { teamId: String(st.team.id), manager: st.team.manager?.managerName ?? "?" });
    }
  }
  return pastBuys(buys, (id, day) => byKey.get(`${id}|${day}`), (id) => pos.get(id) ?? null, (u) => team.get(u));
}

function printBuys(h: PastBuy[]) {
  const by = new Map<string, number[]>();
  for (const b of h) { if (!by.has(b.manager)) by.set(b.manager, []); by.get(b.manager)!.push(b.over); }
  console.log(`\n  Puja justa: ${h.length} fichajes del mercado en ${FAIR.days} días`);
  for (const [m, xs] of [...by].sort((a, b) => b[1].length - a[1].length)) {
    const s = [...xs].sort((a, b) => a - b);
    console.log(`  - ${m}: ${xs.length} fichajes, paga de más ${(s[s.length >> 1] * 100).toFixed(1)} % de mediana (máx. ${(s.at(-1)! * 100).toFixed(1)} %)`);
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

const STATUS_ES: Record<string, string> = { injured: "Lesión", suspended: "Sanción", doubtful: "Duda" };

// Lo que enseña la web de la liga (/liga, /plantilla). Se guarda con cada plan y se refresca cada 30 min.
function buildLigaSnap(i: {
  standing: Awaited<ReturnType<Liga["standing"]>>; teams: Awaited<ReturnType<Liga["team"]>>[]; acts: Activity[]; ctx: Ctx;
  market: Awaited<ReturnType<Liga["market"]>>; myTeamId: string; moneyByTeam: Map<string, number | undefined>; now: Date;
}): LigaSnapshot {
  const myTeam = i.teams.find((t) => String(t.id) === i.myTeamId);
  return {
    myTeamId: i.myTeamId,
    updatedAt: i.now.toISOString(),
    standing: i.standing.map((st) => ({
      teamId: String(st.team.id),
      manager: st.team.manager?.managerName ?? "?",
      position: st.position,
      previous: st.previousPosition,
      points: st.points,
      teamValue: st.team.teamValue,
      money: i.moneyByTeam.get(String(st.team.id)),
    })).sort((a, b) => a.position - b.position),
    activity: [...i.acts]
      .filter((a) => i.now.getTime() - Date.parse(a.createdAt) < 7 * 24 * 3600e3)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .flatMap((a) => { const t = activityMessage(a, i.ctx); return t ? [{ at: a.createdAt, text: t }] : []; })
      .slice(0, 15),
    unlocks: clauseUnlocks(i.teams, i.now.getTime(), i.now.getTime() + 24 * 3600e3).map((u) => ({ player: u.player, manager: u.manager, at: u.at, clause: u.clause })),
    injuries: i.teams.flatMap((t) => t.players
      .filter((p) => STATUS_ES[p.playerMaster.playerStatus])
      .map((p) => ({ player: p.playerMaster.nickname, manager: t.manager?.managerName ?? "?", status: STATUS_ES[p.playerMaster.playerStatus] }))),
    squad: (myTeam?.players ?? []).map((p) => ({
      id: String(p.playerMaster.id), clause: p.buyoutClause, lockedUntil: p.buyoutClauseLockedEndTime, shielded: p.isShielded,
    })),
    owners: Object.fromEntries(i.teams.flatMap((t) => t.players.map((p) => [String(p.playerMaster.id), String(t.id)]))),
    market: i.market.filter((m) => m.status === "on_sale").map((m) => ({
      id: String(m.playerMaster.id), price: m.salePrice, bids: m.numberOfBids, seller: m.sellerTeam?.manager?.managerName,
    })),
  };
}

// Cada 30 min: refresca lo que enseña la web de la liga sobre el último plan (el dinero se queda el del plan)
async function refreshLiga(db: Db, liga: Liga, leagueId: string, standing: Awaited<ReturnType<Liga["standing"]>>, teams: Awaited<ReturnType<Liga["team"]>>[], acts: Activity[], ctx: Ctx) {
  // El último plan de cada usuario de esta liga
  const rows = await db.select({ id: espiaPlans.id, userId: espiaPlans.userId, liga: espiaPlans.liga }).from(espiaPlans)
    .where(eq(espiaPlans.leagueId, leagueId)).orderBy(desc(espiaPlans.createdAt)).limit(100);
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(String(r.userId))) latest.set(String(r.userId), r);
  const withLiga = [...latest.values()].filter((r) => r.liga);
  if (!withLiga.length) return;
  const market = await liga.market();
  for (const last of withLiga) {
    const moneyByTeam = new Map(last.liga!.standing.map((st) => [st.teamId, st.money]));
    const snap = buildLigaSnap({ standing, teams, acts, ctx, market, myTeamId: last.liga!.myTeamId, moneyByTeam, now: new Date() });
    await db.update(espiaPlans).set({ liga: snap }).where(eq(espiaPlans.id, last.id));
  }
}

// ¿Liga Premium? Lo busca en tus ligas de la API. Solo lo enciende: apagarlo es cosa de Cuenta,
// por si el campo de la API no significa lo que creemos. Apunta los campos para poder afinarlo.
async function detectPremium(db: Db, token: string, leagueId: string) {
  const l = (await myLeagues(token)).find((x) => String(x.id) === leagueId);
  if (!l) return;
  console.log(`  Campos de la liga en la API: ${Object.keys(l).join(", ")}`);
  if (premiumOf(l) === true) await db.update(leagues).set({ premium: true }).where(eq(leagues.leagueId, leagueId));
}

// Plan del día: solo para ti. Nunca va al grupo.
async function runPlan(
  db: Db, liga: Liga, leagueId: string, leagueName: string,
  standing: Awaited<ReturnType<Liga["standing"]>>, money: Awaited<ReturnType<typeof estimateLeagueMoney>>,
  acts: Activity[], ctx: Ctx, user: PlanUser, header?: string,
) {
  if (!money?.mine) {
    console.log(`${leagueName}: sin el dinero del usuario ${user.userId ?? "principal"} no hay plan`);
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
  const mts = await db.select({ week: matches.week, date: matches.date, state: matches.state }).from(matches);
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
  const positions = new Map(
    (ids.length ? await db.select({ id: players.id, pos: players.positionId }).from(players).where(inArray(players.id, ids)) : []).map((r) => [r.id, r.pos]),
  );
  // Capitán solo en ligas Premium
  const [lg] = await db.select({ premium: leagues.premium }).from(leagues).where(eq(leagues.leagueId, leagueId));
  const premium = lg?.premium ?? false;
  const lineup = bestLineup(myTeam.players.map((p) => {
    const s = scores.get(String(p.playerMaster.id));
    return {
      id: String(p.playerMaster.id),
      name: p.playerMaster.nickname,
      positionId: positions.get(String(p.playerMaster.id)) ?? 0,
      status: p.playerMaster.playerStatus,
      formAvg: s?.formAvg ?? null,
      startProb: s?.startProb ?? null,
      xp: s?.xpNext?.[0]?.pts ?? null, // puntos esperados del próximo partido
      startSources: s?.startSources ?? [],
    };
  }), { captain: premium });
  const closeAt = nextMatchday(mts, now)?.close ?? null;
  const phase = marketPhase(mts, now);
  const bidHistory = await leagueBuys(db, standing, money.history, now);
  const refreshAt = marketRefresh(market, now);
  const offers = await myOffers(liga, market, money.mine.teamId, myTeam.manager?.managerName);
  if (mode === "preview") printBuys(bidHistory);
  // Lo que marcaste como hecho en la web en las últimas 48 h, y lo que ya tienes a la venta
  // Las claves de "Hecho" llevan delante el usuario (cada uno marca lo suyo)
  const prefix = doneKeyPrefix(user.userId);
  const doneRows = (await db.select({ key: espiaDone.key }).from(espiaDone)
    .where(and(eq(espiaDone.leagueId, leagueId), gte(espiaDone.createdAt, new Date(now.getTime() - 48 * 3600e3))))).map((r) => r.key);
  const done = new Set(doneRows.filter((k) => (prefix ? k.startsWith(prefix) : !/^u\d+:/.test(k))).map((k) => k.slice(prefix.length)));
  const myName = myTeam.manager?.managerName;
  const onSaleByMe = new Set(market.filter((m) => m.status === "on_sale" && myName && m.sellerTeam?.manager?.managerName === myName).map((m) => String(m.playerMaster.id)));
  const friends = await loadFriendClaims(db, leagueId, user.userId, now);
  const acciones = applyDone(
    dailyPlan({ now, myTeam, myMoney: money.mine.money, rivals, market, scores, close: closeAt, lineup, positions, captain: premium, money: user.dinero ?? true, phase, onSale: onSaleByMe, bidHistory, marketRefresh: refreshAt, offers, friends }),
    done, onSaleByMe,
  );
  // Lo marcado como hecho que ya no sale en el plan estaba hecho de verdad: se olvida
  const stillThere = new Set(acciones.map((a) => a.key));
  const verified = [...done].filter((k) => !stillThere.has(k));
  if (mode !== "preview" && verified.length) {
    await db.delete(espiaDone).where(and(eq(espiaDone.leagueId, leagueId), inArray(espiaDone.key, verified.map((k) => prefix + k))));
  }

  // Lo que enseña la web (/ y /liga), guardado junto al plan
  const lineupSnap: LineupSnapshot | null = lineup && {
    formation: lineup.formation,
    expected: lineup.expected,
    captainId: lineup.captain?.id ?? null,
    starters: lineup.starters.map((p) => ({
      id: p.id, name: p.name, positionId: p.positionId, expected: p.expected, startProb: p.startProb, status: p.status,
      nota: scores.get(p.id)?.nota ?? null, hole: lineup.holes.some((h) => h.id === p.id),
    })),
    out: lineup.out.map((p) => ({ id: p.id, name: p.name })),
    disputes: lineupDisputes(lineup).map((d) => ({ id: d.id, name: d.name, sources: sourcesText(d.sources), sub: d.sub.name })),
  };
  const ligaSnap = buildLigaSnap({ standing, teams, acts, ctx, market, myTeamId: money.mine.teamId, moneyByTeam: money.byTeam, now });
  const text = (header ? `${header}\n\n` : "") + planMessage(leagueName, money.mine.money, acciones);
  const chat = user.chat;
  if (mode === "preview" || !chat) {
    console.log(`\n== Plan (privado) de ${leagueName}${user.userId !== null ? ` · usuario ${user.userId}` : ""}${chat ? "" : " · sin chat privado no se envía"}`);
    await send(undefined, pack(text.split("\n")));
  } else {
    await send(chat, pack(text.split("\n")), appButton);
  }
  if (mode !== "preview" && user.userId != null) {
    await pushToUser(db, user.userId, planPush(leagueName, acciones)).catch((e) => console.error(`aviso al móvil: ${e}`));
  }
  if (mode !== "preview") {
    await db.insert(espiaPlans).values({ userId: user.userId, leagueId, leagueName, createdAt: now, myMoney: money.mine.money, acciones, scoreDay: d ?? null, closeAt, lineup: lineupSnap, liga: ligaSnap });
    console.log(`${leagueName}: plan con ${acciones.length} acciones`);
  }
  await weekSummary(db, liga, leagueId, leagueName, user, standing, money.mine.teamId, myTeam, mts, now)
    .catch((e) => console.error(`${leagueName}, tu semana: ${e instanceof Error ? e.message : e}`));
}

// Lo que buscan los amigos de esta liga que usan la app (su último plan de las últimas horas)
async function loadFriendClaims(db: Db, leagueId: string, userId: number | null, now: Date) {
  if (userId == null) return undefined;
  const rows = await db.select({ userId: espiaPlans.userId, name: users.name, acciones: espiaPlans.acciones, createdAt: espiaPlans.createdAt })
    .from(espiaPlans).innerJoin(users, eq(users.id, espiaPlans.userId))
    .where(and(eq(espiaPlans.leagueId, leagueId), ne(espiaPlans.userId, userId), gte(espiaPlans.createdAt, new Date(now.getTime() - FRIENDS_WINDOW_H * 3600e3))))
    .orderBy(desc(espiaPlans.createdAt));
  const latest = new Map<number, FriendPlan>();
  for (const r of rows) if (r.userId != null && !latest.has(r.userId)) latest.set(r.userId, { name: r.name, acciones: (r.acciones ?? []) as Accion[] });
  return latest.size ? friendClaims([...latest.values()]) : undefined;
}

// "Tu semana": una vez por jornada terminada (entre 6 h y 4 días después del último partido)
async function weekSummary(
  db: Db, liga: Liga, leagueId: string, leagueName: string, user: PlanUser,
  standing: Awaited<ReturnType<Liga["standing"]>>, myTeamId: string, myTeam: { players: { playerMaster: { id: string | number } }[] } | undefined,
  mts: { week: number; date: Date; state?: number | null }[], now: Date,
) {
  // Jornada terminada: todos los partidos de su bloque principal acabados (los aplazados no cuentan)
  const done = blocks(mts).filter((b) => mts.filter((m) => m.week === b.week && m.date.getTime() <= b.end).every((m) => m.state === 7));
  const last = done.filter((b) => b.end + 6 * 3600e3 < now.getTime() && b.end > now.getTime() - 4 * 86400e3).at(-1);
  if (!last) return;
  const key = `semana:${last.week}:${user.userId ?? "yo"}`;
  const [seen] = await db.select({ k: espiaEvents.activityId }).from(espiaEvents).where(and(eq(espiaEvents.leagueId, leagueId), eq(espiaEvents.activityId, key)));
  if (seen) return;

  const ws = await liga.weekStanding(last.week).catch(() => [] as Standing[]);
  const mineW = ws.find((s) => String(s.team.id) === myTeamId);
  const bestW = [...ws].sort((a, b) => b.points - a.points)[0];
  const mine = standing.find((s) => String(s.team.id) === myTeamId);

  // Valor de tu plantilla hoy y hace 7 días
  let squad: { now: number; weekAgo: number } | null = null;
  const ids = (myTeam?.players ?? []).map((p) => String(p.playerMaster.id));
  if (ids.length) {
    const today = madridDay(now);
    const ago = madridDay(new Date(now.getTime() - 7 * 86400e3));
    const vals = await db.select({ p: playerValues.playerId, d: playerValues.day, v: playerValues.value }).from(playerValues)
      .where(and(inArray(playerValues.playerId, ids), gte(playerValues.day, madridDay(new Date(now.getTime() - 9 * 86400e3)))));
    const by = new Map<string, Map<string, number>>();
    for (const r of vals) { if (!by.has(r.p)) by.set(r.p, new Map()); by.get(r.p)!.set(r.d, r.v); }
    const sum = (day: string) => ids.reduce((t, id) => t + (valueOn(by.get(id), day) ?? 0), 0);
    squad = { now: sum(today), weekAgo: sum(ago) };
  }

  const ac = await loadAciertos(leagueId, user.userId, db).catch(() => null);
  const since = now.getTime() - 9 * 86400e3;
  const input: WeekInput = {
    league: leagueName,
    week: last.week,
    my: { points: mineW?.points ?? null, weekPosition: mineW?.position ?? null, position: mine?.position ?? null, previousPosition: mine?.previousPosition ?? null },
    best: bestW ? { manager: bestW.team.manager?.managerName ?? "?", points: bestW.points } : null,
    managers: standing.length,
    squad,
    xi: ac?.xi.find((x) => x.week === last.week) ?? null,
    recs: (ac?.recs ?? []).filter((r) => r.at.getTime() >= since && r.change !== null),
  };
  const text = weekSummaryText(input);
  if (!text) return;
  if (mode === "preview") {
    console.log(`\n== Tu semana (${leagueName}${user.userId !== null ? ` · usuario ${user.userId}` : ""})\n${text.replace(/<\/?b>/g, "")}`);
    return;
  }
  if (user.chat) await sendMessage(user.chat, text, [[{ text: "📈 Cuánto acertamos", url: `${APP_URL}/aciertos` }]]);
  const short = weekSummaryPush(input);
  if (user.userId != null && short) {
    await pushToUser(db, user.userId, { title: `📅 Tu jornada ${last.week} en ${leagueName}`, body: short, url: "/aciertos", tag: `semana:${leagueId}` }).catch(() => 0);
  }
  await db.insert(espiaEvents).values({ leagueId, activityId: key, createdAt: now, sentAt: now }).onConflictDoNothing();
}

if (process.argv[1]?.endsWith("espia.ts")) main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
