// Descarga los onces probables de futbolfantasy y de analiticafantasy (segunda fuente) y los guarda para hoy.
// Si una de las dos falla, la otra se guarda igual.
// Uso: npm run onces   (después de npm run ingest, antes de npm run score)

import "dotenv/config";
import { getTableColumns, ne, sql, type SQL } from "drizzle-orm";
import { getConn } from "../src/db";
import { lineups, lineupsAf, players, teams } from "../src/db/schema";
import { analitica, teamSlug } from "../src/lib/onces/analitica";
import { futbolfantasy } from "../src/lib/onces/futbolfantasy";
import { matchPlayers, matchTeam } from "../src/lib/onces/match";
import { AF_ALIASES } from "../src/lib/onces/aliases";

const PAUSE_MS = 1500; // entre páginas, para no cargar su web

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

async function main() {
  const { db, close } = await getConn();
  try {
    const ps = await db.select().from(players).where(ne(players.status, "out_of_league"));
    const active = new Set(ps.map((p) => p.teamId));
    const ts = (await db.select().from(teams)).filter((t) => active.has(t.id));

    const day = today();
    const afOk = await analiticaFantasy(db, ps, ts, day).catch((e) => { console.warn(`analiticafantasy: ${String(e)}`); return false; });

    const slugs = await futbolfantasy.teamSlugs().catch(() => [] as string[]);
    if (!slugs.length) {
      if (afOk) { console.warn("futbolfantasy sin equipos (¿ha cambiado la web?): sigo solo con analiticafantasy"); return; }
      throw new Error("No se encontraron equipos en futbolfantasy ni en analiticafantasy. ¿Han cambiado las webs?");
    }

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

// Segunda fuente: una página por partido de la jornada. Devuelve si fue bien.
type Db = Awaited<ReturnType<typeof getConn>>["db"];
async function analiticaFantasy(db: Db, ps: (typeof players.$inferSelect)[], ts: (typeof teams.$inferSelect)[], day: string) {
  const links = await analitica.matchLinks();
  if (!links.length) throw new Error("sin partidos en la página de alineaciones probables");
  const now = new Date();
  const rows: (typeof lineupsAf.$inferInsert)[] = [];
  const unmatched: string[] = [];
  let teamsOk = 0;
  for (const link of links) {
    await analitica.sleep(PAUSE_MS);
    try {
      for (const t of await analitica.match(link)) {
        const teamId = matchTeam(teamSlug(t), ts);
        if (!teamId) { console.warn(`analiticafantasy: equipo sin emparejar: ${t.name}`); continue; }
        const ff = t.players.map((p) => ({ ffId: p.afId, name: p.name, slug: p.slug, position: p.position, starter: p.starter, prob: p.prob }));
        const m = matchPlayers(ff, ps.filter((p) => p.teamId === teamId), AF_ALIASES);
        for (const p of t.players) {
          const id = m.get(p.afId);
          if (id) rows.push({ playerId: id, day, afId: p.afId, starter: p.starter, prob: p.prob, status: p.status, info: p.info, fetchedAt: now });
          else if (p.starter) unmatched.push(`${t.name}: ${p.name} (af ${p.afId})`);
        }
        teamsOk++;
      }
    } catch (e) {
      console.warn(`analiticafantasy: fallo en ${link}: ${String(e)}`);
    }
  }
  const set: Record<string, SQL> = {};
  for (const [prop, col] of Object.entries(getTableColumns(lineupsAf))) {
    if (prop !== "playerId" && prop !== "day") set[prop] = sql.raw(`excluded."${col.name}"`);
  }
  for (let k = 0; k < rows.length; k += 300) {
    await db.insert(lineupsAf).values(rows.slice(k, k + 300)).onConflictDoUpdate({ target: [lineupsAf.playerId, lineupsAf.day], set });
  }
  console.log(`analiticafantasy ${day}: ${teamsOk} equipos · ${rows.length} jugadores · ${rows.filter((r) => r.starter).length} titulares`);
  if (unmatched.length) console.log(`  titulares sin emparejar:\n  ${unmatched.join("\n  ")}`);
  return teamsOk >= 10;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
