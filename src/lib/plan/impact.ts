// Cuánto cambia tu mejor once (puntos esperados por jornada; con capitán solo en ligas Premium) si entra o sale un jugador.
// Es la medida de todas las decisiones del plan: fichar a quien mejora tu once, proteger a quien más perderías
// y vender a quien no aporta. Función pura.
import { bestLineup, type LineupPlayer } from "./lineup";

const r1 = (x: number) => Math.round(x * 10) / 10;
// captain: solo en ligas Premium cuenta doble el capitán
export function impact(squad: LineupPlayer[], captain = false) {
  const value = (ps: LineupPlayer[]) => bestLineup(ps, { captain })?.expected ?? 0;
  const base = value(squad);
  return {
    base,
    // Puntos por jornada que gana tu once si fichas a este jugador
    gain: (p: LineupPlayer) => r1(value([...squad.filter((x) => x.id !== p.id), p]) - base),
    // Puntos por jornada que pierde tu once si te quedas sin él
    loss: (id: string) => r1(base - value(squad.filter((x) => x.id !== id))),
  };
}

export const pts = (x: number) => `${x.toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} pts`;
