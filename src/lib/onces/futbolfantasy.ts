// Onces probables de futbolfantasy.com (robots.txt lo permite).
// Una página por equipo, una vez al día, con pausa entre peticiones.
// Parser con regex: si cambian el HTML, fallan los tests de tests/onces.test.ts.

const BASE = "https://www.futbolfantasy.com";
const UA = "Mozilla/5.0 (compatible; asistente-fantasy/0.1; uso personal)";

export interface FfPlayer {
  ffId: string;
  name: string; // nombre corto que muestra la web ("Dituro")
  slug: string; // de la URL del jugador ("matias-dituro")
  position: string; // Portero | Defensa | Mediocampista | Delantero
  starter: boolean; // en el once probable
  prob: number | null; // % de ser titular
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

export function parseTeamSlugs(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/href="https:\/\/www\.futbolfantasy\.com\/laliga\/equipos\/([a-z0-9-]+)"/g)) set.add(m[1]);
  return [...set];
}

export function parseLineup(html: string): FfPlayer[] {
  const parts = html.split(/<div class="jugador_(\d+) tipo_campo/);
  const out: FfPlayer[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const ffId = parts[i];
    const b = parts[i + 1];
    const once = b.match(/data-onceFF="([^"]*)"/i)?.[1];
    const position = b.match(/data-posicionLaLigaFantasy="([^"]*)"/i)?.[1] ?? "";
    const prob = b.match(/probabilidad-widget[^>]*>\s*<span[^>]*>\s*(\d+)\s*%/)?.[1];
    const name = b.match(/truncate-name[^>]*>([^<]+)</)?.[1];
    const slug = b.match(/href="https:\/\/www\.futbolfantasy\.com\/jugadores\/([^/"]+)/)?.[1];
    if (!name || !slug || !once) continue;
    out.push({
      ffId,
      name: decode(name),
      slug,
      position,
      starter: once === "titular",
      prob: prob === undefined ? null : Number(prob),
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getHtml(path: string): Promise<string> {
  for (let i = 1; ; i++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return res.text();
    if (i >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`futbolfantasy ${res.status} en ${path}`);
    await sleep(3000 * i);
  }
}

export const futbolfantasy = {
  teamSlugs: async () => parseTeamSlugs(await getHtml("/laliga/posibles-alineaciones")),
  team: async (slug: string) => parseLineup(await getHtml(`/laliga/equipos/${slug}`)),
  sleep,
};
