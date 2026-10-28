import { describe, expect, it } from "vitest";
import { addDays, computeScores, percentiles, teamInfo, type EngineInput, type EngineMatch } from "../src/lib/nota/engine";
import { reasons } from "../src/lib/nota/explain";

const asOf = "2026-10-28";

// Liga mini: 4 equipos, 2 jornadas jugadas, 1 por jugar.
const d = (s: string) => new Date(`${s}T18:00:00+01:00`);
const matches: EngineMatch[] = [
  { week: 1, date: d("2026-10-17"), localId: "A", visitorId: "B", state: 7, localScore: 3, visitorScore: 0 },
  { week: 1, date: d("2026-10-17"), localId: "C", visitorId: "D", state: 7, localScore: 1, visitorScore: 1 },
  { week: 2, date: d("2026-10-24"), localId: "B", visitorId: "C", state: 7, localScore: 0, visitorScore: 2 },
  { week: 2, date: d("2026-10-24"), localId: "D", visitorId: "A", state: 7, localScore: 0, visitorScore: 1 },
  { week: 3, date: d("2026-10-31"), localId: "A", visitorId: "C", state: 1, localScore: null, visitorScore: null },
  { week: 3, date: d("2026-10-31"), localId: "B", visitorId: "D", state: 1, localScore: null, visitorScore: null },
];

const series = (start: number, dailyPct: number) => {
  const m = new Map<string, number>();
  for (let i = 7; i >= 0; i--) m.set(addDays(asOf, -i), Math.round(start * (1 + dailyPct) ** (7 - i)));
  return m;
};

function input(): EngineInput {
  return {
    asOf,
    players: [
      { id: "star", positionId: 4, status: "ok", teamId: "B" }, // juega mucho, puntúa, sube, rival fácil
      { id: "bench", positionId: 4, status: "ok", teamId: "A" }, // no juega, baja
      { id: "hurt", positionId: 4, status: "injured", teamId: "C" },
      { id: "gone", positionId: 4, status: "out_of_league", teamId: "C" },
    ],
    values: new Map([
      ["star", series(5_000_000, 0.03)],
      ["bench", series(5_000_000, -0.02)],
      ["hurt", series(5_000_000, -0.01)],
      ["gone", series(5_000_000, 0)],
    ]),
    weeks: new Map([
      ["star", new Map([[1, { points: 8, minutes: 90 }], [2, { points: 10, minutes: 90 }]])],
      ["bench", new Map([[1, { points: 1, minutes: 10 }]])],
      ["hurt", new Map([[1, { points: 4, minutes: 90 }]])],
    ]),
    matches,
  };
}

describe("percentiles", () => {
  it("reparte de 0 a 100, empates a la media y null a 50", () => {
    expect(percentiles([10, 20, 30])).toEqual([0, 50, 100]);
    expect(percentiles([5, 5, 9])).toEqual([25, 25, 100]);
    expect(percentiles([1, null, 3])).toEqual([0, 50, 100]);
  });
});

describe("teamInfo", () => {
  it("calcula fuerza y próximos rivales", () => {
    const t = teamInfo(matches, asOf);
    expect(t.get("A")!.strength).toBeCloseTo(3 + 0.1 * 2); // 2 victorias, +4 goles en 2 partidos
    expect(t.get("B")!.strength).toBeCloseTo(0 + 0.1 * -2.5);
    expect(t.get("A")!.playedWeeks).toEqual([2, 1]);
    expect(t.get("B")!.next).toEqual([{ teamId: "D", home: true }]);
  });

  it("no cuenta partidos posteriores a la fecha", () => {
    const t = teamInfo(matches, "2026-10-20");
    expect(t.get("A")!.playedWeeks).toEqual([1]);
  });
});

describe("computeScores", () => {
  const scores = computeScores(input());
  const by = (id: string) => scores.find((s) => s.playerId === id)!;

  it("ignora fuera de liga", () => {
    expect(scores.map((s) => s.playerId)).not.toContain("gone");
  });

  it("el jugador en forma tiene la mejor nota y se recomienda fichar", () => {
    expect(scores[0].playerId).toBe("star");
    expect(by("star").formAvg).toBe(9);
    expect(by("star").minutesAvg).toBe(90);
    expect(by("star").action).toBe("fichar");
  });

  it("penaliza la lesión y recomienda vender si baja", () => {
    expect(by("hurt").r).toBe(25);
    expect(by("hurt").action).toBe("vender");
  });

  it("proyecta el valor con el ritmo diario", () => {
    const s = by("star");
    expect(s.dailyRate).toBeCloseTo(0.03, 3);
    expect(s.expected).toBe(Math.round((s.value * 1.03 ** 7) / 10_000) * 10_000);
    expect(s.maxBidSpec).toBeLessThan(s.expected);
    expect(s.maxBidSpec).toBeGreaterThan(s.value);
  });

  it("no recomienda especular si baja", () => {
    expect(by("bench").maxBidSpec).toBeNull();
  });

  it("con once probable: suplente probable no se recomienda fichar", () => {
    const inp = input();
    inp.lineups = new Map([["star", { starter: false, prob: 20 }]]);
    const s = computeScores(inp).find((x) => x.playerId === "star")!;
    expect(s.startProb).toBe(20);
    expect(s.action).not.toBe("fichar");
    expect(reasons(s, "ok", String).some((r) => !r.good && r.text.includes("20 %"))).toBe(true);
  });

  it("explica la nota con sus cifras", () => {
    const r = reasons(by("star"), "ok", (id) => `Equipo ${id}`);
    expect(r.some((x) => x.good && x.text.includes("9 pts"))).toBe(true);
    expect(reasons(by("hurt"), "injured", String)[0]).toEqual({ good: false, text: "Lesionado: resta 25 puntos" });
  });
});
