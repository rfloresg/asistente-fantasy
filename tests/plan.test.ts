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
  const plan = dailyPlan({ now, myTeam, myMoney: 16_500_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: rivalTeam }], market, scores });
  const byTipo = (t: string) => plan.filter((a) => a.tipo === t).map((a) => a.jugador);

  it("protege a la estrella: su cláusula está por debajo de lo que vale → subirla justo por encima", () => {
    // le compensa a un rival hasta 21,6 M (18 M + 20 %): subirla a 22,68 M cuesta 1,34 M
    expect(byTipo("proteger")).toEqual(["Estrella"]);
    expect(plan.find((a) => a.jugador === "Estrella")!.texto).toContain("de 20 M a 22,68 M: te cuesta 1,34 M");
  });
  it("si subirla cuesta más del 25 % de tu dinero, blindar", () => {
    const p = dailyPlan({ now, myTeam, myMoney: 4_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: rivalTeam }], market: [], scores });
    expect(p.find((a) => a.jugador === "Estrella")!.texto).toContain("Blinda");
  });
  it("no protege si la cláusula ya es cara o ningún rival llega", () => {
    const p = dailyPlan({ now, myTeam, myMoney: 40_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 10_000_000, team: rivalTeam }], market: [], scores });
    expect(p.filter((a) => a.tipo === "proteger")).toEqual([]);
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
    const p = dailyPlan({ now, myTeam, myMoney: 16_500_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: rivalTeam }], market: [caro, ...market], scores: sc2 });
    expect(p.map((a) => a.jugador)).not.toContain("Mbappé");
    // 16,5 - 1,34 (subir cláusula) - 12 (Crack) = 3,16 M: la puja de 5,6 M por Chollo pide vender antes
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

describe("presupuesto tras subir cláusulas", () => {
  it("la subida de cláusula propuesta se descuenta antes de clausular", () => {
    // 10 M: subir la de Estrella cuesta 1,34 M (cabe en el 25 %); Crack cuesta 12 M → ya no llegas, aunque sin subida tampoco
    const crack = { ...rivalTeam, players: [tp("10", "Crack", 9_500_000)] };
    const sc = new Map(scores).set("10", score(88, 9_000_000));
    const p = dailyPlan({ now, myTeam, myMoney: 10_000_000, rivals: [{ teamId: "r1", manager: "Jonix", money: 30_000_000, team: crack }], market: [], scores: sc });
    expect(p.some((a) => a.tipo === "proteger" && a.texto.includes("Sube la cláusula"))).toBe(true);
    expect(p.some((a) => a.jugador === "Crack")).toBe(false); // 10 - 1,34 = 8,66 < 9,5
  });
  it("no propone especular si no se gana casi nada", () => {
    const m: MarketItem = { id: "x", salePrice: 570_000, expirationDate: "", status: "on_sale", playerMaster: { id: "40", nickname: "Andrés", marketValue: 1, positionId: 2, playerStatus: "ok" } };
    const sc = new Map(scores).set("40", score(50, 570_000, { maxBidSpec: 575_000 }));
    const p = dailyPlan({ now, myTeam, myMoney: 10_000_000, rivals: [], market: [m], scores: sc });
    expect(p.some((a) => a.jugador === "Andrés")).toBe(false);
  });
});

describe("modo dinero", () => {
  const m = (id: string, nick: string, price: number): MarketItem => ({ id: `m${id}`, salePrice: price, expirationDate: "", status: "on_sale", playerMaster: { id, nickname: nick, marketValue: price, positionId: 3, playerStatus: "ok" } });
  const sube = score(50, 2_000_000, { expected: 2_600_000, maxBidSpec: 2_500_000 });
  const baja = score(55, 6_000_000, { expected: 5_400_000 });
  const sc = new Map(scores).set("50", sube).set("2", baja);
  const run = (money?: boolean) => dailyPlan({ now, myTeam, myMoney: 10_000_000, rivals: [], market: [m("50", "Cohete", 2_000_000)], scores: sc, money });

  it("puja para especular si se espera que suba, y dice cuánto", () => {
    const a = run().find((x) => x.jugador === "Cohete")!;
    expect(a.tipo).toBe("pujar");
    expect(a.texto).toContain("para ganar dinero: esperamos que valga 2,6 M en 7 días (+30 % sobre lo que pide)");
  });
  it("vende al que va a bajar aunque su nota no sea de vender", () => {
    const a = run().find((x) => x.tipo === "vender" && x.jugador === "Malo")!;
    expect(a.texto).toContain("Va a bajar: esperamos que valga 5,4 M en 7 días, 0,6 M menos.");
  });
  it("apagado: ni especula ni vende por la bajada", () => {
    const p = run(false);
    expect(p.some((x) => x.jugador === "Cohete")).toBe(false);
    expect(p.find((x) => x.jugador === "Malo")?.texto ?? "").not.toContain("Va a bajar");
  });
});

import { actionKey, applyDone, type Accion } from "../src/lib/plan/plan";

describe("botón Hecho", () => {
  const a = (tipo: Accion["tipo"], playerId?: string): Accion => ({ tipo, prioridad: 2, playerId, texto: "x", titulo: "t" });
  const acc = [a("proteger", "1"), a("pujar", "2"), a("vender", "3"), a("vender", "4"), a("alinear")];
  const done = new Set([actionKey(acc[0]), actionKey(acc[1])]);
  const out = applyDone(acc, done, new Set(["4"]));
  it("si se podía comprobar y sigue saliendo, vuelve con aviso", () => {
    expect(out[0].pendiente).toContain("sigue igual");
    expect(out[0].hecho).toBeFalsy();
  });
  it("las pujas no se pueden comprobar: quedan como hechas", () => {
    expect(out[1].hecho).toBe(true);
  });
  it("vender: si ya está a la venta, hecho aunque no lo marcaras", () => {
    expect(out[2].hecho).toBeFalsy();
    expect(out[3]).toMatchObject({ hecho: true, detalle: "Ya está a la venta." });
  });
  it("cada acción lleva su clave y el mensaje de Telegram no repite lo hecho", () => {
    expect(out[2].key).toBe("vender:3");
    expect(planMessage("L", 1, out.map((x) => ({ ...x, titulo: undefined })))).not.toContain("Ya está a la venta");
  });
});
