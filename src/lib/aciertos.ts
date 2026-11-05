// Cuánto acertamos: qué pasó con lo que el plan le dijo a cada usuario desde que usa la app.
// Fichar: ¿subió más que el mercado y puntuó? Vender: ¿bajó más que el mercado? Proteger: ¿lo sigues
// teniendo? Once: puntos esperados frente a los que sacó. Y si le hiciste caso (lo dicen las plantillas
// guardadas con cada plan, no el botón "Hecho"). Función pura: los datos los trae la página.

import type { LigaSnapshot, LineupSnapshot } from "./plan/snapshot";

export const HORIZON_DAYS = 7; // el valor se mide hasta 7 días después (o hasta hoy si aún no han pasado)
const KIND: Record<string, Kind> = { pujar: "fichar", clausulazo: "fichar", vender: "vender", proteger: "proteger" };
export type Kind = "fichar" | "vender" | "proteger";

export interface PlanRow {
  createdAt: Date;
  acciones: { tipo: string; playerId?: string; jugador?: string }[];
  lineup: LineupSnapshot | null;
  liga: LigaSnapshot | null;
}

export interface WeekRow {
  week: number;
  start: Date; // primer partido
  finished: boolean;
}

export interface RecOutcome {
  kind: Kind;
  playerId: string;
  name: string;
  at: Date;
  fromDay: string;
  toDay: string;
  days: number; // días medidos (0 = aún nada)
  valueFrom: number | null;
  valueTo: number | null;
  change: number | null; // % de cambio de valor
  market: number | null; // % que cambió el mercado en esos mismos días
  ptsPerWeek: number | null; // en las jornadas terminadas después (como mucho 2)
  followed: boolean | null; // null = no se puede saber
  ok: boolean | null; // acierto
}

export interface XiOutcome {
  week: number;
  expected: number;
  actual: number;
}

export interface Summary {
  n: number;
  measured: number; // con al menos un día de valor
  judged: number; // con veredicto
  ok: number;
  avgChange: number | null;
  avgMarket: number | null;
  avgPts: number | null;
  followed: number;
  followedMoney: number; // fichar: lo que subieron los que fichaste; vender: lo que te ahorraste
}

export interface Aciertos {
  since: Date | null;
  recs: RecOutcome[];
  xi: XiOutcome[];
  summary: Record<Kind, Summary>;
}

const DAY = 86400e3;
export const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Valor de ese día o, si falta, el del último día anterior
export function valueOn(values: Map<string, number> | undefined, day: string): number | null {
  if (!values) return null;
  if (values.has(day)) return values.get(day)!;
  let best: string | null = null;
  for (const d of values.keys()) if (d <= day && (!best || d > best)) best = d;
  return best ? values.get(best)! : null;
}

