// Mejor once y capitán para la próxima jornada. Función pura.
// Puntos esperados del próximo partido: los del modelo xP (rival, titularidad, goles y portería) si los hay;
// si no, forma × probabilidad de jugar (once probable) × estado (lesionado o sancionado 0, en duda la mitad).

import { strongDispute } from "../onces/combine";

export const FORMATIONS = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"]; // las de todo el mundo (sin Premium)

export interface LineupPlayer {
  id: string;
  name: string;
  positionId: number; // 1 POR, 2 DEF, 3 MED, 4 DEL (5 ENT no entra)
  status: string;
  formAvg: number | null;
  startProb: number | null; // % titular según el once probable; null = sin dato
  xp?: number | null; // puntos esperados del próximo partido (modelo xP), ya con titularidad y estado
  startSources?: { source: string; starter: boolean; prob: number }[]; // lo que dice cada fuente de onces
}

export interface Pick extends LineupPlayer {
  expected: number;
}

export interface Lineup {
  formation: string;
  starters: Pick[];
  captain: Pick | null;
  expected: number; // puntos esperados del once (con el capitán doble si la liga es Premium)
  out: Pick[]; // fuera del once: los que no pueden jugar o no van a jugar
  holes: Pick[]; // en el once por obligación (no tienes otro en su puesto) pero no van a jugar
  all: Pick[]; // toda la plantilla (sin entrenadores)
}

const STATUS_FACTOR: Record<string, number> = { injured: 0, suspended: 0, doubtful: 0.5, out_of_league: 0 };

export function expectedPoints(p: LineupPlayer): number {
  if (p.xp !== undefined && p.xp !== null) return Math.round(Math.max(0, p.xp) * (STATUS_FACTOR[p.status] === 0 ? 0 : 1) * 10) / 10;
  const form = Math.max(0, p.formAvg ?? 0);
  // Sin once probable, la forma ya recoge los minutos. Con él, un suplente probable rinde mucho menos.
  const play = p.startProb === null ? 1 : 0.15 + 0.85 * (p.startProb / 100);
  return Math.round(form * play * (STATUS_FACTOR[p.status] ?? 1) * 10) / 10;
}

export const EMPTY = "vacio-"; // id de los puestos sin jugador
export const isEmpty = (id: string) => id.startsWith(EMPTY);

// captain: solo en ligas Premium hay capitán (puntúa doble). En las normales, el once se elige sin él.
export function bestLineup(players: LineupPlayer[], opts: { captain?: boolean } = {}): Lineup | null {
  const withCaptain = opts.captain ?? false;
  const picks: Pick[] = players
    .filter((p) => p.positionId >= 1 && p.positionId <= 4)
    .map((p) => ({ ...p, expected: expectedPoints(p) }))
    .sort((a, b) => b.expected - a.expected);
  if (!picks.length) return null;
  const byPos = (pos: number) => picks.filter((p) => p.positionId === pos);
  // Si no tienes bastantes en un puesto, el hueco se rellena con "Sin jugador" (y el plan te dice que fiches)
  const empty = (pos: number, k: number): Pick => ({ id: `${EMPTY}${pos}-${k}`, name: "Sin jugador", positionId: pos, status: "out_of_league", formAvg: 0, startProb: 0, expected: 0 });
  let best: Lineup | null = null;
  for (const f of FORMATIONS) {
    const [d, m, a] = f.split("-").map(Number);
    const need: [number, number][] = [[1, 1], [2, d], [3, m], [4, a]];
    const starters = need.flatMap(([pos, n]) => {
      const have = byPos(pos).slice(0, n);
      return [...have, ...Array.from({ length: n - have.length }, (_, k) => empty(pos, k))];
    });
    const captain = withCaptain ? [...starters].sort((x, y) => y.expected - x.expected)[0] ?? null : null;
    const expected = Math.round((starters.reduce((s, p) => s + p.expected, 0) + (captain?.expected ?? 0)) * 10) / 10;
    if (!best || expected > best.expected) best = { formation: f, starters, captain, expected, out: [], holes: [], all: picks };
  }
  if (!best) return null;
  const wontPlay = (p: Pick) => (STATUS_FACTOR[p.status] ?? 1) === 0 || (p.startProb !== null && p.startProb < 30);
  const inXI = new Set(best.starters.map((p) => p.id));
  best.out = picks.filter((p) => !inXI.has(p.id) && wontPlay(p));
  best.holes = best.starters.filter(wontPlay);
  return best;
}

// Titulares de tu once en los que las fuentes de onces no coinciden de verdad, con el suplente que
// entraría (mismo puesto, que vaya a puntuar). Sin recambio no se avisa: no cambia nada.
export interface LineupDispute {
  id: string;
  name: string;
  sources: { source: string; starter: boolean; prob: number }[];
  sub: { id: string; name: string };
}

export function lineupDisputes(l: Lineup): LineupDispute[] {
  const inXi = new Set(l.starters.map((p) => p.id));
  const out = new Set(l.out.map((p) => p.id));
  const holes = new Set(l.holes.map((p) => p.id));
  const res: LineupDispute[] = [];
  for (const p of l.starters) {
    if (holes.has(p.id) || !strongDispute(p.startSources)) continue;
    const sub = l.all.filter((q) => q.positionId === p.positionId && !inXi.has(q.id) && !out.has(q.id) && q.expected > 0).sort((a, b) => b.expected - a.expected)[0];
    if (sub) res.push({ id: p.id, name: p.name, sources: p.startSources!, sub: { id: sub.id, name: sub.name } });
  }
  return res;
}
