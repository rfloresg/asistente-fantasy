// Plan del día: mira tu plantilla, el mercado y a los rivales y te dice qué hacer.
// Función pura: datos in, acciones out. Todas las cifras salen de los datos, nunca de un LLM.
// Reglas del juego y criterio: src/lib/meta/manual.ts.

import type { MarketItem, Team, TeamPlayer } from "@/lib/espia/league";
import { RAISE_RATIO } from "@/lib/espia/money";
import { impact, pts } from "./impact";
import { isEmpty, type Lineup, type LineupPlayer } from "./lineup";

export const PLAN = {
  maxPerType: 3, // acciones de cada tipo, como mucho
  sellNota: 40, // nota por debajo de la cual se propone vender (además de action "vender")
  buyNota: 70, // nota mínima para pujar o clausular "para jugar"
  protectMinValue: 3_000_000, // se vigilan tus jugadores que valen al menos esto
  cheapClause: 1.1, // cláusula hasta un 10 % sobre el valor = barata: a cualquiera le compensa
  raiseOver: 1.05, // subir la cláusula un 5 % por encima de lo que le compensa pagar a un rival (o de su dinero)
  raiseMaxShare: 0.25, // y solo si cuesta como mucho el 25 % de tu dinero; si no, blindar
  needClauseOver: 1.3, // para cubrir un hueco se acepta una cláusula de hasta un 30 % sobre el valor
  needNota: 55, // si te falta un titular en un puesto, vale con esta nota (y 60 % de ser titular)
  specMinGain: 100_000, // especular solo si se espera ganar al menos esto (y un 3 %)
  bidExtra: 0.05, // puja: valor + 5 %...
  bidExtraWithBids: 0.12, // ... o + 12 % si ya hay pujas
  // Con tu once calculado, se decide por lo que cambia en puntos esperados por jornada (capitán incluido)
  minGain: 0.8, // fichar para jugar: que tu once gane al menos esto
  clauseMinGain: 1.2, // clausular para jugar: algo más, porque se paga al momento y suele ser más caro
  protectMinLoss: 0.5, // proteger: que tu once pierda al menos esto si te lo quitan
  sellMaxLoss: 0.5, // vender: solo si tu once pierde menos que esto
};

export interface Score {
  nota: number;
  action: "fichar" | "mantener" | "vender";
  value: number;
  maxBidPlay: number;
  maxBidSpec: number | null;
  formAvg: number | null;
  startProb: number | null;
  xp?: number | null; // puntos esperados por partido en los próximos (modelo xP)
}

export interface Rival {
  teamId: string;
  manager: string;
  money?: number; // dinero estimado (máximo)
  team: Team;
}

export interface PlanInput {
  now: Date;
  myTeam: Team;
  myMoney: number;
  rivals: Rival[];
  market: MarketItem[];
  scores: Map<string, Score>;
  close?: Date | null; // cierre del mercado antes de la próxima jornada
  lineup?: Lineup | null; // mejor once para la próxima jornada
  positions?: Map<string, number>; // posición de cada jugador (para cubrir huecos con cláusulas de rivales)
  captain?: boolean; // liga Premium: hay capitán (puntúa doble)
}

export type Tipo = "saldo" | "proteger" | "alinear" | "clausulazo" | "pujar" | "vender" | "aviso";

export interface Accion {
  tipo: Tipo;
  prioridad: number; // 1 = lo primero
  jugador?: string;
  playerId?: string;
  texto: string; // HTML para Telegram
  titulo?: string; // para la web: la acción en pocas palabras
  detalle?: string; // para la web: el porqué, sin HTML
  key?: string; // estable entre planes, para el botón "Hecho"
  hecho?: boolean; // marcado como hecho y no se puede comprobar (o ya comprobado)
  pendiente?: string; // marcado como hecho, pero LaLiga sigue igual
}

const M = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const b = (s: string) => `<b>${esc(s)}</b>`;
const round = (x: number) => Math.ceil(Math.round(x) / 10_000 - 1e-9) * 10_000;

const lockedUntil = (p: TeamPlayer, now: Date) => {
  const t = p.buyoutClauseLockedEndTime ? Date.parse(p.buyoutClauseLockedEndTime) : NaN;
  return t > now.getTime() ? t : null;
};
const clauseOpen = (p: TeamPlayer, now: Date) => !!p.buyoutClause && !lockedUntil(p, now) && !p.isShielded;

