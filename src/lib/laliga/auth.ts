// Sesión de LaLiga Fantasy (Azure B2C), igual que la app móvil.
// LaLiga quitó el login directo con email y contraseña (15/10/2026): solo vale
// el login interactivo (Google o email en su web) con Authorization Code + PKCE.
// Guardamos el refresh token en la base de datos y lo renovamos en cada uso.

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appSecrets } from "@/db/schema";

const TOKEN_URL = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token";
const AUTHORIZE_URL = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/authorize";
const POLICY = "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN";
export const CLIENT_ID = process.env.LALIGA_CLIENT_ID ?? "af88bcff-1157-40a0-b579-030728aacf0b"; // cliente de la app móvil
export const REDIRECT_URI = "authredirect://com.lfp.laligafantasy";
const SECRET_KEY = "laliga_refresh_token";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(challenge: string, state: string) {
  const p = new URLSearchParams({
    p: POLICY,
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
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
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${TOKEN_URL}?p=${POLICY}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
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

export const exchangeCode = (code: string, verifier: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });

export const refresh = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function saveRefreshToken(db: Db, token: string) {
  await db
    .insert(appSecrets)
    .values({ key: SECRET_KEY, value: token, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSecrets.key, set: { value: token, updatedAt: new Date() } });
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
