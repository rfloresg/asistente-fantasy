import { describe, expect, it } from "vitest";
import { activityMessage, dailySummary, type Ctx } from "../src/lib/espia/messages";
import { pack } from "../src/lib/espia/telegram";
import type { Activity, Standing, Team } from "../src/lib/espia/league";

const ctx: Ctx = {
  managers: new Map([["3295526", "Jonix"], ["1928504", "Pepe"]]),
  players: new Map([["2703", { nickname: "Aitor Fdez", value: 1_200_000 }], ["3102", { nickname: "Vini Jr.", value: 60_000_000 }]]),
  valueOn: (id, day) => (id === "2703" && day === "2026-10-27" ? 1_163_000 : undefined),
};
const act = (p: Partial<Activity>): Activity => ({ id: "1", activityTypeId: 31, createdAt: "2026-10-27T19:03:23+01:00", ...p });

describe("activityMessage", () => {
  it("fichaje con precio y % sobre el valor de ese día", () => {
    expect(activityMessage(act({ user1Id: 3295526, playerMasterId: 2703, amount: 1_350_000 }), ctx))
      .toBe("🛒 <b>Jonix</b> ficha a <b>Aitor Fdez</b> por 1,35 M (+16 % sobre su valor)");
  });
  it("venta, cláusula y compra a otro mánager", () => {
    expect(activityMessage(act({ activityTypeId: 33, user1Id: 1928504, playerMasterId: 3102, amount: 58_000_000 }), ctx))
      .toBe("💰 <b>Pepe</b> vende a <b>Vini Jr.</b> por 58 M (-3 % bajo su valor)");
    expect(activityMessage(act({ activityTypeId: 32, user1Id: 3295526, user2Id: 1928504, playerMasterId: 3102, amount: 70_000_000 }), ctx))
      .toBe("💣 <b>Clausulazo</b>: <b>Jonix</b> se lleva a <b>Vini Jr.</b> de <b>Pepe</b> por 70 M");
    expect(activityMessage(act({ activityTypeId: 1, user1Id: 1928504, user2Id: 3295526, playerMasterId: 2703, amount: 1_163_000 }), ctx))
      .toContain("(a su valor) · se lo compra a <b>Jonix</b>");
  });
  it("ignora ganancias por jornada y jugadores desconocidos", () => {
    expect(activityMessage(act({ activityTypeId: 6, user1Id: 3295526, amount: 500000 }), ctx)).toBeNull();
    expect(activityMessage(act({ playerMasterId: 999 }), ctx)).toBeNull();
  });
  it("escapa nombres para HTML", () => {
    const c: Ctx = { ...ctx, managers: new Map([["1", "<Rubén & Co>"]]) };
    expect(activityMessage(act({ activityTypeId: 9, user1Id: 1 }), c)).toBe("👋 <b>&lt;Rubén &amp; Co&gt;</b> se une a la liga");
  });
});

