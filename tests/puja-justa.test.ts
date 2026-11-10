import { describe, expect, it } from "vitest";
import { fairBid, fairBidText, pastBuys, type PastBuy } from "../src/lib/plan/puja-justa";
import { playCap } from "../src/lib/plan/plan";

const now = new Date("2026-11-10T12:00:00+01:00");
const buy = (buyer: string, manager: string, over: number, value = 5_000_000, daysAgo = 10): PastBuy =>
  ({ buyer, manager, over, value, position: 3, at: new Date(now.getTime() - daysAgo * 86400e3) });

// Jonix paga mucho de más; Ana, poco
const history = [
  ...[0.02, 0.03, 0.04, 0.05].map((o) => buy("t2", "Ana", o)),
  ...[0.08, 0.1, 0.12, 0.15].map((o) => buy("t3", "Jonix", o)),
];
const rivals = [{ teamId: "t2", manager: "Ana", money: 20e6 }, { teamId: "t3", manager: "Jonix", money: 20e6 }];

describe("puja justa", () => {
  it("supera 3 de cada 4 fichajes parecidos, con un 1 % más para no empatar", () => {
    const f = fairBid({ price: 5e6, hasBids: false, cap: 8e6, history, rivals, now })!;
    expect(f.over).toBeCloseTo(0.11, 2); // percentil 75 = 0,10 + 0,01
    expect(f.bid).toBe(5_550_000);
    expect(f.beats).toBeGreaterThanOrEqual(0.75);
    expect(f.boldest?.manager).toBe("Jonix");
    expect(fairBidText(f)).toContain("con +11 % habrías superado 8 de cada 10 fichajes parecidos");
  });
  it("si el que más paga no tiene dinero, solo cuentan los que pueden", () => {
    const pobres = [{ teamId: "t2", manager: "Ana", money: 20e6 }, { teamId: "t3", manager: "Jonix", money: 1e6 }];
    const more = [...history, ...[0.03, 0.04].map((o) => buy("t2", "Ana", o))];
    const f = fairBid({ price: 5e6, hasBids: false, cap: 8e6, history: more, rivals: pobres, now })!;
    expect(f.over).toBeLessThan(0.07);
    expect(f.boldest?.manager).toBe("Ana");
  });
  it("nadie puede pagarlo: el mínimo", () => {
    const f = fairBid({ price: 5e6, hasBids: false, cap: 8e6, history, rivals: rivals.map((r) => ({ ...r, money: 1e6 })), now })!;
    expect(f).toMatchObject({ noRival: true, bid: 5e6 });
  });
  it("basta con superar al más rico de los que pueden", () => {
    const f = fairBid({ price: 5e6, hasBids: false, cap: 8e6, history, rivals: rivals.map((r) => ({ ...r, money: 5.2e6 })), now })!;
    expect(f.bid).toBe(5_210_000);
  });
  it("nunca por encima de tu tope; sin historial suficiente, nada", () => {
    const capped = fairBid({ price: 5e6, hasBids: true, cap: 5.3e6, history, rivals, now })!;
    expect(capped.bid).toBe(5.3e6);
    expect(capped.wanted).toBeGreaterThan(5.3e6);
    expect(fairBidText(capped, 5e6)).toContain("con tu tope tienes pocas opciones");
    expect(fairBid({ price: 5e6, hasBids: false, cap: 8e6, history: history.slice(0, 3), rivals, now })).toBeNull();
    // fichajes de jugadores de otro precio no cuentan
    expect(fairBid({ price: 40e6, hasBids: false, cap: 50e6, history, rivals: rivals.map((r) => ({ ...r, money: 100e6 })), now })).toBeNull();
  });
});

describe("fichajes de la liga", () => {
  it("sobreprecio con el valor de ese día; fuera los que no cuadran y los tuyos se reconocen", () => {
    const acts = [
      { activityTypeId: 1, user1Id: 20, playerMasterId: 7, amount: 5_200_000, createdAt: "2026-11-05T19:00:00+01:00" },
      { activityTypeId: 1, user1Id: 20, playerMasterId: 8, amount: 9_000_000, createdAt: "2026-11-05T19:00:00+01:00" }, // +80 %: rareza
      { activityTypeId: 33, user1Id: 20, playerMasterId: 7, amount: 5_000_000, createdAt: "2026-11-05T19:00:00+01:00" }, // venta
    ];
    const r = pastBuys(acts, (_id, day) => (day === "2026-11-05" ? 5_000_000 : undefined), () => 3, (u) => (u === "20" ? { teamId: "t2", manager: "Ana" } : undefined));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ buyer: "t2", manager: "Ana", position: 3 });
    expect(r[0].over).toBeCloseTo(0.04, 5);
  });
});

describe("tope para jugar según lo que te da", () => {
  it("compensa pagar de más lo que devuelve en puntos (100.000 € por punto, 8 jornadas)", () => {
    // +1,8 pts por jornada = 1,44 M en 8 jornadas
    expect(playCap(7e6, 7.31e6, 1.8)).toEqual({ cap: 8_440_000, byPoints: true });
    // si aporta poco, manda el tope de la nota
    expect(playCap(7e6, 7.31e6, 0.2)).toEqual({ cap: 7.31e6, byPoints: false });
    expect(playCap(7e6, 7.31e6, null)).toEqual({ cap: 7.31e6, byPoints: false });
    // nunca más de un 50 % sobre el valor
    expect(playCap(2e6, 2.1e6, 3).cap).toBe(3e6);
  });
});
