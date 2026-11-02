// Plan del día: mira tu plantilla, el mercado y a los rivales y te dice qué hacer.
// Función pura: datos in, acciones out. Todas las cifras salen de los datos, nunca de un LLM.
// Reglas del juego y criterio: src/lib/meta/manual.ts.

import type { MarketItem, Team, TeamPlayer } from "@/lib/espia/league";
import { RAISE_RATIO } from "@/lib/espia/money";

export const PLAN = {
  maxPerType: 3, // acciones de cada tipo, como mucho
  sellNota: 40, // nota por debajo de la cual se propone vender (además de action "vender")
  buyNota: 70, // nota mínima para pujar o clausular "para jugar"
  protectTop: 4, // cuántos de tus jugadores más valiosos se vigilan
  protectMinNota: 60, // y solo si tienen al menos esta nota
  raiseOver: 1.05, // subir la cláusula un 5 % por encima del dinero del rival más rico
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
}

export type Tipo = "saldo" | "proteger" | "clausulazo" | "pujar" | "vender" | "aviso";

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

  // 2. Proteger a tus mejores jugadores con la cláusula abierta
  const valuable = mine
    .filter(({ s }) => (s?.nota ?? 0) >= PLAN.protectMinNota)
    .sort((a, c) => (c.s?.value ?? 0) - (a.s?.value ?? 0))
    .slice(0, PLAN.protectTop);
  let shields = 0;
  for (const { p, s } of valuable) {
    const name = p.playerMaster.nickname;
    const lock = lockedUntil(p, i.now);
    if (lock && lock - i.now.getTime() < 24 * 3600e3) {
      out.push({ tipo: "aviso", prioridad: 3, jugador: name, playerId: id(p), texto: `⏳ La cláusula de ${b(name)} (${M(p.buyoutClause ?? 0)}) se libera en menos de 24 h. Prepárate para protegerlo.` });
      continue;
    }
    if (!clauseOpen(p, i.now) || !known || richest < (p.buyoutClause ?? 0)) continue;
    const target = round(richest * PLAN.raiseOver);
    const cost = round((target - p.buyoutClause!) / RAISE_RATIO);
    if (i.myMoney > 0 && cost <= i.myMoney * PLAN.raiseMaxShare) {
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        texto: `🔒 Sube la cláusula de ${b(name)} de ${M(p.buyoutClause!)} a ${M(target)}: te cuesta ${M(cost)}. Algún rival tiene hasta ${M(richest)} y podría clausulártelo (nota ${s?.nota}).`,
      });
    } else if (shields < 2) {
      shields++;
      out.push({
        tipo: "proteger",
        prioridad: 2,
        jugador: name,
        playerId: id(p),
        texto: `🛡️ Blinda a ${b(name)}${closeTxt}: su cláusula (${M(p.buyoutClause!)}) está al alcance de un rival con hasta ${M(richest)}, y subirla te costaría ${M(cost)}.`,
      });
    }
  }

  // 3. Clausulazos: jugadores de rivales con nota de fichar y cláusula que compensa y puedes pagar
  const clausulazos = i.rivals
    .flatMap((r) => r.team.players.map((p) => ({ r, p, s: sc(id(p)) })))
    .filter(({ p, s }) => s && clauseOpen(p, i.now) && s.nota >= PLAN.buyNota && s.action !== "vender"
      && p.buyoutClause! <= i.myMoney && p.buyoutClause! <= Math.max(s.maxBidPlay, s.maxBidSpec ?? 0))
    .sort((a, c) => c.s!.nota - a.s!.nota)
    .slice(0, PLAN.maxPerType);
  for (const { r, p, s } of clausulazos) {
    const name = p.playerMaster.nickname;
    const over = Math.round(((p.buyoutClause! - s!.value) / s!.value) * 100);
    out.push({
      tipo: "clausulazo",
      prioridad: 2,
      jugador: name,
      playerId: id(p),
      texto: `💣 Clausula a ${b(name)} de ${b(r.manager)} por ${M(p.buyoutClause!)} (${over >= 0 ? "+" : ""}${over} % sobre su valor). Nota ${s!.nota}; lo máximo que pagaría es ${M(Math.max(s!.maxBidPlay, s!.maxBidSpec ?? 0))}.`,
    });
  }

  // 4. Pujas en el mercado de la liga
  const myIds = new Set(i.myTeam.players.map(id));
  const pujas = i.market
    .filter((m) => m.status === "on_sale" && !myIds.has(String(m.playerMaster.id)))
    .map((m) => ({ m, s: sc(String(m.playerMaster.id)) }))
    .filter(({ m, s }) => s && ((s.action === "fichar" && m.salePrice <= s.maxBidPlay) || (s.maxBidSpec !== null && m.salePrice < s.maxBidSpec)))
    .sort((a, c) => c.s!.nota - a.s!.nota)
    .slice(0, PLAN.maxPerType);
  for (const { m, s } of pujas) {
    const name = m.playerMaster.nickname;
    const forPlay = s!.action === "fichar";
    const cap = forPlay ? s!.maxBidPlay : s!.maxBidSpec!;
    const extra = m.numberOfBids ? PLAN.bidExtraWithBids : PLAN.bidExtra;
    const noRival = known && richest < m.salePrice; // nadie más puede pagarlo
    const bid = noRival ? m.salePrice : Math.min(cap, round(m.salePrice * (1 + extra)));
    const why = forPlay ? `para jugar (nota ${s!.nota})` : `para especular (lo esperado en 7 días da hasta ${M(s!.maxBidSpec!)})`;
    const cash = bid > i.myMoney ? ` Ojo: tienes ${M(i.myMoney)}, tendrás que vender antes.` : "";
    const bids = m.numberOfBids ? ` Ya tiene ${m.numberOfBids} puja${m.numberOfBids > 1 ? "s" : ""}.` : "";
    out.push({
      tipo: "pujar",
      prioridad: 3,
      jugador: name,
      playerId: String(m.playerMaster.id),
      texto: `🛒 Puja ${M(bid)} por ${b(name)} ${why}. Sale por ${M(m.salePrice)}; tu tope: ${M(cap)}.${bids}${noRival ? " Ningún rival tiene dinero para superarte." : ""}${cash}`,
    });
  }

  // 5. Vender: nota baja y bajando, o lesionado y bajando (lo decide la nota)
  const ventas = mine
    .filter(({ s }) => s && (s.action === "vender" || s.nota < PLAN.sellNota))
    .slice(0, PLAN.maxPerType);
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

  return out.sort((a, c) => a.prioridad - c.prioridad);
}

const TITLES: Record<Tipo, string> = {
  saldo: "Saldo",
  proteger: "Protege a los tuyos",
  aviso: "Atento",
  clausulazo: "Clausulazos",
  pujar: "Pujas en el mercado",
  vender: "Vender",
};

export function planMessage(leagueName: string, myMoney: number, acciones: Accion[]): string {
  const lines = [`🧠 <b>Tu plan en ${esc(leagueName)}</b> · tienes ${M(myMoney)}`];
  if (!acciones.length) return [...lines, "", "Nada urgente: tu plantilla está bien y no hay gangas claras."].join("\n");
  const order: Tipo[] = ["saldo", "proteger", "aviso", "clausulazo", "pujar", "vender"];
  for (const t of order) {
    const xs = acciones.filter((a) => a.tipo === t);
    if (!xs.length) continue;
    lines.push("", `<b>${TITLES[t]}</b>`, ...xs.map((a) => a.texto));
  }
  return lines.join("\n");
}
