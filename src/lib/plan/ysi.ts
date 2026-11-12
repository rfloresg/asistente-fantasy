// "¿Y si…?": qué pasa con tu once, tu dinero y el valor de tu plantilla si vendes a unos y fichas a otros.
// Función pura: todas las cifras salen de aquí (el LLM solo las explica).
import { bestLineup, type LineupPlayer } from "./lineup";

export interface WhatIfPlayer extends LineupPlayer {
  value: number; // valor hoy
  expected?: number | null; // valor esperado en 7 días
  price?: number | null; // lo que cuesta ficharlo (precio de venta en el mercado de tu liga); null = no está en venta
  owner?: string | null; // si es de un rival: su mánager (solo con cláusula)
}

export interface WhatIf {
  before: number; // puntos esperados de tu mejor once por jornada
  after: number;
  diff: number;
  formationBefore: string | null;
  formationAfter: string | null;
  entran: string[]; // nuevos titulares
  salen: string[]; // titulares que dejan de serlo
  moneyBefore: number;
  moneyAfter: number; // tras vender a su valor y fichar a su precio (o su valor si no hay precio)
  valueDiff7d: number; // cambio esperado en 7 días del valor de lo que vendes frente a lo que fichas
  avisos: string[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function whatIf(squad: WhatIfPlayer[], sell: string[], buy: WhatIfPlayer[], money: number, captain = false): WhatIf {
  const out = new Set(sell);
  const buyIds = new Set(buy.map((p) => p.id));
  const after = [...squad.filter((p) => !out.has(p.id) && !buyIds.has(p.id)), ...buy];
  const l0 = bestLineup(squad, { captain });
  const l1 = bestLineup(after, { captain });
  const s0 = new Set(l0?.starters.map((p) => p.id) ?? []);
  const s1 = new Set(l1?.starters.map((p) => p.id) ?? []);
  const sold = squad.filter((p) => out.has(p.id));
  const avisos: string[] = [];
  for (const id of sell) if (!squad.some((p) => p.id === id)) avisos.push(`${id} no es de tu plantilla: no se cuenta`);
  for (const p of buy) {
    if (squad.some((x) => x.id === p.id)) avisos.push(`${p.name} ya es tuyo`);
    else if (p.owner) avisos.push(`${p.name} es de ${p.owner}: solo con cláusula; cuento su valor como precio`);
    else if (p.price == null) avisos.push(`${p.name} no está en venta en tu liga; cuento su valor como precio`);
  }
  const newBuys = buy.filter((p) => !squad.some((x) => x.id === p.id));
  const income = sold.reduce((t, p) => t + p.value, 0);
  const cost = newBuys.reduce((t, p) => t + (p.price ?? p.value), 0);
  const delta = (ps: WhatIfPlayer[]) => ps.reduce((t, p) => t + ((p.expected ?? p.value) - p.value), 0);
  const moneyAfter = money + income - cost;
  if (moneyAfter < 0) avisos.push("te quedarías en negativo: si empieza la jornada así, no puntúas");
  const b = l0?.expected ?? 0, a = l1?.expected ?? 0;
  return {
    before: r1(b), after: r1(a), diff: r1(a - b),
    formationBefore: l0?.formation ?? null, formationAfter: l1?.formation ?? null,
    entran: (l1?.starters ?? []).filter((p) => !s0.has(p.id)).map((p) => p.name),
    salen: (l0?.starters ?? []).filter((p) => !s1.has(p.id)).map((p) => p.name),
    moneyBefore: money, moneyAfter,
    valueDiff7d: Math.round(delta(newBuys) - delta(sold)),
    avisos,
  };
}
