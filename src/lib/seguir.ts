// Lista de seguimiento: jugadores que marcas con ⭐ en la web. El Espía te avisa cuando salen al mercado
// de tu liga o cuando se libera la cláusula del rival que lo tiene. Función pura.
import type { MarketItem, Team } from "@/lib/espia/league";

export const WATCH_MAX = 30; // jugadores seguidos por usuario, como mucho

export interface WatchEvent { playerId: string; key: string; text: string; short: string }

const M = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// from: desde cuándo cuentan las cláusulas liberadas (la última pasada, o unas horas atrás)
export function watchEvents(watch: Set<string>, market: MarketItem[], teams: Team[], myTeamId: string, from: number, now: number): WatchEvent[] {
  const out: WatchEvent[] = [];
  const mine = new Set(teams.find((t) => String(t.id) === myTeamId)?.players.map((p) => String(p.playerMaster.id)) ?? []);
  for (const m of market) {
    const pid = String(m.playerMaster.id);
    if (!watch.has(pid) || mine.has(pid) || m.status !== "on_sale") continue;
    const seller = m.sellerTeam?.manager?.managerName;
    const name = m.playerMaster.nickname;
    out.push({
      playerId: pid, key: `mercado:${m.id}`,
      text: `⭐ <b>${esc(name)}</b> está en el mercado${seller ? ` (lo vende ${esc(seller)})` : ""} por ${M(m.salePrice)}.`,
      short: `${name} está en el mercado por ${M(m.salePrice)}`,
    });
  }
  for (const t of teams) {
    if (String(t.id) === myTeamId) continue;
    for (const p of t.players) {
      const pid = String(p.playerMaster.id);
      const at = p.buyoutClauseLockedEndTime ? Date.parse(p.buyoutClauseLockedEndTime) : NaN;
      if (!watch.has(pid) || !(at > from && at <= now) || p.isShielded || !p.buyoutClause) continue;
      const mgr = t.manager?.managerName ?? "un rival";
      out.push({
        playerId: pid, key: `clausula:${p.buyoutClauseLockedEndTime}`,
        text: `⭐ La cláusula de <b>${esc(p.playerMaster.nickname)}</b> (de ${esc(mgr)}) ya está libre: ${M(p.buyoutClause)}.`,
        short: `Cláusula libre de ${p.playerMaster.nickname}: ${M(p.buyoutClause)}`,
      });
    }
  }
  return out;
}
