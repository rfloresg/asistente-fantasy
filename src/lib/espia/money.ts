// Dinero estimado de cada mánager a partir de toda la actividad de la liga. Funciones puras.
// La API no deja ver el dinero de los rivales (403), solo el tuyo. Las subidas de cláusula no
// salen en la actividad: se detectan comparando las cláusulas de cada día (solo desde que se guardan).

import type { Activity } from "./league";

// Movimientos de dinero por actividad: [quién, +cobra / -paga]
export function flows(a: Activity): [string, number][] {
  const amount = a.amount ?? 0;
  if (!amount) return [];
  const u1 = a.user1Id == null ? null : String(a.user1Id);
  const u2 = a.user2Id == null ? null : String(a.user2Id);
  const out: [string, number][] = [];
  switch (a.activityTypeId) {
    case 1:
    case 31: // fichaje: paga user1; si es a otro mánager, cobra user2
    case 32: // cláusula: igual
      if (u1) out.push([u1, -amount]);
      if (u2) out.push([u2, amount]);
      break;
    case 33: // venta: cobra user1; si es a otro mánager, paga user2
      if (u1) out.push([u1, amount]);
      if (u2) out.push([u2, -amount]);
      break;
    case 4: // blindaje: paga user1
      if (u1) out.push([u1, -amount]);
      break;
    case 6: // ganancia de jornada: cobra user1
      if (u1) out.push([u1, amount]);
      break;
  }
  return out;
}

// Saldo neto por id de mánager (sin el saldo inicial)
export function netByManager(acts: Activity[]): Map<string, number> {
  const net = new Map<string, number>();
  const seen = new Set<string>();
  for (const a of acts) {
    if (seen.has(String(a.id))) continue;
    seen.add(String(a.id));
    for (const [id, x] of flows(a)) net.set(id, (net.get(id) ?? 0) + x);
  }
  return net;
}

// Reglas de LaLiga Fantasy: se empieza con 100 M y subir la cláusula cuesta la mitad de lo que sube (1:2)
export const START_MONEY = Number(process.env.ESPIA_SALDO_INICIAL ?? 100_000_000);
export const RAISE_RATIO = 2;

// Dinero estimado de un equipo = inicial + neto de la actividad - subidas de cláusula detectadas
export function estimateTeamMoney(net: Map<string, number>, managerIds: string[], raisesSpent = 0, start = START_MONEY): number {
  return start + managerIds.reduce((s, id) => s + (net.get(id) ?? 0), 0) - raisesSpent;
}

export interface ClauseSnap {
  playerId: string;
  teamId: string;
  clause: number;
}

// Compara las cláusulas de hoy con las guardadas: mismo jugador y mismo equipo y cláusula más alta = la han subido
export function clauseRaises(prev: ClauseSnap[], now: ClauseSnap[]): (ClauseSnap & { increase: number; cost: number })[] {
  const before = new Map(prev.map((c) => [c.playerId, c]));
  const out: (ClauseSnap & { increase: number; cost: number })[] = [];
  for (const c of now) {
    const b = before.get(c.playerId);
    if (!b || b.teamId !== c.teamId) continue;
    const increase = c.clause - b.clause;
    if (increase >= 100_000) out.push({ ...c, increase, cost: Math.round(increase / RAISE_RATIO) });
  }
  return out;
}

// La respuesta de /teams/{id}/money: número suelto o un objeto con el dinero
export function parseMoney(body: unknown): number | null {
  if (typeof body === "number") return body;
  if (body && typeof body === "object") {
    for (const k of ["teamMoney", "money", "amount", "balance"]) {
      const v = (body as Record<string, unknown>)[k];
      if (typeof v === "number") return v;
    }
  }
  return null;
}
