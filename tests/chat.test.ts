import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ask, type LlmClient } from "../src/lib/chat/agent";
import { numbersIn, unsupportedNumbers } from "../src/lib/chat/guard";

describe("guard", () => {
  const tool = JSON.stringify({ jugador: "Cepeda", valor: "2,95 M", nota: 85, cambio_valor_7_dias: "+13,6 %", dia: "2026-10-28" });

  it("lee cifras con coma o punto e ignora fechas", () => {
    expect(numbersIn("Vale 2,95 M y sube un 13.6 % desde 2026-10-28")).toEqual([2.95, 13.6]);
  });

  it("acepta cifras de las herramientas y sus redondeos", () => {
    expect(unsupportedNumbers("Cepeda vale 2,95 M, nota 85, sube un 13,6 %", [tool])).toEqual([]);
    expect(unsupportedNumbers("Vale unos 3 M y sube un 14 %", [tool])).toEqual([]);
  });

  it("detecta cifras inventadas", () => {
    expect(unsupportedNumbers("Puja hasta 4,2 M, que subirá un 25 %", [tool])).toEqual([4.2, 25]);
  });

  it("deja pasar números pequeños y los de la pregunta", () => {
    expect(unsupportedNumbers("Te propongo 3 jugadores por menos de 5 M", [tool])).toEqual([]);
    expect(unsupportedNumbers("Con 12 M puedes", [tool, "tengo 12 M"])).toEqual([]);
  });
});

// Claude falso: pide el mercado, se inventa una puja, y al pedirle revisión la corrige.
function fakeClient(replies: Pick<Anthropic.Message, "content" | "stop_reason">[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: LlmClient = {
    messages: {
      create: async (p) => {
        calls.push(structuredClone(p));
        return replies.shift()!;
      },
    },
  };
  return { client, calls };
}

const text = (t: string) => ({ content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn" }) as unknown as Pick<Anthropic.Message, "content" | "stop_reason">;

describe("ask", () => {
  it("usa herramientas, detecta la cifra inventada y pide reescribir", async () => {
    const { client, calls } = fakeClient([
      { content: [{ type: "tool_use", id: "t1", name: "mercado", input: { posicion: "DEL" } }], stop_reason: "tool_use" } as unknown as Pick<Anthropic.Message, "content" | "stop_reason">,
      text("Ficha a Cepeda: vale 2,95 M, puja hasta 4,2 M."),
      text("Ficha a Cepeda: vale 2,95 M, puja máxima 3,5 M."),
    ]);
    const runTool = async () => ({ jugadores: [{ id: "17248", jugador: "Cepeda", valor: "2,95 M", puja_maxima_para_jugar: "3,5 M" }] });

    const res = await ask([{ role: "user", content: "¿Qué delantero ficho?" }], { client, runTool });

    expect(calls).toHaveLength(3);
    const review = calls[2].messages.at(-1)!;
    expect(String(review.content)).toContain("4.2");
    expect(res.reply).toBe("Ficha a Cepeda: vale 2,95 M, puja máxima 3,5 M.");
    expect(res.unsupported).toEqual([]);
    expect(res.players).toEqual([{ id: "17248", name: "Cepeda" }]);
  });

  it("si vuelve a inventar, lo marca en la respuesta", async () => {
    const { client } = fakeClient([text("Sube un 40 %"), text("Sube un 40 % seguro")]);
    const res = await ask([{ role: "user", content: "¿Sube Mbappé?" }], { client, runTool: async () => ({}) });
    expect(res.unsupported).toEqual([40]);
  });
});
