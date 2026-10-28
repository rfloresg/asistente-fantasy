// Inicia sesión en LaLiga Fantasy UNA vez, en tu PC, y guarda la sesión en la base de datos.
// Uso: npm run liga:login
// Se abre una ventana con el login oficial de LaLiga. Entra con email (Google puede
// bloquear navegadores automatizados). Tu contraseña la escribes en la web de LaLiga:
// este script no la ve; solo captura el código de vuelta y lo cambia por la sesión.

import "dotenv/config";
import crypto from "node:crypto";
import { chromium, type Browser } from "playwright";
import { getConn } from "../src/db";
import { authorizeUrl, exchangeCode, pkce, REDIRECT_URI, saveRefreshToken } from "../src/lib/laliga/auth";

const TIMEOUT_MS = 5 * 60_000;

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: false, channel: "chrome" }); // tu Chrome, si lo tienes
  } catch {
    return chromium.launch({ headless: false }); // si no: npx playwright install chromium
  }
}

async function main() {
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(12).toString("hex");
  const browser = await launch();
  const page = await (await browser.newContext()).newPage();

  // Capturamos la vuelta a authredirect://...?code=... venga como venga
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tiempo agotado (5 min) sin completar el login")), TIMEOUT_MS);
    const check = (url: string | undefined) => {
      if (!url?.startsWith(REDIRECT_URI)) return;
      const u = new URL(url.replace(REDIRECT_URI, "https://callback"));
      if (u.searchParams.get("state") !== state) return;
      const c = u.searchParams.get("code");
      const err = u.searchParams.get("error_description");
      clearTimeout(timer);
      if (c) resolve(c);
      else reject(new Error(err ?? "LaLiga no devolvió código"));
    };
    page.on("request", (r) => check(r.url()));
    page.on("requestfailed", (r) => check(r.url()));
    page.on("response", (r) => check(r.headers()["location"]));
    page.on("framenavigated", (f) => check(f.url()));
    page.goto(authorizeUrl(challenge, state)).catch(() => {});
    console.log("Inicia sesión en la ventana que se ha abierto…");
  });

  await browser.close();
  const tokens = await exchangeCode(code, verifier);
  if (!tokens.refresh_token) throw new Error("LaLiga no devolvió refresh token");

  const { db, close } = await getConn();
  await saveRefreshToken(db, tokens.refresh_token);
  await close();
  console.log("Sesión guardada en la base de datos. Ya puedes ejecutar npm run liga:probe");
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
