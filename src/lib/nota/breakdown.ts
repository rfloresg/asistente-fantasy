// Desglose de los puntos de un jugador en una jornada, a partir de las estadísticas de la API
// ({ stat: [valor, puntos] }). Separa lo que depende del rival (goles, asistencias, portería)
// de lo que hace por jugar (minutos, recuperaciones, paradas, puntos de marca...). Función pura.

export interface WeekLine {
  points: number;
  minutes: number;
  goals?: number;
  goalPts?: number;
  assists?: number;
  assistPts?: number;
  conceded?: number; // goles que encajó su equipo mientras jugaba
  concededPts?: number; // puntos por ellos (con portería a cero suman)
}

type Stats = Record<string, [number, number] | undefined>;
const v = (s: Stats, k: string) => s[k]?.[0] ?? 0;
const p = (s: Stats, k: string) => s[k]?.[1] ?? 0;

export function breakdown(points: number, minutes: number, stats: Stats | null | undefined): WeekLine {
  if (!stats || !Object.keys(stats).length) return { points, minutes };
  return {
    points,
    minutes,
    goals: v(stats, "goals"),
    goalPts: p(stats, "goals"),
    assists: v(stats, "goal_assist"),
    assistPts: p(stats, "goal_assist"),
    conceded: v(stats, "goals_conceded"),
    concededPts: p(stats, "goals_conceded"),
  };
}

// Lo que hace "por jugar": todo menos goles, asistencias y portería
export const fixedPts = (w: WeekLine) => w.points - (w.goalPts ?? 0) - (w.assistPts ?? 0) - (w.concededPts ?? 0);
