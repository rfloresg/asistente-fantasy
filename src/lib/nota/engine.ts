// Motor de la Nota Fantasy. Funciones puras: datos in, notas out.
// Sin base de datos ni LLM aquí. Se puede calcular "a fecha X" para validar.

export const CONFIG = {
  // Ajustados con npm run validar (60 días, nov 2026): tendencia y minutos aciertan más; calendario casi nada
  weights: { form: 0.3, trend: 0.3, ppm: 0.1, minutes: 0.25, calendar: 0.05 },
  risk: { injured: 25, suspended: 20, doubtful: 10 } as Record<string, number>,
  formWeeks: 5, // últimos partidos del equipo para forma y minutos
  nextMatches: 2, // rivales que mira el calendario (las 2 jornadas siguientes)
  calendarWeeks: 8, // partidos recientes para medir ataque y defensa de cada equipo
  homeFactor: 1.1, // en casa se marca un 10 % más (y fuera un 10 % menos)
  holdDays: 7, // días que piensas tener al jugador para especular
  specMargin: 0.05, // beneficio mínimo al especular (5 % del valor)
  maxDailyRate: 0.08, // tope de subida/bajada diaria al proyectar
  buy: 70, // nota mínima para fichar
  buyMinForm: 4, // y al menos 4 pts por partido en los últimos partidos
  buyMinProb: 50, // y, si hay once probable, al menos 50 % de ser titular
  sell: 40, // por debajo, y bajando, vender
};

const FINISHED = 7;

export interface EnginePlayer {
  id: string;
  positionId: number;
  status: string;
  teamId: string | null;
}

export interface EngineMatch {
  week: number;
  date: Date;
  localId: string;
  visitorId: string;
  state: number;
  localScore: number | null;
  visitorScore: number | null;
}

export interface EngineInput {
  asOf: string; // "YYYY-MM-DD": día del último valor conocido
  players: EnginePlayer[];
  values: Map<string, Map<string, number>>; // jugador -> día -> valor
  weeks: Map<string, Map<number, { points: number; minutes: number }>>; // jugador -> jornada
  matches: EngineMatch[];
  // Once probable del día asOf (futbolfantasy). Sin dato = solo minutos.
  lineups?: Map<string, { starter: boolean; prob: number | null }>;
}

export type Action = "fichar" | "mantener" | "vender";

export interface PlayerScore {
  playerId: string;
  day: string;
  nota: number;
  // percentiles 0-100 dentro de su posición
  f: number;
  t: number;
  p: number;
  m: number;
  c: number;
  r: number; // puntos que resta el riesgo
  // métricas en bruto, para explicar la nota
  value: number;
  formAvg: number | null; // puntos por partido, últimos N del equipo
  minutesAvg: number | null; // minutos por partido, últimos N
  startProb: number | null; // % de ser titular en el próximo partido (once probable)
  seasonAvg: number | null; // puntos por partido del equipo en la temporada
  pct3: number | null; // % de cambio de valor en 3 días
  pct7: number | null;
  dailyRate: number | null; // ritmo diario usado para proyectar
  ptsPerM: number | null; // puntos por partido / millón de valor
  nextOpponents: { teamId: string; home: boolean }[];
  calendarDifficulty: number | null; // más alto = más difícil
  expected: number; // valor esperado en holdDays días
  maxBidSpec: number | null; // null = no compensa especular
  maxBidPlay: number;
  action: Action;
}

// ---------- utilidades ----------

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round10k = (x: number) => Math.round(x / 10_000) * 10_000;

// Percentil 0-100 de cada valor dentro de la lista (empates = media). null -> 50.
export function percentiles(values: (number | null)[]): number[] {
  const known = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const out = values.map(() => 50);
  if (known.length < 2) return out;
  known.sort((a, b) => a.v - b.v);
  let k = 0;
  while (k < known.length) {
    let j = k;
    while (j + 1 < known.length && known[j + 1].v === known[k].v) j++;
    const rank = (k + j) / 2;
    for (let x = k; x <= j; x++) out[known[x].i] = (rank / (known.length - 1)) * 100;
    k = j + 1;
  }
  return out;
}

// ---------- equipos ----------

interface TeamInfo {
  playedWeeks: number[]; // jornadas terminadas, de más reciente a más antigua
  strength: number; // puntos por partido + 0,1 x diferencia de goles por partido
  attack: number; // goles a favor por partido (últimos partidos, suavizado hacia la media)
  defense: number; // goles en contra por partido (igual)
  next: { teamId: string; home: boolean }[];
}

