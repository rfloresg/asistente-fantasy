// Formas de la API no oficial de LaLiga Fantasy (temporada 26/27).
// Solo campos que usamos. La API mezcla string y number en ids y cifras.

export type Num = number | string;

export interface ApiTeam {
  id: Num;
  name: string;
  shortName?: string;
  slug?: string;
  badgeColor?: string;
}

export interface ApiPlayer {
  id: Num;
  nickname: string;
  teamId?: Num | null;
  positionId: Num;
  playerStatus: string;
  marketValue: Num;
  points: Num;
  averagePoints: Num;
  lastSeasonPoints?: Num | null;
  image?: string | null;
}

export interface ApiWeekStats {
  weekNumber: Num;
  totalPoints: Num;
  isInIdealFormation?: boolean;
  stats: Record<string, [number, number]>;
}

export interface ApiPlayerDetail {
  id: Num;
  playerStats: ApiWeekStats[];
}

export interface ApiMarketValue {
  marketValue: Num;
  date: string; // "2026-10-28T00:00:00+01:00"
  bids: Num;
}

export interface ApiMatch {
  id: Num;
  matchDate: string;
  localId: Num;
  visitorId: Num;
  matchState: Num;
  localScore: Num | null;
  visitorScore: Num | null;
}

export interface ApiCurrentWeek {
  weekNumber: number;
  isLive: boolean;
}
