import { describe, expect, it } from "vitest";
import type { WeekLine } from "../src/lib/nota/breakdown";
import { teamModel, type TeamMatch } from "../src/lib/nota/teams";
import { learnTables, playerXp, type PlayerWeeks } from "../src/lib/nota/xp";

// Liga de 6 equipos: el Barça (plantilla cara) gana casi siempre pero encaja 1 por partido;
// los pequeños marcan poco. 8 jornadas jugadas y la 9 por jugar: Atlético - Barça.
const teams = ["FCB", "ATM", "RSO", "ALA", "LEG", "GIR"];
const value = new Map([["FCB", 900e6], ["ATM", 500e6], ["RSO", 250e6], ["ALA", 90e6], ["LEG", 80e6], ["GIR", 150e6]]);
const day = (w: number) => new Date(Date.UTC(2026, 8, 1 + w * 7, 18));
const score: Record<string, number> = { FCB: 3, ATM: 2, RSO: 1, ALA: 1, LEG: 0, GIR: 1 };
const matches: TeamMatch[] = [];
for (let w = 1; w <= 8; w++) {
  // emparejamientos que rotan
  const order = [...teams.slice(0, 1), ...teams.slice(1).map((_, i, a) => a[(i + w) % a.length])];
  for (let i = 0; i < 3; i++) {
    const L = order[i], V = order[5 - i];
    matches.push({ week: w, date: day(w), localId: L, visitorId: V, state: 7, localScore: L === "FCB" ? 3 : score[L], visitorScore: V === "FCB" ? 3 : Math.max(0, score[V] - 1) + (L === "FCB" ? 1 : 0) });
  }
}
matches.push({ week: 9, date: day(9), localId: "ATM", visitorId: "FCB", state: 1, localScore: null, visitorScore: null });
matches.push({ week: 9, date: day(9), localId: "RSO", visitorId: "ALA", state: 1, localScore: null, visitorScore: null });
matches.push({ week: 9, date: day(9), localId: "GIR", visitorId: "LEG", state: 1, localScore: null, visitorScore: null });
const asOf = "2026-10-31";
const model = teamModel(matches, asOf, value);

const line = (minutes: number, extra: Partial<WeekLine> = {}): WeekLine => ({ points: 6, minutes, goals: 0, goalPts: 0, assists: 0, assistPts: 0, conceded: 1, concededPts: 0, ...extra });
const weeks = (f: (w: number) => WeekLine) => new Map([1, 2, 3, 4, 5, 6, 7, 8].map((w) => [w, f(w)]));
const players: (PlayerWeeks & { status: string })[] = [
  { id: "barrios", positionId: 3, teamId: "ATM", status: "ok", weeks: weeks(() => line(90)) },
  { id: "def-atm", positionId: 2, teamId: "ATM", status: "ok", weeks: weeks(() => line(90)) },
  { id: "def-rso", positionId: 2, teamId: "RSO", status: "ok", weeks: weeks((w) => line(90, w % 2 ? { conceded: 0, concededPts: 4, points: 10 } : {})) },
  { id: "suplente", positionId: 3, teamId: "ATM", status: "ok", weeks: weeks(() => line(15, { points: 1 })) },
  { id: "goleador", positionId: 4, teamId: "RSO", status: "ok", weeks: weeks((w) => line(90, w % 2 ? { goals: 1, goalPts: 4, points: 10 } : {})) },
  { id: "lesionado", positionId: 4, teamId: "RSO", status: "injured", weeks: weeks(() => line(90)) },
];
const tables = learnTables(players, model);
const xp = (id: string) => playerXp(players.find((p) => p.id === id)!, tables, model)!;

describe("fuerza de los equipos", () => {
  it("el Barça sale como el mejor ataque aunque encaje", () => {
    const r = model.ratings;
    const best = [...r].sort((a, b) => b[1].att - a[1].att)[0][0];
    expect(best).toBe("FCB");
    expect(r.get("FCB")!.att).toBeGreaterThan(1.3);
  });
  it("contra el Barça, el Atlético espera más goles en contra que contra un rival medio", () => {
    const f = model.next.get("ATM")![0];
    expect(f).toMatchObject({ teamId: "FCB", home: true, week: 9 });
    expect(f.goalsAgainst).toBeGreaterThan(model.mu * model.ratings.get("ATM")!.def);
  });
});

describe("puntos esperados", () => {
  it("al Barça, un defensa del Atlético lo tiene difícil", () => {
    expect(xp("def-atm").matches[0].label).toBe("difícil");
  });
  it("el titular espera bastante más que el suplente del mismo equipo", () => {
    expect(xp("barrios").xp).toBeGreaterThan(xp("suplente").xp * 2);
    expect(xp("barrios").pStart).toBeGreaterThan(0.8);
  });
  it("el que mete goles espera más que el que no, y el lesionado nada", () => {
    expect(xp("goleador").xp).toBeGreaterThan(xp("def-rso").xp - 3);
    expect(xp("lesionado").xp).toBe(0);
  });
  it("aprende de los datos cuánto vale un gol y una portería a cero en cada puesto", () => {
    expect(tables.get(4)!.ptsPerGoal).toBe(4);
    expect(tables.get(2)!.conceded[0]).toBe(4);
  });
  it("el once probable manda sobre los minutos", () => {
    const p = players.find((x) => x.id === "suplente")!;
    expect(playerXp(p, tables, model, { starter: true, prob: 90 })!.pStart).toBe(0.9);
  });
});
