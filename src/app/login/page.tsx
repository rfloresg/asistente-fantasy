// Portada: lo que ve quien llega sin haber entrado. Qué es, el vídeo, cómo empezar y entrar.
// Todo empieza en el bot de Telegram; la web es para verlo con calma.
import { getDb } from "@/db";
import { seats } from "@/lib/plazas";
import EntrarTelegram from "../_ui/EntrarTelegram";
import InstalarApp from "../_ui/InstalarApp";

type Search = Promise<Record<string, string | undefined>>;

const FEATURES = [
  { tag: "Plan", title: "Qué hacer hoy", text: "A quién proteger, por quién pujar y cuánto, a quién vender. De lo más urgente a lo que puede esperar." },
  { tag: "Once", title: "Tu mejor once", text: "Formación, capitán y quién no va a jugar, según los onces probables y la forma de cada uno." },
  { tag: "Mercado", title: "Caza chollos", text: "Cada jugador con su nota del día y lo máximo que pagaría por él. Mira el mercado entero por ti." },
  { tag: "Espía", title: "El Espía de tu liga", text: "En el grupo de Telegram: cada fichaje, venta y cláusula al momento, y un resumen cada mañana." },
  { tag: "Pregunta", title: "Pregúntale", text: "«¿Vendo a este?», «¿qué delantero ficho con 5 M?». Responde con los datos de hoy, sin inventar cifras." },
];

export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const next = q.next ?? "/";
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const botUrl = bot ? `https://t.me/${bot}?start=conectar` : null;
  const plazas = await seats(await getDb()).catch(() => null);
  const full = plazas?.left === 0;

  return (
    <main className="landing">
      <section className="land-hero">
        <div>
          <p className="kicker">Beta cerrada{plazas?.left != null ? (full ? " · completa" : ` · quedan ${plazas.left} plaza${plazas.left === 1 ? "" : "s"}`) : ""}</p>
          <h1>Deja de fichar <span className="gold">a ojo</span></h1>
          <p className="lead">Tu asistente de LaLiga Fantasy. Mira tu plantilla, el mercado y a tus rivales, y te dice cada día qué hacer: proteger, pujar, vender y tu mejor once.</p>
          {botUrl ? (
            <div className="land-cta">
              <a className="primary" href={botUrl}>{full ? "Apuntarme a la lista" : "Empezar en Telegram"}</a>
              <span className="small">Gratis · 1 minuto · sin contraseñas nuevas</span>
            </div>
          ) : null}
          {bot ? (
            <div className="land-login">
              <span className="small">¿Ya lo usas?</span>
              <EntrarTelegram next={next} label="Entrar con Telegram" className="secondary" />
            </div>
          ) : <p className="bad">Falta TELEGRAM_BOT_USERNAME en Vercel.</p>}
          {q.error === "telegram" && <p className="bad">Telegram no ha confirmado la entrada. Vuelve a probar.</p>}
          {q.borrada && <p className="notice ok">Tu cuenta está borrada. Si vuelves, empiezas de cero.</p>}
          {q.error === "enlace" && <p className="bad">Ese enlace ha caducado. Pulsa «Entrar con Telegram».</p>}
          <InstalarApp />
          <ul className="trust">
            <li>Tu contraseña la escribes en LaLiga, nunca aquí</li>
            <li>Solo lee: nunca ficha ni vende por ti</li>
            <li>Las cifras salen de los datos, no de la IA</li>
          </ul>
        </div>
        <div className="phone" aria-hidden="true">
          <video src="/promo/promo.mp4" poster="/promo/poster.jpg" autoPlay muted loop playsInline preload="metadata" />
        </div>
      </section>

      <section aria-labelledby="que-hace" className="land-section">
        <h2 id="que-hace">Lo que hace por ti</h2>
        <ol className="features">
          {FEATURES.map((f, i) => (
            <li key={f.tag} className="card">
              <span className="feat-tag">{i + 1}/{FEATURES.length} · {f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="empezar" className="land-section">
        <h2 id="empezar">Empieza en 3 pasos</h2>
        <ol className="land-steps">
          <li><span className="num">1</span><div><h3>Abre el bot</h3><p>Pulsa el botón y luego <b>Iniciar</b> en Telegram.</p></div></li>
          <li><span className="num">2</span><div><h3>Conecta tu LaLiga</h3><p>Entras en LaLiga como siempre y le devuelves la página al bot. Te llega tu primer plan en un minuto.</p></div></li>
          <li><span className="num">3</span><div><h3>Mételo en tu grupo</h3><p>Opcional: con un botón, el Espía empieza a contar lo que pasa en tu liga.</p></div></li>
        </ol>
        {botUrl && <a className="primary" href={botUrl} style={{ marginTop: 24 }}>{full ? "Apuntarme a la lista" : "Empezar en Telegram"}</a>}
      </section>

      <section className="land-section land-foot">
        {process.env.APP_PASSWORD && (
          <details style={{ marginTop: 12 }}>
            <summary className="small">Entrar como administrador</summary>
            <form method="post" action="/api/login" style={{ marginTop: 12, maxWidth: 360 }}>
              <input type="hidden" name="next" value={next} />
              <label className="muted" htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" className="ask-input" />
              {q.error === "1" && <p className="bad">Contraseña incorrecta</p>}
              <button className="primary" type="submit">Entrar</button>
            </form>
          </details>
        )}
        <p className="small" style={{ marginTop: 20 }}>
          <a href="/privacidad">Privacidad</a> · <a href="/condiciones">Condiciones</a> · Proyecto personal, sin relación con LaLiga ni con LaLiga Fantasy.
        </p>
      </section>
    </main>
  );
}
