// Convierte respuestas de la API en filas de la base de datos.
// Funciones puras: fáciles de testear con respuestas reales guardadas.

import type {
  ApiMarketValue,
  ApiMatch,
  ApiPlayer,
  ApiPlayerDetail,
  ApiTeam,
  Num,
} from "./types";

const num = (v: Num | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: Num | null | undefined): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

export function parseTeam(t: ApiTeam) {
  return {
    id: String(t.id),
    name: t.name,
    shortName: t.shortName ?? null,
    slug: t.slug ?? null,
    badgeUrl: t.badgeColor ?? null,
  };
}

export function parsePlayer(p: ApiPlayer, now: Date) {
  return {
    id: String(p.id),
    nickname: p.nickname,
    teamId: str(p.teamId),
    positionId: num(p.positionId) ?? 0,
    status: p.playerStatus,
    marketValue: num(p.marketValue) ?? 0,
    points: num(p.points) ?? 0,
    averagePoints: num(p.averagePoints) ?? 0,
    lastSeasonPoints: num(p.lastSeasonPoints),
    imageUrl: p.image ?? null,
    updatedAt: now,
  };
}

// La fecha llega como medianoche en hora de Madrid: nos quedamos con el día.
export function parseMarketValues(playerId: string, list: ApiMarketValue[]) {
  return list
    .map((m) => ({
      playerId,
      day: m.date.slice(0, 10),
      value: num(m.marketValue),
      bids: num(m.bids) ?? 0,
    }))
    .filter((r): r is { playerId: string; day: string; value: number; bids: number } =>
      r.value !== null && /^\d{4}-\d{2}-\d{2}$/.test(r.day),
    );
}

export function parsePlayerWeeks(detail: ApiPlayerDetail) {
  const playerId = String(detail.id);
  return (detail.playerStats ?? []).map((w) => ({
    playerId,
    week: num(w.weekNumber) ?? 0,
    points: num(w.totalPoints) ?? 0,
    minutes: w.stats?.mins_played?.[0] ?? 0,
    ideal: Boolean(w.isInIdealFormation),
    stats: w.stats ?? {},
  }));
}

export function parseMatch(m: ApiMatch, week: number) {
  return {
    id: String(m.id),
    week,
    date: new Date(m.matchDate),
    localId: String(m.localId),
    visitorId: String(m.visitorId),
    state: num(m.matchState) ?? 0,
    localScore: num(m.localScore),
    visitorScore: num(m.visitorScore),
  };
}

// Jugadores que siguen en la liga: solo de estos pedimos detalle.
export const isActive = (p: { status: string }) => p.status !== "out_of_league";
