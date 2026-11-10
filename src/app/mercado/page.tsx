// Mercado: por defecto, lo que está hoy a la venta en tu liga; con el filtro, todos los jugadores.

import Link from "next/link";
import AutoForm from "../_ui/AutoForm";
import { money, n1, notaClass, pct, POS, STATUS, fmtDate } from "@/lib/format";
import { currentLeague, latestPlan } from "@/lib/ligas";
import { advice, marketIds, myPlayerIds, ownerOf } from "@/lib/propiedad";
import { lastRun, market, type Order } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

export default async function Mercado({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const pos = Number(q.pos) || undefined;
  const order = (["nota", "forma", "tendencia", "valor"].includes(q.orden ?? "") ? q.orden : "nota") as Order;
  const maxValue = Number(q.max) ? Number(q.max) * 1e6 : undefined;

  const { current, user } = await currentLeague();
  const plan = current ? await latestPlan(current.id, user?.id) : null;
  const mine = myPlayerIds(plan?.liga); // null = sin datos de tu liga
  const onMarket = marketIds(plan?.liga);
  // Al entrar, lo que de verdad puedes fichar hoy; "todos" para ver la clasificación completa
  const action = q.accion === "todos" ? undefined : q.accion || (onMarket ? "enventa" : undefined);
  // "¿Qué buscas?": con los datos de tu liga, mira si el jugador es tuyo
  const base = { pos, order, maxValue };
  const filter =
    action === "mios" || action === "vender" ? (mine ? { ...base, ids: mine } : { ...base, action: action === "vender" ? "vender" : undefined })
    : action === "fichar" ? { ...base, action: "fichar", excludeIds: mine ?? undefined }
    : action === "nofichar" ? { ...base, action: "vender", excludeIds: mine ?? undefined }
    : action === "enventa" && onMarket ? { ...base, ids: onMarket }
    : base;
  const [run, { day, rows: all }] = await Promise.all([lastRun(), market(filter, action === "mios" || action === "vender" ? 40 : 60)]);
  const withAdvice = all.map((r) => ({ ...r, adv: advice(ownerOf(plan?.liga, String(r.id)), r.s.action, plan?.acciones ?? [], String(r.id)) }));
  const rows = action === "vender" && mine ? withAdvice.filter((r) => r.adv.label.includes("Vender")) : withAdvice;
  const empty =
    action === "enventa" ? "Hoy no hay nadie a la venta con esos filtros."
    : action === "vender" ? "Ninguno de tus jugadores está para vender hoy." : action === "mios" && !mine ? "Aún no sé qué jugadores tienes: llega con tu próximo plan." : "Nadie con esos filtros.";

  return (
    <main>
      <h1>Mercado</h1>
      <p className="lead">
        {action === "enventa"
          ? `Lo que está a la venta hoy en ${plan?.leagueName ?? "tu liga"}, con su nota. Para ver a todos los jugadores de LaLiga, cambia el filtro a «Todos los jugadores».`
          : `Todos los jugadores de LaLiga con su nota de hoy${plan?.liga?.owners ? ` y de quién son en ${plan.leagueName}` : ""}. Solo puedes fichar a los que salen a la venta en tu liga.`}
      </p>
      <p className="muted">
        {run ? `Datos: ${fmtDate(run.startedAt)} · ${run.ok ? "correctos" : "con fallos"}` : "Aún no hay datos de los jugadores."}
        {day ? ` · Notas del ${new Date(`${day}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : " · Aún sin notas de hoy."}
      </p>

      <AutoForm className="filters">
        <select name="pos" defaultValue={q.pos ?? ""}>
          <option value="">Todas las posiciones</option>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>{POS[p]}</option>
          ))}
        </select>
        <select name="accion" defaultValue={q.accion ?? (onMarket ? "enventa" : "todos")} aria-label="Qué buscas">
          {onMarket && <option value="enventa">A la venta hoy en tu liga</option>}
          <option value="todos">Todos los jugadores</option>
          <option value="fichar">Para fichar</option>
          <option value="mios">Mis jugadores</option>
          <option value="vender">Mis jugadores para vender</option>
          <option value="nofichar">Mejor no fichar</option>
        </select>
        <select name="max" defaultValue={q.max ?? ""}>
          <option value="">Cualquier precio</option>
          {[2, 5, 10, 20, 50].map((m) => (
            <option key={m} value={m}>Hasta {m} M</option>
          ))}
        </select>
        <select name="orden" defaultValue={order}>
          <option value="nota">Ordenar por nota</option>
          <option value="forma">Ordenar por pts esperados</option>
          <option value="tendencia">Ordenar por subida 7 días</option>
          <option value="valor">Ordenar por valor</option>
        </select>
        <button type="submit">Filtrar</button>
      </AutoForm>

      <div className="wrap">
        <table className="cards-m">
          <thead>
            <tr>
              <th>Nota</th>
              <th>Jugador</th>
              <th>Pos.</th>
              <th>Acción</th>
              <th className="n">Valor</th>
              <th className="n">7 días</th>
              <th className="n" title="Puntos esperados por partido en los próximos">Pts esp.</th>
              <th className="n">Titular</th>
              <th className="n">Puja máx.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, nickname, team, position, status, s, adv }) => (
              <tr key={id}>
                <td className="c-nota"><span className={notaClass(s.nota)}>{s.nota}</span></td>
                <td className="c-name">
                  <Link href={`/jugador/${id}`} className="stretch">{nickname}</Link> <span className="muted">{team}</span>{" "}
                  {STATUS[status] && <span className="bad">{STATUS[status]}</span>}
                </td>
                <td className="c-pos">{POS[position]}</td>
                <td className="c-act"><span className={`own ${adv.tone}`}>{adv.label}</span></td>
                <td className="n" data-label="Valor">{money(s.value)}</td>
                <td className={`n ${(s.pct7 ?? 0) >= 0 ? "up" : "down"}`} data-label="7 días">{pct(s.pct7)}</td>
                <td className="n" data-label="Pts esp.">{n1(s.xp ?? s.formAvg)}</td>
                <td className="n" data-label="Titular">{s.startProb === null ? "–" : `${s.startProb} %`}</td>
                <td className={`n${adv.bid ? "" : " hide-m"}`} data-label="Puja máx.">{adv.bid ? money(s.maxBidPlay) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty" style={{ marginTop: 12 }}><p>{empty}</p></div>}
      <p className="muted">
        Pts esp.: puntos que esperamos por partido en sus 2 próximos, según el rival y si va a jugar. Titular: probabilidad según el once probable de futbolfantasy. Puja máx.: lo máximo que pagaría para jugarlo, según su nota.
      </p>
    </main>
  );
}
