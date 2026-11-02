// Plan del día: mira tu plantilla, el mercado y a los rivales y te dice qué hacer.
// Función pura: datos in, acciones out. Todas las cifras salen de los datos, nunca de un LLM.
// Reglas del juego y criterio: src/lib/meta/manual.ts.

import type { MarketItem, Team, TeamPlayer } from "@/lib/espia/league";
import { RAISE_RATIO } from "@/lib/espia/money";
import type { Lineup } from "./lineup";

export const PLAN = {
  maxPerType: 3, // acciones de cada tipo, como mucho
  sellNota: 40, // nota por debajo de la cual se propone vender (además de action "vender")
  buyNota: 70, // nota mínima para pujar o clausular "para jugar"
  protectMinValue: 3_000_000, // se vigilan tus jugadores que valen al menos esto
  cheapClause: 1.1, // cláusula hasta un 10 % sobre el valor = barata: a cualquiera le compensa
  raiseOver: 1.05, // subir la cláusula un 5 % por encima de lo que le compensa pagar a un rival (o de su dinero)
  raiseMaxShare: 0.25, // y solo si cuesta como mucho el 25 % de tu dinero; si no, blindar
  bidExtra: 0.05, // puja: valor + 5 %...
  bidExtraWithBids: 0.12, // ... o + 12 % si ya hay pujas
};

export interface Score {
  nota: number;
  action: "fichar" | "mantener" | "vender";
  value: number;
  maxBidPlay: number;
  maxBidSpec: number | null;
  formAvg: number | null;
  startProb: number | null;
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
}

export type Tipo = "saldo" | "proteger" | "alinear" | "clausulazo" | "pujar" | "vender" | "aviso";

