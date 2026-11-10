import { describe, expect, it } from "vitest";
import { lineupAccuracy, type Pred } from "../src/lib/onces/aciertos";

const kick = new Date("2026-11-08T15:00:00Z");
const at = (h: number) => new Date(kick.getTime() + h * 3600e3);
const p = (playerId: string, h: number, starter: boolean, prob: number): Pred => ({ playerId, fetchedAt: at(h), starter, prob });

describe("aciertos de los onces", () => {
  const base = {
    teamOf: new Map([["a", "T1"], ["b", "T1"], ["c", "T2"]]),
    matches: [
      { week: 12, date: kick, localId: "T1", visitorId: "T2", state: 7 },
      { week: 13, date: at(24 * 7), localId: "T2", visitorId: "T1", state: 1 }, // sin jugar: no cuenta
    ],
    // a fue titular, b entró al descanso (45 min = suplente), c no jugó
    minutes: new Map([["a", new Map([[12, 90]])], ["b", new Map([[12, 45]])]]),
  };

  it("usa la última predicción antes del partido y compara fuentes", () => {
    const r = lineupAccuracy({
      ...base,
      sources: {
        "Futbol Fantasy": [p("a", -30, false, 30), p("a", -10, true, 80), p("a", 2, false, 0), p("b", -10, true, 70), p("c", -10, false, 10)],
        "Analítica Fantasy": [p("a", -10, true, 90), p("b", -10, false, 20)],
      },
    });
    expect(r.weeks).toEqual([12]);
    expect(r.alone["Futbol Fantasy"]).toMatchObject({ n: 3, hits: 2, starters: 2, startersHit: 1 });
    expect(r.alone["Analítica Fantasy"]).toMatchObject({ n: 2, hits: 2 });
    expect(r.common["Futbol Fantasy"].n).toBe(2);
    expect(r.common["Combinadas (la que usamos)"].n).toBe(2);
    // b: una lo da titular y la otra no, y acertó Analítica
    expect(r.disputes).toEqual({ n: 1, right: { "Futbol Fantasy": 0, "Analítica Fantasy": 1 } });
  });

  it("no cuenta predicciones de hace más de 4 días", () => {
    const r = lineupAccuracy({ ...base, sources: { "Futbol Fantasy": [p("a", -24 * 5, true, 80)], "Analítica Fantasy": [] } });
    expect(r.weeks).toEqual([]);
    expect(r.alone["Futbol Fantasy"].n).toBe(0);
  });
});
