// Contraseña de acceso a toda la web (APP_PASSWORD). Sin ella definida, la web es abierta (local).
import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "fa_session";

async function sign(value: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.APP_PASSWORD ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  // base64url sin Buffer (el middleware corre en el runtime Edge)
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function expectedCookie() {
  return sign("ok");
}

// Cookie de usuario (entrar con Telegram): "id.firma", firmada con SESSION_KEY (igual que src/lib/session.ts)
async function validUser(raw: string | undefined) {
  if (!raw || !process.env.SESSION_KEY) return false;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(id));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === sig;
}

// Páginas y llamadas que no piden entrar: la entrada, el login con Telegram y el bot
const PUBLIC = ["/login", "/privacidad", "/condiciones", "/descargar", "/api/login", "/api/auth/telegram", "/api/auth/bot", "/api/auth/codigo", "/api/telegram", "/api/salir"];

export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD && !process.env.SESSION_KEY) return NextResponse.next(); // local, sin nada configurado
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  const raw = req.cookies.get("fa_user")?.value;
  if (await validUser(raw)) {
    // Sesión deslizante: al abrir una página se renueva otro año (una vez al día basta: lo marca fa_vivo)
    const res = NextResponse.next();
    if (!pathname.startsWith("/api/") && !req.cookies.get("fa_vivo")) {
      res.cookies.set("fa_user", raw!, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
      res.cookies.set("fa_vivo", "1", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
    }
    return res;
  }
  if (process.env.APP_PASSWORD && req.cookies.get(COOKIE)?.value === (await expectedCookie())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// El icono, el manifiesto, el service worker y la app de Android se sirven sin contraseña
export const config = { matcher: ["/((?!_next/|favicon.ico|icons/|manifest.webmanifest|sw.js|promo/|app/).*)"] };
