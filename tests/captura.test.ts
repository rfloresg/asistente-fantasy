import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { matchRead, type Candidate } from "../src/lib/captura/match";
import { clean, readScreenshot } from "../src/lib/captura/read";
import type { LlmClient } from "../src/lib/chat/agent";

const all: Candidate[] = [
  { id: "3103", nickname: "Mbappé", positionId: 4, teamShort: "RMA", teamName: "Real Madrid" },
  { id: "3102", nickname: "Vini Jr.", positionId: 4, teamShort: "RMA", teamName: "Real Madrid" },
  { id: "1", nickname: "Iñaki Williams", positionId: 4, teamShort: "ATH", teamName: "Athletic Club" },
  { id: "2", nickname: "Nico Williams", positionId: 4, teamShort: "ATH", teamName: "Athletic Club" },
  { id: "3", nickname: "M. Dituro", positionId: 1, teamShort: "ELC", teamName: "Elche CF" },
  { id: "4", nickname: "Cuti Romero", positionId: 2, teamShort: "ATM", teamName: "Atlético de Madrid" },
  { id: "5", nickname: "Isaac Romero", positionId: 4, teamShort: "SEV", teamName: "Sevilla FC" },
];
const r = (nombre: string, equipo: string | null = null, posicion: "POR" | "DEF" | "MED" | "DEL" | null = null) => ({ nombre, equipo, posicion });

describe("matchRead", () => {
  it("empareja nombres exactos, sin tilde y abreviados", () => {
    const m = matchRead([r("Mbappe"), r("Vini Jr."), r("Dituro", "ELC")], all);
    expect(m.map((x) => x.id)).toEqual(["3103", "3102", "3"]);
    expect(m[0].opciones).toEqual([{ id: "3103", nickname: "Mbappé", team: "RMA" }]);
  });

  it("con dudas no elige y da opciones", () => {
    const m = matchRead([r("Williams")], all)[0];
    expect(m.id).toBeNull();
    expect(m.opciones.map((o) => o.id).sort()).toEqual(["1", "2"]);
  });

  it("el equipo leído deshace la duda", () => {
    expect(matchRead([r("Romero", "Atlético")], all)[0].id).toBe("4");
  });

  it("sin parecido no empareja", () => {
    expect(matchRead([r("Lewandowski")], all)[0]).toMatchObject({ id: null, opciones: [] });
  });
});

describe("clean", () => {
  it("valida la salida del modelo", () => {
    expect(clean({ tipo: "plantilla", jugadores: [{ nombre: " Pedri ", equipo: "", posicion: "MC" }, { nombre: "Pedri" }, { nombre: "" }, 5] }))
      .toEqual({ tipo: "plantilla", jugadores: [{ nombre: "Pedri", equipo: null, posicion: null }] });
    expect(clean(null)).toEqual({ tipo: "otra", jugadores: [] });
  });
});

describe("readScreenshot", () => {
  it("manda la imagen y fuerza la herramienta", async () => {
    let sent: Anthropic.MessageCreateParamsNonStreaming | null = null;
    const client: LlmClient = {
      messages: {
        create: async (p) => {
          sent = p;
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", id: "x", name: "registrar_captura", input: { tipo: "mercado", jugadores: [{ nombre: "Cepeda", equipo: "ELC", posicion: "DEL" }] } }],
          } as unknown as Pick<Anthropic.Message, "content" | "stop_reason">;
        },
      },
    };
    const res = await readScreenshot({ data: "aGVsbG8=", mediaType: "image/png" }, { client });
    expect(res).toEqual({ tipo: "mercado", jugadores: [{ nombre: "Cepeda", equipo: "ELC", posicion: "DEL" }] });
    expect(sent!.tool_choice).toEqual({ type: "tool", name: "registrar_captura" });
    const content = sent!.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toMatchObject({ type: "image", source: { media_type: "image/png", data: "aGVsbG8=" } });
  });
});
