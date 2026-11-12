// Tu plantilla con los datos de hoy (estado, once probable, xP, valor), a partir del último plan guardado.
// La usan el «¿Y si…?» del chat y el aviso de última hora.
import { and, eq, inArray, max } from "drizzle-orm";
import type { Db } from "@/db";
import { players, playerScores } from "@/db/schema";
import { ownerOf } from "@/lib/propiedad";
import type { LigaSnapshot } from "./snapshot";
import type { WhatIfPlayer } from "./ysi";

export const myIds = (liga: LigaSnapshot) => Object.entries(liga.owners ?? {}).filter(([, t]) => t === liga.myTeamId).map(([id]) => id);

export async function playersNow(db: Db, liga: LigaSnapshot, ids: string[]) {
  const [{ d }] = await db.select({ d: max(playerScores.day) }).from(playerScores);
  const ps = ids.length ? await db.select().from(players).where(inArray(players.id, ids)) : [];
  const sc = d && ids.length ? await db.select().from(playerScores).where(and(eq(playerScores.day, d), inArray(playerScores.playerId, ids))) : [];
  const byS = new Map(sc.map((s) => [s.playerId, s]));
  const out = new Map<string, WhatIfPlayer & { teamId: string | null }>();
  for (const p of ps) {
    const s = byS.get(p.id);
    const owner = ownerOf(liga, p.id);
    out.set(p.id, {
      id: p.id, name: p.nickname, positionId: p.positionId, status: p.status, teamId: p.teamId,
      formAvg: s?.formAvg ?? null, startProb: s?.startProb ?? null, xp: s?.xpNext?.[0]?.pts ?? null, startSources: s?.startSources ?? [],
      value: s?.value ?? p.marketValue, expected: s?.expected ?? null,
      price: liga.market?.find((m) => m.id === p.id)?.price ?? null,
      owner: owner?.kind === "rival" ? owner.manager : null,
    });
  }
  return { day: d, players: out };
}
