import { describe, expect, it } from "vitest";
import { whatIf, type WhatIfPlayer } from "../src/lib/plan/ysi";

const p = (id: string, positionId: number, xp: number, value = 5_000_000, x: Partial<WhatIfPlayer> = {}): WhatIfPlayer =>
  ({ id, name: `J${id}`, positionId, status: "ok", formAvg: null, startProb: null, xp, value, ...x });
// 1-4-4-2 justo: 11 jugadores
const squad = [p("1", 1, 4), p("2", 2, 3), p("3", 2, 3), p("4", 2, 3), p("5", 2, 2), p("6", 3, 4), p("7", 3, 4), p("8", 3, 4), p("9", 3, 1), p("10", 4, 5), p("11", 4, 5)];

describe("¿y si…?", () => {
  it("cambiar al peor medio por uno mejor sube el once y gasta su precio", () => {
    const r = whatIf(squad, ["9"], [p("20", 3, 6, 8_000_000, { price: 9_000_000, expected: 8_400_000 })], 10_000_000);
    expect(r.diff).toBe(5);
    expect(r.entran).toEqual(["J20"]);
    expect(r.salen).toEqual(["J9"]);
    expect(r.moneyAfter).toBe(10_000_000 + 5_000_000 - 9_000_000);
    expect(r.valueDiff7d).toBe(400_000);
    expect(r.avisos).toEqual([]);
  });
  it("avisa si te quedas en negativo o el fichaje es de un rival", () => {
    const r = whatIf(squad, [], [p("21", 4, 7, 20_000_000, { owner: "Jonix" })], 5_000_000);
    expect(r.moneyAfter).toBe(-15_000_000);
    expect(r.avisos.join(" ")).toContain("Jonix: solo con cláusula");
    expect(r.avisos.join(" ")).toContain("negativo");
  });
});
