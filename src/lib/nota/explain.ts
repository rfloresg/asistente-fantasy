// Motivos de una nota, en texto, generados con las cifras del motor.
// Nada inventado: cada frase sale de un campo de PlayerScore.

import type { PlayerScore } from "./engine";

export interface Reason {
  good: boolean;
  text: string;
}

const n1 = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const signed = (x: number) => `${x > 0 ? "+" : ""}${n1(x)} %`;
export const money = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;

const STATUS: Record<string, string> = {
  injured: "Lesionado",
  suspended: "Sancionado",
  doubtful: "En duda",
};

export function reasons(s: PlayerScore, status: string, teamName: (id: string) => string): Reason[] {
  const out: Reason[] = [];
  if (STATUS[status]) out.push({ good: false, text: `${STATUS[status]}: resta ${s.r} puntos` });

  if (s.formAvg !== null && s.f >= 75) out.push({ good: true, text: `Buena forma: ${n1(s.formAvg)} pts por partido en los últimos partidos` });
  if (s.formAvg !== null && s.f <= 25) out.push({ good: false, text: `Mala forma: ${n1(s.formAvg)} pts por partido en los últimos partidos` });

  if (s.pct7 !== null && s.t >= 75) out.push({ good: true, text: `Sube de valor: ${signed(s.pct7)} en 7 días` });
  if (s.pct7 !== null && s.t <= 25) out.push({ good: false, text: `Baja de valor: ${signed(s.pct7)} en 7 días` });

  if (s.ptsPerM !== null && s.p >= 75) out.push({ good: true, text: `Barato para lo que puntúa: ${n1(s.ptsPerM)} pts por millón` });
  if (s.ptsPerM !== null && s.p <= 25) out.push({ good: false, text: `Caro para lo que puntúa: ${n1(s.ptsPerM)} pts por millón` });

  if (s.minutesAvg !== null && s.m >= 75) out.push({ good: true, text: `Muchos minutos: ${Math.round(s.minutesAvg)} por partido` });
  if (s.minutesAvg !== null && s.m <= 25) out.push({ good: false, text: `Juega poco: ${Math.round(s.minutesAvg)} min por partido` });

  if (s.startProb !== null && s.startProb >= 70) out.push({ good: true, text: `Titular probable: ${s.startProb} % (futbolfantasy)` });
  if (s.startProb !== null && s.startProb <= 40) out.push({ good: false, text: `Probable suplente: ${s.startProb} % de ser titular (futbolfantasy)` });

  const rivals = s.nextOpponents.map((o) => `${teamName(o.teamId)}${o.home ? "" : " (f)"}`).join(", ");
  if (rivals && s.c >= 75) out.push({ good: true, text: `Calendario fácil: ${rivals}` });
  if (rivals && s.c <= 25) out.push({ good: false, text: `Calendario difícil: ${rivals}` });

  return out;
}
