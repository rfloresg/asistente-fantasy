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

export const hourText = (d: Date) => d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

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
  return `⏳ <b>Tu mercado se renueva a las ${hourText(refresh)}</b> (en ${left}) y entonces se resuelven las pujas. Te quedan por hacer:\n${list}\n\nSi ya las has hecho, márcalas como hechas en la app.`;
}
