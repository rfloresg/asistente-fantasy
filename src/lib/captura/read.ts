// Lee una captura de LaLiga Fantasy con Claude (visión).
// Solo saca nombres, equipo y posición: las cifras las ponemos nosotros desde la base de datos.

import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "@/lib/chat/agent";

const MODEL = process.env.ASISTENTE_VISION_MODEL ?? process.env.ASISTENTE_MODEL ?? "claude-haiku-5-5";

export type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface ReadPlayer {
  nombre: string;
  equipo: string | null;
  posicion: "POR" | "DEF" | "MED" | "DEL" | null;
}

export interface ReadResult {
  tipo: "plantilla" | "mercado" | "otra";
  jugadores: ReadPlayer[];
}

const TOOL: Anthropic.Tool = {
  name: "registrar_captura",
  description: "Registra lo que se ve en la captura de LaLiga Fantasy.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["plantilla", "mercado", "otra"],
        description: "plantilla = equipo del usuario; mercado = jugadores en venta; otra = no es de LaLiga Fantasy",
      },
      jugadores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", description: "Nombre tal cual aparece" },
            equipo: { type: ["string", "null"], description: "Equipo o abreviatura si se lee, si no null" },
            posicion: { type: ["string", "null"], enum: ["POR", "DEF", "MED", "DEL", null] },
          },
          required: ["nombre", "equipo", "posicion"],
        },
      },
    },
    required: ["tipo", "jugadores"],
  },
};

const PROMPT = `Es una captura de la app LaLiga Fantasy. Lista todos los jugadores que se ven, con su nombre exactamente como aparece.
Si se ve el equipo (nombre o abreviatura) o la posición, añádelos; si no, null. No inventes jugadores ni completes nombres cortados.
No leas precios ni puntos. Responde llamando a registrar_captura.`;

export async function readScreenshot(
  image: { data: string; mediaType: MediaType },
  deps: { client?: LlmClient } = {},
): Promise<ReadResult> {
  if (!deps.client && !process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en .env");
  const client: LlmClient = deps.client ?? new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No se pudo leer la captura");
  return clean(block.input);
}

// Valida lo que devuelve el modelo: nunca confiar en su forma.
export function clean(raw: unknown): ReadResult {
  const r = (raw ?? {}) as { tipo?: unknown; jugadores?: unknown };
  const tipo = r.tipo === "plantilla" || r.tipo === "mercado" ? r.tipo : "otra";
  const POS = ["POR", "DEF", "MED", "DEL"];
  const seen = new Set<string>();
  const jugadores = (Array.isArray(r.jugadores) ? r.jugadores : [])
    .map((j) => j as Record<string, unknown>)
    .filter((j) => typeof j.nombre === "string" && j.nombre.trim())
    .map((j) => ({
      nombre: String(j.nombre).trim().slice(0, 60),
      equipo: typeof j.equipo === "string" && j.equipo.trim() ? j.equipo.trim().slice(0, 40) : null,
      posicion: POS.includes(String(j.posicion)) ? (j.posicion as ReadPlayer["posicion"]) : null,
    }))
    .filter((j) => !seen.has(j.nombre) && seen.add(j.nombre))
    .slice(0, 40);
  return { tipo, jugadores };
}
