// Cuánto acertamos: lo que el plan te dijo desde que usas la app y qué pasó después.

import Link from "next/link";
import { loadAciertos } from "@/lib/aciertos-db";
import { HORIZON_DAYS, type Kind, type RecOutcome, type Summary } from "@/lib/aciertos";
import { money, n1, pct } from "@/lib/format";
import { currentLeague } from "@/lib/ligas";

export const dynamic = "force-dynamic";

const day = (d: Date, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", ...o });
const LABEL: Record<Kind, string> = { fichar: "Fichar", vender: "Vender", proteger: "Proteger" };
const FEW = 5;

function verdict(r: RecOutcome) {
  if (r.ok === null) return <span className="nota mid" title={r.days ? "Sin datos" : "Pendiente"} aria-label={r.days ? "Sin datos" : "Pendiente"}>…</span>;
  return r.ok ? <span className="nota hi" aria-label="Acierto" title="Acierto">✓</span> : <span className="nota lo" aria-label="Fallo" title="Fallo">✗</span>;
}

// Sin "-0 %": por debajo de 0,05 es 0
const pc = (x: number | null) => (x === null ? "–" : Math.abs(x) < 0.05 ? "0 %" : pct(x));

function SummaryCard({ kind, s }: { kind: Kind; s: Summary }) {
  if (!s.n) return null;
  return (
    <div className="card">
      <div className="k">{LABEL[kind]} · {s.n} consejo{s.n > 1 ? "s" : ""}</div>
      <div className="v">{s.judged ? `${s.ok} de ${s.judged} acertados` : "Pendiente"}</div>
      {kind !== "proteger" && s.avgChange !== null && (
        <div className="small">Valor {pc(s.avgChange)} de media; el mercado, {pc(s.avgMarket)}{s.avgPts !== null ? ` · ${n1(s.avgPts)} pts por jornada` : ""}</div>
      )}
      {kind === "fichar" && s.followed > 0 && <div className="small">Fichaste {s.followed}: {s.followedMoney >= 0 ? "han subido" : "han bajado"} {money(Math.abs(s.followedMoney))} desde el consejo</div>}
      {kind === "vender" && s.followed > 0 && <div className="small">Vendiste {s.followed}: {s.followedMoney >= 0 ? `de haberlos guardado, valdrían ${money(s.followedMoney)} menos` : `han subido ${money(-s.followedMoney)} después`}</div>}
      {kind === "proteger" && s.judged > 0 && <div className="small">Sigues teniendo {s.ok} de {s.judged}</div>}
    </div>
  );
}

export default async function Aciertos() {
  const { current, user } = await currentLeague();
  const a = current ? await loadAciertos(current.id, user?.id ?? null) : null;

  if (!a || !a.since) {
    return (
      <main>
        <h1>Cuánto acertamos</h1>
        <p className="lead">Lo que te dijo el plan y qué pasó después.</p>
        <div className="empty">
          <h2>Aún no hay planes tuyos</h2>
          <p>Con el primer plan (llega cuando se renueva el mercado de tu liga) empezamos a medir. En unos días tendrás aquí los primeros resultados.</p>
        </div>
      </main>
    );
  }

  const { summary: s } = a;
  const measured = s.fichar.measured + s.vender.measured;
  const recs = [...a.recs].sort((x, y) => y.at.getTime() - x.at.getTime());

  return (
    <main>
      <h1>Cuánto acertamos</h1>
      <p className="lead">
        Todo lo que te ha dicho el plan en {current!.name} desde el {day(a.since, { day: "numeric", month: "long" })}, y qué pasó después.
        El valor se mide hasta {HORIZON_DAYS} días después del consejo y se compara con lo que se movió el mercado esos mismos días.
      </p>
      {measured < FEW && <p className="small">Aún hay pocos datos: con una o dos semanas más esto ya dice algo.</p>}

      <div className="grid">
        <SummaryCard kind="fichar" s={s.fichar} />
        <SummaryCard kind="vender" s={s.vender} />
        <SummaryCard kind="proteger" s={s.proteger} />
      </div>

      {a.xi.length > 0 && (
        <section aria-labelledby="xi">
          <h2 id="xi">Tu once</h2>
          <p className="small">El último once que te recomendamos antes de cada jornada: lo que esperábamos y lo que sacó.</p>
          <div className="wrap">
            <table>
              <thead><tr><th scope="col">Jornada</th><th scope="col" className="n">Esperados</th><th scope="col" className="n">Sacó</th></tr></thead>
              <tbody>
                {a.xi.map((x) => (
                  <tr key={x.week}>
                    <td>J{x.week}</td>
                    <td className="n">{n1(x.expected)}</td>
                    <td className={`n ${x.actual >= x.expected ? "up" : "down"}`}>{x.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="todo">
        <h2 id="todo">Cada consejo</h2>
        <p className="small">«Lo hiciste» sale de tu plantilla en los planes siguientes, no del botón Hecho.</p>
        <div className="wrap">
          <table className="cards-m ac">
            <thead>
              <tr>
                <th scope="col">Resultado</th>
                <th scope="col">Jugador</th>
                <th scope="col">Consejo</th>
                <th scope="col">Cuándo</th>
                <th scope="col" className="n">Valor</th>
                <th scope="col" className="n">Mercado</th>
                <th scope="col" className="n">Pts/jornada</th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr key={`${r.kind}:${r.playerId}`}>
                  <td className="c-nota">{verdict(r)}</td>
                  <td className="c-name"><Link href={`/jugador/${r.playerId}`} className="stretch">{r.name}</Link></td>
                  <td className="c-pos">{LABEL[r.kind]}</td>
                  <td className="c-act">{day(r.at)}{r.followed !== null && <span className="muted"> · {r.followed ? "le hiciste caso" : "no lo hiciste"}</span>}</td>
                  <td className={`n ${r.change === null || Math.abs(r.change) < 0.05 ? "" : r.change > 0 ? "up" : "down"}`} data-label="Valor">{pc(r.change)}{r.change !== null ? <div className="small">en {r.days} día{r.days > 1 ? "s" : ""}</div> : !r.days && <div className="small">desde mañana</div>}</td>
                  <td className="n" data-label="Mercado">{pc(r.market)}</td>
                  <td className="n" data-label="Pts/jornada">{n1(r.ptsPerWeek)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small">Acierto: un fichaje que sube más que el mercado o hace 6 pts o más por jornada; una venta que baja más que el mercado; un jugador protegido que sigues teniendo.</p>
    </main>
  );
}
