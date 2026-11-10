// Momentos clave del calendario: cierre de mercado, parones y en qué fase del ciclo estamos. Funciones puras.
//
// Cada jornada se toma por su bloque principal (partidos a 3 días o menos de la mediana): los aplazados
// (un partido de la J8 en diciembre) no estiran la jornada ni esconden un parón.

export const CLOSE_BEFORE_H = 24; // el mercado y las cláusulas cierran 24 h antes de la jornada
export const PARON_DAYS = 9; // más de 9 días sin partidos entre jornadas = parón
const DAY = 86400e3;
const CORE_DAYS = 3;

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

interface Block { week: number; start: number; end: number }

export function blocks(matches: MatchLite[]): Block[] {
  const byWeek = new Map<number, number[]>();
  for (const m of matches) {
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m.date.getTime());
  }
  return [...byWeek.entries()]
    .map(([week, ts]) => {
      ts.sort((a, b) => a - b);
      const med = ts[ts.length >> 1];
      const core = ts.filter((t) => Math.abs(t - med) <= CORE_DAYS * DAY);
      return { week, start: core[0], end: core[core.length - 1] };
    })
    .sort((a, b) => a.start - b.start);
}

// Próxima jornada que aún no ha empezado
export function nextMatchday(matches: MatchLite[], now: Date): NextMatchday | null {
  const bs = blocks(matches);
  const i = bs.findIndex((b) => b.start > now.getTime());
  if (i < 0) return null;
  const b = bs[i];
  const prevEnd = i > 0 ? new Date(bs[i - 1].end) : null;
  return {
    week: b.week,
    start: new Date(b.start),
    close: new Date(b.start - CLOSE_BEFORE_H * 3600e3),
    prevEnd,
    paron: prevEnd ? b.start - prevEnd.getTime() > PARON_DAYS * DAY : false,
  };
}

// Fase del mercado. Lo que funciona en cada una está medido con los valores de la temporada 26/27
// (ver PHASE en plan.ts y el tema "momentos" del manual).
export type PhaseKind = "jornada" | "tras-jornada" | "semana" | "previa" | "cerrado" | "paron-inicio" | "paron-mitad" | "paron-final";

export interface MarketPhase {
  kind: PhaseKind;
  week: number | null; // la próxima jornada (o la que se juega)
  start: Date | null; // su primer partido
  close: Date | null; // cierre de mercado
  daysToStart: number | null;
  paronDay?: number; // día del parón (1 = el siguiente al último partido)
  paronDays?: number; // días que dura
}

export function marketPhase(matches: MatchLite[], now: Date): MarketPhase | null {
  const bs = blocks(matches);
  const t = now.getTime();
  const playing = bs.find((b) => b.start <= t && t <= b.end + 3 * 3600e3); // el último partido acaba ~2 h después
  if (playing) return { kind: "jornada", week: playing.week, start: new Date(playing.start), close: null, daysToStart: 0 };
  const next = nextMatchday(matches, now);
  if (!next) return null;
  const toStart = (next.start.getTime() - t) / DAY;
  const base = { week: next.week, start: next.start, close: next.close, daysToStart: toStart };
  if (t >= next.close.getTime()) return { kind: "cerrado", ...base };
  if (next.paron && next.prevEnd) {
    const since = (t - next.prevEnd.getTime()) / DAY;
    const paronDays = Math.round((next.start.getTime() - next.prevEnd.getTime()) / DAY);
    const paronDay = Math.max(1, Math.ceil(since));
    const kind: PhaseKind = toStart <= 4 ? "paron-final" : since <= 4 ? "paron-inicio" : "paron-mitad";
    return { kind, ...base, paronDay, paronDays };
  }
  if (toStart <= 2) return { kind: "previa", ...base }; // el día del cierre (el mercado cierra 24 h antes)
  if (next.prevEnd && t - next.prevEnd.getTime() <= 1.5 * DAY) return { kind: "tras-jornada", ...base };
  return { kind: "semana", ...base };
}

const hm = (d: Date) =>
  d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", hour: "2-digit", minute: "2-digit" });
const dayName = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric" });

// Una línea para la cabecera del plan: dónde estamos y qué toca
export function phaseLine(p: MarketPhase | null): string | null {
  if (!p) return null;
  switch (p.kind) {
    case "jornada": return `⚽ Jornada ${p.week} en juego: el mercado se mueve con los puntos de cada partido.`;
    case "cerrado": return `🔒 Mercado cerrado: la jornada ${p.week} empieza el ${hm(p.start!)}.`;
    case "previa": return `⏰ Último día de mercado: cierra el ${hm(p.close!)}. Llega con saldo positivo y el once guardado.`;
    case "tras-jornada": return `📊 Recién acabada la jornada: los valores se están moviendo con los puntos.`;
    case "semana": return `📅 Entre semana: la jornada ${p.week} empieza el ${hm(p.start!)}.`;
    case "paron-inicio":
    case "paron-mitad":
    case "paron-final":
      return `🌍 Parón de selecciones (día ${p.paronDay} de ${p.paronDays}): la liga vuelve el ${dayName(p.start!)}${p.kind === "paron-final" ? " y el mercado cierra el " + hm(p.close!) : ""}.`;
  }
}

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
      text: `🌍 <b>Parón</b> hasta la jornada ${next.week} (${hm(next.start)}). Sin protección automática de cláusulas: blinda o sube la cláusula a quien no quieras perder. Es el mejor momento para especular: los que empiezan a subir suelen seguir subiendo todo el parón. No vendas a tus titulares porque estén en rojo.`,
    });
  }
  return out;
}
