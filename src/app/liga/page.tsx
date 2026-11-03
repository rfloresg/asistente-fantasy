// Liga: clasificación con el dinero estimado, últimos movimientos, cláusulas que se liberan y bajas.
// Es lo mismo que ve el grupo de Telegram; lo guarda el Espía con cada plan.

import { money } from "@/lib/format";
import { currentLeague, latestPlan } from "@/lib/ligas";

export const dynamic = "force-dynamic";

const madrid = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", ...o });

// El texto viene del Espía con los nombres ya escapados y solo <b>: se pinta tal cual sin el emoji del principio
const clean = (html: string) => html.replace(/^\S+\s/, "");

const KIND: [RegExp, string][] = [[/ficha/, "Ficha"], [/vende/, "Vende"], [/Clausulazo/, "Cláusula"], [/blinda/, "Blinda"], [/alineación/, "Alineación"], [/se une/, "Llega"]];
const kind = (t: string) => KIND.find(([r]) => r.test(t))?.[1] ?? "";

export default async function Liga() {
  const { current } = await currentLeague();
  const plan = current ? await latestPlan(current.id) : null;
  const liga = plan?.liga;

  if (!plan || !liga) {
    return (
      <main>
        <h1>Tu liga</h1>
        <p className="lead">Clasificación, dinero de cada mánager, fichajes y cláusulas.</p>
        <div className="empty">
          <h2>Aún no hay datos de la liga</h2>
          <p>Llegan con el próximo plan (a las 9:00 o a las 18:00), o ya mismo con <code>npm run espia plan</code>.</p>
        </div>
      </main>
    );
  }

  const withMoney = liga.standing.some((s) => s.money !== undefined);

  return (
    <main>
      <h1>{plan.leagueName}</h1>
      <p className="lead">{liga.standing.length} mánagers. Lo mismo que ve el grupo de Telegram, en una página.</p>

      <div className="cols">
        <div className="col-main">
          <section aria-labelledby="clas">
            <h2 id="clas">Clasificación</h2>
            <div className="wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Puesto</th>
                    <th scope="col">Mánager</th>
                    <th scope="col" className="n">Puntos</th>
                    <th scope="col" className="n hide-m">Plantilla</th>
                    {withMoney && <th scope="col" className="n">Dinero<span className="hide-m">, como mucho</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {liga.standing.map((s) => {
                    const mine = s.teamId === liga.myTeamId;
                    const move = s.previous && s.previous !== s.position ? (s.previous > s.position ? "sube" : "baja") : null;
                    return (
                      <tr key={s.teamId} className={mine ? "me" : undefined}>
                        <td className="pos">{s.position}{move && <span className={move === "sube" ? "up" : "down"} style={{ fontSize: 13, fontWeight: 600, marginLeft: 6 }}>{move}</span>}</td>
                        <td style={{ fontWeight: 600 }}>{s.manager}{mine && <span className="muted" style={{ fontWeight: 400 }}> (tú)</span>}</td>
                        <td className="n" style={{ fontWeight: 700 }}>{s.points}</td>
                        <td className="n hide-m">{s.teamValue ? money(s.teamValue) : "–"}</td>
                        {withMoney && <td className="n">{s.money === undefined ? "–" : money(s.money)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {withMoney && (
              <p className="small" style={{ maxWidth: "68ch" }}>
                Tu dinero es el real. El de los rivales sale de su actividad empezando en 100 M y no cuenta las subidas de cláusula anteriores al Espía: pueden tener menos.
              </p>
            )}
          </section>

          <section aria-labelledby="act" style={{ marginTop: 40 }}>
            <h2 id="act">Últimos movimientos</h2>
            {liga.activity.length ? (
              <ul className="rule">
                {liga.activity.map((a, i) => (
                  <li key={i} style={{ display: "flex", gap: 16 }}>
                    <span className="small when">
                      {kind(a.text)}<br />{madrid(a.at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: clean(a.text) }} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sin movimientos en la última semana.</p>
            )}
          </section>
        </div>

        <aside className="col-side" style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <section aria-labelledby="claus">
            <h2 id="claus">Cláusulas que se liberan</h2>
            {liga.unlocks.length ? (
              <ul className="rule">
                {liga.unlocks.map((u, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                    <span><b>{u.player}</b><br /><span className="small">de {u.manager}, {madrid(u.at, { weekday: "long", hour: "2-digit", minute: "2-digit" })}</span></span>
                    {u.clause && <span style={{ fontWeight: 800, fontStretch: "75%", fontVariationSettings: "\"wdth\" 75", fontSize: 22 }}>{money(u.clause)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Ninguna en las próximas 24 horas.</p>
            )}
          </section>

          <section aria-labelledby="bajas">
            <h2 id="bajas">Bajas</h2>
            {liga.injuries.length ? (
              <ul className="rule">
                {liga.injuries.map((b, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0" }}>
                    <span><b>{b.player}</b> <span className="muted">· {b.manager}</span></span>
                    <span className={b.status === "Duda" ? undefined : "bad"} style={b.status === "Duda" ? { color: "var(--ambar-t)", fontWeight: 600 } : undefined}>{b.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nadie lesionado, sancionado ni en duda.</p>
            )}
          </section>
        </aside>
      </div>

      <p className="small" style={{ marginTop: 40 }}>
        Datos de las {new Date(liga.updatedAt ?? plan.createdAt).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })}. Se actualizan cada 30 minutos; el dinero, a las 9:00 y a las 18:00.
      </p>
    </main>
  );
}
