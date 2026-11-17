import { describe, expect, it } from "vitest";
import { bidReminderText, marketPlanSlot, planChanged, marketRefresh, pendingBids } from "../src/lib/plan/mercado-hora";

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
    expect(t).toContain("se renueva hoy a las 19:00");
    expect(t).toContain("(en 1 h 15 min)");
    expect(t).toContain("• Puja 2 M por Uno");
  });
});

describe("día de la renovación", () => {
  it("hoy, mañana u otro día", async () => {
    const { hourText } = await import("../src/lib/plan/mercado-hora");
    const n = new Date("2026-11-10T13:38:00+01:00");
    expect(hourText(new Date("2026-11-10T19:03:00+01:00"), n)).toBe("hoy a las 19:03");
    expect(hourText(new Date("2026-11-11T13:14:00+01:00"), n)).toBe("mañana a las 13:14");
    expect(hourText(new Date("2026-11-12T13:14:00+01:00"), n)).toBe("el jueves a las 13:14");
  });
});

describe("plan al ritmo del mercado", () => {
  const refresh = new Date("2026-11-18T12:14:00Z"); // el mercado de hoy salió el 17 a las 13:14 de Madrid
  const at = (iso: string) => marketPlanSlot(refresh, new Date(iso));
  it("nada más salir el mercado (desde 10 min)", () => {
    expect(at("2026-11-17T12:20:00Z")).toBeNull();
    expect(at("2026-11-17T12:30:00Z")?.kind).toBe("nuevo");
    expect(at("2026-11-17T12:30:00Z")?.key).toBe("nuevo:2026-11-17T12:14:00.000Z");
  });
  it("12 h después; si cae de noche, a las 8", () => {
    expect(at("2026-11-18T00:30:00Z")).toBeNull(); // 01:30 en Madrid: de noche
    expect(at("2026-11-18T07:00:00Z")?.kind).toBe("medio"); // 08:00 en Madrid
    expect(at("2026-11-18T08:30:00Z")).toBeNull(); // más de 20 h
  });
  it("sin hora de mercado, nada", () => expect(marketPlanSlot(null, new Date())).toBeNull());
});

describe("¿ha cambiado el plan?", () => {
  const a = (tipo: string, playerId: string, hecho = false) => ({ tipo, playerId, hecho });
  it("mismas acciones (aunque cambien cifras o avisos): no", () => {
    expect(planChanged([a("pujar", "1"), a("aviso", "9")], [a("pujar", "1"), a("saldo", "")])).toBe(false);
  });
  it("otro jugador o una acción nueva: sí", () => {
    expect(planChanged([a("pujar", "1")], [a("pujar", "2")])).toBe(true);
    expect(planChanged([a("pujar", "1")], [a("pujar", "1"), a("vender", "3")])).toBe(true);
  });
  it("hacer lo que decía o que algo deje de hacer falta: no", () => {
    expect(planChanged([a("pujar", "1"), a("vender", "2")], [a("pujar", "1", true)])).toBe(false);
  });
});
