// Entrar con un toque. POST: nuevo código y el enlace al bot. GET ?c=: ¿ya lo confirmaste en Telegram?
// Si sí, deja la sesión puesta en este navegador (o en la app instalada).
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { claimCode, CODE_PREFIX, createCode } from "@/lib/login-code";
import { USER_COOKIE, USER_COOKIE_OPTS, userCookieValue } from "@/lib/session";
import { userForTelegram } from "@/lib/users";

export async function POST() {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!bot) return NextResponse.json({ error: "Falta TELEGRAM_BOT_USERNAME" }, { status: 500 });
  const code = await createCode(await getDb());
  return NextResponse.json({ code, url: `https://t.me/${bot}?start=${CODE_PREFIX}${code}` });
}

export async function GET(req: Request) {
  const db = await getDb();
  const r = await claimCode(db, new URL(req.url).searchParams.get("c") ?? "");
  if (r.state !== "ok") return NextResponse.json({ state: r.state });
  const user = await userForTelegram(db, r.telegramId, r.name);
  const res = NextResponse.json({ state: "ok" });
  res.cookies.set(USER_COOKIE, userCookieValue(user.id), USER_COOKIE_OPTS);
  return res;
}
