import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ingestRuns } from "@/db/schema";

export interface Mover {
  id: string;
  nickname: string;
  team: string | null;
  position: number;
  status: string;
  value: number;
  pct7: number;
  bids: number;
  avg: number;
}

export async function lastRun() {
  const db = await getDb();
  const [run] = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(1);
  return run ?? null;
}

// Mayores subidas o bajadas de valor en 7 días (jugadores activos).
// Pujas: las del día anterior (el día en curso aún está incompleto).
export async function movers(dir: "up" | "down", limit = 10): Promise<Mover[]> {
  const db = await getDb();
  const order = dir === "up" ? sql`desc` : sql`asc`;
  const res = await db.execute(sql`
    with last as (select max(day) as d from player_values)
    select p.id, p.nickname, t.short_name as team, p.position_id as position, p.status,
           p.market_value as value, p.average_points as avg,
           round(100.0 * (p.market_value - v7.value) / v7.value, 1) as pct7,
           coalesce(vt.bids, 0) as bids
    from players p
    left join teams t on t.id = p.team_id
    join last on true
    join player_values v7 on v7.player_id = p.id and v7.day = last.d - 7
    left join player_values vt on vt.player_id = p.id and vt.day = last.d - 1
    where p.status <> 'out_of_league' and v7.value > 0
    order by pct7 ${order}
    limit ${limit}
  `);
  // PGlite devuelve { rows }, postgres-js devuelve el array directamente
  const rows = (Array.isArray(res) ? res : res.rows) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    nickname: String(r.nickname),
    team: r.team ? String(r.team) : null,
    position: Number(r.position),
    status: String(r.status),
    value: Number(r.value),
    pct7: Number(r.pct7),
    bids: Number(r.bids),
    avg: Number(r.avg),
  }));
}
