type Search = Promise<Record<string, string | undefined>>;

export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Asistente Fantasy</h1>
      <form method="post" action="/api/login" className="card" style={{ marginTop: 16 }}>
        <input type="hidden" name="next" value={q.next ?? "/"} />
        <label className="muted" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoFocus className="ask-input" />
        {q.error && <p className="bad">Contraseña incorrecta</p>}
        <button className="primary" type="submit">Entrar</button>
      </form>
    </main>
  );
}
