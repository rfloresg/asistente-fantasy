// Junta los onces probables de varias fuentes en una sola probabilidad de ser titular, y avisa si no
// coinciden (una lo pone titular y otra no, o sus probabilidades se separan 40 puntos o más). Función pura.

export interface LineupSource {
  source: "Futbol Fantasy" | "Analítica Fantasy";
  starter: boolean;
  prob: number | null;
  info?: string | null; // motivo de duda, lesión o sanción
}

export interface Combined {
  starter: boolean;
  prob: number;
  sources: { source: string; starter: boolean; prob: number }[];
  dispute: boolean;
  info: string | null;
}

export const DISPUTE_GAP = 40;
const probOf = (s: LineupSource) => s.prob ?? (s.starter ? 70 : 20);

// También sirve con las fuentes ya guardadas en la nota (startSources)
export function disputed(sources: { starter: boolean; prob: number }[]): boolean {
  if (sources.length < 2) return false;
  const ps = sources.map((s) => s.prob);
  return new Set(sources.map((s) => s.starter)).size > 1 || Math.max(...ps) - Math.min(...ps) >= DISPUTE_GAP;
}

// "Futbol Fantasy: titular 80 % · Analítica Fantasy: suplente 30 %"
export const sourcesText = (sources: { source: string; starter: boolean; prob: number }[]) =>
  sources.map((s) => `${s.source}: ${s.starter ? "titular" : "suplente"} ${s.prob} %`).join(" · ");

export function combine(sources: LineupSource[]): Combined | null {
  if (!sources.length) return null;
  const ps = sources.map(probOf);
  const prob = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
  const dispute = disputed(sources.map((s, i) => ({ starter: s.starter, prob: ps[i] })));
  return {
    starter: prob >= 50,
    prob,
    sources: sources.map((s, i) => ({ source: s.source, starter: s.starter, prob: ps[i] })),
    dispute,
    info: sources.find((s) => s.info)?.info ?? null,
  };
}