export interface Accion {
  tipo: Tipo;
  prioridad: number; // 1 = lo primero
  jugador?: string;
  playerId?: string;
  texto: string; // HTML para Telegram
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
      texto: `💸 Estás en ${b(M(i.myMoney))}. Vende por al menos ${M(need)}${closeTxt} o no puntuarás. Los de menos nota: ${pick.map(b).join(", ")}.`,
    });
  }

  // 2. Proteger: tus jugadores con la cláusula abierta que a un rival le compensaría pagar
  //    (barata respecto a su valor, o por debajo de lo que vale según la nota) y que algún rival puede pagar.
  //    Subirla justo por encima de lo que compensa, o blindar si sale caro.
  const worth = (x: Score) => Math.max(x.maxBidPlay, x.maxBidSpec ?? 0, x.value * PLAN.cheapClause);
  let shields = 0;
  let nProtect = 0;
  const candidates = mine
    .filter(({ s }) => s && s.value >= PLAN.protectMinValue && s.action !== "vender" && s.nota >= PLAN.sellNota) // a los que vendes, no
    .sort((a, c) => c.s!.value - a.s!.value);
  for (const { p, s } of candidates) {
    const name = p.playerMaster.nickname;
    const clause = p.buyoutClause ?? 0;
    const lock = lockedUntil(p, i.now);
    if (lock) {
      if (lock - i.now.getTime() < 24 * 3600e3 && clause <= worth(s!)) {
        out.push({ tipo: "aviso", prioridad: 3, jugador: name, playerId: id(p), texto: `⏳ La cláusula de ${b(name)} (${M(clause)}) se libera en menos de 24 h y está barata para lo que vale (nota ${s!.nota}). Prepárate para subirla o blindarlo.` });
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
    if (i.myMoney > 0 && cost <= i.myMoney * PLAN.raiseMaxShare) {
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        texto: `🔒 Sube la cláusula de ${b(name)} de ${M(clause)} a ${M(target)}: te cuesta ${M(cost)}. Ahora a un rival le compensa clausularlo (vale ${M(s!.value)}, nota ${s!.nota}).${reach}`,
      });
    } else if (shields < 2) {
      shields++;
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        texto: `🛡️ Blinda a ${b(name)}${closeTxt}: su cláusula (${M(clause)}) está barata para lo que vale (${M(s!.value)}, nota ${s!.nota}) y subirla a ${M(target)} te costaría ${M(cost)}.${reach}${s!.nota < 50 ? " Si te da igual perderlo, déjalo: cobrarías la cláusula." : ""}`,
      });
    } else {
      out.push({
        tipo: "aviso",
        prioridad: 3,
        jugador: name,
        playerId: id(p),
        texto: `⚠️ ${b(name)} tiene la cláusula barata (${M(clause)}, nota ${s!.nota}) y ya no te quedan blindajes: asume el riesgo o sube la cláusula (${M(cost)}).`,
      });
    }
  }

  // Presupuesto: tu dinero + lo que sacarías vendiendo a los que se recomienda vender.
  // Clausulazos y pujas lo van gastando, por orden; lo que no cabe no se propone.
  const ventas = mine
    .filter(({ s }) => s && (s.action === "vender" || s.nota < PLAN.sellNota))
    .slice(0, PLAN.maxPerType);
  const fromSales = ventas.reduce((t, { s }) => t + (s?.value ?? 0), 0);
  let budget = Math.max(0, i.myMoney) + fromSales;
  let cash = Math.max(0, i.myMoney); // lo que tienes ya, sin vender
  const cashNote = (x: number) => (x > cash ? ` Para pagarlo tendrás que vender antes (tienes ${M(Math.max(0, cash))} libres).` : "");

  // 3. Clausulazos: jugadores de rivales con nota de fichar y cláusula que compensa. Se pagan al momento.
  const clausulazos = i.rivals
    .flatMap((r) => r.team.players.map((p) => ({ r, p, s: sc(id(p)) })))
    .filter(({ p, s }) => s && clauseOpen(p, i.now) && s.nota >= PLAN.buyNota && s.action !== "vender"
      && p.buyoutClause! <= Math.max(s.maxBidPlay, s.maxBidSpec ?? 0))
    .sort((a, c) => c.s!.nota - a.s!.nota);
  let nClaus = 0;
  for (const { r, p, s } of clausulazos) {
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
      texto: `💣 Clausula a ${b(name)} de ${b(r.manager)} por ${M(clause)} (${over >= 0 ? "+" : ""}${over} % sobre su valor). Nota ${s!.nota}; lo máximo que pagaría es ${M(Math.max(s!.maxBidPlay, s!.maxBidSpec ?? 0))}.`,
    });
  }

  // 4. Pujas en el mercado de la liga
  const myIds = new Set(i.myTeam.players.map(id));
  const pujas = i.market
    .filter((m) => m.status === "on_sale" && !myIds.has(String(m.playerMaster.id)))
    .map((m) => ({ m, s: sc(String(m.playerMaster.id)) }))
    .filter(({ m, s }) => s && ((s.action === "fichar" && m.salePrice <= s.maxBidPlay) || (s.maxBidSpec !== null && m.salePrice < s.maxBidSpec)))
    .sort((a, c) => c.s!.nota - a.s!.nota);
  let nPujas = 0;
  for (const { m, s } of pujas) {
    if (nPujas >= PLAN.maxPerType) break;
    const forPlay = s!.action === "fichar";
    const cap = forPlay ? s!.maxBidPlay : s!.maxBidSpec!;
    const extra = m.numberOfBids ? PLAN.bidExtraWithBids : PLAN.bidExtra;
    const noRival = known && richest < m.salePrice; // nadie más puede pagarlo
    const bid = noRival ? m.salePrice : Math.min(cap, round(m.salePrice * (1 + extra)));
    if (bid > budget) continue; // ni vendiendo llegas
    nPujas++;
    const note = cashNote(bid);
    budget -= bid;
    cash -= bid;
    const name = m.playerMaster.nickname;
    const why = forPlay ? `para jugar (nota ${s!.nota})` : `para especular (lo esperado en 7 días da hasta ${M(s!.maxBidSpec!)})`;
    const bids = m.numberOfBids ? ` Ya tiene ${m.numberOfBids} puja${m.numberOfBids > 1 ? "s" : ""}.` : "";
    out.push({
      tipo: "pujar",
      prioridad: 3,
      jugador: name,
      playerId: String(m.playerMaster.id),
      texto: `🛒 Puja ${M(bid)} por ${b(name)} ${why}. Sale por ${M(m.salePrice)}; tu tope: ${M(cap)}.${bids}${noRival ? " Ningún rival tiene dinero para superarte." : ""}${note}`,
    });
  }

  // 5. Vender: nota baja y bajando, o lesionado y bajando (lo decide la nota)
  for (const { p, s } of ventas) {
    const name = p.playerMaster.nickname;
    const hurt = p.playerMaster.playerStatus === "injured" ? " Está lesionado: véndelo antes de que baje más." : "";
    out.push({
      tipo: "vender",
      prioridad: 4,
      jugador: name,
      playerId: id(p),
      texto: `💰 Pon a la venta a ${b(name)}: nota ${s!.nota}, vale ${M(s!.value)}.${hurt}`,
    });
  }

  // 6. Alineación y capitán
  if (i.lineup) {
    const l = i.lineup;
    const POS = ["", "POR", "DEF", "MED", "DEL"];
    const row = (pos: number) => l.starters.filter((p) => p.positionId === pos).map((p) => esc(p.name)).join(", ");
    const doubts = l.starters.filter((p) => p.status === "doubtful" || (p.startProb !== null && p.startProb < 60));
    const lines = [
      `📋 Alinea un ${b(l.formation)} (unos ${l.expected.toLocaleString("es-ES")} pts esperados con el capitán):`,
      ...[1, 2, 3, 4].map((pos) => `${POS[pos]}: ${row(pos)}`),
    ];
    if (l.captain) lines.push(`©️ Capitán: ${b(l.captain.name)} (${l.captain.expected.toLocaleString("es-ES")} pts esperados${l.captain.startProb !== null ? `, ${l.captain.startProb} % de ser titular` : ""}).`);
    if (doubts.length) lines.push(`Dudas: ${doubts.map((p) => `${b(p.name)}${p.startProb !== null ? ` (${p.startProb} %)` : " (en duda)"}`).join(", ")}. Revisa el once antes de la jornada.`);
    if (l.out.length) lines.push(`No alinees: ${l.out.map((p) => b(p.name)).join(", ")}.`);
    out.push({ tipo: "alinear", prioridad: 3, texto: lines.join("\n") });
  }

  return out.sort((a, c) => a.prioridad - c.prioridad);
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

export function planMessage(leagueName: string, myMoney: number, acciones: Accion[]): string {
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
