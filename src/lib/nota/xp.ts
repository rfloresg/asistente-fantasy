// Puntos esperados (xP) de cada jugador en sus próximos partidos. Función pura.
//
// xP de un partido =
//   P(titular)  · [ fijos de titular + 0,92 · ataque + portería ]
// + P(suplente) · [ fijos de suplente + 0,25 · ataque ]
//
//   ataque   = goles esperados del equipo · (su parte de los goles · pts por gol + su parte de las asistencias · pts por asistencia)
//   portería = media de lo que suman los goles encajados, según los que se esperan en contra (Poisson)
//   fijos    = lo que hace por jugar (minutos, recuperaciones, paradas, marca...), su media acercada a la de su puesto
//
// Las tablas de puntos (cuánto vale un gol, una portería a cero...) se aprenden de los datos de cada puesto,
// así que si LaLiga cambia la puntuación, el modelo se adapta solo.

import { fixedPts, type WeekLine } from "./breakdown";
import { neutral, type Fixture, type TeamModel } from "./teams";

export const XP = {
  // Ajustados con datos reales (jornadas 4 a 11, 3.364 casos): ver npm run validar
  formWeeks: 4, // partidos recientes del equipo para saber si es titular
  priorStarts: 3, // partidos "como los de su valor" que se suman a los fijos
  priorStartWeeks: 0.5, // partidos "como los de su valor" que se suman para saber si es titular
  startDecay: 0.6, // peso de cada partido anterior respecto al siguiente más reciente (1 = todos igual)
  priorTeamGoals: 20, // goles del equipo "como los de su valor" para su parte de goles y asistencias
  startMin: 60, // minutos para contar como titular (y para la portería a cero)
  maxConceded: 5,
  easy: 0.6, // puntos de más (o de menos) frente a un rival medio para llamarlo "fácil" (o "difícil")
};

// Recta por puesto: lo que se espera según su valor de mercado (x = log del valor en millones)
export interface Line { a: number; b: number }
const atValue = (l: Line, value: number | undefined) => l.a + l.b * Math.log(Math.max(0.2, (value ?? 1e6) / 1e6));

export interface PosTables {
  ptsPerGoal: number;
  ptsPerAssist: number;
  conceded: number[]; // puntos medios por k goles encajados (titular), k = 0..maxConceded
  fixedStart: number;
  fixedSub: number;
  goalShare: number; // parte media de los goles de su equipo que mete un titular de este puesto
  assistShare: number;
  // Según su valor: los caros hacen más puntos fijos, meten más y son más titulares
  fixedByValue: Line;
  goalByValue: Line;
  assistByValue: Line;
  startByValue: Line;
}

export interface PlayerWeeks {
  id: string;
  positionId: number;
  teamId: string | null;
  weeks: Map<number, WeekLine>;
  value?: number; // valor de mercado ese día
}

// Recta por mínimos cuadrados ponderados; sin datos suficientes, plana en la media
function fit(points: { x: number; y: number; w: number }[], fallback: number): Line {
  const W = points.reduce((s, p) => s + p.w, 0);
  if (points.length < 8 || !W) return { a: fallback, b: 0 };
  const mx = points.reduce((s, p) => s + p.w * p.x, 0) / W, my = points.reduce((s, p) => s + p.w * p.y, 0) / W;
  const sxx = points.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0), sxy = points.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0);
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

const pois = (k: number, l: number) => {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * l ** k) / f;
};

