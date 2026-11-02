// Mensajes del Espía para Telegram (HTML). Funciones puras: datos in, texto out.
// Tipos de actividad de la API: 1 compra · 31 fichaje · 33 venta · 32 cláusula ·
// 4 blindaje · 6 ganancia por jornada · 7 alineación incorrecta · 9 nuevo miembro.

import type { Activity, MarketItem, Standing, Team } from "./league";

export const MIN_NOTA_MERCADO = 60; // en el resumen solo salen jugadores con nota de 60 o más

export interface Ctx {
  managers: Map<string, string>; // managerId -> nombre
  players: Map<string, { nickname: string; value: number }>; // id -> jugador (valor de hoy)
  valueOn?: (playerId: string, day: string) => number | undefined; // valor en una fecha
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const money = (x: number) => `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
const signedPct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x)} %`;

const who = (ctx: Ctx, id: Activity["user1Id"]) =>
  id == null ? null : (ctx.managers.get(String(id)) ?? null);
const player = (ctx: Ctx, id: Activity["playerMasterId"]) =>
  id == null ? null : (ctx.players.get(String(id))?.nickname ?? null);

// "(+16 % sobre su valor)" si sabemos el valor de ese día
function overValue(ctx: Ctx, a: Activity): string {
  if (!a.amount || a.playerMasterId == null) return "";
  const id = String(a.playerMasterId);
  const v = ctx.valueOn?.(id, a.createdAt.slice(0, 10)) ?? ctx.players.get(id)?.value;
  if (!v) return "";
  const p = ((a.amount - v) / v) * 100;
  if (Math.abs(p) < 1) return " (a su valor)";
  return ` (${signedPct(p)} ${p > 0 ? "sobre" : "bajo"} su valor)`;
}

// Un mensaje por actividad. null = no interesa publicarla.
export function activityMessage(a: Activity, ctx: Ctx): string | null {
  const u1 = who(ctx, a.user1Id);
  const u2 = who(ctx, a.user2Id);
  const pl = player(ctx, a.playerMasterId);
  const b = (s: string | null) => (s ? `<b>${esc(s)}</b>` : "Alguien");
  const amount = a.amount ? money(a.amount) : null;

  switch (a.activityTypeId) {
    case 1:
    case 31:
      if (!pl) return null;
      return `🛒 ${b(u1)} ficha a <b>${esc(pl)}</b>${amount ? ` por ${amount}` : ""}${overValue(ctx, a)}${u2 ? ` · se lo compra a ${b(u2)}` : ""}`;
    case 33:
      if (!pl) return null;
      return `💰 ${b(u1)} vende a <b>${esc(pl)}</b>${amount ? ` por ${amount}` : ""}${overValue(ctx, a)}${u2 ? ` a ${b(u2)}` : ""}`;
    case 32:
      if (!pl) return null;
      return `💣 <b>Clausulazo</b>: ${b(u1)} se lleva a <b>${esc(pl)}</b>${u2 ? ` de ${b(u2)}` : ""}${amount ? ` por ${amount}` : ""}`;
    case 4:
      if (!pl) return null;
      return `🛡️ ${b(u1)} blinda a <b>${esc(pl)}</b>${amount ? ` (${amount})` : ""}`;
    case 7:
      return `🤦 ${b(u1)} tenía una alineación incorrecta`;
    case 9:
      return `👋 ${b(u1)} se une a la liga`;
    default:
      return null; // 6 = ganancias por jornada: van en el resumen
  }
}

const MEDAL = ["🥇", "🥈", "🥉"];

export interface SummaryInput {
  leagueName: string;
  day: string;
  standing: Standing[];
  teams: Team[];
  last24h: Activity[];
  market: MarketItem[];
  notas: Map<string, { nota: number; action: string }>; // nota del día por jugador
  ctx: Ctx;
}

// Resumen diario: clasificación, gasto en 24 h, lesionados, mercado.
export function dailySummary(i: SummaryInput): string {
  const lines: string[] = [`📊 <b>${esc(i.leagueName)}</b> · resumen del ${i.day}`, ""];

  lines.push("<b>Clasificación</b>");
  for (const s of [...i.standing].sort((a, b) => a.position - b.position)) {
    const name = s.team.manager?.managerName ?? "?";
    const move = s.previousPosition && s.previousPosition !== s.position ? (s.previousPosition > s.position ? " ⬆️" : " ⬇️") : "";
    const value = s.team.teamValue ? ` · plantilla ${money(s.team.teamValue)}` : "";
    lines.push(`${MEDAL[s.position - 1] ?? `${s.position}.`} ${esc(name)} · ${s.points} pts${value}${move}`);
  }

  const spent = new Map<string, number>();
  const earned = new Map<string, number>();
  for (const a of i.last24h) {
    const name = who(i.ctx, a.user1Id);
    if (!name || !a.amount) continue;
    if ([1, 31, 32].includes(a.activityTypeId)) spent.set(name, (spent.get(name) ?? 0) + a.amount);
    if (a.activityTypeId === 33) earned.set(name, (earned.get(name) ?? 0) + a.amount);
  }
  if (spent.size || earned.size) {
    lines.push("", "<b>Movimientos en 24 h</b>");
    const names = new Set([...spent.keys(), ...earned.keys()]);
    for (const n of names) {
      const parts = [spent.get(n) ? `gasta ${money(spent.get(n)!)}` : "", earned.get(n) ? `ingresa ${money(earned.get(n)!)}` : ""].filter(Boolean);
      lines.push(`• ${esc(n)}: ${parts.join(", ")}`);
    }
  }

  const hurt: string[] = [];
  for (const t of i.teams) {
    const bad = t.players.filter((p) => ["injured", "suspended", "doubtful"].includes(p.playerMaster.playerStatus));
    if (bad.length) {
      const label = (s: string) => (s === "injured" ? "lesión" : s === "suspended" ? "sanción" : "duda");
      hurt.push(`• ${esc(t.manager?.managerName ?? "?")}: ${bad.map((p) => `${esc(p.playerMaster.nickname)} (${label(p.playerMaster.playerStatus)})`).join(", ")}`);
    }
  }
  if (hurt.length) lines.push("", "<b>Bajas en las plantillas</b>", ...hurt);

  const onSale = i.market
    .filter((m) => m.status === "on_sale")
    .map((m) => ({ m, n: i.notas.get(String(m.playerMaster.id)) }))
    .filter(({ n }) => (n?.nota ?? 0) >= MIN_NOTA_MERCADO)
    .sort((a, b) => (b.n?.nota ?? 0) - (a.n?.nota ?? 0))
    .slice(0, 5);
  if (onSale.length) {
    lines.push("", "<b>Lo mejor del mercado hoy</b>");
    for (const { m, n } of onSale) {
      const bids = m.numberOfBids ? ` · ${m.numberOfBids} puja${m.numberOfBids > 1 ? "s" : ""}` : "";
      lines.push(`• ${esc(m.playerMaster.nickname)}${n ? ` · nota ${n.nota}` : ""} · ${money(m.salePrice)}${bids}`);
    }
  }
  return lines.join("\n");
}
