// Mi plantilla y mercado de mi liga: desde una captura, con los datos de hoy.

import Link from "next/link";
import { money, n1, notaClass, pct, POS, STATUS } from "@/lib/format";
import { scoresFor } from "@/lib/queries";
import { currentLeague, latestPlan } from "@/lib/ligas";
import Upload from "./Upload";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;
type Row = Awaited<ReturnType<typeof scoresFor>>["rows"][number];

// En tu plantilla "fichar" significa que está en racha: mantener.
const SQUAD_ADVICE: Record<string, string> = { vender: "Vender", mantener: "Mantener", fichar: "Mantener (en racha)" };
const MARKET_ADVICE: Record<string, string> = { fichar: "Pujar", mantener: "Solo si lo necesitas", vender: "No pujar" };
const ORDER: Record<string, number> = { vender: 0, mantener: 1, fichar: 2 };

type Extra = { clauses?: Map<string, { clause?: number; lockedUntil?: string; shielded?: boolean }>; prices?: Map<string, { price: number; bids?: number; seller?: string }> };

const lockTxt = (iso?: string) => {
  if (!iso || Date.parse(iso) <= Date.now()) return "abierta";
  return `hasta el ${new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
};

function Squad({ rows, extra = {} }: { rows: Row[]; extra?: Extra }) {
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
      <Table rows={sorted} advice={SQUAD_ADVICE} market={false} extra={extra} />
    </>
  );
}

function Market({ rows, extra = {} }: { rows: Row[]; extra?: Extra }) {
  const sorted = [...rows].sort((a, b) => (b.s?.nota ?? 0) - (a.s?.nota ?? 0));
  const buy = sorted.filter((r) => r.s?.action === "fichar");
  return (
    <>
      <div className="grid">
        <div className="card"><div className="k">En venta</div><div className="v">{rows.length}</div></div>
        <div className="card"><div className="k">Por los que pujar</div><div className="v">{buy.length ? buy.map((r) => r.nickname).join(", ") : "Ninguno"}</div></div>
      </div>
      <Table rows={sorted} advice={MARKET_ADVICE} market extra={extra} />
    </>
  );
}

function Table({ rows, advice, market, extra = {} }: { rows: Row[]; advice: Record<string, string>; market: boolean; extra?: Extra }) {
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
            {extra.clauses && <th className="n">Cláusula</th>}
            {extra.prices && <th className="n">Sale por</th>}
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
              {extra.clauses && (() => {
                const c = extra.clauses!.get(id);
                return <td className="n">{c?.clause ? money(c.clause) : "–"}<div className="small">{c?.shielded ? "blindado" : lockTxt(c?.lockedUntil)}</div></td>;
              })()}
              {extra.prices && (() => {
                const m = extra.prices!.get(id);
                return <td className="n">{m ? money(m.price) : "–"}<div className="small">{m?.bids ? `${m.bids} puja${m.bids > 1 ? "s" : ""}` : m?.seller ? `de ${m.seller}` : "de la liga"}</div></td>;
              })()}
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
  const fromShot = (q.ids ?? "").split(",").filter((x) => /^\d+$/.test(x));

  // Sin captura: tu plantilla o el mercado de la liga elegida, tal como los guardó el Espía
  const { current } = await currentLeague();
  const liga = !fromShot.length && current ? (await latestPlan(current.id))?.liga : null;
  const fromLeague = tipo === "plantilla" ? liga?.squad : liga?.market;
  const ids = fromShot.length ? fromShot : (fromLeague ?? []).map((x) => x.id);
  const extra: Extra = !fromShot.length && liga
    ? tipo === "plantilla"
      ? { clauses: new Map((liga.squad ?? []).map((x) => [x.id, x])) }
      : { prices: new Map((liga.market ?? []).map((x) => [x.id, x])) }
    : {};
  const auto = !fromShot.length && !!fromLeague;

  const { day, rows } = await scoresFor(ids);
  const question =
    tipo === "plantilla"
      ? `Esta es mi plantilla: ${rows.map((r) => `${r.nickname} (id ${r.id})`).join(", ")}. ¿Qué vendo, a quién mantengo y qué hago esta semana?`
      : `Estos jugadores están en venta en mi liga: ${rows.map((r) => `${r.nickname} (id ${r.id})`).join(", ")}. ¿Por quién pujo y hasta cuánto?`;

  return (
    <main>
      <h1>{tipo === "plantilla" ? "Mi plantilla" : "En venta en mi liga"}</h1>
      <p className="lead">
        {auto
          ? `${tipo === "plantilla" ? "Tu plantilla" : "Lo que hay en el mercado"} de ${current!.name}, con la nota de hoy y qué hacer con cada jugador.`
          : "Sube una captura de la app y te digo qué hacer con cada jugador."}
      </p>
      <div className="seg" role="group" aria-label="Qué ver">
        <Link href="/plantilla" aria-current={tipo === "plantilla" ? "page" : undefined}>Mi plantilla</Link>
        <Link href="/plantilla?tipo=mercado" aria-current={tipo === "mercado" ? "page" : undefined}>En venta en mi liga</Link>
      </div>
      {!auto && <Upload tipo={tipo} hasIds={fromShot.length > 0} restore={!liga} />}
      {rows.length > 0 && (
        <>
          <p className="muted">Notas del {day}. Las cifras salen de la base de datos{fromShot.length ? ", no de la captura" : ""}.</p>
          {tipo === "plantilla" ? <Squad rows={rows} extra={extra} /> : <Market rows={rows} extra={extra} />}
          <p style={{ marginTop: 16 }}>
            <Link href={`/chat?q=${encodeURIComponent(question)}`}>Pregúntale al asistente por esta lista</Link>
          </p>
        </>
      )}
      {auto && (
        <details style={{ marginTop: 32 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Analizar otra lista con una captura</summary>
          <div style={{ marginTop: 16 }}><Upload tipo={tipo} hasIds={false} restore={false} /></div>
        </details>
      )}
    </main>
  );
}