export function aciertos(i: {
  plans: PlanRow[];
  values: Map<string, Map<string, number>>; // jugador -> día -> valor
  points: Map<string, Map<number, number>>; // jugador -> jornada -> puntos
  weeks: WeekRow[];
  lastDay: string; // último día con valores
  market: (from: string, to: string) => number | null; // % medio del mercado entre dos días
}): Aciertos {
  const plans = [...i.plans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const owner = (p: PlanRow, id: string) => (p.liga?.owners ? (p.liga.owners[id] === p.liga.myTeamId ? "mio" : "otro") : null);

  // Cada recomendación una vez: la primera vez que salió
  const seen = new Set<string>();
  const recs: RecOutcome[] = [];
  plans.forEach((plan, idx) => {
    for (const a of plan.acciones) {
      const kind = KIND[a.tipo];
      if (!kind || !a.playerId) continue;
      const key = `${kind}:${a.playerId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const id = a.playerId;
      const fromDay = madridDay(plan.createdAt);
      const toDay = [addDays(fromDay, HORIZON_DAYS), i.lastDay].sort()[0];
      const days = Math.max(0, daysBetween(fromDay, toDay));
      const vf = valueOn(i.values.get(id), fromDay);
      const vt = days ? valueOn(i.values.get(id), toDay) : null;
      const change = vf && vt !== null ? ((vt - vf) / vf) * 100 : null;
      const market = days ? i.market(fromDay, toDay) : null;

      const after = i.weeks.filter((w) => w.finished && w.start > plan.createdAt).sort((x, y) => x.week - y.week).slice(0, 2);
      const ptsPerWeek = after.length ? mean(after.map((w) => i.points.get(id)?.get(w.week) ?? 0)) : null;

      // ¿Le hizo caso? Lo dicen las plantillas guardadas con este plan y los siguientes. La de cada plan
      // se refresca cada 30 min, así que la de este mismo plan ya puede recoger lo que hiciste después.
      // Vender y proteger solo se proponen con jugadores tuyos: si deja de estar en tu equipo, lo vendiste.
      const later = plans.slice(idx).map((p) => owner(p, id)).filter((o) => o !== null);
      let followed: boolean | null = null;
      if (kind === "fichar") followed = later.length ? later.includes("mio") : null;
      if (kind === "vender") followed = later.length ? later.includes("otro") : null;
      if (kind === "proteger") followed = later.length ? later.at(-1) === "mio" : null;

      let ok: boolean | null = null;
      if (change !== null && market !== null) {
        if (kind === "fichar") ok = change > market || (ptsPerWeek !== null && ptsPerWeek >= 6);
        if (kind === "vender") ok = change < market;
      }
      if (kind === "proteger" && followed !== null) ok = followed;

      recs.push({ kind, playerId: id, name: a.jugador ?? id, at: plan.createdAt, fromDay, toDay, days, valueFrom: vf, valueTo: vt, change, market, ptsPerWeek, followed, ok });
    }
  });

  // Once: el último que le dimos antes de cada jornada terminada
  const xi: XiOutcome[] = [];
  for (const w of [...i.weeks].filter((w) => w.finished).sort((a, b) => a.week - b.week)) {
    const plan = [...plans].reverse().find((p) => p.lineup && p.createdAt < w.start && p.createdAt.getTime() > w.start.getTime() - 7 * DAY);
    if (!plan?.lineup) continue;
    const actual = plan.lineup.starters.reduce((s, p) => s + (i.points.get(p.id)?.get(w.week) ?? 0), 0);
    xi.push({ week: w.week, expected: plan.lineup.expected, actual });
  }

  const summarize = (kind: Kind): Summary => {
    const rs = recs.filter((r) => r.kind === kind);
    const measured = rs.filter((r) => r.change !== null);
    const fol = rs.filter((r) => r.followed && r.valueFrom !== null && r.valueTo !== null);
    const sign = kind === "vender" ? -1 : 1;
    return {
      n: rs.length,
      measured: measured.length,
      judged: rs.filter((r) => r.ok !== null).length,
      ok: rs.filter((r) => r.ok).length,
      avgChange: mean(measured.map((r) => r.change!)),
      avgMarket: mean(measured.filter((r) => r.market !== null).map((r) => r.market!)),
      avgPts: mean(rs.filter((r) => r.ptsPerWeek !== null).map((r) => r.ptsPerWeek!)),
      followed: rs.filter((r) => r.followed).length,
      followedMoney: fol.reduce((s, r) => s + sign * (r.valueTo! - r.valueFrom!), 0),
    };
  };

  return {
    since: plans[0]?.createdAt ?? null,
    recs,
    xi,
    summary: { fichar: summarize("fichar"), vender: summarize("vender"), proteger: summarize("proteger") },
  };
}

// % medio que cambió el valor de todos los jugadores entre dos días (los de más de 1 M, para no
// inflarlo con los baratos que suben un 20 % por 50 000 €)
export function marketChange(all: Map<string, Map<string, number>>, from: string, to: string): number | null {
  const xs: number[] = [];
  for (const vs of all.values()) {
    const a = valueOn(vs, from);
    const b = valueOn(vs, to);
    if (a && a >= 1e6 && b !== null) xs.push(((b - a) / a) * 100);
  }
  return mean(xs);
}
