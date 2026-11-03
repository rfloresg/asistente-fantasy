// Borrar mi cuenta (botón en Cuenta). El administrador no puede: sin él no funciona el modo antiguo.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteUser } from "@/lib/borrar";
import { COOKIE } from "@/middleware";
import { currentUser, USER_COOKIE } from "@/lib/session";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  if (user.isAdmin) return NextResponse.json({ error: "La cuenta de administrador no se puede borrar desde la web." }, { status: 403 });
  await deleteUser(await getDb(), user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(USER_COOKIE);
  res.cookies.delete(COOKIE);
  return res;
}