describe("dailySummary", () => {
  const standing: Standing[] = [
    { position: 2, previousPosition: 1, points: 300, team: { id: "t2", teamValue: 200_000_000, manager: { id: "1928504", managerName: "Pepe" } } },
    { position: 1, previousPosition: 2, points: 343, team: { id: "t1", teamValue: 255_320_781, manager: { id: "3295526", managerName: "Jonix" } } },
  ];
  const teams: Team[] = [
    { id: "t1", manager: { id: "3295526", managerName: "Jonix" }, players: [{ playerMaster: { id: "3102", nickname: "Vini Jr.", playerStatus: "suspended", marketValue: 1 } }] },
  ];
  const text = dailySummary({
    leagueName: "Los Súbditos de Willy", day: "2026-10-28", standing, teams,
    last24h: [act({ user1Id: 3295526, playerMasterId: 2703, amount: 1_350_000 })],
    market: [{ id: "m", salePrice: 1_047_068, expirationDate: "", status: "on_sale", numberOfBids: 2, playerMaster: { id: "2703", nickname: "Aitor Fdez", marketValue: 1, positionId: 1, playerStatus: "ok" } },
      { id: "m2", salePrice: 500_000, expirationDate: "", status: "on_sale", numberOfBids: 0, playerMaster: { id: "9999", nickname: "Malo", marketValue: 1, positionId: 2, playerStatus: "ok" } }],
    notas: new Map([["2703", { nota: 85, action: "fichar" }], ["9999", { nota: 49, action: "mantener" }]]),
    ctx,
    prevPoints: { t1: 300, t2: 300 },
    money: new Map([["t1", 12_500_000], ["t2", -3_000_000]]),
  });
  it("ordena la clasificación y marca subidas", () => {
    expect(text).toContain("🥇 Jonix · 343 pts · plantilla 255,32 M ⬆️");
    expect(text.indexOf("Jonix")).toBeLessThan(text.indexOf("Pepe"));
  });
  it("gasto, bajas y mercado con nota", () => {
    expect(text).toContain("• Jonix: gasta 1,35 M");
    expect(text).toContain("Vini Jr. (sanción)");
    expect(text).toContain("• Aitor Fdez · nota 85 · 1,05 M · 2 pujas");
    expect(text).not.toContain("Malo"); // nota < 60 no sale
  });
  it("puntos desde el último resumen y dinero estimado", () => {
    expect(text).toContain("• Jonix: +43 pts");
    expect(text).not.toContain("• Pepe: +0");
    expect(text.indexOf("• Jonix: 12,5 M")).toBeLessThan(text.indexOf("• Pepe: -3 M"));
  });
});

describe("pack", () => {
  it("agrupa sin pasar del límite", () => {
    const out = pack(["a".repeat(30), "b".repeat(30), "c".repeat(30)], 70);
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.length <= 70)).toBe(true);
  });
});

import { parseLeagues } from "../scripts/espia";

