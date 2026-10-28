import { describe, expect, it } from "vitest";
import { parseLineup, parseTeamSlugs, type FfPlayer } from "../src/lib/onces/futbolfantasy";
import { matchPlayers, matchTeam } from "../src/lib/onces/match";

// Misma estructura que las páginas de equipo de futbolfantasy (recortada).
const block = (id: number, once: string, pos: string, prob: number, name: string, slug: string) => `
<div class="jugador_${id} tipo_campo portero    camiseta-wrapper"
 data-posicion="${pos}" data-posicionLaLigaFantasy="${pos}" data-onceFF="${once}" data-onceFF-x="50%">
  <a class="camiseta " data-totalGoles="0">
    <span class="view probabilidad probabilidad-widget force-block d-block mb-1"><span class="mx-auto prob-4 ">${prob}%</span></span>
  </a>
  <a href="https://www.futbolfantasy.com/jugadores/${slug}/laliga-26-27"><span class="truncate-name">${name}</span></a>
</div>`;

const html =
  block(9161, "titular", "Portero", 90, "Dituro", "matias-dituro") +
  block(7658, "titular", "Mediocampista", 90, "Valera", "german-valera") +
  block(5022, "suplente", "Defensa", 0, "Bambo", "bambo-diaby") +
  block(1, "titular", "Portero", 80, "Fortu&ntilde;o", "ngel-fortuno");

describe("parseLineup", () => {
  it("lee titular, probabilidad, posición, nombre y slug", () => {
    const ps = parseLineup(html);
    expect(ps).toHaveLength(4);
    expect(ps[0]).toEqual({
      ffId: "9161", name: "Dituro", slug: "matias-dituro", position: "Portero", starter: true, prob: 90,
    });
    expect(ps[2]).toMatchObject({ starter: false, prob: 0 });
  });

  it("lee los equipos de la portada", () => {
    const h = '<a href="https://www.futbolfantasy.com/laliga/equipos/elche">x</a><a href="https://www.futbolfantasy.com/laliga/equipos/real-madrid">y</a>';
    expect(parseTeamSlugs(h)).toEqual(["elche", "real-madrid"]);
  });
});

describe("matchTeam", () => {
  const teams = [
    { id: "21", slug: "d-alaves", name: "Deportivo Alavés" },
    { id: "26", slug: "rc-deportivo", name: "RC Deportivo" },
    { id: "2", slug: "atletico-de-madrid", name: "Atlético de Madrid" },
    { id: "15", slug: "real-madrid", name: "Real Madrid" },
    { id: "6", slug: "rc-celta", name: "Celta" },
  ];
  it("empareja aunque el nombre sea más largo", () => {
    expect(matchTeam("atletico", teams)).toBe("2");
    expect(matchTeam("celta", teams)).toBe("6");
    expect(matchTeam("alaves", teams)).toBe("21");
  });
  it("desempata con coincidencia exacta", () => {
    expect(matchTeam("deportivo", teams)).toBe("26");
    expect(matchTeam("real-madrid", teams)).toBe("15");
  });
});

describe("matchPlayers", () => {
  const ff = (name: string, slug: string, position = "Delantero", ffId = name): FfPlayer => ({
    ffId, name, slug, position, starter: true, prob: 80,
  });
  const o = (id: string, nickname: string, positionId = 4) => ({ id, nickname, positionId });

  it("casos reales: iniciales, apodos y slugs sin tilde inicial", () => {
    const ours = [
      o("1", "M. Dituro", 1), o("2", "Germán V.", 3), o("3", "Diaby", 2), o("4", "A. Fortuño", 1),
      o("5", "Ez Abde"), o("6", "Aitor Fdez", 1), o("7", "Maroan"), o("8", "Jonny Otto", 2),
    ];
    const m = matchPlayers(
      [
        ff("Dituro", "matias-dituro", "Portero"), ff("Valera", "german-valera", "Mediocampista"),
        ff("Bambo", "bambo-diaby", "Defensa"), ff("Fortuño", "ngel-fortuno", "Portero"),
        ff("Abde", "abde-ezzalzouli"), ff("Aitor", "aitor-fernandez", "Portero"),
        ff("Sannadi", "maroan-sannadi"), ff("Jonny", "jonny-castro", "Defensa"),
      ],
      ours,
    );
    expect(Object.fromEntries(m)).toEqual({
      Dituro: "1", Valera: "2", Bambo: "3", Fortuño: "4", Abde: "5", Aitor: "6", Sannadi: "7", Jonny: "8",
    });
  });

  it("si hay empate no empareja", () => {
    const m = matchPlayers([ff("Romero", "romero")], [o("1", "Isaac Romero"), o("2", "Cuti Romero")]);
    expect(m.size).toBe(0);
  });

  it("no empareja nombres sin nada en común", () => {
    expect(matchPlayers([ff("Calatrava", "lex-calatrava")], [o("1", "Pere Milla")]).size).toBe(0);
  });
});
