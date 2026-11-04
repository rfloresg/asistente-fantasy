// Cuánto cambia tu mejor once (puntos esperados por jornada, capitán incluido) si entra o sale un jugador.
// Es la medida de todas las decisiones del plan: fichar a quien mejora tu once, proteger a quien más perderías
// y vender a quien no aporta. Función pura.
import { bestLineup, type LineupPlayer } from "./lineup";

const r1 = (x: number) => Math.round(x * 10) / 10;
const value = (ps: LineupPlayer[]) => bestLineup(ps)?.expected ?? 0;

export function impact(squad: LineupPlayer[]) {
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
