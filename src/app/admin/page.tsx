// Administrador: cómo le va al bot con cada usuario y qué hace cada uno (visitas, Hecho, preguntas),
// y "Ver su plan" para mirar la web como él. La actividad se guarda 30 días.
import { desc, eq, gte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { activity, chatUsage, espiaPlans, feedback, laligaSessions, leagues, memberships, users } from "@/db/schema";
import { activeDays } from "@/lib/actividad";
import { seats } from "@/lib/plazas";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const madrid = (d: Date, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) =>
  d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", ...o });
const ago = (d: Date) => {
  const m = (Date.now() - d.getTime()) / 6e4;
  return m < 60 ? `hace ${Math.max(1, Math.round(m))} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

type Event = { at: Date; icon: string; text: string; quote?: string };

export default async function Admin() {
  const me = await requireUser("/admin");
  if (!me.isAdmin) notFound();
  const db = await getDb();
  const week = new Date(Date.now() - 7 * 864e5);
  const [us, ss, ms, ls, plans, chats, ops, plazas, acts] = await Promise.all([
    db.select().from(users).orderBy(users.id),
    db.select().from(laligaSessions),
    db.select().from(memberships),
    db.select().from(leagues),
    db.select({ userId: espiaPlans.userId, leagueId: espiaPlans.leagueId, leagueName: espiaPlans.leagueName, createdAt: espiaPlans.createdAt, acciones: espiaPlans.acciones })
      .from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(1000),
    db.select().from(chatUsage).where(eq(chatUsage.day, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }))),
    db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(50),
    seats(db),
    db.select().from(activity).where(gte(activity.createdAt, week)).orderBy(desc(activity.createdAt)).limit(2000),
  ]);
  const leagueName = new Map(ls.map((l) => [l.leagueId, l.name]));
  const nameOf = new Map(us.map((u) => [u.id, u.name]));

  const rows = us.map((u) => {
    const s = ss.find((x) => x.userId === u.id);
    const mine = acts.filter((a) => a.userId === u.id);
    const myPlans = plans.filter((p) => p.userId === u.id);
    const last = myPlans[0];
    const events: Event[] = [
      ...mine.map((a): Event => {
        if (a.kind === "visita") return { at: a.createdAt, icon: "👀", text: `Abrió la web${a.detail && a.detail !== "/" ? ` (${a.detail})` : ""}` };
        if (a.kind === "hecho") return { at: a.createdAt, icon: "✅", text: `Marcó como hecho: ${a.detail ?? ""}` };
        if (a.kind === "pregunta") return { at: a.createdAt, icon: "💬", text: "Preguntó", quote: a.detail ?? "" };
        return { at: a.createdAt, icon: "🔄", text: "Pidió actualizar el plan" };
      }),
      ...myPlans.filter((p) => p.createdAt >= week).map((p): Event => {
        const n = p.acciones.filter((a) => a.tipo !== "alinear").length;
        return { at: p.createdAt, icon: "📋", text: `Recibió el plan de ${p.leagueName}: ${n} movimiento${n === 1 ? "" : "s"}` };
      }),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      u, s, last, events,
      ligas: ms.filter((m) => m.userId === u.id).map((m) => leagueName.get(m.leagueId) ?? m.leagueId),
      pending: last ? last.acciones.filter((a) => a.tipo !== "alinear" && !a.hecho).length : 0,
      chatToday: chats.find((c) => c.userId === u.id)?.count ?? 0,
      days: activeDays(mine.filter((a) => a.kind === "visita").map((a) => a.createdAt)),
      done: mine.filter((a) => a.kind === "hecho").length,
      asked: mine.filter((a) => a.kind === "pregunta").length,
    };
  });
  const friends = rows.filter((r) => !r.u.isAdmin);
  const stale = rows.filter((r) => r.s && !r.s.lastError && (!r.last || Date.now() - r.last.createdAt.getTime() > 26 * 36e5));
  const questions = acts.filter((a) => a.kind === "pregunta").slice(0, 30);

  return (
    <main>
      <p className="kicker">Solo tú ves esto</p>
      <h1>Tus <span className="hl">amigos</span></h1>

      <dl className="stats" style={{ margin: "24px 0 32px" }}>
        <div><dt>Usuarios</dt><dd>{us.length}</dd></div>
        <div><dt>Conectados</dt><dd className="cash">{ss.filter((s) => !s.lastError).length}</dd></div>
        <div><dt>Activos esta semana</dt><dd>{friends.filter((r) => r.days > 0).length}</dd></div>
        <div><dt>Plazas</dt><dd>{plazas.max ? `${plazas.used}/${plazas.max}` : "∞"}</dd></div>
        <div><dt>Grupos con Espía</dt><dd>{ls.filter((l) => l.active && l.groupChatId).length}</dd></div>
      </dl>
      {!plazas.max && <p className="small">Sin tope de plazas: pon MAX_USUARIOS en Vercel.</p>}
      {stale.length > 0 && <p className="bad">Sin plan en más de 26 h aunque están conectados: {stale.map((r) => r.u.name).join(", ")}. Mira los registros de GitHub Actions.</p>}

      <section aria-labelledby="usuarios">
        <h2 id="usuarios">Usuarios</h2>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Usuario</th><th scope="col">LaLiga</th><th scope="col">Última visita</th><th scope="col">Último plan</th>
                <th scope="col">Esta semana</th><th scope="col"><span className="sr-only">Ver</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, s, last, ligas, pending, days, done, asked, chatToday }) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}{u.isAdmin && <span className="muted" style={{ fontWeight: 400 }}> (tú)</span>}<div className="small">{ligas.join(", ") || "sin ligas"}</div></td>
                  <td>
                    {!s ? <span className="muted">Sin conectar</span> : s.lastError ? <span className="bad" title={s.lastError}>Caducada</span> : <span className="up">Conectada</span>}
                    <div className="small">desde el {madrid(u.createdAt, { day: "numeric", month: "short" })}</div>
                  </td>
                  <td>{u.isAdmin ? <span className="muted">–</span> : u.lastSeenAt ? <>{ago(u.lastSeenAt)}<div className="small">{days} de 7 días</div></> : <span className="muted">Nunca</span>}</td>
                  <td>{last ? <>{ago(last.createdAt)}<div className="small">{leagueName.get(last.leagueId) ?? last.leagueName} · {pending} pendiente{pending === 1 ? "" : "s"}</div></> : <span className="muted">Ninguno</span>}</td>
                  <td>{u.isAdmin ? <span className="muted">–</span> : <>{done} hecho{done === 1 ? "" : "s"} · {asked} pregunta{asked === 1 ? "" : "s"}<div className="small">{chatToday} preguntas hoy</div></>}</td>
                  <td>{!u.isAdmin && last && <a className="chip" href={`/api/admin/ver?u=${u.id}`}>Ver su plan</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="actividad" style={{ marginTop: 44 }}>
        <h2 id="actividad">Actividad de la semana</h2>
        {friends.length ? (
          <div className="timelines">
            {friends.map((r) => (
              <details key={r.u.id} className="card timeline" open={friends.length <= 3}>
                <summary>
                  <b>{r.u.name}</b>
                  <span className="small">{r.events.length ? `${r.events.length} cosas · lo último ${ago(r.events[0].at)}` : "Nada esta semana"}</span>
                </summary>
                {r.events.length > 0 && (
                  <ol>
                    {r.events.slice(0, 40).map((e, i) => (
                      <li key={i}>
                        <span className="when">{madrid(e.at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        <span aria-hidden="true">{e.icon}</span>
                        <span>{e.text}{e.quote && <q>{e.quote}</q>}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            ))}
          </div>
        ) : <p className="muted">Aún no hay nadie más que tú.</p>}
      </section>

      <div className="cols" style={{ marginTop: 44 }}>
        <section className="col-main" aria-labelledby="preguntas">
          <h2 id="preguntas">Qué preguntan</h2>
          {questions.length ? (
            <ul className="rule">
              {questions.map((q) => (
                <li key={q.id}>
                  <span className="small">{nameOf.get(q.userId) ?? "?"} · {madrid(q.createdAt)}</span>
                  <p style={{ margin: "4px 0 0", color: "var(--ink)" }}>«{q.detail}»</p>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nadie ha preguntado nada esta semana.</p>}
        </section>

        <section className="col-side" aria-labelledby="opiniones">
          <h2 id="opiniones">Opiniones</h2>
          {ops.length ? (
            <ul className="rule">
              {ops.map((o) => (
                <li key={o.id}>
                  <b>{o.name}</b> <span className="small">· {madrid(o.createdAt)}</span>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{o.text}</p>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Aún nadie ha mandado nada. Llegan con /opinion en el bot.</p>}
        </section>
      </div>

      <section aria-labelledby="grupos" style={{ marginTop: 44 }}>
        <h2 id="grupos">Ligas</h2>
        <ul className="rule">
          {ls.map((l) => (
            <li key={l.leagueId} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span><b>{l.name}</b> <span className="small">· {ms.filter((m) => m.leagueId === l.leagueId).length} miembros</span></span>
              <span className="small">
                {!l.active ? "Apagada" : l.groupChatId ? `Espía en el grupo (de ${nameOf.get(l.groupOwnerId ?? -1) ?? "?"})` : "Sin grupo"}
                {l.groupChatId && ` · dinero ${l.showMoney ? "sí" : "no"} · subidas ${l.showRaises ? "sí" : "no"}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="small" style={{ marginTop: 32 }}>La actividad se guarda 30 días. Tus propias visitas no cuentan.</p>
    </main>
  );
}
