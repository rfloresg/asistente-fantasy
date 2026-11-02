// Momentos clave del calendario según el meta: cierre de mercado y parones. Funciones puras.

export const CLOSE_BEFORE_H = 24; // el mercado y las cláusulas cierran 24 h antes de la jornada
export const PARON_DAYS = 9; // más de 9 días sin partidos entre jornadas = parón

export interface MatchLite {
  week: number;
  date: Date;
}

export interface NextMatchday {
  week: number;
  start: Date; // primer partido
  close: Date; // cierre de mercado y cláusulas
  prevEnd: Date | null; // último partido de la jornada anterior
  paron: boolean;
}

// Próxima jornada que aún no ha empezado
export function nextMatchday(matches: MatchLite[], now: Date): NextMatchday | null {
  const byWeek = new Map<number, { start: number; end: number }>();
  for (const m of matches) {
    const t = m.date.getTime();
    const w = byWeek.get(m.week) ?? { start: t, end: t };
    byWeek.set(m.week, { start: Math.min(w.start, t), end: Math.max(w.end, t) });
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[1].start - b[1].start);
  const i = weeks.findIndex(([, w]) => w.start > now.getTime());
  if (i < 0) return null;
  const [week, w] = weeks[i];
  const prevEnd = i > 0 ? new Date(weeks[i - 1][1].end) : null;
  return {
    week,
    start: new Date(w.start),
    close: new Date(w.start - CLOSE_BEFORE_H * 3600e3),
    prevEnd,
    paron: prevEnd ? w.start - prevEnd.getTime() > PARON_DAYS * 24 * 3600e3 : false,
  };
}

const hm = (d: Date) =>
  d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", hour: "2-digit", minute: "2-digit" });

// Avisos del meta que tocan ahora. key = para no repetirlos.
export function metaAlerts(next: NextMatchday | null, now: Date, closeWarnH = 4): { key: string; text: string }[] {
  if (!next) return [];
  const out: { key: string; text: string }[] = [];
  const toClose = next.close.getTime() - now.getTime();
  if (toClose > 0 && toClose <= closeWarnH * 3600e3) {
    out.push({
      key: `cierre:${next.week}`,
      text: `⏰ <b>El mercado y las cláusulas cierran el ${hm(next.close)}</b>, 24 h antes de la jornada ${next.week}. Últimas horas para clausular: blinda a tus estrellas con la cláusula abierta y llega con saldo positivo, que en negativo no se puntúa.`,
    });
  }
  if (next.paron && next.prevEnd && now > next.prevEnd && toClose > 0) {
    out.push({
      key: `paron:${next.week}`,
      text: `🌍 <b>Parón</b> hasta la jornada ${next.week} (${hm(next.start)}). Sin protección automática de cláusulas: blinda o sube la cláusula a quien no quieras perder. Al principio suben los que tienen bombo; en la última semana suele frenarse.`,
    });
  }
  return out;
}
