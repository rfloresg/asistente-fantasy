// Sesión de LaLiga Fantasy (Azure B2C), igual que la app móvil.
// LaLiga quitó el login directo con email y contraseña (15/10/2026): solo vale
// el login interactivo (Google o email en su web) con Authorization Code + PKCE.
// Guardamos el refresh token en la base de datos y lo renovamos en cada uso.

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appSecrets, laligaSessions } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

const TOKEN_URL = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token";
const AUTHORIZE_URL = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/authorize";
const POLICY = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN";
export const CLIENT_ID = process.env.LALIGA_CLIENT_ID ?? "af88bcff-1157-40a0-b579-030728aacf0b"; // cliente de la app móvil
export const REDIRECT_URI = "authredirect://com.lfp.laligafantasy";
// Para iniciar sesión desde la web: LaLiga acepta también esta página de Microsoft como vuelta.
// El usuario copia su dirección (lleva el código) y la pega en nuestra web.
export const WEB_REDIRECT_URI = "https://jwt.ms";
const SECRET_KEY = "laliga_refresh_token";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(challenge: string, state: string, redirect = REDIRECT_URI) {
  const p = new URLSearchParams({
    p: POLICY,
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirect,
    scope: "openid offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce: state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

export interface Tokens {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number; // si viene, la sesión caduca a la fuerza (logins tipo web de una sola página)
}

async function tokenRequest(params: Record<string, string>, origin?: string): Promise<Tokens> {
  const res = await fetch(`${TOKEN_URL}?p=${POLICY}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: "openid offline_access", ...params }),
  });
  const text = await res.text();
  let body: Tokens & { error?: string; error_description?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Login de LaLiga no disponible (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(body.error_description ?? body.error ?? `Error HTTP ${res.status}`);
  return body;
}

export const exchangeCode = (code: string, verifier: string, redirect = REDIRECT_URI) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier }, originFor(redirect));

export const refresh = (refreshToken: string, redirect = REDIRECT_URI) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, originFor(redirect));

// Si la vuelta es una web (jwt.ms), LaLiga puede pedir que la renovación venga "desde" esa web
const originFor = (redirect: string) => (redirect.startsWith("https://") ? new URL(redirect).origin : undefined);

// Código de una dirección pegada por el usuario: https://jwt.ms/?code=...&state=...
export function parseCallback(pasted: string): { code: string | null; state: string | null; error: string | null } {
  try {
    const u = new URL(pasted.trim().replace(REDIRECT_URI, "https://callback"));
    const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
    const get = (k: string) => u.searchParams.get(k) ?? hash.get(k);
    return { code: get("code"), state: get("state"), error: get("error_description") ?? get("error") };
  } catch {
    return { code: null, state: null, error: "Eso no parece una dirección web" };
  }
}

export async function saveRefreshToken(db: Db, token: string) {
  await db
    .insert(appSecrets)
    .values({ key: SECRET_KEY, value: token, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSecrets.key, set: { value: token, updatedAt: new Date() } });
}

// La sesión de un usuario ya no vale: tiene que volver a conectar. firstTime = es la primera vez que falla (para avisarle una sola vez)
export class SessionExpired extends Error {
  constructor(public userId: number, public firstTime: boolean, detail: string) {
    super(`La sesión de LaLiga del usuario ${userId} ha caducado: tiene que volver a conectar (${detail})`);
  }
}

// Sesión de un usuario: renueva su refresh token (cifrado en laliga_sessions) y devuelve el de acceso
export async function getUserAccessToken(db: Db, userId: number): Promise<string> {
  const [row] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, userId));
  if (!row) throw new Error(`El usuario ${userId} no ha conectado LaLiga`);
  let t: Tokens;
  try {
    t = await refresh(decrypt(row.refreshEnc), row.redirect);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    await db.update(laligaSessions).set({ lastError: msg, updatedAt: new Date() }).where(eq(laligaSessions.userId, userId));
    throw new SessionExpired(userId, !row.lastError, msg);
  }
  if (t.refresh_token) await saveUserSession(db, userId, t.refresh_token, row.redirect);
  const bearer = t.access_token ?? t.id_token;
  if (!bearer) throw new Error("LaLiga no devolvió token de acceso");
  return bearer;
}

export async function saveUserSession(db: Db, userId: number, refreshToken: string, redirect: string) {
  const values = { userId, refreshEnc: encrypt(refreshToken), redirect, updatedAt: new Date(), lastError: null };
  await db.insert(laligaSessions).values(values)
    .onConflictDoUpdate({ target: laligaSessions.userId, set: { refreshEnc: values.refreshEnc, redirect, updatedAt: values.updatedAt, lastError: null } });
}

// Token de acceso para la API. Usa el refresh token guardado y guarda el nuevo.
export async function getAccessToken(db: Db): Promise<string> {
  const [row] = await db.select().from(appSecrets).where(eq(appSecrets.key, SECRET_KEY));
  const stored = row?.value ?? process.env.LALIGA_REFRESH_TOKEN;
  if (!stored) throw new Error("No hay sesión de LaLiga. Ejecuta npm run liga:login en tu PC.");
  let t: Tokens;
  try {
    t = await refresh(stored);
  } catch (e) {
    throw new Error(`La sesión de LaLiga ha caducado: vuelve a ejecutar npm run liga:login (${String(e)})`);
  }
  if (t.refresh_token && t.refresh_token !== stored) await saveRefreshToken(db, t.refresh_token);
  const bearer = t.access_token ?? t.id_token;
  if (!bearer) throw new Error("LaLiga no devolvió token de acceso");
  return bearer;
}
