// Entrar: con tu Telegram (todo el mundo) o con la contraseña de administrador.
import TelegramButton from "./TelegramButton";

type Search = Promise<Record<string, string | undefined>>;

export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const next = q.next ?? "/";
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return (
    <main style={{ maxWidth: 560 }}>
      <h1>Asistente Fantasy</h1>
      <p className="lead">Tu plan del día en LaLiga Fantasy: a quién proteger, por quién pujar, a quién vender y tu mejor once. Y un Espía que cuenta en el grupo todo lo que pasa en la liga.</p>

      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 6 }}>Entra con Telegram</h2>
        <p className="muted" style={{ marginTop: 0 }}>Sin contraseñas. Te llegará tu plan por Telegram, solo a ti.</p>
        {bot ? <TelegramButton bot={bot} next={next} /> : <p className="bad">Falta TELEGRAM_BOT_USERNAME en Vercel.</p>}
        {q.error === "telegram" && <p className="bad">Telegram no ha confirmado la entrada. Vuelve a probar.</p>}
      </section>

      {process.env.APP_PASSWORD && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Entrar como administrador</summary>
          <form method="post" action="/api/login" style={{ marginTop: 12 }}>
            <input type="hidden" name="next" value={next} />
            <label className="muted" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" className="ask-input" />
            {q.error === "1" && <p className="bad">Contraseña incorrecta</p>}
            <button className="primary" type="submit">Entrar</button>
          </form>
        </details>
      )}
    </main>
  );
}
