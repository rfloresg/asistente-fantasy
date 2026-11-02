// Validación de la nota con lo que pasó después. Funciones puras.
// Para cada nota guardada (jugador y día) mira:
//   - cuánto cambió su valor en los 7 días siguientes
//   - cuántos puntos hizo en las 2 jornadas siguientes
// y mide si una nota más alta acierta más (correlación de rangos de Spearman, de -1 a 1).

import { addDays } from "./engine";

export const HORIZON_DAYS = 7;
export const NEXT_WEEKS = 2;
export const FACTORS = ["nota", "f", "t", "p", "m", "c"] as const;
export type Factor = (typeof FACTORS)[number];

export interface ScoreRow {
  playerId: string;
  day: string;
  nota: number;
  f: number;
  t: number;
  p: number;
  m: number;
  c: number;
  value: number;
  expected: number;
  maxBidSpec: number | null;
  action: string;
}

export interface Outcome {
  row: ScoreRow;
  valueChange: number | null; // en tanto por uno, a 7 días
  points: number | null; // puntos en las 2 jornadas siguientes
}

// Jornadas que empiezan después de un día (orden por fecha de su primer partido)
function weeksAfter(weekStart: Map<number, string>, day: string, n: number): number[] {
  return [...weekStart.entries()]
    .filter(([, start]) => start > day)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, n)
    .map(([w]) => w);
}

export function outcomes(
  rows: ScoreRow[],
  values: Map<string, Map<string, number>>,
  points: Map<string, Map<number, number>>, // jugador -> jornada -> puntos
  weekStart: Map<number, string>, // jornada -> día de su primer partido
  playedWeeks: Set<number>, // jornadas ya terminadas
): Outcome[] {
  return rows.map((row) => {
    const later = values.get(row.playerId)?.get(addDays(row.day, HORIZON_DAYS));
    const valueChange = later && row.value ? later / row.value - 1 : null;
    const next = weeksAfter(weekStart, row.day, NEXT_WEEKS);
    const done = next.length === NEXT_WEEKS && next.every((w) => playedWeeks.has(w));
    const pts = done ? next.reduce((s, w) => s + (points.get(row.playerId)?.get(w) ?? 0), 0) : null;
    return { row, valueChange, points: pts };
  });
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; // empates: rango medio
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 10 || a.length !== b.length) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (ra.length + 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - mean) * (rb[i] - mean);
    da += (ra[i] - mean) ** 2;
    db += (rb[i] - mean) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface Report {
  n: { value: number; points: number };
  corr: Record<Factor, { value: number | null; points: number | null }>;
  byAction: Record<string, { n: number; valueChange: number | null; points: number | null; up: number | null }>;
  quintiles: { from: number; to: number; n: number; valueChange: number | null; points: number | null }[];
  spec: { n: number; up: number | null; meanError: number | null }; // jugadores con especulación recomendada
}

export function report(os: Outcome[]): Report {
  const withV = os.filter((o) => o.valueChange !== null);
  const withP = os.filter((o) => o.points !== null);
  const corr = Object.fromEntries(
    FACTORS.map((f) => [f, {
      value: spearman(withV.map((o) => o.row[f]), withV.map((o) => o.valueChange!)),
      points: spearman(withP.map((o) => o.row[f]), withP.map((o) => o.points!)),
    }]),
  ) as Report["corr"];

  const byAction: Report["byAction"] = {};
  for (const a of ["fichar", "mantener", "vender"]) {
    const g = os.filter((o) => o.row.action === a);
    const v = g.filter((o) => o.valueChange !== null).map((o) => o.valueChange!);
    byAction[a] = {
      n: g.length,
      valueChange: avg(v),
      points: avg(g.filter((o) => o.points !== null).map((o) => o.points!)),
      up: v.length ? v.filter((x) => x > 0).length / v.length : null,
    };
  }

  const sorted = [...os].sort((a, b) => a.row.nota - b.row.nota);
  const quintiles: Report["quintiles"] = [];
  for (let q = 0; q < 5; q++) {
    const g = sorted.slice(Math.floor((q * sorted.length) / 5), Math.floor(((q + 1) * sorted.length) / 5));
    if (!g.length) continue;
    quintiles.push({
      from: g[0].row.nota,
      to: g.at(-1)!.row.nota,
      n: g.length,
      valueChange: avg(g.filter((o) => o.valueChange !== null).map((o) => o.valueChange!)),
      points: avg(g.filter((o) => o.points !== null).map((o) => o.points!)),
    });
  }

  const spec = withV.filter((o) => o.row.maxBidSpec !== null);
  return {
    n: { value: withV.length, points: withP.length },
    corr,
    byAction,
    quintiles,
    spec: {
      n: spec.length,
      up: spec.length ? spec.filter((o) => o.valueChange! > 0).length / spec.length : null,
      // error medio del valor esperado frente al real (en tanto por uno)
      meanError: avg(spec.map((o) => Math.abs(o.row.expected / o.row.value - 1 - o.valueChange!))),
    },
  };
}

// Pesos sugeridos: proporcionales a lo que cada factor acierta (media de las dos correlaciones, solo positivas)
export function suggestWeights(r: Report): Record<"form" | "trend" | "ppm" | "minutes" | "calendar", number> | null {
  const map = { form: "f", trend: "t", ppm: "p", minutes: "m", calendar: "c" } as const;
  const raw = Object.fromEntries(
    Object.entries(map).map(([k, f]) => {
      const c = [r.corr[f].value, r.corr[f].points].filter((x): x is number => x !== null);
      return [k, Math.max(0, avg(c) ?? 0)];
    }),
  ) as Record<keyof typeof map, number>;
  const total = Object.values(raw).reduce((s, x) => s + x, 0);
  if (!total) return null;
  return Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, Math.round((x / total) * 100) / 100])) as Record<keyof typeof map, number>;
}
