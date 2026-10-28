import { NextResponse } from "next/server";
import { matchRead } from "@/lib/captura/match";
import { readScreenshot, type MediaType } from "@/lib/captura/read";
import { candidates } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Claude puede tardar unos segundos

const TYPES: MediaType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024; // Vercel no acepta más de 4,5 MB por petición

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("imagen");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  if (!TYPES.includes(file.type as MediaType)) return NextResponse.json({ error: "Formato no válido: usa PNG, JPG o WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La imagen pesa más de 4 MB" }, { status: 400 });
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const read = await readScreenshot({ data, mediaType: file.type as MediaType });
    if (read.tipo === "otra" || !read.jugadores.length) {
      return NextResponse.json({ error: "No parece una captura de LaLiga Fantasy con jugadores" }, { status: 422 });
    }
    return NextResponse.json({ tipo: read.tipo, items: matchRead(read.jugadores, await candidates()) });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
