import { describe, expect, it } from "vitest";
import { bestLineup, expectedPoints, type LineupPlayer } from "../src/lib/plan/lineup";
import { dailyPlan, planMessage } from "../src/lib/plan/plan";

const pl = (id: string, positionId: number, formAvg: number, extra: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id, name: id, positionId, status: "ok", formAvg, startProb: 80, ...extra,
});

describe("puntos esperados", () => {
  it("forma × probabilidad de jugar × estado", () => {
    expect(expectedPoints(pl("a", 3, 10, { startProb: 100 }))).toBe(10);
    expect(expectedPoints(pl("a", 3, 10, { startProb: 0 }))).toBe(1.5);
    expect(expectedPoints(pl("a", 3, 10, { startProb: null }))).toBe(10);
    expect(expectedPoints(pl("a", 3, 10, { status: "injured" }))).toBe(0);
    expect(expectedPoints(pl("a", 3, 10, { status: "doubtful", startProb: 100 }))).toBe(5);
  });
});

describe("mejor once", () => {
  const squad = [
    pl("POR1", 1, 5), pl("POR2", 1, 2),
    pl("D1", 2, 6), pl("D2", 2, 5), pl("D3", 2, 4), pl("D4", 2, 1), pl("D5", 2, 0.5),
    pl("M1", 3, 9), pl("M2", 3, 8), pl("M3", 3, 7), pl("M4", 3, 6), pl("M5", 3, 5),
    pl("A1", 4, 10, { startProb: 100 }), pl("A2", 4, 3), pl("A3", 4, 9, { status: "injured" }),
    pl("ENT", 5, 20),
  ];
  const l = bestLineup(squad)!;
  it("elige la formación que más suma y nunca a lesionados ni entrenadores", () => {
    expect(l.formation).toBe("3-5-2");
    expect(l.starters).toHaveLength(11);
    expect(l.starters.map((p) => p.id)).not.toContain("A3");
    expect(l.starters.map((p) => p.id)).not.toContain("ENT");
  });
  it("capitán: el de más puntos esperados", () => {
    expect(l.captain!.id).toBe("A1");
    expect(l.out.map((p) => p.id)).toEqual(["A3"]);
  });
  it("sale en el plan", () => {
    const acc = dailyPlan({ now: new Date(), myTeam: { id: "t", players: [] }, myMoney: 1, rivals: [], market: [], scores: new Map(), lineup: l });
    const text = planMessage("Liga", 1, acc);
    expect(text).toContain("Alinea un <b>3-5-2</b>");
    expect(text).toContain("Capitán: <b>A1</b>");
    expect(text).toContain("No alinees: <b>A3</b>");
  });
});
