// Borrar mi cuenta (botón en Cuenta). El administrador no puede: sin él no funciona el modo antiguo.
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteUser } from "@/lib/borrar";
import { inviteWaiting } from "@/lib/espera";
import { COOKIE } from "@/middleware";
import { currentUser, USER_COOKIE } from "@/lib/session";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entra primero en la web" }, { status: 401 });
  if (user.isAdmin) return NextResponse.json({ error: "La cuenta de administrador no se puede borrar desde la web." }, { status: 403 });
  const db = await getDb();
  await deleteUser(db, user.id);
  await inviteWaiting(db).catch(() => 0); // su plaza, para el siguiente de la lista
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(USER_COOKIE);
  res.cookies.delete(COOKIE);
  return res;
}
