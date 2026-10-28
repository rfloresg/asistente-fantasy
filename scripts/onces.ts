// Descarga los onces probables de futbolfantasy y los guarda para hoy.
// Uso: npm run onces   (después de npm run ingest, antes de npm run score)

import "dotenv/config";
import { getTableColumns, ne, sql, type SQL } from "drizzle-orm";
import { getConn } from "../src/db";
import { lineups, players, teams } from "../src/db/schema";
import { futbolfantasy } from "../src/lib/onces/futbolfantasy";
import { matchPlayers, matchTeam } from "../src/lib/onces/match";

const PAUSE_MS = 1500; // entre páginas, para no cargar su web

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

async function main() {
  const { db, close } = await getConn();
  try {
    const ps = await db.select().from(players).where(ne(players.status, "out_of_league"));
    const active = new Set(ps.map((p) => p.teamId));
    const ts = (await db.select().from(teams)).filter((t) => active.has(t.id));

    const slugs = await futbolfantasy.teamSlugs();
    if (!slugs.length) throw new Error("No se encontraron equipos en futbolfantasy. ¿Ha cambiado la web?");

    const day = today();
    const now = new Date();
    const rows: (typeof lineups.$inferInsert)[] = [];
    const unmatched: string[] = [];
    let teamsOk = 0;

    for (const slug of slugs) {
      const teamId = matchTeam(slug, ts);
      if (!teamId) {
        console.warn(`equipo sin emparejar: ${slug}`);
        continue;
      }
      try {
        const ff = await futbolfantasy.team(slug);
        const ours = ps.filter((p) => p.teamId === teamId);
        const m = matchPlayers(ff, ours);
        for (const f of ff) {
          const id = m.get(f.ffId);
          if (id) rows.push({ playerId: id, day, ffId: f.ffId, starter: f.starter, prob: f.prob, fetchedAt: now });
          else if (f.starter) unmatched.push(`${slug}: ${f.name} (ff ${f.ffId})`);
        }
        teamsOk++;
      } catch (e) {
        console.warn(`fallo en ${slug}: ${String(e)}`);
      }
      await futbolfantasy.sleep(PAUSE_MS);
    }

    const set: Record<string, SQL> = {};
    for (const [prop, col] of Object.entries(getTableColumns(lineups))) {
      if (prop !== "playerId" && prop !== "day") set[prop] = sql.raw(`excluded."${col.name}"`);
    }
    for (let k = 0; k < rows.length; k += 300) {
      await db.insert(lineups).values(rows.slice(k, k + 300))
        .onConflictDoUpdate({ target: [lineups.playerId, lineups.day], set });
    }

    console.log(`${day}: ${teamsOk}/${slugs.length} equipos · ${rows.length} jugadores · ${rows.filter((r) => r.starter).length} titulares`);
    if (unmatched.length) console.log(`titulares sin emparejar (añadir a src/lib/onces/aliases.ts):\n  ${unmatched.join("\n  ")}`);
    if (teamsOk < slugs.length / 2) throw new Error("Fallaron más de la mitad de los equipos.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
