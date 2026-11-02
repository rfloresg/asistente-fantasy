import { describe, expect, it } from "vitest";
import { bestLineup, expectedPoints, type LineupPlayer } from "../src/lib/plan/lineup";
import { dailyPlan, planMessage } from "../src/lib/plan/plan";

const pl = (id: string, positionId: number, formAvg: number, extra: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id, name: id, positionId, status: "ok", formAvg, startProb: 80, ...extra,
});

describe("puntos esperados", () => {
  it("forma × probabilidad de jugar × estado", () => {
    expect(expectedPoints(pl("a", 3, 10, { startProb: 100 }))).toBe(10);
    expect(expectedPoints(pl("a", 3, 10, { startProb: 0 }))).toBe(1.5);
    expect(expectedPoints(pl("a", 3, 10, { startProb: null }))).toBe(10);
    expect(expectedPoints(pl("a", 3, 10, { status: "injured" }))).toBe(0);
    expect(expectedPoints(pl("a", 3, 10, { status: "doubtful", startProb: 100 }))).toBe(5);
  });
});

describe("mejor once", () => {
  const squad = [
    pl("POR1", 1, 5), pl("POR2", 1, 2),
    pl("D1", 2, 6), pl("D2", 2, 5), pl("D3", 2, 4), pl("D4", 2, 1), pl("D5", 2, 0.5),
    pl("M1", 3, 9), pl("M2", 3, 8), pl("M3", 3, 7), pl("M4", 3, 6), pl("M5", 3, 5),
    pl("A1", 4, 10, { startProb: 100 }), pl("A2", 4, 3), pl("A3", 4, 9, { status: "injured" }),
    pl("ENT", 5, 20),
  ];
  const l = bestLineup(squad)!;
  it("elige la formación que más suma y nunca a lesionados ni entrenadores", () => {
    expect(l.formation).toBe("3-5-2");
    expect(l.starters).toHaveLength(11);
    expect(l.starters.map((p) => p.id)).not.toContain("A3");
    expect(l.starters.map((p) => p.id)).not.toContain("ENT");
  });
  it("capitán: el de más puntos esperados", () => {
    expect(l.captain!.id).toBe("A1");
    expect(l.out.map((p) => p.id)).toEqual(["A3"]);
  });
  it("detecta huecos: titulares por obligación que no van a jugar", () => {
    const thin = [pl("POR1", 1, 5, { startProb: 5 }), ...squad.filter((p) => p.positionId !== 1)];
    const t = bestLineup(thin)!;
    expect(t.holes.map((p) => p.id)).toEqual(["POR1"]);
    expect(t.out.map((p) => p.id)).not.toContain("POR1");
    const acc = dailyPlan({ now: new Date(), myTeam: { id: "t", players: [] }, myMoney: 1, rivals: [], market: [], scores: new Map(), lineup: t });
    expect(planMessage("L", 1, acc)).toContain("<b>POR1</b> (POR, 5 %) entra por obligación y no va a jugar. Ficha un portero que juegue.");
    // y en las pujas aparece un portero titular aunque su nota no sea de "fichar"
    const gk = { id: "m", salePrice: 1_000_000, expirationDate: "", status: "on_sale", playerMaster: { id: "gk", nickname: "Portero", marketValue: 1, positionId: 1, playerStatus: "ok" } };
    const sc = new Map([["gk", { nota: 58, action: "mantener" as const, value: 1_000_000, maxBidPlay: 1_000_000, maxBidSpec: null, formAvg: 4, startProb: 90 }]]);
    const acc2 = dailyPlan({ now: new Date(), myTeam: { id: "t", players: [] }, myMoney: 5_000_000, rivals: [], market: [gk], scores: sc, lineup: t });
    expect(acc2.find((a) => a.tipo === "pujar")!.texto).toContain("Te falta un titular en su puesto");
  });
  it("sale en el plan", () => {
    const acc = dailyPlan({ now: new Date(), myTeam: { id: "t", players: [] }, myMoney: 1, rivals: [], market: [], scores: new Map(), lineup: l });
    const text = planMessage("Liga", 1, acc);
    expect(text).toContain("Alinea un <b>3-5-2</b>");
    expect(text).toContain("Capitán: <b>A1</b>");
    expect(text).toContain("No alinees: <b>A3</b>");
  });
});

