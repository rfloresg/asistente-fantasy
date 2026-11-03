// Enlaza un grupo de Telegram con una de tus ligas desde la web (enlaces antiguos de /espia).
// Lo normal ahora es hacerlo en el propio grupo con los botones del bot.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sendMessage } from "@/lib/espia/telegram";
import { groupSig } from "@/lib/grupo";
import { activateGroup, activatedText } from "@/lib/grupo-activar";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const { chat, sig, leagueId } = (await req.json().catch(() => ({}))) as { chat?: string; sig?: string; leagueId?: string };
  if (!chat || !leagueId || sig !== groupSig(chat)) return NextResponse.json({ error: "Enlace no válido: escribe otra vez /espia en el grupo" }, { status: 400 });
  const out = await activateGroup(await getDb(), user.id, leagueId, chat);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  await sendMessage(chat, activatedText(out.name)).catch(() => {});
  return NextResponse.json({ ok: true });
}
