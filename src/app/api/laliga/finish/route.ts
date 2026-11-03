// Conectar con LaLiga, paso 2: el usuario pega la dirección de jwt.ms; cambiamos el código por su sesión
// (cifrada) y apuntamos sus ligas. Nunca vemos su contraseña.
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { leagues, loginAttempts, memberships } from "@/db/schema";
import { myLeagues } from "@/lib/espia/league";
import { exchangeCode, parseCallback, saveUserSession, WEB_REDIRECT_URI } from "@/lib/laliga/auth";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    return await finish(req);
  } catch (e) {
    // Siempre un mensaje claro (antes salía "No se pudo conectar" sin más)
    return NextResponse.json({ error: `Error al guardar la sesión: ${String(e instanceof Error ? e.message : e)}` }, { status: 500 });
  }
}

async function finish(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  const { pasted } = (await req.json().catch(() => ({}))) as { pasted?: string };
  const { code, state, error } = parseCallback(pasted ?? "");
  if (error) return NextResponse.json({ error: `LaLiga dice: ${error}` }, { status: 400 });
  if (!code || !state) return NextResponse.json({ error: "En esa dirección no hay código. Copia la dirección completa de la página de Microsoft a la que llegas." }, { status: 400 });

  const db = await getDb();
  const [attempt] = await db.select().from(loginAttempts).where(and(eq(loginAttempts.state, state), eq(loginAttempts.userId, user.id)));
  if (!attempt || Date.now() - attempt.createdAt.getTime() > 15 * 60e3) {
    return NextResponse.json({ error: "Ese inicio de sesión ha caducado. Pulsa otra vez Conectar con LaLiga." }, { status: 400 });
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.state, state));

  let tokens;
  try {
    tokens = await exchangeCode(code, attempt.verifier, WEB_REDIRECT_URI);
  } catch (e) {
    return NextResponse.json({ error: `LaLiga no aceptó el código: ${String(e instanceof Error ? e.message : e)}` }, { status: 502 });
  }
  if (!tokens.refresh_token) return NextResponse.json({ error: "LaLiga no devolvió una sesión que se pueda renovar" }, { status: 502 });
  await saveUserSession(db, user.id, tokens.refresh_token, WEB_REDIRECT_URI);

  const bearer = tokens.access_token ?? tokens.id_token ?? "";
  const ls = await myLeagues(bearer).catch(() => []);
  for (const l of ls) {
    const id = String(l.id);
    await db.insert(leagues).values({ leagueId: id, name: l.name?.trim() || "Liga", active: true, createdAt: new Date() })
      .onConflictDoUpdate({ target: leagues.leagueId, set: { name: l.name?.trim() || "Liga" } });
    await db.insert(memberships).values({ userId: user.id, leagueId: id, plan: true, createdAt: new Date() }).onConflictDoNothing();
  }
  // Aviso si LaLiga da una sesión de vida corta (caduca sí o sí y habría que volver a entrar)
  const hours = tokens.refresh_token_expires_in ? Math.round(tokens.refresh_token_expires_in / 3600) : null;
  return NextResponse.json({ ok: true, leagues: ls.map((l) => ({ id: String(l.id), name: l.name?.trim() })), sessionHours: hours });
}
