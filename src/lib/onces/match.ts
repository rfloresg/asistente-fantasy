// Empareja equipos y jugadores de futbolfantasy con los de la API de LaLiga.
// Los nombres no coinciden ("M. Dituro" vs "Dituro", "Ez Abde" vs "Abde"),
// y los slugs pierden la letra inicial con tilde ("ngel-fortuno" = Ángel Fortuño).
// Solo se empareja dentro del mismo equipo, y si hay empate no se empareja.

import type { FfPlayer } from "./futbolfantasy";
import { PLAYER_ALIASES } from "./aliases";

const STOP = new Set(["cf", "fc", "ud", "rc", "rcd", "c", "a", "d", "r", "club", "de", "sad"]);

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (s: string) => norm(s).split(" ").filter(Boolean);
const words = (s: string) => tokens(s).filter((w) => w.length > 1);

// ff "real-madrid" -> nuestro equipo cuyo slug o nombre contiene todas sus palabras.
// Si hay varios ("deportivo" está en "Deportivo Alavés"), gana el que coincide exacto.
export function matchTeam(ffSlug: string, teams: { id: string; slug: string | null; name: string }[]): string | null {
  const want = tokens(ffSlug).filter((t) => !STOP.has(t));
  const hits = teams.filter((t) => {
    const have = new Set([...tokens(t.slug ?? ""), ...tokens(t.name)]);
    return want.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0].id;
  const exact = hits.filter((t) => {
    const own = tokens(t.slug ?? t.name).filter((x) => !STOP.has(x));
    return own.length === want.length && own.every((x) => want.includes(x));
  });
  return exact.length === 1 ? exact[0].id : null;
}

const POS: Record<string, number> = { Portero: 1, Defensa: 2, Mediocampista: 3, Delantero: 4 };

export interface OurPlayer {
  id: string;
  nickname: string;
  positionId: number;
}

// Puntuación de parecido entre un jugador de ff y uno nuestro. null = no es él.
export function similarity(f: FfPlayer, o: OurPlayer): number | null {
  const ffAll = new Set([...words(f.name), ...words(f.slug)]);
  const ffName = words(f.name);
  const ourAll = tokens(o.nickname);
  const ourFull = words(o.nickname);
  const initials = ourAll.filter((w) => w.length === 1);
  if (!ourFull.length) return null;

  const shared = ourFull.filter((w) => ffAll.has(w));
  if (!shared.length) return null;
  const strong = ourFull.every((w) => ffAll.has(w)) || (ffName.length > 0 && ffName.every((w) => ourFull.includes(w)));
  const surname = ffAll.has(ourFull[ourFull.length - 1]);
  if (!strong && !surname) return null;

  const ffInitials = [...tokens(f.name), ...tokens(f.slug)].map((w) => w[0]);
  return (
    shared.length * 10 +
    (strong ? 5 : 0) +
    (POS[f.position] === o.positionId ? 3 : 0) +
    (initials.length && initials.every((i) => ffInitials.includes(i)) ? 2 : 0)
  );
}

// Devuelve ffId -> id nuestro.
export function matchPlayers(ff: FfPlayer[], ours: OurPlayer[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();

  for (const f of ff) {
    const alias = PLAYER_ALIASES[f.ffId];
    if (alias && ours.some((o) => o.id === alias)) {
      result.set(f.ffId, alias);
      used.add(alias);
    }
  }

  // Todas las parejas posibles, de más a menos parecido
  const pairs: { ffId: string; id: string; score: number }[] = [];
  for (const f of ff) {
    if (result.has(f.ffId)) continue;
    for (const o of ours) {
      if (used.has(o.id)) continue;
      const score = similarity(f, o);
      if (score !== null) pairs.push({ ffId: f.ffId, id: o.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  for (const p of pairs) {
    if (result.has(p.ffId) || used.has(p.id)) continue;
    // empate con otra opción libre para el mismo jugador de ff o el mismo nuestro = dudoso
    const tie = pairs.some(
      (q) =>
        q !== p &&
        q.score === p.score &&
        ((q.ffId === p.ffId && !used.has(q.id)) || (q.id === p.id && !result.has(q.ffId))),
    );
    if (tie) continue;
    result.set(p.ffId, p.id);
    used.add(p.id);
  }
  return result;
}
