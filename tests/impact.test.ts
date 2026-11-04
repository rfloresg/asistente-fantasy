import { describe, expect, it } from "vitest";
import type { MarketItem, Team, TeamPlayer } from "../src/lib/espia/league";
import { impact } from "../src/lib/plan/impact";
import { bestLineup, type LineupPlayer } from "../src/lib/plan/lineup";
import { dailyPlan, type Score } from "../src/lib/plan/plan";

// Plantilla completa en 4-3-3 con puntos esperados (xp) por partido
const P = (id: string, positionId: number, xp: number): LineupPlayer => ({ id, name: id, positionId, status: "ok", formAvg: xp, startProb: null, xp });
const squad = [
  P("POR", 1, 5), P("D1", 2, 6), P("D2", 2, 5), P("D3", 2, 5), P("D4", 2, 4), P("D5", 2, 1),
  P("M1", 3, 8), P("M2", 3, 6), P("M3", 3, 5), P("M4", 3, 2), P("A1", 4, 9), P("A2", 4, 6), P("A3", 4, 5),
];
const now = new Date("2026-11-04T10:00:00+01:00");
const tp = (p: LineupPlayer, clause: number, extra: Partial<TeamPlayer> = {}): TeamPlayer => ({
  buyoutClause: clause, buyoutClauseLockedEndTime: "2026-10-01T10:00:00+02:00",
  playerMaster: { id: p.id, nickname: p.id, playerStatus: "ok", marketValue: 1 }, ...extra,
});
const score = (xp: number, value: number, s: Partial<Score> = {}): Score => ({
  nota: 75, action: "fichar", value, maxBidPlay: Math.round(value * 1.2), maxBidSpec: null, formAvg: xp, startProb: null, xp, ...s,
});
const myTeam: Team = { id: "me", players: squad.map((p) => tp(p, 10_000_000)) };
const scores = new Map<string, Score>(squad.map((p) => [p.id, score(p.xp!, 10_000_000)]));
const lineup = bestLineup(squad)!;
const sale = (id: string, pos: number, price: number): MarketItem => ({ id: `m${id}`, salePrice: price, expirationDate: "", status: "on_sale", playerMaster: { id, nickname: id, marketValue: price, positionId: pos, playerStatus: "ok" } });

describe("lo que cambia tu once", () => {
  const imp = impact(squad, true); // liga Premium: con capitán
  it("ganas lo que mejora sobre tu peor titular del puesto (o la formación)", () => {
    expect(imp.gain(P("X", 4, 7))).toBeGreaterThan(1); // mejor que A3 (5)
    expect(imp.gain(P("Y", 3, 1))).toBe(0); // peor que todos tus medios: banquillo
  });
  it("pierdes lo que aporta; el suplente no aporta", () => {
    expect(imp.loss("A1")).toBeGreaterThan(7); // capitán: cuenta doble (y el que entra no es tan bueno)
    expect(impact(squad).loss("A1")).toBeLessThan(imp.loss("A1")); // sin capitán, pierdes menos
    expect(imp.loss("D5")).toBe(0);
  });
});

describe("plan con puntos esperados", () => {
  it("puja por quien mejora tu once y lo dice en puntos; no por quien sería suplente aunque su nota sea de fichar", () => {
    const market = [sale("BUENO", 4, 5_000_000), sale("BANQUILLO", 3, 5_000_000)];
    const sc = new Map(scores).set("BUENO", score(8, 5_000_000)).set("BANQUILLO", score(3, 5_000_000));
    const plan = dailyPlan({ now, myTeam, myMoney: 20_000_000, rivals: [], market, scores: sc, lineup });
    const bids = plan.filter((a) => a.tipo === "pujar");
    expect(bids.map((a) => a.jugador)).toEqual(["BUENO"]);
    expect(bids[0].detalle).toContain("mejora tu once en +");
    expect(bids[0].detalle).toContain("pts por jornada");
  });
  it("protege a quien más perderías y no al suplente aunque tenga la cláusula barata", () => {
    // A1 (capitán) y D5 (suplente) con la cláusula igual a su valor: a un rival le compensa
    const team: Team = { id: "me", players: squad.map((p) => tp(p, ["A1", "D5"].includes(p.id) ? 10_000_000 : 40_000_000)) };
    const rival: Team = { id: "r", manager: { id: "9", managerName: "Jonix" }, players: [] };
    const plan = dailyPlan({ now, myTeam: team, myMoney: 30_000_000, rivals: [{ teamId: "r", manager: "Jonix", money: 50_000_000, team: rival }], market: [], scores, lineup });
    const prot = plan.filter((a) => a.tipo === "proteger");
    expect(prot.map((a) => a.jugador)).toEqual(["A1"]);
    expect(prot[0].detalle).toContain("tu once pierde");
  });
  it("clausula al que más puntos da por millón", () => {
    const rivalTeam: Team = { id: "r", manager: { id: "9", managerName: "Jonix" }, players: [tp(P("CARO", 4, 9), 30_000_000), tp(P("BARATO", 4, 8), 8_000_000)] };
    const sc = new Map(scores).set("CARO", score(9, 30_000_000)).set("BARATO", score(8, 8_000_000));
    const plan = dailyPlan({ now, myTeam, myMoney: 35_000_000, rivals: [{ teamId: "r", manager: "Jonix", money: 1, team: rivalTeam }], market: [], scores: sc, lineup, positions: new Map([["CARO", 4], ["BARATO", 4]]) });
    expect(plan.filter((a) => a.tipo === "clausulazo")[0].jugador).toBe("BARATO");
  });
});
