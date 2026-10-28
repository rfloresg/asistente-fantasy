// Lectura de una liga privada con la sesión del usuario. Solo GET: nunca toca nada.

const BASE = process.env.LALIGA_API_BASE ?? "https://fantasy-api.llt-services.com/api";
const CMP = "/v1/competition/1";

export interface Standing {
  position: number;
  previousPosition?: number;
  points: number;
  team: {
    id: string;
    managerId?: number | string;
    teamValue?: number;
    teamPoints?: number;
    manager?: { id: string; managerName: string };
  };
}

export interface Activity {
  id: string;
  activityTypeId: number;
  user1Id?: number | string | null;
  user2Id?: number | string | null;
  playerMasterId?: number | string | null;
  amount?: number | null;
  createdAt: string;
}

export interface MarketItem {
  id: string;
  salePrice: number;
  expirationDate: string;
  status: string;
  numberOfBids?: number;
  playerMaster: { id: string; nickname: string; marketValue: number; positionId: number; playerStatus: string };
  sellerTeam?: { manager?: { managerName?: string } } | null;
}

export interface TeamPlayer {
  buyoutClause?: number;
  buyoutClauseLockedEndTime?: string;
  isShielded?: boolean;
  playerMaster: { id: string; nickname: string; playerStatus: string; marketValue: number };
}

export interface Team {
  id: string;
  players: TeamPlayer[];
  teamValue?: number;
  manager?: { id: string; managerName: string };
}

const list = <T>(d: unknown): T[] =>
  Array.isArray(d) ? d : ((d as { elements?: T[] })?.elements ?? (d as { leagues?: T[] })?.leagues ?? []);

export function leagueClient(token: string, leagueId: string) {
  const get = async <T>(p: string): Promise<T> => {
    const res = await fetch(`${BASE}${p}${p.includes("?") ? "&" : "?"}x-lang=es`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`API ${res.status} en ${p}`);
    return (await res.json()) as T;
  };
  return {
    standing: async () => list<Standing>(await get(`${CMP}/leagues/${leagueId}/standing`)),
    activity: async (page = 0) => list<Activity>(await get(`${CMP}/leagues/${leagueId}/activity/${page}`)),
    market: async () => list<MarketItem>(await get(`${CMP}/league/${leagueId}/market`)),
    team: (teamId: string) => get<Team>(`${CMP}/leagues/${leagueId}/teams/${teamId}`),
  };
}

export async function myLeagues(token: string) {
  const res = await fetch(`${BASE}${CMP}/leagues?x-lang=es`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API ${res.status} al listar ligas`);
  return list<{ id: string; name: string }>(await res.json());
}
