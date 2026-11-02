// Dinero estimado de cada mánager a partir de toda la actividad de la liga. Funciones puras.
// La API no deja ver el dinero de los rivales (403), solo el tuyo. Con el tuyo se calcula
// el saldo inicial (igual para todos) y con la actividad, lo que ha ganado y gastado cada uno.

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

// Dinero estimado = saldo inicial + neto. El inicial sale de tu dinero real.
export function estimateMoney(
  acts: Activity[],
  me: { ids: string[]; money: number },
): { start: number; money: Map<string, number> } {
  const net = netByManager(acts);
  const myNet = me.ids.reduce((s, id) => s + (net.get(id) ?? 0), 0);
  const start = me.money - myNet;
  const money = new Map<string, number>();
  for (const [id, x] of net) money.set(id, start + x);
  return { start, money };
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
