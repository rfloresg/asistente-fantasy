// Cliente de la API no oficial de LaLiga Fantasy. Solo lectura, sin login.
// Educado: pocas peticiones a la vez y reintentos con espera.

import type {
  ApiCurrentWeek,
  ApiMarketValue,
  ApiMatch,
  ApiPlayer,
  ApiPlayerDetail,
  ApiTeam,
} from "./types";

const BASE = process.env.LALIGA_API_BASE ?? "https://fantasy-api.llt-services.com/api";
const CMP = "/v1/competition/1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(public status: number, public path: string) {
    super(`API ${status} en ${path}`);
  }
}

async function get<T>(path: string, tries = 3): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}x-lang=es`;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return (await res.json()) as T;
      // 4xx no se arregla reintentando (salvo 429)
      if (res.status < 500 && res.status !== 429) throw new ApiError(res.status, path);
      if (i >= tries) throw new ApiError(res.status, path);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
      if (i >= tries) throw e;
    }
    await sleep(1000 * 2 ** (i - 1));
  }
}

// Algunas rutas devuelven array plano y otras { elements: [...] }.
const list = <T>(d: unknown): T[] =>
  Array.isArray(d) ? d : ((d as { elements?: T[] })?.elements ?? []);

export const laliga = {
  teams: async () => list<ApiTeam>(await get("/v3/teams-master")),
  players: async () => list<ApiPlayer>(await get(`${CMP}/players`)),
  currentWeek: () => get<ApiCurrentWeek>(`${CMP}/week/current`),
  calendar: async (week: number) => list<ApiMatch>(await get(`${CMP}/calendar?weekNumber=${week}`)),
  player: (id: string) => get<ApiPlayerDetail>(`${CMP}/player/${id}`),
  marketValues: async (id: string) => list<ApiMarketValue>(await get(`${CMP}/player/${id}/market-value`)),
};

// Ejecuta tareas con un máximo de `limit` en paralelo.
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
