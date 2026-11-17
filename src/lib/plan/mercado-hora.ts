// La hora de tu mercado: cada liga renueva su mercado a su hora (la de cuando se creó) y las pujas se
// resuelven entonces. Los jugadores que pone la liga (sin vendedor) caducan todos a esa hora.
// Funciones puras.

import type { MarketItem } from "@/lib/espia/league";

export const BID_REMINDER_MIN = 90; // avisar cuando falte hora y media o menos

// Próxima renovación del mercado de la liga
export function marketRefresh(market: Pick<MarketItem, "expirationDate" | "sellerTeam">[], now: Date): Date | null {
  const ts = market
    .filter((m) => !m.sellerTeam && m.expirationDate)
    .map((m) => Date.parse(m.expirationDate))
    .filter((t) => Number.isFinite(t) && t > now.getTime());
  return ts.length ? new Date(Math.min(...ts)) : null;
}

const madridDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
// "hoy a las 19:03", "mañana a las 13:14" o "el jueves a las 13:14"
export function hourText(d: Date, now: Date): string {
  const h = d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  if (madridDay(d) === madridDay(now)) return `hoy a las ${h}`;
  const tomorrow = madridDay(new Date(now.getTime() + 86400e3)) === madridDay(d);
  return tomorrow ? `mañana a las ${h}` : `el ${d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "long" })} a las ${h}`;
}

interface BidAction { tipo: string; playerId?: string; jugador?: string; titulo?: string; hecho?: boolean; key?: string }

// Las pujas del último plan que aún no has hecho y cuyo jugador sigue en el mercado
export function pendingBids(acciones: BidAction[], market: Pick<MarketItem, "playerMaster">[], done: Set<string>): BidAction[] {
  const onMarket = new Set(market.map((m) => String(m.playerMaster.id)));
  return acciones.filter((a) => a.tipo === "pujar" && a.playerId && onMarket.has(a.playerId) && !a.hecho && !(a.key && done.has(a.key)));
}

export function bidReminderText(refresh: Date, now: Date, pend: BidAction[], esc: (s: string) => string): string {
  const min = Math.max(1, Math.round((refresh.getTime() - now.getTime()) / 60000));
  const left = min >= 60 ? `${Math.floor(min / 60)} h${min % 60 >= 10 ? ` ${min % 60} min` : ""}` : `${min} min`;
  const list = pend.map((a) => `• ${esc(a.titulo ?? a.jugador ?? "")}`).join("\n");
  return `⏳ <b>Tu mercado se renueva ${hourText(refresh, now)}</b> (en ${left}) y entonces se resuelven las pujas. Te quedan por hacer:\n${list}\n\nSi ya las has hecho, márcalas como hechas en la app.`;
}

// Plan al ritmo del mercado: uno nada más renovarse (cuando salen los jugadores nuevos)
// y otro 12 h después. El mercado actual salió 24 h antes de su próxima renovación.
// De noche (antes de las 8 en Madrid) no se manda: espera a las 8 si aún está en su margen.
export const MARKET_PLAN = { afterMin: 10, firstUntilH: 8, secondH: 12, secondUntilH: 20, quietUntil: 8, fallbackH: 26 };

export interface MarketSlot { key: string; kind: "nuevo" | "medio"; publishedAt: Date }

const madridHour = (d: Date) => Number(d.toLocaleString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }));

export function marketPlanSlot(refresh: Date | null, now: Date): MarketSlot | null {
  if (!refresh || madridHour(now) < MARKET_PLAN.quietUntil) return null;
  const pub = refresh.getTime() - 24 * 3600e3;
  const since = now.getTime() - pub;
  const at = new Date(pub);
  const H = 3600e3;
  if (since >= MARKET_PLAN.afterMin * 60e3 && since < MARKET_PLAN.firstUntilH * H) return { key: `nuevo:${at.toISOString()}`, kind: "nuevo", publishedAt: at };
  if (since >= MARKET_PLAN.secondH * H && since < MARKET_PLAN.secondUntilH * H) return { key: `medio:${at.toISOString()}`, kind: "medio", publishedAt: at };
  return null;
}

export function marketPlanHeader(s: MarketSlot, league: string, esc: (s: string) => string): string {
  return s.kind === "nuevo"
    ? `🆕 <b>Mercado nuevo en ${esc(league)}</b>. Tu plan con los jugadores que acaban de salir:`
    : `🕐 <b>Media jornada de mercado en ${esc(league)}</b> (12 h desde que salió). Tu plan actualizado:`;
}
