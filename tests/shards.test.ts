import { describe, expect, it } from "vitest";
import { parseShard, shardOf } from "../src/lib/espia/shards";

const t = (leagueId: string, reader: number, ...plan: number[]) => ({ leagueId, reader, planUsers: plan.map((userId) => ({ userId })) });

describe("repartir ligas entre pasadas", () => {
  it("las ligas que comparten usuario van juntas", () => {
    const a = t("A", 7, 7, 9), b = t("B", 9), c = t("C", 12, 12), d = t("D", 13, 13), e = t("E", 14, 7);
    const s = shardOf([a, b, c, d, e], 4);
    expect(s.get(a)).toBe(s.get(b)); // 9 está en A y B
    expect(s.get(a)).toBe(s.get(e)); // 7 está en A y E
    expect(s.get(a)).toBe(7 % 4); // grupo de 7, 9 y 14: su id más bajo
    expect(s.get(c)).toBe(0);
    expect(s.get(d)).toBe(1);
  });
  it("estable aunque entren ligas nuevas", () => {
    const c = t("C", 12, 12);
    expect(shardOf([c], 4).get(c)).toBe(shardOf([t("X", 5), c, t("Y", 22, 3)], 4).get(c));
  });
  it("parseShard", () => {
    expect(parseShard("2/4")).toEqual({ i: 2, n: 4 });
    expect(parseShard(undefined)).toEqual({ i: 0, n: 1 });
    expect(parseShard("5/4")).toEqual({ i: 0, n: 1 });
  });
});
