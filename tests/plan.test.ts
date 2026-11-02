import { describe, expect, it } from "vitest";
import { dailyPlan, planMessage, type Score } from "../src/lib/plan/plan";
import type { MarketItem, Team, TeamPlayer } from "../src/lib/espia/league";

const now = new Date("2026-11-03T10:00:00+01:00");
const tp = (id: string, nickname: string, clause: number, extra: Partial<TeamPlayer> = {}, status = "ok"): TeamPlayer => ({
  buyoutClause: clause,
  buyoutClauseLockedEndTime: "2026-10-01T10:00:00+02:00",
  playerMaster: { id, nickname, playerStatus: status, marketValue: 1 },
  ...extra,
});
const score = (nota: number, value: number, s: Partial<Score> = {}): Score => ({
  nota, value, action: nota >= 70 ? "fichar" : nota < 40 ? "vender" : "mantener",
  maxBidPlay: Math.round(value * 1.2), maxBidSpec: null, formAvg: 6, startProb: 80, ...s,
});

const myTeam: Team = {
  id: "me",
  players: [
    tp("1", "Estrella", 20_000_000),
    tp("2", "Malo", 3_000_000, {}, "injured"),
    tp("3", "Recién", 30_000_000, { buyoutClauseLockedEndTime: "2026-11-04T08:00:00+01:00" }),
  ],
};
const rivalTeam: Team = { id: "r1", manager: { id: "9", managerName: "Jonix" }, players: [
  tp("10", "Crack", 12_000_000),
  tp("11", "Bloqueado", 5_000_000, { buyoutClauseLockedEndTime: "2026-11-10T10:00:00+01:00" }),
  tp("12", "Blindado", 5_000_000, { isShielded: true }),
] };
const market: MarketItem[] = [
  { id: "m1", salePrice: 5_000_000, expirationDate: "", status: "on_sale", numberOfBids: 1, playerMaster: { id: "20", nickname: "Chollo", marketValue: 5_000_000, positionId: 3, playerStatus: "ok" } },
  { id: "m2", salePrice: 9_000_000, expirationDate: "", status: "on_sale", playerMaster: { id: "21", nickname: "Caro", marketValue: 9_000_000, positionId: 3, playerStatus: "ok" } },
];
const scores = new Map<string, Score>([
  ["1", score(85, 18_000_000)],
  ["2", score(30, 3_000_000)],
  ["3", score(80, 25_000_000)],
  ["10", score(88, 11_000_000)],
  ["11", score(90, 4_000_000)],
  ["12", score(90, 4_000_000)],
  ["20", score(82, 5_000_000)],
  ["21", score(50, 9_000_000)],
]);

describe("plan del día", () => {
  const plan = dailyPlan({ now, myTeam, myMoney: 15_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: rivalTeam }], market, scores });
  const byTipo = (t: string) => plan.filter((a) => a.tipo === t).map((a) => a.jugador);

  it("protege a la estrella: la cláusula está al alcance del rival y subirla cuesta demasiado → blindar", () => {
    // subir a 31,5 M cuesta 5,75 M > 25 % de 15 M → blindaje
    expect(byTipo("proteger")).toEqual(["Estrella"]);
    expect(plan.find((a) => a.jugador === "Estrella")!.texto).toContain("Blinda");
  });
  it("avisa de la cláusula que se libera en menos de 24 h", () => {
    expect(byTipo("aviso")).toEqual(["Recién"]);
  });
  it("clausulazo solo si está abierta, sin blindaje, compensa y llego", () => {
    expect(byTipo("clausulazo")).toEqual(["Crack"]);
  });
  it("puja por el chollo con nota de fichar, no por el caro", () => {
    expect(byTipo("pujar")).toEqual(["Chollo"]);
    expect(plan.find((a) => a.jugador === "Chollo")!.texto).toContain("Puja 5,6 M"); // +12 % porque ya hay puja
  });
  it("no propone lo que no puedes pagar ni vendiendo, y reparte el presupuesto", () => {
    const caro: MarketItem = { id: "m3", salePrice: 180_000_000, expirationDate: "", status: "on_sale", playerMaster: { id: "30", nickname: "Mbappé", marketValue: 1, positionId: 4, playerStatus: "ok" } };
    const sc2 = new Map(scores).set("30", score(95, 180_000_000));
    const p = dailyPlan({ now, myTeam, myMoney: 15_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: rivalTeam }], market: [caro, ...market], scores: sc2 });
    expect(p.map((a) => a.jugador)).not.toContain("Mbappé");
    // tras clausular a Crack (12 M) te quedan 3 M: la puja de 5,6 M por Chollo pide vender antes
    expect(p.find((a) => a.jugador === "Chollo")!.texto).toContain("tendrás que vender antes");
  });
  it("vende al de nota baja", () => {
    expect(byTipo("vender")).toEqual(["Malo"]);
  });
  it("sube la cláusula si es barato respecto a tu dinero", () => {
    const p = dailyPlan({ now, myTeam, myMoney: 40_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 21_000_000, team: rivalTeam }], market: [], scores });
    expect(p.find((a) => a.jugador === "Estrella")!.texto).toContain("Sube la cláusula de <b>Estrella</b> de 20 M a 22,05 M: te cuesta 1,03 M");
  });
  it("saldo negativo primero", () => {
    const p = dailyPlan({ now, myTeam, myMoney: -2_000_000, rivals: [], market: [], scores });
    expect(p[0].tipo).toBe("saldo");
    expect(p[0].texto).toContain("<b>Malo</b>");
  });
  it("mensaje agrupado", () => {
    const text = planMessage("KFC Fantasy", 15_000_000, plan);
    expect(text.indexOf("Protege")).toBeLessThan(text.indexOf("Clausulazos"));
    expect(planMessage("X", 1, [])).toContain("Nada urgente");
  });
});
