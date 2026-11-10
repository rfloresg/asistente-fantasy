// Puja justa: cuánto pujar para llevártelo sin pagar de más. Se aprende de tu liga: en cada fichaje del
// mercado (actividad tipo 1) se ve cuánto pagó el ganador sobre el valor de ese día. Con lo que suelen
// pagar de más los rivales que pueden permitírselo, se puja lo justo para superar a la mayoría.
// Función pura: el historial y el dinero los trae el Espía.

export interface PastBuy {
  buyer: string; // equipo
  manager: string;
  over: number; // lo que pagó de más: 0,04 = +4 %
  value: number; // valor del jugador ese día
  position: number | null;
  at: Date;
}

export interface FairBid {
  bid: number;
  over: number; // sobre el precio de salida
  beats: number; // parte de los fichajes parecidos de tu liga que habrías superado (0-1)
  n: number; // cuántos fichajes parecidos
  boldest: { manager: string; over: number } | null; // el rival (de los que pueden pagarlo) que más paga de más
  noRival: boolean;
}

export const FAIR = {
  days: 90, // historial que se mira
  minBuys: 6, // con menos fichajes parecidos, no se sabe: puja como siempre
  valueSpan: 2.5, // "parecido": que valga entre 2,5 veces menos y 2,5 veces más
  quantile: 0.75, // superar 3 de cada 4 fichajes parecidos...
  quantileWithBids: 0.9, // ... o 9 de cada 10 si ya tiene pujas
  margin: 0.01, // un 1 % más, para no empatar (en empate gana la primera puja)
  maxOver: 0.5, // fichajes con más del 50 % de sobreprecio: rarezas, fuera
};

const ACT_MARKET_BUY = 1;

export interface ActLite {
  activityTypeId: number;
  user1Id?: number | string | null;
  playerMasterId?: number | string | null;
  amount?: number | null;
  createdAt: string;
}

// Fichajes del mercado de la liga con su sobreprecio
export function pastBuys(
  acts: ActLite[],
  valueOn: (playerId: string, day: string) => number | undefined,
  positionOf: (playerId: string) => number | null,
  teamOfUser: (userId: string) => { teamId: string; manager: string } | undefined,
): PastBuy[] {
  const out: PastBuy[] = [];
  for (const a of acts) {
    if (a.activityTypeId !== ACT_MARKET_BUY || !a.amount || a.user1Id == null || a.playerMasterId == null) continue;
    const team = teamOfUser(String(a.user1Id));
    if (!team) continue;
    const pid = String(a.playerMasterId);
    const day = new Date(a.createdAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const value = valueOn(pid, day);
    if (!value) continue;
    const over = a.amount / value - 1;
    if (over < -0.02 || over > FAIR.maxOver) continue; // el valor de ese día no cuadra: mejor no contarlo
    out.push({ buyer: team.teamId, manager: team.manager, over: Math.max(0, over), value, position: positionOf(pid), at: new Date(a.createdAt) });
  }
  return out;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};

export function fairBid(i: {
  price: number; // precio de salida (el valor)
  hasBids: boolean;
  cap: number; // lo máximo que te compensa
  history: PastBuy[];
  rivals: { teamId: string; manager: string; money?: number }[];
  now: Date;
  round?: (x: number) => number;
}): FairBid | null {
  const round = i.round ?? ((x: number) => Math.ceil(Math.round(x) / 10_000 - 1e-9) * 10_000);
  const known = i.rivals.some((r) => r.money !== undefined);
  const able = i.rivals.filter((r) => r.money === undefined || r.money >= i.price);
  if (known && !able.length) return { bid: i.price, over: 0, beats: 1, n: 0, boldest: null, noRival: true };

  const rivalIds = new Set(i.rivals.map((r) => r.teamId));
  const since = i.now.getTime() - FAIR.days * 86400e3;
  const similar = i.history.filter((h) => rivalIds.has(h.buyer) && h.at.getTime() >= since
    && h.value >= i.price / FAIR.valueSpan && h.value <= i.price * FAIR.valueSpan);
  if (similar.length < FAIR.minBuys) return null;
  // Si hay datos de sobra, solo los de quien hoy puede pagarlo
  const ableIds = new Set(able.map((r) => r.teamId));
  const fromAble = similar.filter((h) => ableIds.has(h.buyer));
  const pool = fromAble.length >= FAIR.minBuys ? fromAble : similar;

  const overs = pool.map((h) => h.over);
  let over = quantile(overs, i.hasBids ? FAIR.quantileWithBids : FAIR.quantile) + FAIR.margin;
  let bid = round(i.price * (1 + over));
  // Nadie puede pujar más de lo que tiene: basta con superar al más rico de los que pueden
  const richest = known ? Math.max(...able.map((r) => r.money ?? Infinity)) : Infinity;
  if (richest < bid) bid = Math.max(i.price, round(richest + 10_000));
  bid = Math.min(bid, Math.max(i.price, i.cap));
  over = bid / i.price - 1;

  const byManager = new Map<string, number[]>();
  for (const h of similar.filter((x) => ableIds.has(x.buyer))) {
    if (!byManager.has(h.manager)) byManager.set(h.manager, []);
    byManager.get(h.manager)!.push(h.over);
  }
  const boldest = [...byManager.entries()]
    .map(([manager, xs]) => ({ manager, over: quantile(xs, 0.5) }))
    .sort((a, b) => b.over - a.over)[0] ?? null;

  return { bid, over, beats: overs.filter((x) => x < over).length / overs.length, n: pool.length, boldest, noRival: false };
}

const pctTxt = (x: number) => `${Math.round(x * 100)} %`;

// "Con +4 % habrías superado 8 de cada 10 fichajes parecidos de tu liga (el que más paga de más: Jonix, +9 %)."
export function fairBidText(f: FairBid): string {
  if (f.noRival) return " Ningún rival tiene dinero para superarte: puja el mínimo.";
  const tens = Math.round(f.beats * 10);
  const bold = f.boldest && f.boldest.over > 0.005 ? ` El que más paga de más de los que pueden: ${f.boldest.manager} (+${pctTxt(f.boldest.over)} de media).` : "";
  return ` Puja justa: con +${pctTxt(f.over)} habrías superado ${tens} de cada 10 fichajes parecidos de tu liga.${bold}`;
}
