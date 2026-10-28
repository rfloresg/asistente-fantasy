// Empareja los nombres leídos en la captura con jugadores reales.
// En la app de LaLiga Fantasy los nombres suelen ser los mismos que da la API,
// pero pueden venir cortados o sin tilde. Si hay dudas, devolvemos opciones.

import { norm, similarity } from "@/lib/onces/match";
import type { ReadPlayer } from "./read";

export interface Candidate {
  id: string;
  nickname: string;
  positionId: number;
  teamShort: string | null;
  teamName: string | null;
}

export interface MatchItem {
  leido: ReadPlayer;
  id: string | null; // emparejado seguro
  opciones: { id: string; nickname: string; team: string | null }[]; // si hay dudas
}

const POS: Record<string, number> = { POR: 1, DEF: 2, MED: 3, DEL: 4 };
const FF_POS = ["", "Portero", "Defensa", "Mediocampista", "Delantero"];

function teamOk(read: string | null, c: Candidate): boolean {
  if (!read) return true;
  const r = norm(read);
  return [c.teamShort, c.teamName].some((t) => {
    if (!t) return false;
    const n = norm(t);
    return n === r || n.includes(r) || r.includes(n);
  });
}

export function matchRead(read: ReadPlayer[], all: Candidate[]): MatchItem[] {
  return read.map((leido) => {
    const pool = all.filter((c) => teamOk(leido.equipo, c));
    const asFf = { ffId: "", name: leido.nombre, slug: leido.nombre, position: FF_POS[POS[leido.posicion ?? ""] ?? 0] ?? "", starter: false, prob: null };
    const exact = pool.filter((c) => norm(c.nickname) === norm(leido.nombre));
    const scored = (exact.length ? exact : pool)
      .map((c) => ({ c, s: exact.length ? 100 : similarity(asFf, c) }))
      .filter((x): x is { c: Candidate; s: number } => x.s !== null)
      .map((x) => ({ ...x, s: x.s + (leido.posicion && POS[leido.posicion] === x.c.positionId ? 3 : 0) }))
      .sort((a, b) => b.s - a.s);

    const best = scored[0];
    const sure = best && (scored.length === 1 || scored[1].s < best.s);
    return {
      leido,
      id: sure ? best.c.id : null,
      // seguro: una sola opción (la elegida); con dudas: las 5 mejores
      opciones: scored.slice(0, sure ? 1 : 5).map(({ c }) => ({ id: c.id, nickname: c.nickname, team: c.teamShort })),
    };
  });
}
