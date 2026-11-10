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
  sellerTeam?: { id?: string | number; manager?: { managerName?: string } } | null;
  discr?: string; // "marketPlayerTeam" = lo vende un mánager
  numberOfOffers?: number; // ofertas recibidas (solo se ven en los tuyos)
  playerTeam?: { playerTeamId?: string | number } | null;
}

export interface Offer {
  id: string | number;
  money: number;
  status?: string; // "pending" = sin responder
  expirationDate?: string;
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

// La respuesta de ofertas: una lista, una lista dentro de "elements"/"offers"/"data", o una sola oferta
export function parseOffers(d: unknown): Offer[] {
  const o = d as { elements?: unknown; offers?: unknown; data?: unknown; money?: unknown } | null;
  const arr = Array.isArray(d) ? d : Array.isArray(o?.elements) ? o.elements : Array.isArray(o?.offers) ? o.offers : Array.isArray(o?.data) ? o.data : o && typeof o.money === "number" ? [o] : [];
  return (arr as Offer[]).filter((x) => x && typeof x.money === "number" && x.money > 0);
}

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
    // Ofertas recibidas por un jugador tuyo a la venta (de la liga y de otros mánagers)
    offers: async (playerTeamId: string) => parseOffers(await get(`${CMP}/league/${leagueId}/playerTeam/${playerTeamId}/offer`)),
    // Solo funciona con tu equipo: los rivales dan 403 (devuelve null)
    money: async (teamId: string): Promise<unknown | null> => {
      try {
        return await get<unknown>(`${CMP}/teams/${teamId}/money`);
      } catch {
        return null;
      }
    },
  };
}

export async function myLeagues(token: string) {
  const res = await fetch(`${BASE}${CMP}/leagues?x-lang=es`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API ${res.status} al listar ligas`);
  return list<{ id: string; name: string }>(await res.json());
}
