// "Tu semana": el resumen de cada jornada para cada usuario, por Telegram (y notificación de la app).
// Puntos de la jornada y puesto en ella, puesto en la general, lo que ha cambiado el valor de tu plantilla,
// el once que te dimos (esperado y real) y el mejor y el peor consejo de la semana. Función pura.

import type { RecOutcome, XiOutcome } from "./aciertos";

export interface WeekInput {
  league: string;
  week: number;
  my: { points: number | null; weekPosition: number | null; position: number | null; previousPosition: number | null };
  best: { manager: string; points: number } | null; // el mejor de la jornada
  managers: number;
  squad: { now: number; weekAgo: number } | null; // valor de tu plantilla
  xi: XiOutcome | null; // nuestro once de esa jornada
  recs: RecOutcome[]; // consejos de la semana ya medidos
}

const M = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
const signedM = (x: number) => `${x >= 0 ? "+" : "−"}${M(Math.abs(x))}`;
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x))} %`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VERB: Record<RecOutcome["kind"], string> = { fichar: "fichar a", vender: "vender a", proteger: "proteger a" };

// Para un consejo: cuánto "acertó" (fichar: lo que subió sobre el mercado; vender: lo que bajó)
const edge = (r: RecOutcome) => (r.change === null || r.market === null ? null : r.kind === "vender" ? r.market - r.change : r.change - r.market);

export function bestAndWorst(recs: RecOutcome[]): { best: RecOutcome | null; worst: RecOutcome | null } {
  const scored = recs.filter((r) => r.kind !== "proteger" && edge(r) !== null).sort((a, b) => edge(b)! - edge(a)!);
  if (!scored.length) return { best: null, worst: null };
  const best = edge(scored[0])! > 0 ? scored[0] : null;
  const last = scored[scored.length - 1];
  const worst = edge(last)! < 0 && last !== best ? last : null;
  return { best, worst };
}

const recLine = (r: RecOutcome) => `${VERB[r.kind]} <b>${esc(r.name)}</b> (${pct(r.change!)}; el mercado, ${pct(r.market!)})`;

export function weekSummaryText(i: WeekInput): string | null {
  const lines: string[] = [];
  if (i.my.points !== null) {
    const rank = i.my.weekPosition ? ` · ${i.my.weekPosition}.º de ${i.managers} en la jornada` : "";
    const top = i.best && i.my.weekPosition !== 1 ? ` (el mejor, ${esc(i.best.manager)} con ${i.best.points})` : i.my.weekPosition === 1 ? " 🏆 ¡el mejor de la jornada!" : "";
    lines.push(`⚽ Hiciste <b>${i.my.points} pts</b>${rank}${top}.`);
  }
  if (i.my.position) {
    const diff = i.my.previousPosition ? i.my.previousPosition - i.my.position : 0;
    const move = diff > 0 ? ` (subes ${diff})` : diff < 0 ? ` (bajas ${-diff})` : "";
    lines.push(`📊 En la general vas <b>${i.my.position}.º</b>${move}.`);
  }
  if (i.squad && i.squad.weekAgo > 0) {
    lines.push(`💰 Tu plantilla vale <b>${M(i.squad.now)}</b> (${signedM(i.squad.now - i.squad.weekAgo)} en 7 días).`);
  }
  if (i.xi) {
    const diff = i.xi.actual - i.xi.expected;
    const how = Math.abs(diff) < 3 ? "casi lo que esperábamos" : diff > 0 ? "más de lo esperado" : "menos de lo esperado";
    lines.push(`📋 El once que te recomendamos esperaba ${i.xi.expected.toLocaleString("es-ES", { maximumFractionDigits: 1 })} pts y sacó ${i.xi.actual}: ${how}.`);
  }
  const { best, worst } = bestAndWorst(i.recs);
  if (best) lines.push(`✅ Mejor consejo: ${recLine(best)}.`);
  if (worst) lines.push(`❌ Peor consejo: ${recLine(worst)}.`);
  if (!lines.length) return null;
  return `📅 <b>Tu jornada ${i.week} en ${esc(i.league)}</b>\n\n${lines.join("\n")}`;
}

// Texto corto para la notificación del móvil
export function weekSummaryPush(i: WeekInput): string | null {
  const parts: string[] = [];
  if (i.my.points !== null) parts.push(`${i.my.points} pts`);
  if (i.my.position) parts.push(`vas ${i.my.position}.º`);
  if (i.squad && i.squad.weekAgo > 0) parts.push(`plantilla ${signedM(i.squad.now - i.squad.weekAgo)}`);
  return parts.length ? parts.join(" · ") : null;
}
