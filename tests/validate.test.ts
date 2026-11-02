import { describe, expect, it } from "vitest";
import { outcomes, report, spearman, suggestWeights, type ScoreRow } from "../src/lib/nota/validate";

const row = (playerId: string, nota: number, action = "mantener", extra: Partial<ScoreRow> = {}): ScoreRow => ({
  playerId, day: "2026-10-01", nota, f: nota, t: nota, p: 50, m: 50, c: 100 - nota,
  value: 1_000_000, expected: 1_000_000, maxBidSpec: null, action, ...extra,
});

describe("spearman", () => {
  it("1 si el orden coincide, -1 si es el contrario, null con pocos datos", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(spearman(a, a.map((x) => x * 3))).toBeCloseTo(1);
    expect(spearman(a, a.map((x) => -x))).toBeCloseTo(-1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
});

describe("validación", () => {
  // 20 jugadores: a más nota, más sube y más puntos
  const rows = Array.from({ length: 20 }, (_, i) => row(`p${i}`, i * 5, i >= 14 ? "fichar" : i < 4 ? "vender" : "mantener",
    i === 19 ? { expected: 1_100_000, maxBidSpec: 1_050_000 } : {}));
  const values = new Map(rows.map((r, i) => [r.playerId, new Map([["2026-10-08", 1_000_000 * (1 + (i - 10) / 100)]])]));
  const points = new Map(rows.map((r, i) => [r.playerId, new Map([[8, i], [9, i]])]));
  const weekStart = new Map([[7, "2026-09-28"], [8, "2026-10-03"], [9, "2026-10-10"], [10, "2026-10-17"]]);
  const os = outcomes(rows, values, points, weekStart, new Set([7, 8, 9]));

  it("cambio de valor a 7 días y puntos de las 2 jornadas siguientes", () => {
    expect(os[19].valueChange).toBeCloseTo(0.09);
    expect(os[19].points).toBe(38);
    // si alguna de las 2 jornadas no ha terminado, sin puntos
    expect(outcomes(rows, values, points, weekStart, new Set([8]))[0].points).toBeNull();
  });
  it("informe: la nota acierta, el calendario (al revés) no, y fichar > vender", () => {
    const r = report(os);
    expect(r.corr.nota.value).toBeCloseTo(1);
    expect(r.corr.c.points).toBeCloseTo(-1);
    expect(r.byAction.fichar.valueChange!).toBeGreaterThan(r.byAction.vender.valueChange!);
    expect(r.quintiles).toHaveLength(5);
    expect(r.spec).toMatchObject({ n: 1, up: 1 });
    const w = suggestWeights(r)!;
    expect(w.calendar).toBe(0); // no acierta: peso 0
    expect(w.form).toBeGreaterThan(0);
  });
});
