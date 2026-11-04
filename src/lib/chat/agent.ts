// Bucle del asistente: Claude pide datos a las herramientas y los explica.
// Al final se comprueba que cada cifra de la respuesta sale de los datos.

import Anthropic from "@anthropic-ai/sdk";
import { unsupportedNumbers } from "./guard";
import { runTool as realRunTool, TOOLS } from "./tools";

const MODEL = process.env.ASISTENTE_MODEL ?? "claude-haiku-5-5";
const MAX_STEPS = 6; // llamadas a herramientas por pregunta, como mucho

const SYSTEM = `Eres el asistente de LaLiga Fantasy de quien te escribe. Hablas en español de España, cercano y directo, como un buen analista fantasy de redes, pero sin exagerar ni prometer nada.

Reglas:
- Solo sabes lo que te dan las herramientas. Antes de opinar sobre un jugador o el mercado, consúltalas.
- Cada cifra que escribas (valor, nota, %, puntos, puja) tiene que estar en la respuesta de una herramienta, tal cual. No calcules cifras nuevas ni redondees a tu manera.
- Si no tienes un dato, dilo. No supongas lesiones, rotaciones ni fichajes.
- Basa la recomendación en la nota y en "recomendacion" de las herramientas, y explica por qué con los motivos.
- Mira "en_tu_liga": si un jugador ya es suyo, nunca le digas que lo fiche (es mantener, proteger o vender); si es de otro mánager, solo se consigue con cláusula.
- La nota mide si conviene comprar a ese precio, no quién es mejor. Si preguntan por los mejores, ordena por forma.
- Respuestas cortas: unas pocas frases o una lista breve. Sin tablas.
- Menciona el día de los datos si es relevante.
- Si pregunta qué hacer hoy, consulta plan_del_dia y explícalo por orden de prioridad.
- Juega como un pro: para explicar estrategia (cuánto pujar, especular, cláusulas, blindaje, parones, capitán, deuda) consulta la herramienta meta y aplícala a los datos del jugador. Si una regla viene marcada como "según guías", dilo.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  players: { id: string; name: string }[]; // jugadores consultados, para enlazar su ficha
  unsupported: number[]; // cifras sin respaldo que quedaron (debería ser vacío)
}

// Lo mínimo que usamos del cliente de Anthropic (los tests pasan uno falso)
export interface LlmClient {
  messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Pick<Anthropic.Message, "content" | "stop_reason">> };
}

export async function ask(
  history: ChatTurn[],
  deps: { client?: LlmClient; runTool?: typeof realRunTool; userId?: number | null } = {},
): Promise<ChatResult> {
  if (!deps.client && !process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en .env");
  const client: LlmClient = deps.client ?? new Anthropic();
  const runTool = deps.runTool ?? realRunTool;
  const messages: Anthropic.MessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const sources: string[] = history.filter((t) => t.role === "user").map((t) => t.content);
  const seen = new Map<string, string>();

  const collect = (out: unknown) => {
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.id === "string" && typeof o.jugador === "string") seen.set(o.id, o.jugador);
        Object.values(o).forEach(walk);
      }
    };
    walk(out);
  };

  let retried = false;
  for (let step = 0; step < MAX_STEPS + 2; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      tools: step < MAX_STEPS ? TOOLS : [],
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "tool_use") {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        let out: unknown;
        try {
          out = await runTool(block.name, block.input as Record<string, unknown>, deps.userId ?? null);
        } catch (e) {
          out = { error: String(e) };
        }
        const json = JSON.stringify(out);
        sources.push(json);
        collect(out);
        results.push({ type: "tool_result", tool_use_id: block.id, content: json });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const reply = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    const bad = unsupportedNumbers(reply, sources);
    if (bad.length && !retried) {
      // Una segunda oportunidad: que reescriba sin las cifras que no salen de los datos
      retried = true;
      messages.push({
        role: "user",
        content: `Revisión automática: estas cifras no aparecen en los datos de las herramientas: ${bad.join(", ")}. Reescribe la respuesta usando solo cifras que aparezcan tal cual en los datos, o quítalas.`,
      });
      continue;
    }
    const mentioned = [...seen].filter(([, name]) => reply.includes(name)).map(([id, name]) => ({ id, name }));
    return { reply, players: mentioned, unsupported: bad };
  }
  return { reply: "No he podido terminar la respuesta. Prueba a preguntarlo de otra forma.", players: [], unsupported: [] };
}