export function dailyPlan(i: PlanInput): Accion[] {
  const out: Accion[] = [];
  const id = (p: { playerMaster: { id: string } }) => String(p.playerMaster.id);
  const sc = (pid: string) => i.scores.get(pid);
  const richest = Math.max(0, ...i.rivals.map((r) => r.money ?? 0));
  const known = i.rivals.some((r) => r.money !== undefined);
  const closeTxt = i.close && i.close > i.now
    ? ` antes del cierre (${i.close.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", hour: "2-digit", minute: "2-digit" })})`
    : "";

  // Lo que cambia tu once (puntos esperados por jornada) con o sin cada jugador. Sin once calculado, null: se usa la nota.
  const asPlayer = (pid: string, name: string, pos: number | undefined, status: string): LineupPlayer | null => {
    const s = sc(pid);
    return pos ? { id: pid, name, positionId: pos, status, formAvg: s?.formAvg ?? null, startProb: s?.startProb ?? null, xp: s?.xp ?? null } : null;
  };
  const squad = (i.lineup?.all ?? []).map((p) => ({ id: p.id, name: p.name, positionId: p.positionId, status: p.status, formAvg: p.formAvg, startProb: p.startProb, xp: sc(p.id)?.xp ?? p.xp ?? null }));
  const imp = squad.length ? impact(squad, i.captain ?? false) : null;
  const gainOf = (pid: string, name: string, pos: number | undefined, status: string) => {
    const lp = imp ? asPlayer(pid, name, pos, status) : null;
    return lp ? imp!.gain(lp) : null;
  };
  const lossOf = (pid: string) => (imp ? imp.loss(pid) : null);
  const lossTxt = (pid: string) => { const l = lossOf(pid); return l !== null && l > 0 ? ` Si te lo quitan, tu once pierde ${pts(l)} por jornada.` : ""; };
  const gainTxt = (g: number | null, pid: string) => {
    const x = sc(pid)?.xp;
    return g !== null ? `mejora tu once en +${pts(g)} por jornada${x != null ? ` (esperamos ${pts(x)} por partido)` : ""}` : "";
  };

  // 1. Saldo: en negativo al empezar la jornada no se puntúa
  const mine = i.myTeam.players
    .map((p) => ({ p, s: sc(id(p)) }))
    .sort((a, c) => (a.s?.nota ?? 0) - (c.s?.nota ?? 0));
  if (i.myMoney < 0) {
    const need = -i.myMoney;
    const pick: string[] = [];
    let got = 0;
    for (const { p, s } of mine) {
      if (got >= need) break;
      pick.push(p.playerMaster.nickname);
      got += s?.value ?? p.playerMaster.marketValue;
    }
    out.push({
      tipo: "saldo",
      prioridad: 1,
      titulo: `Sal de los números rojos`, detalle: `Estás en ${M(i.myMoney)}. Vende por al menos ${M(need)}${closeTxt} o no puntuarás. Los de menos nota: ${pick.join(", ")}.`, texto: `💸 Estás en ${b(M(i.myMoney))}. Vende por al menos ${M(need)}${closeTxt} o no puntuarás. Los de menos nota: ${pick.map(b).join(", ")}.`,
    });
  }

  // 2. Proteger: tus jugadores con la cláusula abierta que a un rival le compensaría pagar
  //    (barata respecto a su valor, o por debajo de lo que vale según la nota) y que algún rival puede pagar.
  //    Subirla justo por encima de lo que compensa, o blindar si sale caro.
  const worth = (x: Score) => Math.max(x.maxBidPlay, x.maxBidSpec ?? 0, x.value * PLAN.cheapClause);
  let shields = 0;
  let nProtect = 0;
  let reserved = 0; // lo que cuestan las subidas de cláusula propuestas: se resta antes de fichar
  const candidates = mine
    .filter(({ s }) => s && s.value >= PLAN.protectMinValue && s.action !== "vender" && s.nota >= PLAN.sellNota) // a los que vendes, no
    // con tu once calculado: solo los que de verdad te dejan sin puntos, y primero los que más
    .filter(({ p }) => { const l = lossOf(id(p)); return l === null || l >= PLAN.protectMinLoss; })
    .sort((a, c) => (lossOf(id(c.p)) ?? 0) - (lossOf(id(a.p)) ?? 0) || c.s!.value - a.s!.value);
  for (const { p, s } of candidates) {
    const name = p.playerMaster.nickname;
    const clause = p.buyoutClause ?? 0;
    const lock = lockedUntil(p, i.now);
    if (lock) {
      if (lock - i.now.getTime() < 24 * 3600e3 && clause <= worth(s!)) {
        out.push({ tipo: "aviso", prioridad: 3, jugador: name, playerId: id(p), titulo: `Vigila a ${name}`, detalle: `Su cláusula (${M(clause)}) se libera en menos de 24 h y está barata para lo que vale (nota ${s!.nota}).${lossTxt(id(p))} Prepárate para subirla o blindarlo.`, texto: `⏳ La cláusula de ${b(name)} (${M(clause)}) se libera en menos de 24 h y está barata para lo que vale (nota ${s!.nota}). Prepárate para subirla o blindarlo.` });
      }
      continue;
    }
    if (!clauseOpen(p, i.now) || clause > worth(s!)) continue; // cerrada, blindado o ya cara
    if (known && richest < clause) continue; // ningún rival llega
    if (nProtect >= PLAN.maxPerType) break;
    nProtect++;
    const target = round(Math.min(worth(s!), known ? richest : Infinity) * PLAN.raiseOver);
    const cost = round((target - clause) / RAISE_RATIO);
    const reach = known ? ` Algún rival tiene hasta ${M(richest)}.` : "";
    if (i.myMoney - reserved > 0 && cost <= (i.myMoney - reserved) * PLAN.raiseMaxShare) {
      reserved += cost;
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        titulo: `Sube la cláusula de ${name}`, detalle: `De ${M(clause)} a ${M(target)}: te cuesta ${M(cost)}. Ahora a un rival le compensa clausularlo (vale ${M(s!.value)}, nota ${s!.nota}).${lossTxt(id(p))}${reach}`, texto: `🔒 Sube la cláusula de ${b(name)} de ${M(clause)} a ${M(target)}: te cuesta ${M(cost)}. Ahora a un rival le compensa clausularlo (vale ${M(s!.value)}, nota ${s!.nota}).${reach}`,
      });
    } else if (shields < 2) {
      shields++;
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        titulo: `Blinda a ${name}`, detalle: `Hazlo${closeTxt || " hoy"}. Su cláusula (${M(clause)}) está barata para lo que vale (${M(s!.value)}, nota ${s!.nota}) y subirla a ${M(target)} te costaría ${M(cost)}.${lossTxt(id(p))}${reach}${s!.nota < 50 ? " Si te da igual perderlo, déjalo: cobrarías la cláusula." : ""}`, texto: `🛡️ Blinda a ${b(name)}${closeTxt}: su cláusula (${M(clause)}) está barata para lo que vale (${M(s!.value)}, nota ${s!.nota}) y subirla a ${M(target)} te costaría ${M(cost)}.${reach}${s!.nota < 50 ? " Si te da igual perderlo, déjalo: cobrarías la cláusula." : ""}`,
      });
    } else {
      out.push({
        tipo: "aviso",
        prioridad: 3,
        jugador: name,
        playerId: id(p),
        titulo: `${name}, sin protección`, detalle: `Tiene la cláusula barata (${M(clause)}, nota ${s!.nota}) y ya no te quedan blindajes: asume el riesgo o sube la cláusula (${M(cost)}).`, texto: `⚠️ ${b(name)} tiene la cláusula barata (${M(clause)}, nota ${s!.nota}) y ya no te quedan blindajes: asume el riesgo o sube la cláusula (${M(cost)}).`,
      });
    }
  }

  // Presupuesto: tu dinero + lo que sacarías vendiendo a los que se recomienda vender.
  // Clausulazos y pujas lo van gastando, por orden; lo que no cabe no se propone.
  // No vendas si te quedas sin jugadores para alinear en su puesto (mínimo de las formaciones: 1-3-3-1)
  // Se cuentan los que pueden jugar: titulares del once propuesto y suplentes que no estén en "no alinear"
  const outIds = new Set(i.lineup?.out.map((p) => p.id) ?? []);
  const posOf = new Map((i.lineup?.all ?? []).filter((p) => !outIds.has(p.id)).map((p) => [p.id, p.positionId]));
  const lineupIds = new Set(posOf.keys());
  const MIN_POS: Record<number, number> = { 1: 1, 2: 3, 3: 3, 4: 1 };
  const left = new Map<number, number>();
  for (const pos of posOf.values()) left.set(pos, (left.get(pos) ?? 0) + 1);
  const ventas = mine
    .filter(({ s }) => s && (s.action === "vender" || s.nota < PLAN.sellNota))
    .filter(({ p }) => { const l = lossOf(id(p)); return l === null || l < PLAN.sellMaxLoss; }) // si suma a tu once, no
    .filter(({ p }) => {
      const pos = posOf.get(id(p));
      if (!pos || !lineupIds.has(id(p)) || (left.get(pos) ?? 0) - 1 >= (MIN_POS[pos] ?? 0)) {
        if (pos) left.set(pos, (left.get(pos) ?? 0) - 1);
        return true;
      }
      return false; // es de los pocos que tienes en su puesto: primero ficha recambio
    })
    .slice(0, PLAN.maxPerType);
  const fromSales = ventas.reduce((t, { s }) => t + (s?.value ?? 0), 0);
  let budget = Math.max(0, i.myMoney - reserved) + fromSales;
  let cash = Math.max(0, i.myMoney - reserved); // lo que tienes ya, sin vender y tras subir cláusulas
  const cashNote = (x: number) => (x > cash ? ` Para pagarlo tendrás que vender antes (tienes ${M(Math.max(0, cash))} libres).` : "");

  // 3. Clausulazos: jugadores de rivales con nota de fichar y cláusula que compensa. Se pagan al momento.
  const clausulazos = i.rivals
    .flatMap((r) => r.team.players.map((p) => ({ r, p, s: sc(id(p)), g: gainOf(id(p), p.playerMaster.nickname, i.positions?.get(id(p)), p.playerMaster.playerStatus) })))
    .filter(({ p, s, g }) => s && clauseOpen(p, i.now) && s.action !== "vender"
      && (g !== null ? g >= PLAN.clauseMinGain : s.nota >= PLAN.buyNota)
      && p.buyoutClause! <= Math.max(s.maxBidPlay, s.maxBidSpec ?? 0))
    // con tu once: los que más puntos dan por millón; si no, por nota
    .sort((a, c) => (a.g !== null && c.g !== null ? c.g / c.p.buyoutClause! - a.g / a.p.buyoutClause! : c.s!.nota - a.s!.nota));
  let nClaus = 0;
  for (const { r, p, s, g } of clausulazos) {
    if (nClaus >= PLAN.maxPerType) break;
    const clause = p.buyoutClause!;
    if (clause > cash) continue; // la cláusula se paga en el momento: hace falta tenerlo
    nClaus++;
    budget -= clause;
    cash -= clause;
    const name = p.playerMaster.nickname;
    const over = Math.round(((clause - s!.value) / s!.value) * 100);
    out.push({
      tipo: "clausulazo",
      prioridad: 2,
      jugador: name,
      playerId: id(p),
      titulo: `Clausula a ${name}`, detalle: `Es de ${r.manager} y cuesta ${M(clause)} (${over >= 0 ? "+" : ""}${over} % sobre su valor).${g !== null ? ` ${gainTxt(g, id(p))[0].toUpperCase()}${gainTxt(g, id(p)).slice(1)}.` : ""} Nota ${s!.nota}; lo máximo que pagaría es ${M(Math.max(s!.maxBidPlay, s!.maxBidSpec ?? 0))}.`, texto: `💣 Clausula a ${b(name)} de ${b(r.manager)} por ${M(clause)} (${over >= 0 ? "+" : ""}${over} % sobre su valor).${g !== null ? ` ${gainTxt(g, id(p))[0].toUpperCase()}${gainTxt(g, id(p)).slice(1)}.` : ""} Nota ${s!.nota}; lo máximo que pagaría es ${M(Math.max(s!.maxBidPlay, s!.maxBidSpec ?? 0))}.`,
    });
  }

  // 4. Pujas en el mercado de la liga
  const needPos = new Set((i.lineup?.holes ?? []).map((p) => p.positionId));
  const myIds = new Set(i.myTeam.players.map(id));
  const pujas = i.market
    .filter((m) => m.status === "on_sale" && !myIds.has(String(m.playerMaster.id)))
    .map((m) => {
      const pid = String(m.playerMaster.id), s = sc(pid);
      const g = gainOf(pid, m.playerMaster.nickname, m.playerMaster.positionId, m.playerMaster.playerStatus ?? "ok");
      // Para jugar: con tu once, que lo mejore; sin él, que la nota diga fichar
      const play = !!s && m.salePrice <= s.maxBidPlay && (g !== null ? g >= PLAN.minGain : s.action === "fichar");
      const need = !!s && needPos.has(m.playerMaster.positionId) && s.nota >= PLAN.needNota && (s.startProb ?? 100) >= 60 && m.salePrice <= s.maxBidPlay;
      return { m, s, g, play: play || need };
    })
    .filter(({ m, s, play }) => s && (play || (s.maxBidSpec !== null && s.maxBidSpec - m.salePrice >= Math.max(PLAN.specMinGain, m.salePrice * 0.03))))
    // primero los de los puestos donde te faltan titulares, luego los que más mejoran tu once (o por nota)
    .sort((a, c) => Number(needPos.has(c.m.playerMaster.positionId)) - Number(needPos.has(a.m.playerMaster.positionId))
      || (a.g !== null && c.g !== null ? c.g - a.g : c.s!.nota - a.s!.nota));
  // Primero las pujas que cubren un hueco, luego las cláusulas para huecos y al final el resto
  let nPujas = 0;
  const done = new Set<string>();
  const doPujas = (onlyNeed: boolean) => {
    for (const { m, s, g, play } of pujas) {
      if (nPujas >= PLAN.maxPerType) break;
      if (done.has(m.id) || (onlyNeed && !needPos.has(m.playerMaster.positionId))) continue;
      const forPlay = play;
      const cap = forPlay ? s!.maxBidPlay : s!.maxBidSpec!;
      const extra = m.numberOfBids ? PLAN.bidExtraWithBids : PLAN.bidExtra;
      const noRival = known && richest < m.salePrice; // nadie más puede pagarlo
      const bid = noRival ? m.salePrice : Math.min(cap, round(m.salePrice * (1 + extra)));
      if (bid > budget) continue; // ni vendiendo llegas
      nPujas++;
      done.add(m.id);
      const note = cashNote(bid);
      budget -= bid;
      cash -= bid;
      const name = m.playerMaster.nickname;
      const need = needPos.has(m.playerMaster.positionId) ? ` Te falta un titular en su puesto.` : "";
      const why = forPlay ? `para jugar: ${g !== null ? gainTxt(g, String(m.playerMaster.id)) : `nota ${s!.nota}`}` : `para especular (lo esperado en 7 días da hasta ${M(s!.maxBidSpec!)})`;
      const bids = m.numberOfBids ? ` Ya tiene ${m.numberOfBids} puja${m.numberOfBids > 1 ? "s" : ""}.` : "";
      out.push({
        tipo: "pujar",
        prioridad: 3,
        jugador: name,
        playerId: String(m.playerMaster.id),
        titulo: `Puja ${M(bid)} por ${name}`, detalle: `${why[0].toUpperCase()}${why.slice(1)}.${need} Sale por ${M(m.salePrice)}; tu tope: ${M(cap)}.${bids}${noRival ? " Ningún rival tiene dinero para superarte." : ""}${note}`, texto: `🛒 Puja ${M(bid)} por ${b(name)} ${why}.${need} Sale por ${M(m.salePrice)}; tu tope: ${M(cap)}.${bids}${noRival ? " Ningún rival tiene dinero para superarte." : ""}${note}`,
      });
    }
  };
  doPujas(true);

  // 4b. Huecos sin cubrir: si en el mercado no hay nadie de ese puesto, busca cláusulas de rivales
  const POSNAME: Record<number, string> = { 1: "portero", 2: "defensa", 3: "centrocampista", 4: "delantero" };
  const covered = new Set(out.filter((a) => a.tipo === "pujar" || a.tipo === "clausulazo").map((a) => i.positions?.get(a.playerId ?? "") ?? i.market.find((m) => String(m.playerMaster.id) === a.playerId)?.playerMaster.positionId));
  for (const pos of needPos) {
    if (covered.has(pos)) continue;
    const opt = i.rivals
      .flatMap((r) => r.team.players.map((p) => ({ r, p, s: sc(id(p)) })))
      .filter(({ p, s }) => s && i.positions?.get(id(p)) === pos && clauseOpen(p, i.now)
        && s.nota >= PLAN.needNota && (s.startProb ?? 0) >= 60
        && p.buyoutClause! <= budget && p.buyoutClause! <= Math.max(s.maxBidPlay, s.value * PLAN.needClauseOver))
      // con tu once: el que más puntos da por millón; si no, el más barato
      .map((x) => ({ ...x, g: gainOf(id(x.p), x.p.playerMaster.nickname, pos, x.p.playerMaster.playerStatus) }))
      .sort((a, c) => (a.g !== null && c.g !== null ? c.g / c.p.buyoutClause! - a.g / a.p.buyoutClause! : a.p.buyoutClause! - c.p.buyoutClause!))[0];
    if (opt) {
      const { r, p, s } = opt;
      const clause = p.buyoutClause!;
      const sell = clause > cash ? ` Antes vende para tener ${M(clause)} libres: la cláusula se paga al momento.` : "";
      budget -= clause;
      cash -= clause;
      out.push({
        tipo: "clausulazo",
        prioridad: 2,
        jugador: p.playerMaster.nickname,
        playerId: id(p),
        titulo: `Clausula a ${p.playerMaster.nickname}`, detalle: `Te falta un ${POSNAME[pos]} titular y no hay en el mercado. Es de ${r.manager}: ${M(clause)} (vale ${M(s!.value)}, nota ${s!.nota}, ${s!.startProb} % de ser titular).${sell}`, texto: `💣 Te falta un ${POSNAME[pos]} titular y no hay en el mercado: clausula a ${b(p.playerMaster.nickname)} de ${b(r.manager)} por ${M(clause)} (vale ${M(s!.value)}, nota ${s!.nota}, ${s!.startProb} % de ser titular).${sell}`,
      });
    } else {
      out.push({
        tipo: "aviso",
        prioridad: 3,
        titulo: `Busca ${POSNAME[pos]} mañana`, detalle: `Te falta un ${POSNAME[pos]} titular y hoy no hay ninguno a tu alcance ni en el mercado ni por cláusula. Cada día salen 12 jugadores nuevos.`, texto: `🔎 Te falta un ${POSNAME[pos]} titular y hoy no hay ninguno a tu alcance ni en el mercado ni por cláusula. Cada día salen 12 jugadores nuevos: revisa el mercado mañana.`,
      });
    }
  }

  doPujas(false);

  // 5. Vender: nota baja y bajando, o lesionado y bajando (lo decide la nota), y que no aporte a tu once
  const sellWhy = (pid: string) => { const l = lossOf(pid); return l === null ? "" : l <= 0 ? " No suma a tu once." : ` Apenas suma a tu once (${pts(l)} por jornada).`; };
  for (const { p, s } of ventas) {
    const name = p.playerMaster.nickname;
    const hurt = p.playerMaster.playerStatus === "injured" ? " Está lesionado: véndelo antes de que baje más." : "";
    out.push({
      tipo: "vender",
      prioridad: 4,
      jugador: name,
      playerId: id(p),
      titulo: `Vende a ${name}`, detalle: `Nota ${s!.nota}, vale ${M(s!.value)}.${sellWhy(id(p))}${hurt}`, texto: `💰 Pon a la venta a ${b(name)}: nota ${s!.nota}, vale ${M(s!.value)}.${sellWhy(id(p))}${hurt}`,
    });
  }

  // 6. Alineación y capitán
  if (i.lineup) {
    const l = i.lineup;
    const POS = ["", "POR", "DEF", "MED", "DEL"];
    const row = (pos: number) => l.starters.filter((p) => p.positionId === pos).map((p) => esc(p.name)).join(", ");
    const holeIds = new Set(l.holes.map((p) => p.id));
    const doubts = l.starters.filter((p) => !holeIds.has(p.id) && (p.status === "doubtful" || (p.startProb !== null && p.startProb < 60)));
    const lines = [
      `📋 Alinea un ${b(l.formation)} (unos ${l.expected.toLocaleString("es-ES")} pts esperados${l.captain ? " con el capitán" : ""}):`,
      ...[1, 2, 3, 4].map((pos) => `${POS[pos]}: ${row(pos)}`),
    ];
    if (l.captain) lines.push(`©️ Capitán: ${b(l.captain.name)} (${l.captain.expected.toLocaleString("es-ES")} pts esperados${l.captain.startProb !== null ? `, ${l.captain.startProb} % de ser titular` : ""}).`);
    if (doubts.length) lines.push(`Dudas: ${doubts.map((p) => `${b(p.name)}${p.startProb !== null ? ` (${p.startProb} %)` : " (en duda)"}`).join(", ")}. Revisa el once antes de la jornada.`);
    const missing = l.holes.filter((p) => isEmpty(p.id));
    const benchwarm = l.holes.filter((p) => !isEmpty(p.id));
    if (benchwarm.length) {
      lines.push(`⚠️ Te faltan titulares: ${benchwarm.map((p) => `${b(p.name)} (${POS[p.positionId]}${p.startProb !== null ? `, ${p.startProb} %` : ""})`).join(", ")} ${benchwarm.length > 1 ? "entran por obligación y no van" : "entra por obligación y no va"} a jugar. Ficha ${needText(benchwarm)} que ${benchwarm.length > 1 ? "jueguen" : "juegue"}.`);
    }
    if (missing.length) lines.push(`⚠️ No te llega para un once: ficha ${needText(missing)}.`);
    if (l.out.length) lines.push(`No alinees: ${l.out.map((p) => b(p.name)).join(", ")}.`);
    out.push({ tipo: "alinear", prioridad: 3, texto: lines.join("\n") });
  }

  return out.sort((a, c) => a.prioridad - c.prioridad);
}

