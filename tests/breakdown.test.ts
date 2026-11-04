import { describe, expect, it } from "vitest";
import player from "./fixtures/player-68.json";
import { breakdown, fixedPts } from "../src/lib/nota/breakdown";

describe("desglose de puntos", () => {
  it("separa portería y lo fijo con una respuesta real de la API (Unai Simón, J9)", () => {
    const w = player.playerStats[0] as unknown as { totalPoints: number; stats: Record<string, [number, number]> };
    const b = breakdown(w.totalPoints, w.stats.mins_played[0], w.stats);
    expect(b).toMatchObject({ points: 11, minutes: 90, goals: 0, conceded: 0, concededPts: 4 });
    expect(fixedPts(b)).toBe(7); // 2 minutos + 1 paradas + 3 recuperaciones - 1 pérdidas + 2 marca
  });
  it("sin estadísticas, solo puntos y minutos", () => {
    expect(breakdown(5, 90, {})).toEqual({ points: 5, minutes: 90 });
  });
});
