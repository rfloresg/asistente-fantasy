// Mi plantilla y mercado de mi liga: desde una captura, con los datos de hoy.

import Link from "next/link";
import { money, n1, notaClass, pct, POS, STATUS } from "@/lib/format";
import { scoresFor } from "@/lib/queries";
import Upload from "./Upload";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;
type Row = Awaited<ReturnType<typeof scoresFor>>["rows"][number];

// En tu plantilla "fichar" significa que está en racha: mantener.
const SQUAD_ADVICE: Record<string, string> = { vender: "Vender", mantener: "Mantener", fichar: "Mantener (en racha)" };
const MARKET_ADVICE: Record<string, string> = { fichar: "Pujar", mantener: "Solo si lo necesitas", vender: "No pujar" };
const ORDER: Record<string, number> = { vender: 0, mantener: 1, fichar: 2 };

function Squad({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => (ORDER[a.s?.action ?? "mantener"] - ORDER[b.s?.action ?? "mantener"]) || (a.s?.nota ?? 0) - (b.s?.nota ?? 0));
  const sell = sorted.filter((r) => r.s?.action === "vender");
  const total = rows.reduce((t, r) => t + (r.s?.value ?? 0), 0);
  return (
    <>
      <div className="grid">
        <div className="card"><div className="k">Jugadores</div><div className="v">{rows.length}</div></div>
        <div className="card"><div className="k">Valor de la plantilla</div><div className="v">{money(total)}</div></div>
        <div className="card"><div className="k">Para vender</div><div className="v">{sell.length ? sell.map((r) => r.nickname).join(", ") : "Ninguno"}</div></div>
      </div>
      <Table rows={sorted} advice={SQUAD_ADVICE} market={false} />
    </>
  );
}

function Market({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => (b.s?.nota ?? 0) - (a.s?.nota ?? 0));
  const buy = sorted.filter((r) => r.s?.action === "fichar");
  return (
    <>
      <div className="grid">
        <div className="card"><div className="k">En venta</div><div className="v">{rows.length}</div></div>
        <div className="card"><div className="k">Por los que pujar</div><div className="v">{buy.length ? buy.map((r) => r.nickname).join(", ") : "Ninguno"}</div></div>
      </div>
      <Table rows={sorted} advice={MARKET_ADVICE} market />
    </>
  );
}

function Table({ rows, advice, market }: { rows: Row[]; advice: Record<string, string>; market: boolean }) {
  return (
    <div className="wrap" style={{ marginTop: 16 }}>
      <table>
        <thead>
          <tr>
            <th>Nota</th>
            <th>Jugador</th>
            <th>Pos.</th>
            <th>Consejo</th>
            <th className="n">Valor</th>
            <th className="n">7 días</th>
            <th className="n">Forma</th>
            <th className="n">Titular</th>
            {market ? <th className="n">Puja máx.</th> : <th className="n">En 7 días</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, nickname, team, position, status, s }) => (
            <tr key={id}>
              <td>{s ? <span className={notaClass(s.nota)}>{s.nota}</span> : "–"}</td>
              <td>
                <Link href={`/jugador/${id}`}>{nickname}</Link> <span className="muted">{team}</span>{" "}
                {STATUS[status] && <span className="bad">{STATUS[status]}</span>}
              </td>
              <td>{POS[position]}</td>
              <td>{s ? advice[s.action] : "Sin nota"}</td>
              <td className="n">{money(s?.value ?? null)}</td>
              <td className={`n ${(s?.pct7 ?? 0) >= 0 ? "up" : "down"}`}>{pct(s?.pct7 ?? null)}</td>
              <td className="n">{n1(s?.formAvg ?? null)}</td>
              <td className="n">{s?.startProb == null ? "–" : `${s.startProb} %`}</td>
              {market ? (
                <td className="n">{s?.action === "fichar" ? money(s.maxBidPlay) : s?.maxBidSpec ? `${money(s.maxBidSpec)} (especular)` : "–"}</td>
              ) : (
                <td className="n">{money(s?.expected ?? null)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Plantilla({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const tipo = q.tipo === "mercado" ? "mercado" : "plantilla";
  const ids = (q.ids ?? "").split(",").filter((x) => /^\d+$/.test(x));
  const { day, rows } = await scoresFor(ids);
  const question =
    tipo === "plantilla"
      ? `Esta es mi plantilla: ${rows.map((r) => `${r.nickname} (id ${r.id})`).join(", ")}. ¿Qué vendo, a quién mantengo y qué hago esta semana?`
      : `Estos jugadores están en venta en mi liga: ${rows.map((r) => `${r.nickname} (id ${r.id})`).join(", ")}. ¿Por quién pujo y hasta cuánto?`;

  return (
    <main>
      <Link className="back" href="/">← Mercado</Link>
      <h1 style={{ marginTop: 12 }}>{tipo === "plantilla" ? "Mi plantilla" : "Mercado de mi liga"}</h1>
      <div className="nav">
        <Link href="/plantilla?tipo=plantilla">Mi plantilla</Link>
        <Link href="/plantilla?tipo=mercado">Mercado de mi liga</Link>
      </div>
      <Upload tipo={tipo} hasIds={ids.length > 0} />
      {rows.length > 0 && (
        <>
          <p className="muted">Datos del {day}. Las cifras salen de la base de datos, no de la captura.</p>
          {tipo === "plantilla" ? <Squad rows={rows} /> : <Market rows={rows} />}
          <p style={{ marginTop: 16 }}>
            <Link href={`/chat?q=${encodeURIComponent(question)}`}>Pídele al asistente que lo analice →</Link>
          </p>
        </>
      )}
    </main>
  );
}
