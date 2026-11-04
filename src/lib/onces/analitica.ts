// Onces probables de analiticafantasy.com (su robots.txt permite estas páginas). Segunda fuente, para
// contrastar con futbolfantasy: probabilidad de ser titular, si está en el once y su estado (duda,
// lesión, sanción) con el motivo. Una página por partido de la jornada, con pausa entre peticiones.
// La página es de Next.js: los datos van en trozos self.__next_f.push([1,"..."]). Parser puro.

const BASE = "https://www.analiticafantasy.com";
const UA = "Mozilla/5.0 (compatible; asistente-fantasy/0.1; uso personal)";
const POSITION = ["Portero", "Defensa", "Mediocampista", "Delantero"]; // positionId 0..3 de la web

export interface AfPlayer {
  afId: string;
  name: string;
  slug: string;
  position: string; // como futbolfantasy, para emparejar con el mismo código
  starter: boolean;
  prob: number | null; // % de ser titular
  status: "doubt" | "injury" | "sanction" | null;
  info: string | null; // "Duda leve para la jornada 12 · Molestias en el tobillo"
}

export interface AfTeam {
  name: string; // "Atletico Madrid"
  players: AfPlayer[];
}

// Enlaces a los partidos de la jornada desde la página de alineaciones probables
export function parseMatchLinks(html: string): string[] {
  return [...new Set([...html.matchAll(/href="(\/partido\/\d+-[a-z0-9-]+)"/g)].map((m) => m[1]))];
}

// Junta los trozos de datos de Next.js en un solo texto
function nextData(html: string): string {
  let out = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { out += JSON.parse(`"${m[1]}"`); } catch { /* trozo raro: se ignora */ }
  }
  return out;
}

// El objeto JSON que empieza justo después de `"clave":`, respetando las cadenas
function objectAfter(text: string, key: string): unknown {
  const at = text.indexOf(`"${key}":`);
  if (at < 0) return null;
  let i = at + key.length + 3;
  while (text[i] === " ") i++;
  if (text[i] !== "{") return null;
  let depth = 0, inStr = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
    }
  }
  return null;
}

type RawPlayer = {
  playerId: number; name: string; slug: string; positionId: number; chance: number | null; esTitular: boolean;
  playerExtras?: { status?: string | null; isSanctioned?: boolean | null; statusInfo?: string | null; report?: string | null } | null;
};

const toPlayer = (p: RawPlayer): AfPlayer => {
  const x = p.playerExtras ?? {};
  const status = x.isSanctioned ? "sanction" : x.status === "doubt" ? "doubt" : x.status === "injury" || x.status === "injured" ? "injury" : null;
  const info = [x.report, x.statusInfo].filter(Boolean).join(" · ") || null;
  return {
    afId: String(p.playerId), name: p.name, slug: p.slug, position: POSITION[p.positionId] ?? "",
    starter: !!p.esTitular, prob: typeof p.chance === "number" ? p.chance : null, status, info,
  };
};

// Un partido: los dos equipos con sus jugadores (la alineación principal de la web)
export function parseMatch(html: string): AfTeam[] {
  const data = nextData(html);
  const block = objectAfter(data, "lineupBlock") as { home?: { players?: RawPlayer[] }; away?: { players?: RawPlayer[] } } | null;
  // Nombres de los equipos: los datos estructurados del partido (SportsEvent) o, si faltan, los de Next
  const home = html.match(/"homeTeam":\{"@type":"SportsTeam","name":"([^"]+)"/)?.[1] ?? data.match(/"homeTeamName":"([^"]+)"/)?.[1];
  const away = html.match(/"awayTeam":\{"@type":"SportsTeam","name":"([^"]+)"/)?.[1] ?? data.match(/"awayTeamName":"([^"]+)"/)?.[1];
  if (!block || !home || !away) return [];
  return [
    { name: home, players: (block.home?.players ?? []).map(toPlayer) },
    { name: away, players: (block.away?.players ?? []).map(toPlayer) },
  ].filter((t) => t.players.length);
}

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const teamSlug = (t: AfTeam) => slugify(t.name);

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`analiticafantasy ${res.status} en ${path}`);
  return res.text();
}

export const analitica = {
  matchLinks: async () => parseMatchLinks(await get("/la-liga/alineaciones-probables")),
  match: async (path: string) => parseMatch(await get(path)),
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
};
