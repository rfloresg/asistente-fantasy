// Conectar una cuenta de LaLiga a un usuario (desde la web o desde el bot).
// Paso 1: startConnect da la dirección del login oficial (PKCE). Paso 2: finishConnect canjea
// la dirección de jwt.ms que trae el usuario por su sesión (cifrada) y apunta sus ligas.
import crypto from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { leagues, loginAttempts, memberships } from "@/db/schema";
import { myLeagues } from "@/lib/espia/league";
import { authorizeUrl, exchangeCode, parseCallback, pkce, saveUserSession, WEB_REDIRECT_URI } from "@/lib/laliga/auth";

export async function startConnect(db: Db, userId: number): Promise<string> {
  if (!process.env.SESSION_KEY) throw new Error("Falta SESSION_KEY en Vercel (y redeploy)");
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 15 * 60e3)));
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(16).toString("hex");
  await db.insert(loginAttempts).values({ state, verifier, userId, createdAt: new Date() });
  return authorizeUrl(challenge, state, WEB_REDIRECT_URI);
}

export class ConnectError extends Error {}

// Busca la dirección de jwt.ms dentro de un texto (al compartir, Telegram puede añadir el título de la página)
export const findCallback = (text: string) => text.match(/https:\/\/jwt\.ms\/?\S*/)?.[0] ?? null;

export async function finishConnect(db: Db, userId: number, pasted: string) {
  const { code, state, error } = parseCallback(findCallback(pasted) ?? pasted);
  if (error) throw new ConnectError(`LaLiga dice: ${error}`);
  if (!code || !state) throw new ConnectError("En esa dirección no hay código. Mándame la de la página en blanco de Microsoft, completa.");
  const [attempt] = await db.select().from(loginAttempts).where(and(eq(loginAttempts.state, state), eq(loginAttempts.userId, userId)));
  if (!attempt || Date.now() - attempt.createdAt.getTime() > 15 * 60e3) {
    throw new ConnectError("Ese inicio de sesión ha caducado (dura 15 minutos). Vuelve a empezar.");
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.state, state));
  let tokens;
  try {
    tokens = await exchangeCode(code, attempt.verifier, WEB_REDIRECT_URI);
  } catch (e) {
    throw new ConnectError(`LaLiga no aceptó el código: ${String(e instanceof Error ? e.message : e)}`);
  }
  if (!tokens.refresh_token) throw new ConnectError("LaLiga no devolvió una sesión que se pueda renovar");
  await saveUserSession(db, userId, tokens.refresh_token, WEB_REDIRECT_URI);

  const ls = await myLeagues(tokens.access_token ?? tokens.id_token ?? "").catch(() => []);
  for (const l of ls) {
    const id = String(l.id);
    const name = l.name?.trim() || "Liga";
    await db.insert(leagues).values({ leagueId: id, name, active: true, createdAt: new Date() })
      .onConflictDoUpdate({ target: leagues.leagueId, set: { name, active: true } });
    await db.insert(memberships).values({ userId, leagueId: id, plan: true, createdAt: new Date() }).onConflictDoNothing();
  }
  const hours = tokens.refresh_token_expires_in ? Math.round(tokens.refresh_token_expires_in / 3600) : null;
  return { leagues: ls.map((l) => ({ id: String(l.id), name: l.name?.trim() || "Liga" })), sessionHours: hours };
}
