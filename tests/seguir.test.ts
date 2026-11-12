import { describe, expect, it } from "vitest";
import { watchEvents } from "../src/lib/seguir";
import type { MarketItem, Team } from "../src/lib/espia/league";

const now = Date.parse("2026-11-12T12:00:00Z");
const market: MarketItem[] = [
  { id: "m1", salePrice: 6_500_000, expirationDate: "", status: "on_sale", playerMaster: { id: "20", nickname: "Pedri", marketValue: 6_000_000, positionId: 3, playerStatus: "ok" }, sellerTeam: { manager: { managerName: "Jonix" } } },
  { id: "m2", salePrice: 1_000_000, expirationDate: "", status: "on_sale", playerMaster: { id: "21", nickname: "Otro", marketValue: 1_000_000, positionId: 3, playerStatus: "ok" } },
];
const teams: Team[] = [
  { id: "me", players: [{ buyoutClause: 1, playerMaster: { id: "30", nickname: "Mío", marketValue: 1, playerStatus: "ok" } }] },
  { id: "r1", manager: { id: "9", managerName: "Ayman" }, players: [
    { buyoutClause: 9_000_000, buyoutClauseLockedEndTime: "2026-11-12T10:00:00Z", playerMaster: { id: "40", nickname: "Lamine", marketValue: 1, playerStatus: "ok" } },
    { buyoutClause: 9_000_000, buyoutClauseLockedEndTime: "2026-11-15T10:00:00Z", playerMaster: { id: "41", nickname: "Aún no", marketValue: 1, playerStatus: "ok" } },
    { buyoutClause: 9_000_000, buyoutClauseLockedEndTime: "2026-11-12T10:00:00Z", isShielded: true, playerMaster: { id: "42", nickname: "Blindado", marketValue: 1, playerStatus: "ok" } },
  ] },
];

describe("lista de seguimiento", () => {
  it("avisa de los seguidos en el mercado y de cláusulas recién liberadas", () => {
    const e = watchEvents(new Set(["20", "40", "41", "42", "30"]), market, teams, "me", now - 48 * 3600e3, now);
    expect(e.map((x) => x.key)).toEqual(["mercado:m1", "clausula:2026-11-12T10:00:00Z"]);
    expect(e[0].text).toContain("lo vende Jonix");
    expect(e[1].short).toBe("Cláusula libre de Lamine: 9 M");
  });
  it("si no sigues a nadie, nada", () => {
    expect(watchEvents(new Set(), market, teams, "me", 0, now)).toEqual([]);
  });
});
