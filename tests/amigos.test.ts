import { describe, expect, it } from "vitest";
import { dailyPlan, type Accion, type Score } from "../src/lib/plan/plan";
import { friendClaims } from "../src/lib/plan/amigos";
import type { MarketItem, Team } from "../src/lib/espia/league";

const now = new Date("2026-11-03T10:00:00+01:00");
const score = (nota: number, value: number): Score => ({ nota, value, action: "fichar", maxBidPlay: Math.round(value * 1.2), maxBidSpec: null, formAvg: 6, startProb: 80 });
const item = (id: string, nickname: string, price: number): MarketItem =>
  ({ id: `m${id}`, salePrice: price, expirationDate: "", status: "on_sale", playerMaster: { id, nickname, marketValue: price, positionId: 3, playerStatus: "ok" } });
const myTeam: Team = { id: "me", players: [] };
const market = [item("20", "Bueno", 5_000_000), item("21", "Otro", 5_000_000), item("22", "Tercero", 5_000_000), item("23", "Cuarto", 5_000_000)];
const scores = new Map<string, Score>([["20", score(90, 5_000_000)], ["21", score(85, 5_000_000)], ["22", score(80, 5_000_000)], ["23", score(75, 5_000_000)]]);
const base = { now, myTeam, myMoney: 100_000_000, rivals: [], market, scores, money: false };

describe("amigos en la misma liga", () => {
  it("recoge a por quién va cada amigo (pujas y clausulazos, no el resto)", () => {
    const acc = (tipo: Accion["tipo"], playerId: string): Accion => ({ tipo, playerId, prioridad: 1, texto: "" });
    const m = friendClaims([{ name: "Ayman", acciones: [acc("pujar", "20"), acc("vender", "5")] }, { name: "Jonix", acciones: [acc("clausulazo", "30"), acc("pujar", "20")] }]);
    expect([...m]).toEqual([["20", "Ayman"], ["30", "Jonix"]]);
  });
  it("lo que busca un amigo pasa al final: el plan elige otros", () => {
    const solo = dailyPlan(base).filter((a) => a.tipo === "pujar").map((a) => a.jugador);
    expect(solo).toEqual(["Bueno", "Otro", "Tercero"]);
    const con = dailyPlan({ ...base, friends: new Map([["20", "Ayman"]]) }).filter((a) => a.tipo === "pujar").map((a) => a.jugador);
    expect(con).toEqual(["Otro", "Tercero", "Cuarto"]);
  });
  it("si no hay alternativa, lo propone con aviso", () => {
    const p = dailyPlan({ ...base, market: [market[0]], friends: new Map([["20", "Ayman"]]) });
    const a = p.find((x) => x.jugador === "Bueno")!;
    expect(a.texto).toContain("Ayman también lo tiene en su plan");
    expect(a.detalle).toContain("os pisáis");
  });
});
