// Conectar con LaLiga, paso 1: prepara el login oficial (PKCE) y devuelve su dirección.
import crypto from "node:crypto";
import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { loginAttempts } from "@/db/schema";
import { authorizeUrl, pkce, WEB_REDIRECT_URI } from "@/lib/laliga/auth";
import { currentUser } from "@/lib/session";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const db = await getDb();
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 15 * 60e3)));
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(16).toString("hex");
  await db.insert(loginAttempts).values({ state, verifier, userId: user.id, createdAt: new Date() });
  return NextResponse.json({ url: authorizeUrl(challenge, state, WEB_REDIRECT_URI) });
}
