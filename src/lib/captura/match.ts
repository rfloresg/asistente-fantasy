// Empareja los nombres leídos en la captura con jugadores reales.
// En la app de LaLiga Fantasy los nombres suelen ser los de la API, pero:
// - pueden venir cortados ("Guido Ro...")
// - las abreviaturas de equipo no coinciden con las de la API (FCB vs BAR, CVF vs VIL)
// Por eso el equipo solo suma, nunca descarta. Si hay dudas, devolvemos opciones.

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
  opciones: { id: string; nickname: string; team: string | null }[];
}

const POS: Record<string, number> = { POR: 1, DEF: 2, MED: 3, DEL: 4 };
const FF_POS = ["", "Portero", "Defensa", "Mediocampista", "Delantero"];

// Abreviaturas de la app que no coinciden con las de la API
const TEAM_ALIASES: Record<string, string> = { fcb: "bar", cvf: "vil", vcf: "val", rcde: "esp", atm: "atm", rma: "rma" };

export function sameTeam(read: string | null, c: Candidate): boolean {
  if (!read) return false;
  const r = norm(read);
  const want = TEAM_ALIASES[r] ?? r;
  return [c.teamShort, c.teamName].some((t) => {
    if (!t) return false;
    const n = norm(t);
    return n === want || (want.length > 3 && (n.includes(want) || want.includes(n)));
  });
}

const TRUNC = /(\.\.\.|…)\s*$/;

function score(leido: ReadPlayer, c: Candidate): number | null {
  const truncated = TRUNC.test(leido.nombre);
  const base = norm(leido.nombre.replace(TRUNC, ""));
  const nick = norm(c.nickname);
  let s: number | null;
  if (!base) s = null;
  else if (nick === base) s = 100;
  else if (truncated && nick.startsWith(base)) s = 90;
  else {
    const asFf = { ffId: "", name: base, slug: base, position: FF_POS[POS[leido.posicion ?? ""] ?? 0] ?? "", starter: false, prob: null };
    s = similarity(asFf, c);
  }
  if (s === null) return null;
  if (sameTeam(leido.equipo, c)) s += 20;
  if (leido.posicion && POS[leido.posicion] === c.positionId) s += 3;
  return s;
}

export function matchRead(read: ReadPlayer[], all: Candidate[]): MatchItem[] {
  return read.map((leido) => {
    const scored = all
      .map((c) => ({ c, s: score(leido, c) }))
      .filter((x): x is { c: Candidate; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    const sure = !!best && (scored.length === 1 || scored[1].s < best.s);
    return {
      leido,
      id: sure ? best.c.id : null,
      // seguro: una sola opción (la elegida); con dudas: las 5 mejores
      opciones: scored.slice(0, sure ? 1 : 5).map(({ c }) => ({ id: c.id, nickname: c.nickname, team: c.teamShort })),
    };
  });
}
