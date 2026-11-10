// Conectar tu cuenta de LaLiga para que el Espía lea tus ligas y te haga el plan.

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { laligaSessions, leagues, memberships } from "@/db/schema";
import { requireUser } from "@/lib/session";
import Link from "next/link";
import Connect from "./Connect";
import DeleteAccount from "./DeleteAccount";
import { currentTheme } from "@/lib/tema";
import LeagueRow from "./LeagueRow";

export const dynamic = "force-dynamic";

const madrid = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default async function Conectar() {
  const user = await requireUser("/conectar");
  const theme = await currentTheme();
  const db = await getDb();
  const [session] = await db.select().from(laligaSessions).where(eq(laligaSessions.userId, user.id));
  const mine = await db.select({ id: leagues.leagueId, name: leagues.name, plan: memberships.plan, dinero: memberships.dinero, group: leagues.groupChatId, owner: leagues.groupOwnerId, money: leagues.showMoney, raises: leagues.showRaises, premium: leagues.premium })
    .from(memberships).innerJoin(leagues, eq(leagues.leagueId, memberships.leagueId)).where(eq(memberships.userId, user.id));

  const connected = !!session && !session.lastError;
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return (
    <main>
      {connected ? (
        <>
          <h1>Tu <span className="hl">cuenta</span></h1>
          <p className="lead">Tu LaLiga está conectada. Aquí eliges en qué ligas quieres plan y cómo se comporta el Espía en tu grupo.</p>
        </>
      ) : (
        <>
          <h1>Conecta tu <span className="hl">LaLiga</span></h1>
          <p className="lead">Para leer tus ligas y hacerte el plan con tu dinero real, el Espía necesita tu sesión de LaLiga. Solo lee: nunca ficha, vende ni toca nada.</p>
        </>
      )}

      <div className="cols">
        <section className="col-main">
          {connected ? (
            <>
              <div className="card ok-card">
                <span className="k">Estado</span>
                <div className="v up">✓ Conectada</div>
                <p className="small" style={{ margin: "6px 0 0" }}>Se renovó el {madrid(session!.updatedAt)}. Se renueva sola; si algún día caduca, el bot te avisa por Telegram.</p>
              </div>
              <details className="reconnect">
                <summary>Volver a conectar</summary>
                <Connect connected bot={bot} />
              </details>
            </>
          ) : (
            <Connect connected={false} bot={bot} />
          )}
        </section>
        <aside className="col-side">
          {!connected && (
            <>
              <h2>Tu conexión</h2>
              {session ? <p className="bad">La sesión ha caducado. Vuelve a conectar.</p> : <p className="muted">Sin conectar.</p>}
            </>
          )}
          <h2 id="ligas" style={{ marginTop: connected ? 0 : 28 }}>Tus ligas</h2>
          <p className="small" style={{ marginTop: -4 }}>Para que el Espía publique en el grupo de una liga, mete el bot en el grupo: se activa solo.</p>
          {mine.length ? (
            <ul className="rule">
              {mine.map((l) => <LeagueRow key={l.id} id={l.id} name={l.name} plan={l.plan} dinero={l.dinero} group={!!l.group} owner={l.owner === user.id} money={l.money} raises={l.raises} premium={l.premium} />)}
            </ul>
          ) : (
            <p className="muted">Aparecerán cuando conectes.</p>
          )}
          <form method="post" action="/api/logout" style={{ marginTop: 28 }}>
            <p className="small" style={{ margin: "0 0 8px" }}>Has entrado como <b>{user.name}</b>.</p>
            <button type="submit" className="chip">Salir</button>
          </form>
          {user.isAdmin && <p style={{ marginTop: 20 }}><Link href="/admin" className="chip">Administración</Link></p>}
          <h2 style={{ marginTop: 28 }}>Tema</h2>
          <form action="/api/tema" method="post" className="seg tema" aria-label="Tema de la app">
            <button type="submit" name="tema" value="oscuro" aria-pressed={theme === "oscuro"}>🌙 Oscuro</button>
            <button type="submit" name="tema" value="claro" aria-pressed={theme === "claro"}>☀️ Claro</button>
          </form>
          <p className="small" style={{ marginTop: 20 }}><Link href="/privacidad">Qué datos guardamos</Link></p>
          <DeleteAccount admin={user.isAdmin} />
        </aside>
      </div>
    </main>
  );
}
