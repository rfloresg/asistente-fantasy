import { describe, expect, it } from "vitest";
import { aciertos, marketChange, valueOn, type PlanRow } from "../src/lib/aciertos";

const at = (day: string, h = 9) => new Date(`${day}T${String(h - 1).padStart(2, "0")}:00:00Z`); // hora de Madrid en invierno
const liga = (owners: Record<string, string>) => ({ myTeamId: "yo", standing: [], activity: [], unlocks: [], injuries: [], owners });

const values = new Map([
  ["a", new Map([["2026-11-02", 10e6], ["2026-11-05", 12e6]])], // fichar: sube 20 %
  ["b", new Map([["2026-11-02", 5e6], ["2026-11-05", 4e6]])], // vender: baja 20 %
  ["c", new Map([["2026-11-02", 2e6], ["2026-11-05", 2e6]])], // el resto, igual
]);

describe("cuánto acertamos", () => {
  const plans: PlanRow[] = [
    { createdAt: at("2026-11-02"), acciones: [{ tipo: "pujar", playerId: "a", jugador: "A" }, { tipo: "vender", playerId: "b", jugador: "B" }], lineup: null, liga: liga({ b: "yo" }) },
    // se repite: cuenta una vez, la primera
    { createdAt: at("2026-11-03"), acciones: [{ tipo: "pujar", playerId: "a", jugador: "A" }], lineup: { formation: "4-4-2", expected: 40, captainId: null, starters: [{ id: "a", name: "A", positionId: 3, expected: 6, startProb: 90, status: "ok", nota: 70, hole: false }], out: [] }, liga: liga({ a: "yo" }) },
  ];
  const r = aciertos({
    plans,
    values,
    points: new Map([["a", new Map([[12, 9]])]]),
    weeks: [{ week: 12, start: at("2026-11-04", 21), finished: true }, { week: 13, start: at("2026-11-10"), finished: false }],
    lastDay: "2026-11-05",
    market: (f, t) => marketChange(values, f, t),
  });

  it("una recomendación por jugador, medida hasta hoy", () => {
    expect(r.recs).toHaveLength(2);
    const a = r.recs.find((x) => x.kind === "fichar")!;
    expect(a).toMatchObject({ days: 3, change: 20, ptsPerWeek: 9, followed: true, ok: true });
  });
  it("venta acertada si baja más que el mercado, y si la hiciste", () => {
    const b = r.recs.find((x) => x.kind === "vender")!;
    expect(b).toMatchObject({ change: -20, followed: true, ok: true });
    expect(r.summary.vender.followedMoney).toBe(1e6);
    expect(r.summary.fichar.followedMoney).toBe(2e6);
  });
  it("el once: esperado frente a lo que sacó", () => {
    expect(r.xi).toEqual([{ week: 12, expected: 40, actual: 9 }]);
  });
  it("valor del día o del anterior", () => {
    expect(valueOn(values.get("a"), "2026-11-04")).toBe(10e6);
    expect(valueOn(values.get("a"), "2026-11-01")).toBeNull();
  });
});
