// De quién es un jugador en tu liga y qué te toca hacer con él. Función pura.
// Nunca "Fichar" a uno que ya es tuyo: con los tuyos es mantener, proteger o vender.
// Si es de un rival, solo se consigue clausulando; si está libre, la nota decide.
import type { LigaSnapshot } from "@/lib/plan/snapshot";

export type Owner = { kind: "mio" } | { kind: "rival"; manager: string } | { kind: "libre"; onSale: boolean };
type PlanAction = { tipo: string; playerId?: string };

export function ownerOf(liga: LigaSnapshot | null | undefined, playerId: string): Owner | null {
  if (!liga?.owners) return null; // planes antiguos sin este dato: no sabemos
  const team = liga.owners[playerId];
  if (team === liga.myTeamId) return { kind: "mio" };
  if (team) return { kind: "rival", manager: liga.standing.find((s) => s.teamId === team)?.manager ?? "otro mánager" };
  return { kind: "libre", onSale: !!liga.market?.some((m) => m.id === playerId) };
}

export interface Advice {
  label: string;
  tone: "mio" | "rival" | "libre" | "neutro";
  bid: boolean; // tiene sentido enseñar la puja máxima
}

const GENERIC: Record<string, string> = { fichar: "Fichar", mantener: "Mantener", vender: "Vender" };

export function advice(owner: Owner | null, notaAction: string, plan: PlanAction[], playerId: string): Advice {
  const inPlan = (tipo: string) => plan.some((a) => a.tipo === tipo && a.playerId === playerId);
  if (!owner) return { label: GENERIC[notaAction] ?? notaAction, tone: "neutro", bid: notaAction === "fichar" };
  if (owner.kind === "mio") {
    if (inPlan("proteger")) return { label: "Tuyo · Proteger", tone: "mio", bid: false };
    if (inPlan("vender") || notaAction === "vender") return { label: "Tuyo · Vender", tone: "mio", bid: false };
    return { label: "Tuyo · Mantener", tone: "mio", bid: false };
  }
  if (owner.kind === "rival") {
    return { label: inPlan("clausulazo") ? `De ${owner.manager} · Clausúlalo` : `De ${owner.manager}`, tone: "rival", bid: false };
  }
  if (notaAction === "fichar") return { label: owner.onSale ? "En venta · Fichar" : "Fichar", tone: "libre", bid: true };
  return { label: notaAction === "vender" ? "Evitar" : "Sin prisa", tone: "neutro", bid: false };
}