describe("parseLeagues", () => {
  it("varias ligas con su grupo", () => {
    expect(parseLeagues({ ESPIA_LIGAS: "018477470:-5110647810, 018218984:-100123" } as unknown as NodeJS.ProcessEnv)).toEqual([
      { leagueId: "018477470", chatId: "-5110647810" },
      { leagueId: "018218984", chatId: "-100123" },
    ]);
  });
  it("una sola liga con las variables de antes", () => {
    expect(parseLeagues({ LIGA_ID: "1", TELEGRAM_CHAT_ID: "-2" } as unknown as NodeJS.ProcessEnv)).toEqual([{ leagueId: "1", chatId: "-2" }]);
    expect(parseLeagues({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
});

import { clauseRaises, estimateTeamMoney, flows, netByManager, parseMoney } from "../src/lib/espia/money";
import { clauseUnlocks } from "../src/lib/espia/messages";

describe("dinero estimado", () => {
  const acts: Activity[] = [
    act({ id: "a", activityTypeId: 31, user1Id: 1, amount: 10_000_000 }), // 1 ficha del mercado
    act({ id: "b", activityTypeId: 33, user1Id: 2, amount: 4_000_000 }), // 2 vende al mercado
    act({ id: "c", activityTypeId: 32, user1Id: 2, user2Id: 1, amount: 20_000_000 }), // 2 le clausula a 1
    act({ id: "d", activityTypeId: 6, user1Id: 1, amount: 1_500_000 }), // 1 cobra jornada
    act({ id: "d", activityTypeId: 6, user1Id: 1, amount: 1_500_000 }), // repetida: no cuenta
  ];
  it("movimientos por tipo", () => {
    expect(flows(acts[2])).toEqual([["2", -20_000_000], ["1", 20_000_000]]);
    expect(flows(act({ activityTypeId: 9, user1Id: 1 }))).toEqual([]);
  });
  it("100 M + actividad - subidas de cláusula", () => {
    const net = netByManager(acts); // 1: -10 + 20 + 1,5 (la repetida no cuenta) · 2: +4 - 20
    expect(estimateTeamMoney(net, ["1"])).toBe(111_500_000);
    expect(estimateTeamMoney(net, ["2"], 1_000_000)).toBe(83_000_000);
    expect(estimateTeamMoney(net, ["99"])).toBe(100_000_000);
  });
  it("detecta subidas de cláusula: mismo equipo y más alta; cuesta la mitad", () => {
    const prev = [{ playerId: "5", teamId: "t1", clause: 10_000_000 }, { playerId: "6", teamId: "t1", clause: 5_000_000 }];
    const now = [{ playerId: "5", teamId: "t1", clause: 14_000_000 }, { playerId: "6", teamId: "t2", clause: 9_000_000 }];
    expect(clauseRaises(prev, now)).toEqual([{ playerId: "5", teamId: "t1", clause: 14_000_000, increase: 4_000_000, cost: 2_000_000 }]);
  });
  it("lee la respuesta de dinero", () => {
    expect(parseMoney({ teamMoney: 5 })).toBe(5);
    expect(parseMoney(7)).toBe(7);
    expect(parseMoney({ x: 1 })).toBeNull();
  });
});

describe("cláusulas", () => {
  const teams: Team[] = [{
    id: "t1", manager: { id: "1", managerName: "Jonix" }, players: [
      { buyoutClause: 30_000_000, buyoutClauseLockedEndTime: "2026-11-02T10:00:00+01:00", playerMaster: { id: "5", nickname: "Pedri", playerStatus: "ok", marketValue: 1 } },
      { buyoutClauseLockedEndTime: "2026-11-10T10:00:00+01:00", playerMaster: { id: "6", nickname: "Lejos", playerStatus: "ok", marketValue: 1 } },
    ],
  }];
  it("solo las que se liberan en la ventana", () => {
    const now = Date.parse("2026-11-02T12:00:00+01:00");
    const u = clauseUnlocks(teams, now - 48 * 3600e3, now);
    expect(u.map((x) => x.player)).toEqual(["Pedri"]);
    expect(u[0].key).toBe("unlock:5:2026-11-02T10:00:00+01:00");
  });
});

import { metaAlerts, nextMatchday } from "../src/lib/meta/calendario";
import { tema, TEMAS } from "../src/lib/meta/manual";

describe("meta: calendario", () => {
  const d = (s: string) => new Date(s);
  const mts = [
    { week: 11, date: d("2026-10-31T16:00:00+01:00") },
    { week: 11, date: d("2026-11-02T21:00:00+01:00") },
    { week: 12, date: d("2026-11-21T14:00:00+01:00") },
    { week: 12, date: d("2026-11-23T21:00:00+01:00") },
  ];
  it("próxima jornada, cierre 24 h antes y parón", () => {
    const n = nextMatchday(mts, d("2026-11-03T10:00:00+01:00"))!;
    expect(n.week).toBe(12);
    expect(n.close.toISOString()).toBe(d("2026-11-20T14:00:00+01:00").toISOString());
    expect(n.paron).toBe(true);
  });
  it("avisa del parón y del cierre en las últimas 4 h", () => {
    const n = nextMatchday(mts, d("2026-11-03T10:00:00+01:00"));
    expect(metaAlerts(n, d("2026-11-03T10:00:00+01:00")).map((a) => a.key)).toEqual(["paron:12"]);
    expect(metaAlerts(n, d("2026-11-20T11:00:00+01:00")).map((a) => a.key)).toEqual(["cierre:12", "paron:12"]);
    expect(metaAlerts(n, d("2026-11-20T09:00:00+01:00")).map((a) => a.key)).toEqual(["paron:12"]);
  });
});

describe("meta: manual", () => {
  it("índice y temas con fuentes", () => {
    expect(TEMAS).toContain("clausulas");
    const t = tema("clausulas") as { reglas: string[]; fuentes: string[] };
    expect(t.reglas.some((r) => r.includes("1:2"))).toBe(true);
    expect(t.fuentes.length).toBeGreaterThan(0);
    expect(tema("nada")).toHaveProperty("error");
  });
});
