// Conectar tu cuenta de LaLiga para que el Espía lea tus ligas y te haga el plan.

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { laligaSessions, leagues, memberships } from "@/db/schema";
import { currentUser } from "@/lib/session";
import Connect from "./Connect";
import LeagueRow from "./LeagueRow";

export const dynamic = "force-dynamic";

const madrid = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default async function Conectar() {
  const user = await currentUser();
  if (!user) {
    return (
      <main>
        <h1>Conecta tu LaLiga</h1>
        <div className="empty"><p>Aún no hay ningún usuario. Ejecuta <code>npm run usuarios:migrar</code> una vez.</p></div>
      </main>
    );
  }
  const db = await getDb();
  const [session] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, user.id));
  const mine = await db.select({ id: leagues.leagueId, name: leagues.name, plan: memberships.plan, group: leagues.groupChatId })
    .from(memberships).innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId)).where(eq(memberships.userId, user.id));

  return (
    <main>
      <h1>Conecta tu LaLiga</h1>
      <p className="lead">Para leer tus ligas y hacerte el plan con tu dinero real, el Espía necesita tu sesión de LaLiga. Solo lee: nunca ficha, vende ni toca nada.</p>

      <div className="cols">
        <section className="col-main">
          <Connect connected={!!session && !session.lastError} />
        </section>
        <aside className="col-side">
          <h2>Tu conexión</h2>
          {session ? (
            session.lastError ? (
              <p className="bad">La sesión ha caducado. Vuelve a conectar.</p>
            ) : (
              <p>Conectada. Se renovó por última vez el {madrid(session.updatedAt)}.</p>
            )
          ) : (
            <p className="muted">Sin conectar.</p>
          )}
          <h2 style={{ marginTop: 28 }}>Tus ligas</h2>
          {mine.length ? (
            <ul className="rule">
              {mine.map((l) => <LeagueRow key={l.id} id={l.id} name={l.name} plan={l.plan} group={!!l.group} />)}
            </ul>
          ) : (
            <p className="muted">Aparecerán cuando conectes.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