export function teamInfo(matches: EngineMatch[], asOf: string): Map<string, TeamInfo> {
  const cutoff = new Date(`${addDays(asOf, 1)}T00:00:00+01:00`); // fin del día asOf en Madrid
  const start = new Date(`${asOf}T00:00:00+01:00`);
  const acc = new Map<string, { weeks: { w: number; d: number; gf: number; ga: number }[]; pts: number; gd: number; n: number; next: { d: number; teamId: string; home: boolean }[] }>();
  const get = (id: string) => {
    if (!acc.has(id)) acc.set(id, { weeks: [], pts: 0, gd: 0, n: 0, next: [] });
    return acc.get(id)!;
  };
  for (const m of matches) {
    const L = get(m.localId);
    const V = get(m.visitorId);
    const done = m.state === FINISHED && m.date < cutoff && m.localScore !== null && m.visitorScore !== null;
    if (done) {
      const diff = m.localScore! - m.visitorScore!;
      L.weeks.push({ w: m.week, d: +m.date, gf: m.localScore!, ga: m.visitorScore! });
      V.weeks.push({ w: m.week, d: +m.date, gf: m.visitorScore!, ga: m.localScore! });
      L.pts += diff > 0 ? 3 : diff === 0 ? 1 : 0;
      V.pts += diff < 0 ? 3 : diff === 0 ? 1 : 0;
      L.gd += diff;
      V.gd -= diff;
      L.n++;
      V.n++;
    } else if (m.state !== FINISHED && m.date >= start) {
      L.next.push({ d: +m.date, teamId: m.visitorId, home: true });
      V.next.push({ d: +m.date, teamId: m.localId, home: false });
    }
  }
  // Media de goles por partido de la liga, para suavizar equipos con pocos partidos
  const all = [...acc.values()].flatMap((a) => a.weeks);
  const leagueAvg = all.length ? all.reduce((s, w) => s + w.gf, 0) / all.length : 1.3;
  const PRIOR = 2; // partidos "de media" que se suman a cada equipo
  const out = new Map<string, TeamInfo>();
  for (const [id, a] of acc) {
    const recent = [...a.weeks].sort((x, y) => y.d - x.d).slice(0, CONFIG.calendarWeeks);
    const smooth = (sum: number) => (sum + PRIOR * leagueAvg) / (recent.length + PRIOR);
    out.set(id, {
      playedWeeks: a.weeks.sort((x, y) => y.d - x.d).map((x) => x.w),
      strength: a.n ? a.pts / a.n + (0.1 * a.gd) / a.n : 1.3,
      attack: smooth(recent.reduce((s, w) => s + w.gf, 0)),
      defense: smooth(recent.reduce((s, w) => s + w.ga, 0)),
      next: a.next.sort((x, y) => x.d - y.d).slice(0, CONFIG.nextMatches).map(({ teamId, home }) => ({ teamId, home })),
    });
  }
  return out;
}

// Dificultad de un partido para un jugador (más alto = más difícil), según su puesto:
// porteros y defensas sufren con los goles que se esperan en contra; delanteros, con los que no se esperan a favor.
export function matchDifficulty(own: { attack: number; defense: number }, opp: { attack: number; defense: number } | undefined, home: boolean, positionId: number): number {
  const avg = 1.3;
  const o = opp ?? { attack: avg, defense: avg };
  const h = home ? CONFIG.homeFactor : 1 / CONFIG.homeFactor;
  const goalsFor = (own.attack * o.defense) / avg * h;
  const goalsAgainst = (o.attack * own.defense) / avg / h;
  if (positionId <= 2) return goalsAgainst; // POR, DEF: portería a cero
  if (positionId === 3) return goalsAgainst * 0.5 - goalsFor; // MED: un poco de cada
  return -goalsFor; // DEL (y entrenador): goles del equipo
}

// ---------- motor ----------

