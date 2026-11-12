// Aviso de última hora: un titular del once que te recomendamos se ha lesionado, queda en duda
// o ya no sale en el once probable, y su partido aún no ha empezado. Te dice a quién meter.
// Función pura: compara el once del último plan con los datos de ahora.
import { bestLineup, type LineupPlayer } from "./lineup";
import type { LineupSnapshot } from "./snapshot";

export const LAST_MINUTE = {
  dropTo: 40, // ya no es titular probable si baja de aquí...
  dropFrom: 60, // ... y antes estaba por encima de esto
  aheadH: 36, // solo para partidos de las próximas 36 h
};

export interface LastMinuteAlert {
  id: string;
  name: string;
  reason: string; // sin cifras inventadas: el % sale del once probable
  key: string; // estable: para avisar una vez por cambio
  sub: { id: string; name: string } | null; // a quién meter (null = no tienes recambio que juegue)
}

const BAD: Record<string, string> = { injured: "se ha lesionado", suspended: "está sancionado", out_of_league: "ha salido de la liga", doubtful: "está en duda" };

export function lastMinute(
  prev: LineupSnapshot, squad: LineupPlayer[], kickoff: (playerId: string) => Date | null, now: Date, captain = false,
): LastMinuteAlert[] {
  const cur = new Map(squad.map((p) => [p.id, p]));
  const l = bestLineup(squad, { captain });
  if (!l) return [];
  const prevIds = new Set(prev.starters.map((p) => p.id));
  const nowIds = new Set(l.starters.map((p) => p.id));
  const out: LastMinuteAlert[] = [];
  for (const p of prev.starters) {
    const c = cur.get(p.id);
    if (!c) continue; // ya no es tuyo
    const k = kickoff(p.id);
    if (!k || k <= now || k.getTime() - now.getTime() > LAST_MINUTE.aheadH * 3600e3) continue;
    let reason: string | null = null, tag = "";
    if (c.status !== p.status && BAD[c.status]) { reason = BAD[c.status]; tag = c.status; }
    else if (c.startProb !== null && c.startProb < LAST_MINUTE.dropTo && (p.startProb ?? 100) >= LAST_MINUTE.dropFrom) {
      reason = `ya no sale titular en el once probable (${c.startProb} %)`; tag = "suplente";
    }
    if (!reason) continue;
    // Recambio: quien entra en tu mejor once de ahora en su puesto (o en cualquiera, si cambia el dibujo)
    const subP = l.starters.find((q) => !prevIds.has(q.id) && q.positionId === p.positionId)
      ?? l.starters.find((q) => !prevIds.has(q.id));
    const stillIn = nowIds.has(p.id);
    out.push({ id: p.id, name: p.name, reason, key: `${p.id}:${tag}`, sub: subP && !stillIn ? { id: subP.id, name: subP.name } : null });
  }
  return out;
}

export function lastMinuteText(league: string, alerts: LastMinuteAlert[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = alerts.map((a) => `• <b>${esc(a.name)}</b> ${esc(a.reason)}. ${a.sub ? `Mete a <b>${esc(a.sub.name)}</b>.` : "No tienes un recambio mejor: déjalo o ficha a alguien."}`);
  return `🚨 <b>Última hora en tu once</b> (${esc(league)})\n${lines.join("\n")}`;
}
