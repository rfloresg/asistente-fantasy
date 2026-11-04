// Administrador: cómo le va al bot con cada usuario, y "Ver su plan" para mirar la web como él.
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { chatUsage, espiaPlans, laligaSessions, leagues, memberships, users } from "@/db/schema";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const madrid = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ago = (d: Date) => {
  const h = (Date.now() - d.getTime()) / 36e5;
  return h < 1 ? "hace menos de 1 h" : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`;
};

export default async function Admin() {
  const me = await requireUser("/admin");
  if (!me.isAdmin) notFound();
  const db = await getDb();
  const [us, ss, ms, ls, plans, chats] = await Promise.all([
    db.select().from(users).orderBy(users.id),
    db.select().from(laligaSessions),
    db.select().from(memberships),
    db.select().from(leagues),
    db.select({ userId: espiaPlans.userId, leagueId: espiaPlans.leagueId, createdAt: espiaPlans.createdAt, acciones: espiaPlans.acciones })
      .from(espiaPlans).orderBy(desc(espiaPlans.createdAt)).limit(500),
    db.select().from(chatUsage).where(eq(chatUsage.day, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }))),
  ]);
  const leagueName = new Map(ls.map((l) => [l.leagueId, l.name]));
  const rows = us.map((u) => {
    const s = ss.find((x) => x.userId === u.id);
    const last = plans.find((p) => p.userId === u.id);
    return {
      u, s, last,
      ligas: ms.filter((m) => m.userId === u.id).map((m) => leagueName.get(m.leagueId) ?? m.leagueId),
      pending: last ? last.acciones.filter((a) => a.tipo !== "alinear" && !a.hecho).length : 0,
      chat: chats.find((c) => c.userId === u.id)?.count ?? 0,
    };
  });
  const stale = rows.filter((r) => r.s && !r.s.lastError && (!r.last || Date.now() - r.last.createdAt.getTime() > 26 * 36e5));

  return (
    <main>
      <h1>Administración</h1>
      <p className="lead">{us.length} usuarios · {ss.filter((s) => !s.lastError).length} conectados · {ls.filter((l) => l.active && l.groupChatId).length} grupos con Espía</p>
      {stale.length > 0 && <p className="bad">Sin plan en más de 26 h aunque están conectados: {stale.map((r) => r.u.name).join(", ")}. Mira los registros de GitHub Actions.</p>}

      <section aria-labelledby="usuarios">
        <h2 id="usuarios">Usuarios</h2>
        <div className="wrap">
          <table>
            <thead>
              <tr><th scope="col">Usuario</th><th scope="col">LaLiga</th><th scope="col">Ligas</th><th scope="col">Último plan</th><th scope="col" className="n">Preguntas hoy</th><th scope="col"><span className="sr-only">Ver</span></th></tr>
            </thead>
            <tbody>
              {rows.map(({ u, s, last, ligas, pending, chat }) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}{u.isAdmin && <span className="muted" style={{ fontWeight: 400 }}> (tú)</span>}<div className="small">desde el {madrid(u.createdAt)}</div></td>
                  <td>
                    {!s ? <span className="muted">Sin conectar</span> : s.lastError ? <span className="bad" title={s.lastError}>Caducada</span> : <span className="up">Conectada</span>}
                    {s && <div className="small">renovada {ago(s.updatedAt)}</div>}
                  </td>
                  <td>{ligas.join(", ") || <span className="muted">–</span>}</td>
                  <td>{last ? <>{ago(last.createdAt)}<div className="small">{leagueName.get(last.leagueId)} · {pending} movimiento{pending === 1 ? "" : "s"}</div></> : <span className="muted">Ninguno</span>}</td>
                  <td className="n">{chat}</td>
                  <td>{!u.isAdmin && last && <a className="chip" href={`/api/admin/ver?u=${u.id}`}>Ver su plan</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="grupos" style={{ marginTop: 40 }}>
        <h2 id="grupos">Ligas</h2>
        <ul className="rule">
          {ls.map((l) => (
            <li key={l.leagueId} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span><b>{l.name}</b> <span className="small">· {ms.filter((m) => m.leagueId === l.leagueId).length} miembros</span></span>
              <span className="small">
                {!l.active ? "Apagada" : l.groupChatId ? `Espía en el grupo (de ${us.find((u) => u.id === l.groupOwnerId)?.name ?? "?"})` : "Sin grupo"}
                {l.groupChatId && ` · dinero ${l.showMoney ? "sí" : "no"} · subidas ${l.showRaises ? "sí" : "no"}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