// Prefijo de las claves de "Hecho" en la base de datos: cada usuario marca lo suyo (null = modo antiguo)
export const doneKeyPrefix = (userId: number | null) => (userId === null ? "" : `u${userId}:`);

export const actionKey = (a: Pick<Accion, "tipo" | "playerId" | "titulo">) => `${a.tipo}:${a.playerId ?? a.titulo ?? ""}`;

// Lo que no se puede comprobar en LaLiga (tus pujas no se ven; los avisos son solo avisos)
const UNVERIFIABLE = new Set<Tipo>(["pujar", "aviso"]);

// Cruza el plan nuevo con lo que marcaste como hecho:
// - si ya no sale, estaba hecho de verdad (desaparece solo)
// - si sale y no se puede comprobar, se queda como hecho
// - si sale y se podía comprobar, vuelve con un aviso
export function applyDone(acciones: Accion[], done: Set<string>, onSaleByMe: Set<string> = new Set()): Accion[] {
  return acciones.map((a) => {
    if (a.tipo === "alinear") return a;
    const key = actionKey(a);
    if (a.tipo === "vender" && a.playerId && onSaleByMe.has(a.playerId)) return { ...a, key, hecho: true, detalle: "Ya está a la venta." };
    if (!done.has(key)) return { ...a, key };
    if (UNVERIFIABLE.has(a.tipo)) return { ...a, key, hecho: true };
    return { ...a, key, pendiente: "Lo marcaste como hecho, pero en LaLiga sigue igual." };
  });
}

