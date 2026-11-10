// ¿Qué fuente de onces acierta más? Compara lo último que dijo cada una antes de cada partido con lo que
// pasó: titular = jugó más de 45 minutos (la API no dice quién salió de inicio; un cambio al descanso
// cuenta como suplente). Solo cuenta la predicción hecha en los 4 días antes del partido. Función pura.

import { combine, type LineupSource } from "./combine";

export interface Pred {
  playerId: string;
  fetchedAt: Date;
  starter: boolean;
  prob: number | null;
}

export interface MatchRow {
  week: number;
  date: Date;
  localId: string;
  visitorId: string;
  state: number; // 7 = terminado
}

export interface Score {
  n: number;
  hits: number; // acertó si sería titular o no
  starters: number; // los que dio de titulares
  startersHit: number; // de esos, los que salieron
  brier: number | null; // error de la probabilidad (0 perfecto, 0,25 = tirar una moneda)
}

export interface AccuracyReport {
  weeks: number[];
  alone: Record<string, Score>; // cada fuente con todo lo que predijo
  common: Record<string, Score>; // las dos y la media, solo con los jugadores que predijeron las dos
  disputes: { n: number; right: Record<string, number> }; // cuando una dice titular y la otra no, quién acertó
}

const WINDOW_MS = 4 * 86400e3;
export const STARTED_MIN = 45;

const empty = (): Score & { sq: number; nb: number } => ({ n: 0, hits: 0, starters: 0, startersHit: 0, brier: null, sq: 0, nb: 0 });
type Acc = ReturnType<typeof empty>;

function add(a: Acc, starter: boolean, prob: number | null, started: boolean) {
  a.n++;
  if (starter === started) a.hits++;
  if (starter) { a.starters++; if (started) a.startersHit++; }
  const p = (prob ?? (starter ? 70 : 20)) / 100;
  a.sq += (p - (started ? 1 : 0)) ** 2;
  a.nb++;
}
const done = (a: Acc): Score => ({ n: a.n, hits: a.hits, starters: a.starters, startersHit: a.startersHit, brier: a.nb ? a.sq / a.nb : null });

// La última predicción antes del partido (y no más de 4 días antes)
function lastBefore(preds: Pred[] | undefined, kickoff: Date): Pred | null {
  let best: Pred | null = null;
  for (const p of preds ?? []) {
    const t = p.fetchedAt.getTime();
    if (t < kickoff.getTime() && t >= kickoff.getTime() - WINDOW_MS && (!best || t > best.fetchedAt.getTime())) best = p;
  }
  return best;
}

export function lineupAccuracy(i: {
  sources: Record<LineupSource["source"], Pred[]>;
  teamOf: Map<string, string>; // jugador -> equipo
  matches: MatchRow[];
  minutes: Map<string, Map<number, number>>; // jugador -> jornada -> minutos
}): AccuracyReport {
  const names = Object.keys(i.sources) as LineupSource["source"][];
  const byPlayer = Object.fromEntries(names.map((n) => {
    const m = new Map<string, Pred[]>();
    for (const p of i.sources[n]) { if (!m.has(p.playerId)) m.set(p.playerId, []); m.get(p.playerId)!.push(p); }
    return [n, m];
  })) as Record<string, Map<string, Pred[]>>;

  const matchOf = new Map<string, MatchRow>(); // "equipo:jornada" -> partido terminado
  for (const m of i.matches) if (m.state === 7) { matchOf.set(`${m.localId}:${m.week}`, m); matchOf.set(`${m.visitorId}:${m.week}`, m); }

  const alone = Object.fromEntries(names.map((n) => [n, empty()])) as Record<string, Acc>;
  const common = Object.fromEntries([...names, "Combinadas (la que usamos)"].map((n) => [n, empty()])) as Record<string, Acc>;
  const disputes = { n: 0, right: Object.fromEntries(names.map((n) => [n, 0])) as Record<string, number> };
  const weeks = new Set<number>();

  const players = new Set(names.flatMap((n) => [...byPlayer[n].keys()]));
  const finishedWeeks = [...new Set(i.matches.filter((m) => m.state === 7).map((m) => m.week))];
  for (const pid of players) {
    const team = i.teamOf.get(pid);
    if (!team) continue;
    for (const week of finishedWeeks) {
      const match = matchOf.get(`${team}:${week}`);
      if (!match) continue;
      const preds = names.map((n) => [n, lastBefore(byPlayer[n].get(pid), match.date)] as const).filter(([, p]) => p) as [LineupSource["source"], Pred][];
      if (!preds.length) continue;
      weeks.add(week);
      const started = (i.minutes.get(pid)?.get(week) ?? 0) > STARTED_MIN;
      for (const [n, p] of preds) add(alone[n], p.starter, p.prob, started);
      if (preds.length < names.length) continue;
      const mix = combine(preds.map(([source, p]) => ({ source, starter: p.starter, prob: p.prob })))!;
      for (const [n, p] of preds) add(common[n], p.starter, p.prob, started);
      add(common["Combinadas (la que usamos)"], mix.starter, mix.prob, started);
      if (new Set(preds.map(([, p]) => p.starter)).size > 1) {
        disputes.n++;
        for (const [n, p] of preds) if (p.starter === started) disputes.right[n]++;
      }
    }
  }
  const out = (r: Record<string, Acc>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, done(v)]));
  return { weeks: [...weeks].sort((a, b) => a - b), alone: out(alone), common: out(common), disputes };
}