// Tablas por puesto aprendidas de todas las jornadas de la liga
export function learnTables(players: PlayerWeeks[], teams: TeamModel): Map<number, PosTables> {
  const teamGoals = goalsByWeek(teams);
  const out = new Map<number, PosTables>();
  for (const pos of [1, 2, 3, 4]) {
    let g = 0, gp = 0, a = 0, ap = 0, fs = 0, ns = 0, fsub = 0, nsub = 0, tg = 0, gs = 0, as = 0;
    const cSum = new Array(XP.maxConceded + 1).fill(0), cN = new Array(XP.maxConceded + 1).fill(0);
    const fixPts: { x: number; y: number; w: number }[] = [], goalPts: typeof fixPts = [], astPts: typeof fixPts = [], startPts: typeof fixPts = [];
    for (const pl of players) {
      if (pl.positionId !== pos) continue;
      // Por jugador, para las rectas según su valor
      let pf = 0, pn = 0, pg = 0, pa = 0, ptg = 0, played = 0;
      const teamWeeks = pl.teamId ? (teams.played.get(pl.teamId) ?? []).map((x) => x.week) : [];
      for (const [week, w] of pl.weeks) {
        if (!teams.doneWeeks.has(week)) continue;
        if (w.minutes >= XP.startMin) { pf += fixedPts(w); pn++; }
        const t = pl.teamId ? teamGoals.get(`${pl.teamId}:${week}`) : undefined;
        if (w.minutes > 0 && t !== undefined) { ptg += t * Math.min(1, w.minutes / 90); pg += w.goals ?? 0; pa += w.assists ?? 0; played++; }
      }
      if (pl.value) {
        const x = Math.log(Math.max(0.2, pl.value / 1e6));
        if (pn) fixPts.push({ x, y: pf / pn, w: pn });
        if (ptg > 0) { goalPts.push({ x, y: pg / ptg, w: ptg }); astPts.push({ x, y: pa / ptg, w: ptg }); }
        const tw = teamWeeks.filter((wk) => teams.doneWeeks.has(wk));
        if (tw.length) startPts.push({ x, y: tw.filter((wk) => (pl.weeks.get(wk)?.minutes ?? 0) >= XP.startMin).length / tw.length, w: tw.length });
      }
      void played;
      for (const [week, w] of pl.weeks) {
        if (w.minutes <= 0 || !teams.doneWeeks.has(week)) continue;
        if (w.goals !== undefined) { g += w.goals; gp += w.goalPts ?? 0; a += w.assists ?? 0; ap += w.assistPts ?? 0; }
        if (w.minutes >= XP.startMin) {
          fs += fixedPts(w); ns++;
          if (w.conceded !== undefined) { const k = Math.min(XP.maxConceded, w.conceded); cSum[k] += w.concededPts ?? 0; cN[k]++; }
          const t = pl.teamId ? teamGoals.get(`${pl.teamId}:${week}`) : undefined;
          if (t !== undefined) { tg += t; gs += w.goals ?? 0; as += w.assists ?? 0; }
        } else { fsub += fixedPts(w); nsub++; }
      }
    }
    // Sin datos de un hueco de la tabla, el vecino (más goles encajados nunca suma más)
    const conceded = cSum.map((s, k) => (cN[k] ? s / cN[k] : NaN));
    for (let k = 0; k <= XP.maxConceded; k++) if (Number.isNaN(conceded[k])) conceded[k] = k ? conceded[k - 1] : 0;
    const goalShare = tg ? gs / tg : [0, 0, 0.03, 0.06, 0.15][pos];
    const assistShare = tg ? as / tg : [0, 0, 0.04, 0.07, 0.08][pos];
    out.set(pos, {
      fixedByValue: fit(fixPts, ns ? fs / ns : 4),
      goalByValue: fit(goalPts, goalShare),
      assistByValue: fit(astPts, assistShare),
      startByValue: fit(startPts, 0.5),
      ptsPerGoal: g ? gp / g : [0, 10, 6, 5, 4][pos],
      ptsPerAssist: a ? ap / a : 3,
      conceded,
      fixedStart: ns ? fs / ns : 4,
      fixedSub: nsub ? fsub / nsub : 1,
      goalShare,
      assistShare,
    });
  }
  return out;
}

function goalsByWeek(teams: TeamModel) {
  const m = new Map<string, number>();
  for (const [id, l] of teams.played) for (const x of l) m.set(`${id}:${x.week}`, x.goalsFor);
  return m;
}

export interface MatchXp {
  week: number;
  teamId: string;
  home: boolean;
  pts: number;
  goalsFor: number;
  goalsAgainst: number;
  label: "fácil" | "normal" | "difícil";
}

export interface PlayerXp {
  xp: number; // media por partido de los próximos
  pStart: number; // 0-1
  matches: MatchXp[];
  calendar: number; // xP de sus partidos / xP contra rivales medios (1 = normal)
}

const STATUS: Record<string, number> = { injured: 0, suspended: 0, out_of_league: 0, doubtful: 0.5 };