describe("ventas y puestos", () => {
  it("no propone vender al último defensa que puede jugar", () => {
    const squad = [
      pl("POR", 1, 5), pl("D1", 2, 6), pl("D2", 2, 5), pl("D3", 2, 1),
      pl("M1", 3, 9), pl("M2", 3, 8), pl("M3", 3, 7), pl("M4", 3, 6), pl("A1", 4, 10), pl("A2", 4, 9), pl("A3", 4, 8),
    ];
    const l = bestLineup(squad)!;
    const team = { id: "t", players: squad.map((p) => ({ playerMaster: { id: p.id, nickname: p.id, playerStatus: "ok", marketValue: 1 } })) };
    const scores = new Map(squad.map((p) => [p.id, { nota: p.id === "D3" || p.id === "M4" ? 20 : 70, action: "mantener" as const, value: 1_000_000, maxBidPlay: 1_000_000, maxBidSpec: null, formAvg: p.formAvg, startProb: 80 }]));
    const acc = dailyPlan({ now: new Date(), myTeam: team, myMoney: 1, rivals: [], market: [], scores, lineup: l });
    const sells = acc.filter((a) => a.tipo === "vender").map((a) => a.jugador);
    expect(sells).toContain("M4"); // le sobran centrocampistas
    expect(sells).not.toContain("D3"); // sin él no llega a 3 defensas
  });
});

describe("huecos sin mercado", () => {
  const squad = [pl("POR1", 1, 5, { startProb: 5 }), pl("D1", 2, 6), pl("D2", 2, 5), pl("D3", 2, 4), pl("M1", 3, 9), pl("M2", 3, 8), pl("M3", 3, 7), pl("M4", 3, 6), pl("A1", 4, 10), pl("A2", 4, 9), pl("A3", 4, 8)];
  const l = bestLineup(squad)!;
  const myTeam = { id: "t", players: [] };
  const rival = { teamId: "r", manager: "Jonix", money: 50_000_000, team: { id: "r", players: [
    { buyoutClause: 3_000_000, buyoutClauseLockedEndTime: "2026-01-01T00:00:00Z", playerMaster: { id: "gk", nickname: "Meta", playerStatus: "ok", marketValue: 1 } },
  ] } };
  const scores = new Map([["gk", { nota: 60, action: "mantener" as const, value: 2_500_000, maxBidPlay: 2_500_000, maxBidSpec: null, formAvg: 5, startProb: 95 }]]);
  const positions = new Map([["gk", 1]]);
  it("propone clausular un portero titular de un rival si llegas", () => {
    const acc = dailyPlan({ now: new Date(), myTeam, myMoney: 5_000_000, rivals: [rival], market: [], scores, lineup: l, positions });
    expect(acc.find((a) => a.jugador === "Meta")!.texto).toContain("Te falta un portero titular y no hay en el mercado: clausula a <b>Meta</b>");
  });
  it("cubrir el hueco va antes que otras pujas", () => {
    const med = { id: "mm", salePrice: 3_000_000, expirationDate: "", status: "on_sale", playerMaster: { id: "med", nickname: "Medio", marketValue: 1, positionId: 3, playerStatus: "ok" } };
    const sc2 = new Map(scores).set("med", { nota: 90, action: "fichar" as const, value: 3_000_000, maxBidPlay: 3_600_000, maxBidSpec: null, formAvg: 8, startProb: 90 });
    const acc = dailyPlan({ now: new Date(), myTeam, myMoney: 5_000_000, rivals: [rival], market: [med], scores: sc2, lineup: l, positions });
    expect(acc.some((a) => a.jugador === "Meta")).toBe(true);
    expect(acc.some((a) => a.jugador === "Medio")).toBe(false); // ya no llega
  });
  it("si no llegas, avisa", () => {
    const acc = dailyPlan({ now: new Date(), myTeam, myMoney: 1_000_000, rivals: [rival], market: [], scores, lineup: l, positions });
    expect(acc.some((a) => a.texto.includes("hoy no hay ninguno a tu alcance"))).toBe(true);
  });
});
