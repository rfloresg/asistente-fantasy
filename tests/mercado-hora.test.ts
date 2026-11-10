import { describe, expect, it } from "vitest";
import { bidReminderText, marketRefresh, pendingBids } from "../src/lib/plan/mercado-hora";

const now = new Date("2026-11-10T17:45:00+01:00");
const item = (id: string, exp: string, seller = false) => ({
  expirationDate: exp, sellerTeam: seller ? { manager: { managerName: "Ana" } } : null,
  playerMaster: { id, nickname: id, marketValue: 1, positionId: 3, playerStatus: "ok" },
});
const market = [
  item("1", "2026-11-10T19:00:00+01:00"), item("2", "2026-11-10T19:00:00+01:00"),
  item("3", "2026-11-10T18:10:00+01:00", true), // lo vende un mánager: caduca a su hora, no cuenta
];

describe("hora del mercado", () => {
  it("la renovación es cuando caducan los de la liga", () => {
    expect(marketRefresh(market, now)?.toISOString()).toBe(new Date("2026-11-10T19:00:00+01:00").toISOString());
    expect(marketRefresh([], now)).toBeNull();
  });
  it("pujas pendientes: las que no has hecho y siguen en el mercado", () => {
    const acc = [
      { tipo: "pujar", playerId: "1", titulo: "Puja 2 M por Uno", key: "pujar:1" },
      { tipo: "pujar", playerId: "2", titulo: "Puja 3 M por Dos", key: "pujar:2" },
      { tipo: "pujar", playerId: "9", titulo: "Puja 1 M por Fuera", key: "pujar:9" },
      { tipo: "vender", playerId: "1", titulo: "Vende" },
    ];
    const p = pendingBids(acc, market, new Set(["pujar:2"]));
    expect(p.map((a) => a.playerId)).toEqual(["1"]);
    const t = bidReminderText(new Date("2026-11-10T19:00:00+01:00"), now, p, (s) => s);
    expect(t).toContain("se renueva a las 19:00");
    expect(t).toContain("(en 1 h 15 min)");
    expect(t).toContain("• Puja 2 M por Uno");
  });
});
