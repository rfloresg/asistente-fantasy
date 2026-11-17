// Administración: avisar a la lista de espera de que hay sitio (tantos como plazas libres).
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { inviteWaiting } from "@/lib/espera";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const me = await currentUser();
  const url = new URL(req.url);
  if (!me?.isAdmin) return NextResponse.redirect(new URL("/", url), 303);
  const sent = await inviteWaiting(await getDb());
  return NextResponse.redirect(new URL(`/admin?avisados=${sent}`, url), 303);
}
