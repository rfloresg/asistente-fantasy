// Fase 1: página para comprobar que la ingesta guarda bien los datos.
// La Nota Fantasy llega en la fase 2.

import { lastRun, movers, type Mover } from "@/lib/queries";

export const dynamic = "force-dynamic";

const POS = ["", "POR", "DEF", "MED", "DEL", "ENT"];
const STATUS: Record<string, string> = { injured: "Lesión", doubtful: "Duda", suspended: "Sanción" };
const money = (n: number) => `${(n / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
const fmtDate = (d: Date) =>
  d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" });

function Table({ rows }: { rows: Mover[] }) {
  return (
    <div className="wrap">
      <table>
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Pos.</th>
            <th className="n">Valor</th>
            <th className="n">7 días</th>
            <th className="n">Pujas ayer</th>
            <th className="n">Media pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.nickname} <span className="muted">{r.team}</span>{" "}
                {STATUS[r.status] && <span className="bad">{STATUS[r.status]}</span>}
              </td>
              <td>{POS[r.position] ?? r.position}</td>
              <td className="n">{money(r.value)}</td>
              <td className={`n ${r.pct7 >= 0 ? "up" : "down"}`}>
                {r.pct7 > 0 ? "+" : ""}
                {r.pct7.toLocaleString("es-ES")} %
              </td>
              <td className="n">{r.bids}</td>
              <td className="n">{r.avg.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Home() {
  const [run, up, down] = await Promise.all([lastRun(), movers("up"), movers("down")]);

  return (
    <main>
      <h1>Asistente Fantasy</h1>
      <p className="muted">
        {run
          ? `Última ingesta: ${fmtDate(run.startedAt)} · ${run.ok ? "correcta" : "con fallos"} · ${run.players} jugadores`
          : "Sin datos. Ejecuta npm run ingest."}
      </p>

      <h2>Más suben en 7 días</h2>
      <Table rows={up} />

      <h2>Más bajan en 7 días</h2>
      <Table rows={down} />
    </main>
  );
}
