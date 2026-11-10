import { describe, expect, it } from "vitest";
import { parseOffers, type Team, type TeamPlayer } from "../src/lib/espia/league";
import { applyDone, dailyPlan, type Score } from "../src/lib/plan/plan";

const now = new Date("2026-11-10T10:00:00+01:00");
const tp = (id: string, nickname: string): TeamPlayer => ({ buyoutClause: 50e6, buyoutClauseLockedEndTime: "2026-12-01T10:00:00+01:00", playerMaster: { id, nickname, playerStatus: "ok", marketValue: 1 } });
const score = (value: number, s: Partial<Score> = {}): Score => ({ nota: 55, action: "mantener", value, maxBidPlay: value, maxBidSpec: null, formAvg: 4, startProb: 80, expected: value, ...s });
// Clave: su salida hace perder 2 pts por jornada; Suplente: no entra en el once
const lineup = (keyLoss: boolean) => {
  const pl = (id: string, name: string, pos: number, expected: number) => ({ id, name, positionId: pos, expected, startProb: 90, status: "ok", nota: 60, value: 5e6 });
  const xi = [pl("g", "Por", 1, 3), pl("d1", "D1", 2, 3), pl("d2", "D2", 2, 3), pl("d3", "D3", 2, 3), pl("m1", "M1", 3, 3), pl("m2", "M2", 3, 3), pl("m3", "M3", 3, 3), pl("a1", "A1", 4, 3), pl("a2", "A2", 4, 3), pl("a3", "A3", 4, 3)];
  const clave = pl("k", "Clave", 3, keyLoss ? 6 : 3);
  return { all: [...xi, clave, pl("s", "Suplente", 3, 1)] };
};
const team: Team = { id: "me", players: ["g", "d1", "d2", "d3", "m1", "m2", "m3", "a1", "a2", "a3", "k", "s"].map((id) => tp(id, id === "k" ? "Clave" : id === "s" ? "Suplente" : id)) };
const xp = (id: string) => (id === "k" ? 8 : id === "s" ? 1 : 3);
const scores = new Map<string, Score>(team.players.map((p) => [String(p.playerMaster.id), score(5e6, { xp: xp(String(p.playerMaster.id)) })]));
import { bestLineup } from "../src/lib/plan/lineup";

const plan = (offers: [string, number][], sc = scores) => {
  const l = bestLineup(lineup(true).all as never)!;
  return dailyPlan({ now, myTeam: team, myMoney: 1e6, rivals: [], market: [], scores: sc, lineup: l, offers: new Map(offers.map(([id, money]) => [id, [{ money }]])) });
};

describe("ofertas recibidas", () => {
  it("lee la respuesta en sus formas", () => {
    expect(parseOffers([{ id: 1, money: 5e6, status: "pending" }])).toHaveLength(1);
    expect(parseOffers({ elements: [{ id: 1, money: 5e6 }] })).toHaveLength(1);
    expect(parseOffers({ id: 1, money: 5e6 })).toHaveLength(1);
    expect(parseOffers({})).toEqual([]);
  });
  it("acepta por uno que no es clave si pasa un 3 % del valor", () => {
    const a = plan([["s", 5.3e6]]).find((x) => x.playerId === "s")!;
    expect(a.texto).toContain("Acepta la oferta de 5,3 M por <b>Suplente</b>: +6 % sobre lo que vale");
    expect(a.oferta).toBe(true);
  });
  it("por debajo del valor y sin bajar, nada", () => {
    expect(plan([["s", 4.9e6]]).some((x) => x.playerId === "s")).toBe(false);
  });
  it("si va a bajar, vale aceptar al valor", () => {
    const sc = new Map(scores).set("s", score(5e6, { expected: 4.5e6, xp: 1 }));
    const t = plan([["s", 5e6]], sc).find((x) => x.playerId === "s")?.texto ?? "";
    expect(t).toContain("+0 % sobre lo que vale, y va a bajar");
    expect(t).not.toContain(": y");
  });
  it("por uno clave: solo si es muy buena, y como aviso para pensarlo", () => {
    expect(plan([["k", 5.4e6]]).filter((x) => x.playerId === "k").map((x) => x.titulo)).toEqual([]);
    const a = plan([["k", 6e6]]).find((x) => x.playerId === "k")!;
    expect(a.tipo).toBe("aviso");
    expect(a.texto).toContain("es clave en tu once");
  });
  it("estar a la venta no la da por hecha", () => {
    const acc = plan([["s", 5.3e6]]);
    const out = applyDone(acc, new Set(), new Set(["s"]));
    expect(out.find((x) => x.playerId === "s")?.hecho).toBeFalsy();
  });
});