export function computeScores(input: EngineInput): PlayerScore[] {
  const { asOf } = input;
  const teams = teamInfo(input.matches, asOf);

  type Raw = Omit<PlayerScore, "nota" | "f" | "t" | "p" | "m" | "c" | "maxBidPlay" | "action">;
  const raws: (Raw & { positionId: number; status: string })[] = [];

  for (const pl of input.players) {
    if (pl.status === "out_of_league") continue;
    const vals = input.values.get(pl.id);
    const v0 = vals?.get(asOf);
    if (!v0) continue;
    const v3 = vals?.get(addDays(asOf, -3));
    const v7 = vals?.get(addDays(asOf, -7));
    const team = pl.teamId ? teams.get(pl.teamId) : undefined;
    const pw = input.weeks.get(pl.id);

    const weekStat = (w: number) => pw?.get(w) ?? { points: 0, minutes: 0 };
    const recent = (team?.playedWeeks ?? []).slice(0, CONFIG.formWeeks);
    const season = team?.playedWeeks ?? [];
    const formAvg = mean(recent.map((w) => weekStat(w).points));
    const lu = input.lineups?.get(pl.id);
    const startProb = lu ? (lu.prob ?? (lu.starter ? 70 : 20)) : null;
    const minutesAvg = mean(recent.map((w) => weekStat(w).minutes));
    const seasonAvg = mean(season.map((w) => weekStat(w).points));

    const r3 = v3 ? (v0 / v3) ** (1 / 3) - 1 : null;
    const r7 = v7 ? (v0 / v7) ** (1 / 7) - 1 : null;
    const rates = [r3, r7].filter((x): x is number => x !== null);
    const dailyRate = rates.length ? clamp(mean(rates)!, -CONFIG.maxDailyRate, CONFIG.maxDailyRate) : null;

    const next = team?.next ?? [];
    const difficulty = team ? mean(next.map((n) => matchDifficulty(team, teams.get(n.teamId), n.home, pl.positionId))) : null;

    const expected = round10k(v0 * (1 + (dailyRate ?? 0)) ** CONFIG.holdDays);
    const spec = expected - v0 * CONFIG.specMargin;

    raws.push({
      playerId: pl.id,
      day: asOf,
      positionId: pl.positionId,
      status: pl.status,
      r: CONFIG.risk[pl.status] ?? 0,
      value: v0,
      formAvg,
      minutesAvg,
      startProb,
      seasonAvg,
      pct3: v3 ? ((v0 - v3) / v3) * 100 : null,
      pct7: v7 ? ((v0 - v7) / v7) * 100 : null,
      dailyRate,
      ptsPerM: seasonAvg !== null ? seasonAvg / (v0 / 1e6) : null,
      nextOpponents: next,
      calendarDifficulty: difficulty,
      expected,
      maxBidSpec: spec > v0 ? round10k(spec) : null,
    });
  }

  // Percentiles por posición
  const out: PlayerScore[] = [];
  const byPos = new Map<number, typeof raws>();
  for (const r of raws) byPos.set(r.positionId, [...(byPos.get(r.positionId) ?? []), r]);

  const W = CONFIG.weights;
  for (const group of byPos.values()) {
    const F = percentiles(group.map((g) => g.formAvg));
    const T = percentiles(group.map((g) => g.dailyRate));
    const P = percentiles(group.map((g) => g.ptsPerM));
    // Minutos: mitad lo que ha jugado, mitad la probabilidad de ser titular si la hay
    const M = percentiles(
      group.map((g) => {
        const played = g.minutesAvg === null ? null : Math.min(g.minutesAvg / 90, 1);
        if (g.startProb === null) return played;
        return 0.5 * (played ?? 0) + 0.5 * (g.startProb / 100);
      }),
    );
    // menos dificultad = mejor: invertimos el signo
    const C = percentiles(group.map((g) => (g.calendarDifficulty === null ? null : -g.calendarDifficulty)));

    group.forEach((g, i) => {
      const nota = Math.round(
        clamp(W.form * F[i] + W.trend * T[i] + W.ppm * P[i] + W.minutes * M[i] + W.calendar * C[i] - g.r, 0, 100),
      );
      const falling = (g.dailyRate ?? 0) < 0;
      const action: Action =
        nota >= CONFIG.buy &&
        (g.formAvg ?? 0) >= CONFIG.buyMinForm &&
        (g.startProb === null || g.startProb >= CONFIG.buyMinProb) &&
        (g.status === "ok" || g.status === "doubtful")
          ? "fichar"
          : (nota < CONFIG.sell && falling) || (g.status === "injured" && falling)
            ? "vender"
            : "mantener";
      // Para jugar: pagar algo más cuanto mejor la nota, hasta +30 % con nota 100
      const maxBidPlay = round10k(g.value * (1 + 0.3 * Math.max(0, nota - 60) / 40));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { positionId, status, ...rest } = g;
      out.push({
        ...rest,
        nota,
        f: Math.round(F[i]),
        t: Math.round(T[i]),
        p: Math.round(P[i]),
        m: Math.round(M[i]),
        c: Math.round(C[i]),
        maxBidPlay,
        action,
      });
    });
  }
  return out.sort((a, b) => b.nota - a.nota);
}