const NEED: Record<number, [string, string]> = { 1: ["un portero", "porteros"], 2: ["un defensa", "defensas"], 3: ["un centrocampista", "centrocampistas"], 4: ["un delantero", "delanteros"] };
function needText(holes: { positionId: number }[]): string {
  const count = new Map<number, number>();
  for (const h of holes) count.set(h.positionId, (count.get(h.positionId) ?? 0) + 1);
  return [...count].map(([pos, n]) => (n === 1 ? NEED[pos][0] : `${n} ${NEED[pos][1]}`)).join(" y ");
}

const TITLES: Record<Tipo, string> = {
  saldo: "Saldo",
  proteger: "Protege a los tuyos",
  alinear: "Alineación",
  aviso: "Atento",
  clausulazo: "Clausulazos",
  pujar: "Pujas en el mercado",
  vender: "Vender",
};

export function planMessage(leagueName: string, myMoney: number, all: Accion[]): string {
  const acciones = all.filter((a) => !a.hecho);
  const lines = [`🧠 <b>Tu plan en ${esc(leagueName)}</b> · tienes ${M(myMoney)}`];
  if (!acciones.length) return [...lines, "", "Nada urgente: tu plantilla está bien y no hay gangas claras."].join("\n");
  const order: Tipo[] = ["saldo", "proteger", "aviso", "clausulazo", "pujar", "vender", "alinear"];
  for (const t of order) {
    const xs = acciones.filter((a) => a.tipo === t);
    if (!xs.length) continue;
    lines.push("", `<b>${TITLES[t]}</b>`, ...xs.map((a) => a.texto));
  }
  return lines.join("\n");
}
