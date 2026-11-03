// Conectar con LaLiga, paso 1: prepara el login oficial (PKCE) y devuelve su dirección.
import crypto from "node:crypto";
import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { loginAttempts } from "@/db/schema";
import { authorizeUrl, pkce, WEB_REDIRECT_URI } from "@/lib/laliga/auth";
import { currentUser } from "@/lib/session";

export async function POST() {
  try {
    return await start();
  } catch (e) {
    return NextResponse.json({ error: `No se pudo empezar: ${String(e instanceof Error ? e.message : e)}` }, { status: 500 });
  }
}

async function start() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const db = await getDb();
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 15 * 60e3)));
  if (!process.env.SESSION_KEY) return NextResponse.json({ error: "Falta SESSION_KEY en Vercel (y redeploy)" }, { status: 500 });
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(16).toString("hex");
  await db.insert(loginAttempts).values({ state, verifier, userId: user.id, createdAt: new Date() });
  return NextResponse.json({ url: authorizeUrl(challenge, state, WEB_REDIRECT_URI) });
}
