// Hoy: tu plan en la liga elegida (movimientos por prioridad) y tu once en el campo.
// Lo genera el Espía a las 9:00 y a las 18:00 (npm run espia plan).

import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { laligaSessions } from "@/db/schema";
import { money } from "@/lib/format";
import { currentLeague, latestPlan } from "@/lib/ligas";
import type { LineupSnapshot } from "@/lib/plan/snapshot";
import Refresh, { DoneButton } from "./_ui/Refresh";
import Welcome from "./_ui/Welcome";

export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = {
  saldo: "Saldo",
  proteger: "Proteger",
  clausulazo: "Clausulazo",
  pujar: "Pujar",
  vender: "Vender",
  aviso: "Atento",
};

const madrid = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", ...o });
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/^\S+\s/, "");

function Pitch({ l }: { l: LineupSnapshot }) {
  // De arriba abajo: delanteros, medios, defensas, portero
  const rows: [number, string][] = [[4, "16%"], [3, "40%"], [2, "64%"], [1, "87%"]];
  const hole = l.starters.filter((p) => p.hole);
  const disputes = l.disputes ?? [];
  const doubt = l.starters.filter((p) => !p.hole && (disputes.some((d) => d.id === p.id) || p.status === "doubtful" || (p.startProb !== null && p.startProb < 60)));
  const doubtOnly = doubt.filter((p) => !disputes.some((d) => d.id === p.id));
  const captain = l.starters.find((p) => p.id === l.captainId);
  const label = `Once en ${l.formation}${captain ? `, con ${captain.name} de capitán` : ""}${hole.length ? ` y ${hole.length} hueco${hole.length > 1 ? "s" : ""}` : ""}`;
  return (
    <>
      <div className="pitch" role="img" aria-label={label}>
        <div className="lines" aria-hidden="true" />
        <div className="area-n" aria-hidden="true" />
        <div className="area-s" aria-hidden="true" />
        {rows.map(([pos, top]) => (
          <div key={pos} className="line-up" style={{ top }}>
            {l.starters.filter((p) => p.positionId === pos).map((p) => {
              const cls = p.hole ? "player hole" : doubt.includes(p) ? "player doubt" : "player";
              const pct = p.startProb !== null && (p.hole || doubt.includes(p)) ? `${p.startProb} %` : null;
              if (p.id.startsWith("vacio-")) {
                return (
                  <span key={p.id} className="player hole">
                    <span className="disc">+</span>
                    <span className="name">Sin jugador</span>
                  </span>
                );
              }
              return (
                <Link key={p.id} href={`/jugador/${p.id}`} className={cls}>
                  <span className="disc">{p.nota ?? "–"}</span>
                  {p.id === l.captainId && <span className="arm" aria-hidden="true">C</span>}
                  <span className="name">{p.name}</span>
                  {pct && <span className="pct">{pct}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="legend">
        {captain && (
          <li><span className="k c" aria-hidden="true">C</span><span>Capitán: {captain.name}, {captain.expected.toLocaleString("es-ES")} pts esperados{captain.startProb !== null ? ` y ${captain.startProb} % de ser titular` : ""}.</span></li>
        )}
        {hole.length > 0 && (
          <li><span className="k h" aria-hidden="true" /><span>Huecos: {hole.filter((p) => !p.id.startsWith("vacio-")).length ? `${hole.filter((p) => !p.id.startsWith("vacio-")).map((p) => p.name).join(" y ")} entra${hole.filter((p) => !p.id.startsWith("vacio-")).length > 1 ? "n" : ""} por obligación y no va${hole.filter((p) => !p.id.startsWith("vacio-")).length > 1 ? "n" : ""} a jugar. ` : ""}{hole.some((p) => p.id.startsWith("vacio-")) ? "Te faltan jugadores para completar el once." : ""}</span></li>
        )}
        {disputes.map((d) => (
          <li key={d.id}><span className="k d" aria-hidden="true" /><span>⚠️ No está claro que {d.name} sea titular: {d.sources}. Si no sale en el once, mete a {d.sub}.</span></li>
        ))}
        {doubtOnly.length > 0 && (
          <li><span className="k d" aria-hidden="true" /><span>Dudas: {doubtOnly.map((p) => p.name).join(", ")}.{l.out.length ? ` No alinees a ${l.out.map((p) => p.name).join(", ")}.` : ""}</span></li>
        )}
        {!doubt.length && l.out.length > 0 && <li><span className="k d" aria-hidden="true" /><span>No alinees a {l.out.map((p) => p.name).join(", ")}.</span></li>}
      </ul>
      <p className="small" style={{ marginTop: 10 }}>El número es la nota de hoy. Toca un jugador para ver su ficha.</p>
    </>
  );
}

export default async function Hoy() {
  const { current, user, viewing } = await currentLeague();
  const plan = current ? await latestPlan(current.id, user?.id) : null;

  if (!plan) {
    const [session] = user ? await (await getDb()).select().from(laligaSessions).where(eq(laligaSessions.userId, user.id)) : [];
    const connected = !user || (!!session && !session.lastError);
    return (
      <main>
        <h1>Tu plan de hoy</h1>
        <p className="lead">Aquí verás qué hacer en cada liga: a quién proteger, por quién pujar, a quién vender y tu mejor once.</p>
        {user && !viewing && <Welcome userId={user.id} />}
        {connected && !viewing && (
          <div className="empty">
            <h2>Aún no hay plan</h2>
            <p>Se genera solo a las 9:00 y a las 18:00. Para tenerlo ya, pulsa el botón.</p>
            <div style={{ marginTop: 16 }}><Refresh since={null} /></div>
          </div>
        )}
      </main>
    );
  }

  const me = plan.liga?.standing.find((s) => s.teamId === plan.liga?.myTeamId);
  const close = plan.closeAt && plan.closeAt > new Date() ? plan.closeAt : null;
  const all = plan.acciones.filter((a) => a.tipo !== "alinear").sort((a, b) => a.prioridad - b.prioridad);
  const moves = all.filter((a) => !a.hecho);
  const done = all.filter((a) => a.hecho);
  const since = plan.createdAt.toISOString();

  return (
    <main>
      {user && !viewing && <Welcome userId={user.id} />}
      <div className="hero">
        <div>
          <p className="kicker">Tu plan · {plan.leagueName}</p>
          <h1>{close ? <>Cierre del <span className="hl">mercado</span></> : <>Tu plan <span className="hl">de hoy</span></>}</h1>
          <p className="lead">
            {close ? "Esto es lo que te toca hacer antes de que cierre, de lo más urgente a lo que puede esperar." : "Esto es lo que te toca hacer, de lo más urgente a lo que puede esperar."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <dl className="stats">
            {close && (
              <div className="clock">
                <dt>El mercado cierra</dt>
                <dd><span className="day">{madrid(close, { weekday: "long" })}</span>{madrid(close, { hour: "2-digit", minute: "2-digit" })}</dd>
              </div>
            )}
            <div><dt>Tu dinero</dt><dd className={plan.myMoney < 0 ? "down" : "cash"}>{money(plan.myMoney)}</dd></div>
            {me && <div><dt>Puesto</dt><dd>{me.position}.º <span className="pts">{me.points} pts</span></dd></div>}
          </dl>
          {!viewing && <Refresh since={since} leagueId={plan.leagueId} />}
        </div>
      </div>

      <div className="cols">
        <section className="col-main" aria-labelledby="mov">
          <h2 id="mov">Tus movimientos</h2>
          {moves.length ? (
            <ol className="rule">
              {moves.map((a, i) => (
                <li key={i} className={`move ${a.tipo}`}>
                  <span className="tarjeta" aria-hidden="true" />
                  <div className="body">
                    <div className="row">
                      <h3>{a.playerId && a.titulo ? <Link href={`/jugador/${a.playerId}`} style={{ textDecoration: "none" }}>{a.titulo}</Link> : (a.titulo ?? TIPO[a.tipo])}</h3>
                      <span className="tipo">{TIPO[a.tipo] ?? a.tipo}</span>
                    </div>
                    <p>{a.detalle ?? plain(a.texto)}</p>
                    {a.pendiente && <p className="pending">{a.pendiente}</p>}
                  </div>
                  {a.key && current && !viewing && <DoneButton since={since} leagueId={plan.leagueId} k={a.key} />}
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty"><p>{done.length ? "Lo tienes todo hecho." : "Nada urgente: tu plantilla está bien y no hay gangas claras."}</p></div>
          )}
          {done.length > 0 && (
            <>
              <h3 style={{ margin: "28px 0 6px", fontSize: 18 }}>Hecho</h3>
              <ul className="rule done-list">
                {done.map((a, i) => (
                  <li key={i}><s>{a.titulo ?? TIPO[a.tipo]}</s>{a.detalle === "Ya está a la venta." && <span className="small"> · ya está a la venta</span>}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {plan.lineup && (
          <section className="col-side" aria-labelledby="once">
            <div className="pitch-head">
              <h2 id="once">Tu once · {plan.lineup.formation}</h2>
              <span className="small">unos {plan.lineup.expected.toLocaleString("es-ES")} pts</span>
            </div>
            <Pitch l={plan.lineup} />
          </section>
        )}
      </div>

      <p style={{ marginTop: 32 }}><Link href="/aciertos" className="chip">Cuánto acertamos →</Link> <span className="small">lo que te dijo el plan y qué pasó después</span></p>

      <p className="small" style={{ marginTop: 16 }}>
        Plan de las {madrid(plan.createdAt, { hour: "2-digit", minute: "2-digit" })} del {madrid(plan.createdAt, { day: "numeric", month: "long" })}
        {plan.scoreDay ? ", con las notas de ese día" : ""}. Se actualiza a las 9:00, a las 18:00 y 4 horas antes del cierre; si mueves algo en LaLiga, pulsa Actualizar plan. El dinero de los rivales es un máximo.
      </p>
    </main>
  );
}
