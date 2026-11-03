// Botón "Actualizar plan": lanza el workflow del Espía en modo plan (GitHub Actions).
// Necesita en Vercel GITHUB_DISPATCH_TOKEN: un token de GitHub con permiso "Actions: read and write" sobre el repo.
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { espiaPlans } from "@/db/schema";

const REPO = process.env.GITHUB_REPO ?? "rfloresg/asistente-fantasy";

// Hora del último plan guardado, para saber cuándo ha llegado el nuevo
export async function GET() {
  const db = await getDb();
  const [last] = await db.select({ at: espiaPlans.createdAt }).from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(1);
  return NextResponse.json({ last: last?.at ?? null });
}

export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: "Falta GITHUB_DISPATCH_TOKEN en Vercel" }, { status: 500 });
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/espia.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { modo: "plan" } }),
  });
  if (!res.ok) return NextResponse.json({ error: `GitHub respondió ${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
