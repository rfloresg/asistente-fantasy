// Mercado: todos los jugadores con su Nota Fantasy del día.

import Link from "next/link";
import { ACTION, money, n1, notaClass, pct, POS, STATUS, fmtDate } from "@/lib/format";
import { lastRun, market, type Order } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

export default async function Mercado({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const pos = Number(q.pos) || undefined;
  const action = q.accion || undefined;
  const order = (["nota", "forma", "tendencia", "valor"].includes(q.orden ?? "") ? q.orden : "nota") as Order;
  const maxValue = Number(q.max) ? Number(q.max) * 1e6 : undefined;

  const [run, { day, rows }] = await Promise.all([lastRun(), market({ pos, action, order, maxValue })]);

  return (
    <main>
      <h1>Mercado</h1>
      <p className="lead">Todos los jugadores con su nota de hoy. Filtra por puesto, consejo o precio.</p>
      <p className="muted">
        {run ? `Datos: ${fmtDate(run.startedAt)} · ${run.ok ? "correctos" : "con fallos"}` : "Sin datos. Ejecuta npm run ingest."}
        {day ? ` · Nota del ${day}` : " · Sin notas. Ejecuta npm run score."}
      </p>

      <form className="filters">
        <select name="pos" defaultValue={q.pos ?? ""}>
          <option value="">Todas las posiciones</option>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>{POS[p]}</option>
          ))}
        </select>
        <select name="accion" defaultValue={q.accion ?? ""}>
          <option value="">Todas las acciones</option>
          <option value="fichar">Fichar</option>
          <option value="mantener">Mantener</option>
          <option value="vender">Vender</option>
        </select>
        <select name="max" defaultValue={q.max ?? ""}>
          <option value="">Cualquier precio</option>
          {[2, 5, 10, 20, 50].map((m) => (
            <option key={m} value={m}>Hasta {m} M</option>
          ))}
        </select>
        <select name="orden" defaultValue={order}>
          <option value="nota">Ordenar por nota</option>
          <option value="forma">Ordenar por forma</option>
          <option value="tendencia">Ordenar por subida 7 días</option>
          <option value="valor">Ordenar por valor</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>Nota</th>
              <th>Jugador</th>
              <th>Pos.</th>
              <th>Acción</th>
              <th className="n">Valor</th>
              <th className="n">7 días</th>
              <th className="n">Forma</th>
              <th className="n">Titular</th>
              <th className="n">Puja máx.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, nickname, team, position, status, s }) => (
              <tr key={id}>
                <td><span className={notaClass(s.nota)}>{s.nota}</span></td>
                <td>
                  <Link href={`/jugador/${id}`}>{nickname}</Link> <span className="muted">{team}</span>{" "}
                  {STATUS[status] && <span className="bad">{STATUS[status]}</span>}
                </td>
                <td>{POS[position]}</td>
                <td>{ACTION[s.action]}</td>
                <td className="n">{money(s.value)}</td>
                <td className={`n ${(s.pct7 ?? 0) >= 0 ? "up" : "down"}`}>{pct(s.pct7)}</td>
                <td className="n">{n1(s.formAvg)}</td>
                <td className="n">{s.startProb === null ? "–" : `${s.startProb} %`}</td>
                <td className="n">{s.action === "fichar" ? money(s.maxBidPlay) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Forma: puntos por partido en los últimos 5 de su equipo. Titular: probabilidad según el once probable de futbolfantasy. Puja máx.: lo máximo que pagaría para jugarlo, según su nota.
      </p>
    </main>
  );
}
