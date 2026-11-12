import { describe, expect, it } from "vitest";
import { lastMinute, lastMinuteText } from "../src/lib/plan/ultima-hora";
import type { LineupPlayer } from "../src/lib/plan/lineup";
import type { LineupSnapshot } from "../src/lib/plan/snapshot";

const now = new Date("2026-11-21T12:00:00+01:00");
const p = (id: string, positionId: number, xp: number, x: Partial<LineupPlayer> = {}): LineupPlayer =>
  ({ id, name: `J${id}`, positionId, status: "ok", formAvg: null, startProb: 90, xp, ...x });
// 1-4-4-2 y un medio de recambio
const squad = [p("1", 1, 4), p("2", 2, 3), p("3", 2, 3), p("4", 2, 3), p("5", 2, 3), p("6", 3, 4), p("7", 3, 4), p("8", 3, 4), p("9", 3, 4), p("10", 4, 5), p("11", 4, 5), p("12", 3, 2)];
const prev: LineupSnapshot = {
  formation: "4-4-2", expected: 0, captainId: null, out: [],
  starters: squad.slice(0, 11).map((x) => ({ id: x.id, name: x.name, positionId: x.positionId, expected: x.xp!, startProb: 90, status: "ok", nota: null, hole: false })),
};
const in5h = () => new Date(now.getTime() + 5 * 3600e3);

describe("aviso de última hora", () => {
  it("un titular se lesiona: avisa y dice a quién meter", () => {
    const sq = squad.map((x) => (x.id === "9" ? { ...x, status: "injured", xp: 0 } : x));
    const a = lastMinute(prev, sq, in5h, now);
    expect(a).toEqual([{ id: "9", name: "J9", reason: "se ha lesionado", key: "9:injured", sub: { id: "12", name: "J12" } }]);
    expect(lastMinuteText("KFC", a)).toContain("Mete a <b>J12</b>");
  });
  it("deja de ser titular probable", () => {
    const sq = squad.map((x) => (x.id === "8" ? { ...x, startProb: 20, xp: 0.5 } : x));
    expect(lastMinute(prev, sq, in5h, now)[0]).toMatchObject({ id: "8", key: "8:suplente", sub: { name: "J12" } });
  });
  it("si su partido ya empezó o está lejos, nada", () => {
    const sq = squad.map((x) => (x.id === "9" ? { ...x, status: "injured", xp: 0 } : x));
    expect(lastMinute(prev, sq, () => new Date(now.getTime() - 3600e3), now)).toEqual([]);
    expect(lastMinute(prev, sq, () => new Date(now.getTime() + 48 * 3600e3), now)).toEqual([]);
  });
  it("sin cambios, nada", () => {
    expect(lastMinute(prev, squad, in5h, now)).toEqual([]);
  });
});
