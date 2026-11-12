import { describe, expect, it } from "vitest";
import type { RecOutcome } from "../src/lib/aciertos";
import { bestAndWorst, weekSummaryPush, weekSummaryText, type WeekInput } from "../src/lib/semana";

const rec = (kind: RecOutcome["kind"], name: string, change: number, market: number): RecOutcome => ({
  kind, playerId: name, name, at: new Date("2026-11-05T09:00:00+01:00"), fromDay: "2026-11-05", toDay: "2026-11-12", days: 7,
  valueFrom: 1e6, valueTo: 1e6 * (1 + change / 100), change, market, ptsPerWeek: null, followed: null, ok: null,
});

const base: WeekInput = {
  league: "KFC Fantasy", week: 12, managers: 7,
  my: { points: 58, weekPosition: 3, position: 5, previousPosition: 6 },
  best: { manager: "Jonix", points: 71 },
  squad: { now: 202.5e6, weekAgo: 199.4e6 },
  xi: { week: 12, expected: 51.7, actual: 55 },
  recs: [rec("fichar", "Cohete", 18, -1), rec("vender", "Malo", 6, -1), rec("fichar", "Normal", 0, -1)],
};

describe("tu semana", () => {
  it("cuenta la jornada, la general, la plantilla, el once y los consejos", () => {
    const t = weekSummaryText(base)!;
    expect(t).toContain("Tu jornada 12 en KFC Fantasy");
    expect(t).toContain("Hiciste <b>58 pts</b> · 3.º de 7 en la jornada (el mejor, Jonix con 71)");
    expect(t).toContain("vas <b>5.º</b> (subes 1)");
    expect(t).toContain("Tu plantilla vale <b>202,5 M</b> (+3,1 M en 7 días)");
    expect(t).toContain("esperaba 51,7 pts y sacó 55: más de lo esperado");
    expect(t).toContain("Mejor consejo: fichar a <b>Cohete</b> (+18 %; el mercado, −1 %)");
    expect(t).toContain("Peor consejo: vender a <b>Malo</b> (+6 %; el mercado, −1 %)");
  });
  it("si fuiste el mejor, lo celebra; sin datos, nada", () => {
    expect(weekSummaryText({ ...base, my: { ...base.my, weekPosition: 1 } })).toContain("¡el mejor de la jornada!");
    expect(weekSummaryText({ ...base, my: { points: null, weekPosition: null, position: null, previousPosition: null }, squad: null, xi: null, recs: [] })).toBeNull();
  });
  it("mejor y peor: solo si de verdad lo son", () => {
    expect(bestAndWorst([rec("fichar", "A", -5, 0)])).toEqual({ best: null, worst: expect.objectContaining({ name: "A" }) });
    expect(bestAndWorst([rec("fichar", "A", 5, 0)])).toEqual({ best: expect.objectContaining({ name: "A" }), worst: null });
  });
  it("texto corto para el móvil", () => {
    expect(weekSummaryPush(base)).toBe("58 pts · vas 5.º · plantilla +3,1 M");
  });
});
