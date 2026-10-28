import { NextResponse } from "next/server";
import { ask, type ChatTurn } from "@/lib/chat/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Claude puede tardar unos segundos

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { messages?: ChatTurn[] } | null;
  const history = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10) // contexto corto: más barato
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!history.length || history.at(-1)!.role !== "user") {
    return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });
  }
  try {
    return NextResponse.json(await ask(history));
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
