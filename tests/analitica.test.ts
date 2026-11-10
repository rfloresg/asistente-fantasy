import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMatch, parseMatchLinks, teamSlug } from "../src/lib/onces/analitica";
import { combine, sourcesText } from "../src/lib/onces/combine";
import { matchPlayers, matchTeam } from "../src/lib/onces/match";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("Analítica Fantasy (respuesta real, J12 Atlético - Barça)", () => {
  const teams = parseMatch(fx("analitica-partido.html"));
  it("lee los dos equipos con su once", () => {
    expect(teams.map((t) => t.name)).toEqual(["Atletico Madrid", "Barcelona"]);
    for (const t of teams) expect(t.players.filter((p) => p.starter)).toHaveLength(11);
  });
  it("lee probabilidad, estado y motivo", () => {
    const b = teams[0].players.find((p) => p.name === "Pablo Barrios")!;
    expect(b).toMatchObject({ starter: true, prob: 70, status: "doubt", position: "Mediocampista" });
    expect(b.info).toContain("Molestias en el tobillo");
  });
  it("enlaces de los partidos de la jornada", () => {
    const links = parseMatchLinks(fx("analitica-jornada.html"));
    expect(links).toHaveLength(10);
    expect(links).toContain("/partido/100012041-atletico-madrid-barcelona");
  });
  it("se empareja con nuestros equipos y jugadores como futbolfantasy", () => {
    const ours = [{ id: "1", slug: "atletico-de-madrid", name: "Atlético de Madrid" }, { id: "2", slug: "fc-barcelona", name: "FC Barcelona" }];
    expect(matchTeam(teamSlug(teams[0]), ours)).toBe("1");
    expect(matchTeam(teamSlug(teams[1]), ours)).toBe("2");
    const ff = teams[0].players.map((p) => ({ ffId: p.afId, name: p.name, slug: p.slug, position: p.position, starter: p.starter, prob: p.prob }));
    const m = matchPlayers(ff, [{ id: "1565", nickname: "Barrios", positionId: 3 }, { id: "100", nickname: "Oblak", positionId: 1 }]);
    expect(m.get("336594")).toBe("1565");
    expect(m.get("29")).toBe("100");
  });
  it("sin datos estructurados, saca los equipos de los datos de Next (Elche - Betis)", () => {
    const t = parseMatch(fx("analitica-partido-sin-ld.html"));
    expect(t.map((x) => x.name)).toEqual(["Elche", "Real Betis"]);
    expect(t[0].players.filter((p) => p.starter)).toHaveLength(11);
  });
  it("equipos con ciudad en el nombre", () => {
    const ours = [
      { id: "49", slug: "r-racing-club", name: "R. Racing Club" },
      { id: "26", slug: "rc-deportivo", name: "RC Deportivo" },
      { id: "21", slug: "deportivo-alaves", name: "Deportivo Alavés" },
      { id: "6", slug: "rc-celta", name: "RC Celta" },
    ];
    expect(matchTeam("racing-santander", ours)).toBe("49");
    expect(matchTeam("deportivo-la-coruna", ours)).toBe("26");
    expect(matchTeam("celta-vigo", ours)).toBe("6");
  });
});

describe("juntar fuentes", () => {
  it("manda Futbol Fantasy, aunque venga segunda", () => {
    expect(combine([{ source: "Analítica Fantasy", starter: true, prob: 70 }, { source: "Futbol Fantasy", starter: true, prob: 80 }])).toMatchObject({ prob: 80, starter: true, dispute: false });
  });
  it("avisa cuando no coinciden", () => {
    const c = combine([{ source: "Futbol Fantasy", starter: true, prob: 75 }, { source: "Analítica Fantasy", starter: false, prob: 30, info: "Duda" }])!;
    expect(c).toMatchObject({ dispute: true, prob: 75, starter: true, info: "Duda" });
  });
  it("con una sola fuente, esa", () => {
    expect(combine([{ source: "Analítica Fantasy", starter: false, prob: null }])).toMatchObject({ prob: 20, starter: false, dispute: false });
    expect(combine([])).toBeNull();
  });
});

describe("texto de las fuentes", () => {
  it("dice titular o suplente en cada una", () => {
    expect(sourcesText([{ source: "Futbol Fantasy", starter: true, prob: 50 }, { source: "Analítica Fantasy", starter: false, prob: 50 }]))
      .toBe("Futbol Fantasy: titular 50 % · Analítica Fantasy: suplente 50 %");
  });
});
