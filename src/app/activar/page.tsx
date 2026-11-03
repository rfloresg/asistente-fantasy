// Viene del botón que da el bot al escribir /espia en un grupo: eliges qué liga es ese grupo.
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leagues, memberships } from "@/db/schema";
import { groupSig } from "@/lib/grupo";
import { currentUser } from "@/lib/session";
import Pick from "./Pick";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | undefined>>;

export default async function Activar({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const ok = q.chat && q.sig === groupSig(q.chat);
  const user = await currentUser();
  const db = await getDb();
  const mine = user
    ? await db.select({ id: leagues.leagueId, name: leagues.name }).from(memberships)
        .innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId)).where(and(eq(memberships.userId, user.id)))
    : [];
  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Activar el Espía</h1>
      {!ok ? (
        <div className="empty"><p>Este enlace no vale. Escribe otra vez <code>/espia</code> en el grupo de tu liga.</p></div>
      ) : (
        <>
          <p className="lead">¿Qué liga es el grupo <b>{q.t ?? "de Telegram"}</b>? El Espía publicará allí sus fichajes, ventas, cláusulas y un resumen cada mañana.</p>
          {mine.length ? (
            <Pick chat={q.chat!} sig={q.sig!} leagues={mine} />
          ) : (
            <div className="empty"><p>Aún no tienes ligas. Primero <Link href="/conectar">conecta tu LaLiga</Link> y vuelve a este enlace.</p></div>
          )}
        </>
      )}
    </main>
  );
}