export function playerXp(
  pl: PlayerWeeks & { status: string },
  tables: Map<number, PosTables>,
  teams: TeamModel,
  lineup?: { starter: boolean; prob: number | null },
): PlayerXp | null {
  const T = tables.get(pl.positionId);
  if (!T || !pl.teamId) return null;
  const fixtures = teams.next.get(pl.teamId) ?? [];
  if (!fixtures.length) return null;
  const teamGoals = goalsByWeek(teams);

  // Titular o suplente: once probable si lo hay; si no, sus últimos partidos de equipo
  const recent = (teams.played.get(pl.teamId) ?? []).map((x) => x.week).sort((a, b) => b - a).slice(0, XP.formWeeks);
  // El último partido pesa más que los anteriores (startDecay por cada uno hacia atrás)
  let starts = 0, subs = 0, wsum = 0;
  recent.forEach((wk, i) => {
    const w = XP.startDecay ** i, m = pl.weeks.get(wk)?.minutes ?? 0;
    wsum += w;
    if (m >= XP.startMin) starts += w; else if (m > 0) subs += w;
  });
  const startPrior = Math.min(0.95, Math.max(0.05, atValue(T.startByValue, pl.value)));
  let pStart = (starts + XP.priorStartWeeks * startPrior) / (wsum + XP.priorStartWeeks);
  let pSub = (subs + 0.25) / (wsum + 1);
  if (lineup) {
    pStart = (lineup.prob ?? (lineup.starter ? 70 : 20)) / 100;
    pSub = Math.min(1 - pStart, (1 - pStart) * 0.5);
  }
  const st = STATUS[pl.status] ?? 1;
  pStart *= st;
  pSub *= st;

  // Sus números, acercados a los de su puesto cuando hay pocos partidos
  let fs = 0, ns = 0, g = 0, a = 0, tg = 0;
  for (const [wk, w] of pl.weeks) {
    if (!teams.doneWeeks.has(wk)) continue; // solo jornadas jugadas a esa fecha
    if (w.minutes >= XP.startMin) { fs += fixedPts(w); ns++; }
    if (w.minutes > 0) {
      const t = teamGoals.get(`${pl.teamId}:${wk}`);
      if (t !== undefined) { tg += t * Math.min(1, w.minutes / 90); g += w.goals ?? 0; a += w.assists ?? 0; }
    }
  }
  // Punto de partida según lo que vale (el mercado ya sabe mucho de cada jugador); sus partidos lo ajustan
  const fixedPrior = atValue(T.fixedByValue, pl.value);
  const goalPrior = Math.max(0, atValue(T.goalByValue, pl.value));
  const assistPrior = Math.max(0, atValue(T.assistByValue, pl.value));
  const fixedStart = (fs + XP.priorStarts * fixedPrior) / (ns + XP.priorStarts);
  const goalShare = (g + XP.priorTeamGoals * goalPrior) / (tg + XP.priorTeamGoals);
  const assistShare = (a + XP.priorTeamGoals * assistPrior) / (tg + XP.priorTeamGoals);

  const one = (f: { goalsFor: number; goalsAgainst: number }) => {
    const attack = f.goalsFor * (goalShare * T.ptsPerGoal + assistShare * T.ptsPerAssist);
    let keep = 0;
    for (let k = 0; k <= XP.maxConceded; k++) {
      const pk = k === XP.maxConceded ? 1 - [...Array(XP.maxConceded).keys()].reduce((s, j) => s + pois(j, f.goalsAgainst), 0) : pois(k, f.goalsAgainst);
      keep += pk * T.conceded[k];
    }
    return pStart * (fixedStart + 0.92 * attack + keep) + pSub * (T.fixedSub + 0.25 * attack);
  };

  const base = one(neutral(teams, pl.teamId));
  const matches: MatchXp[] = fixtures.map((f: Fixture) => {
    const pts = one(f);
    const diff = pts - base;
    return {
      week: f.week, teamId: f.teamId, home: f.home,
      pts: Math.round(pts * 10) / 10,
      goalsFor: Math.round(f.goalsFor * 100) / 100,
      goalsAgainst: Math.round(f.goalsAgainst * 100) / 100,
      label: diff >= XP.easy ? "fácil" : diff <= -XP.easy ? "difícil" : "normal",
    };
  });
  const xp = matches.reduce((s, m) => s + m.pts, 0) / matches.length;
  return {
    xp: Math.round(xp * 10) / 10,
    pStart: Math.round(pStart * 100) / 100,
    matches,
    calendar: base > 0 ? Math.round((xp / base) * 100) / 100 : 1,
  };
}
