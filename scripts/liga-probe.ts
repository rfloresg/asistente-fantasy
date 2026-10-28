// Mira qué datos da la API sobre tu liga (solo lectura) para diseñar el Espía.
// Uso: npm run liga:probe
// Guarda las respuestas en ./liga-probe/ (no se sube a git) y muestra un resumen
// de su estructura, sin tokens, para pegarlo en el chat.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getConn } from "../src/db";
import { getAccessToken } from "../src/lib/laliga/auth";

const BASE = "https://fantasy-api.llt-services.com/api";
const CMP = "/v1/competition/1";
const OUT = path.join(process.cwd(), "liga-probe");

async function main() {
  const { db, close } = await getConn();
  const token = await getAccessToken(db);
  await close();
  fs.mkdirSync(OUT, { recursive: true });

  const get = async (name: string, p: string) => {
    const res = await fetch(`${BASE}${p}${p.includes("?") ? "&" : "?"}x-lang=es`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const body = await res.json().catch(() => null);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 1));
    return { status: res.status, body };
  };

  // Estructura: claves y tipos, sin valores largos
  const shape = (v: unknown, depth = 0): unknown => {
    if (Array.isArray(v)) return v.length ? [`${v.length} elementos`, shape(v[0], depth + 1)] : [];
    if (v && typeof v === "object") {
      if (depth > 3) return "{…}";
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
    }
    return typeof v === "string" && v.length > 40 ? "string" : v;
  };
  const list = (b: unknown): Record<string, unknown>[] =>
    Array.isArray(b) ? b : ((b as { elements?: []; leagues?: [] })?.elements ?? (b as { leagues?: [] })?.leagues ?? []);

  const leagues = await get("ligas", `${CMP}/leagues`);
  console.log(`\n== ligas (${leagues.status})`);
  const ls = list(leagues.body);
  ls.forEach((l, i) => console.log(`  [${i}] ${String(l.name)} · id ${String(l.id)}`));
  const league = ls[Number(process.env.LIGA_INDEX ?? 0)];
  if (!league) throw new Error("No se encontraron ligas en tu cuenta");
  const id = String(league.id);

  const results = {
    clasificacion: await get("clasificacion", `${CMP}/leagues/${id}/standing`),
    actividad: await get("actividad", `${CMP}/leagues/${id}/activity/0`),
    mercado: await get("mercado", `${CMP}/league/${id}/market`),
  };
  const standing = list(results.clasificacion.body);
  const firstTeam = standing[0] as { team?: { id?: string }; id?: string } | undefined;
  const teamId = firstTeam?.team?.id ?? firstTeam?.id;
  if (teamId) Object.assign(results, { equipo: await get("equipo", `${CMP}/leagues/${id}/teams/${teamId}`) });
  if (teamId) Object.assign(results, { dinero: await get("dinero", `${CMP}/teams/${teamId}/money`) });

  for (const [name, r] of Object.entries(results)) {
    console.log(`\n== ${name} (${r.status})`);
    console.log(JSON.stringify(shape(r.body), null, 1).slice(0, 2500));
  }

  const acts = list(results.actividad.body);
  const types = new Map<unknown, number>();
  for (const a of acts) types.set(a.activityTypeId, (types.get(a.activityTypeId) ?? 0) + 1);
  console.log("\n== tipos de actividad (id: cuántos)", Object.fromEntries(types));
  console.log("\nDatos completos en la carpeta liga-probe/ (no se suben a git).");
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
