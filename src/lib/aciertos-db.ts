// Datos para "Cuánto acertamos": los planes de un usuario en una liga y lo que pasó después.

import { and, eq, gte, isNull, max, or } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { espiaPlans, matches, playerValues, playerWeeks } from "@/db/schema";
import { aciertos, madridDay, marketChange, type WeekRow } from "./aciertos";

export async function loadAciertos(leagueId: string, userId: number | null, conn?: Db) {
  const db = conn ?? (await getDb());
  // Como latestPlan: los planes de antes de los usuarios cuentan como del primero que los usa
  const who = userId == null ? isNull(espiaPlans.userId) : or(eq(espiaPlans.userId, userId), isNull(espiaPlans.userId));
  const plans = await db.select({ createdAt: espiaPlans.createdAt, acciones: espiaPlans.acciones, lineup: espiaPlans.lineup, liga: espiaPlans.liga })
    .from(espiaPlans).where(and(eq(espiaPlans.leagueId, leagueId), who));
  if (!plans.length) return null;

  const since = plans.reduce((a, p) => (p.createdAt < a ? p.createdAt : a), plans[0].createdAt);
  const sinceDay = madridDay(since);
  const [vals, mts, [{ last }]] = await Promise.all([
    db.select({ playerId: playerValues.playerId, day: playerValues.day, value: playerValues.value }).from(playerValues).where(gte(playerValues.day, sinceDay)),
    db.select({ week: matches.week, date: matches.date, state: matches.state }).from(matches),
    db.select({ last: max(playerValues.day) }).from(playerValues),
  ]);
  const values = new Map<string, Map<string, number>>();
  for (const v of vals) {
    if (!values.has(v.playerId)) values.set(v.playerId, new Map());
    values.get(v.playerId)!.set(v.day, v.value);
  }
  const byWeek = new Map<number, WeekRow>();
  for (const m of mts) {
    const w = byWeek.get(m.week) ?? { week: m.week, start: m.date, finished: true };
    if (m.date < w.start) w.start = m.date;
    if (m.state !== 7) w.finished = false;
    byWeek.set(m.week, w);
  }
  const weeks = [...byWeek.values()].filter((w) => w.start > new Date(since.getTime() - 7 * 86400e3));
  const minWeek = Math.min(...weeks.map((w) => w.week), 99);
  const wks = await db.select({ playerId: playerWeeks.playerId, week: playerWeeks.week, points: playerWeeks.points }).from(playerWeeks).where(gte(playerWeeks.week, minWeek));
  const points = new Map<string, Map<number, number>>();
  for (const w of wks) {
    if (!points.has(w.playerId)) points.set(w.playerId, new Map());
    points.get(w.playerId)!.set(w.week, w.points);
  }
  const cache = new Map<string, number | null>();
  const market = (from: string, to: string) => {
    const k = `${from}:${to}`;
    if (!cache.has(k)) cache.set(k, marketChange(values, from, to));
    return cache.get(k)!;
  };
  return aciertos({ plans, values, points, weeks, lastDay: last ?? sinceDay, market });
}
