// Chat con el asistente. Las cifras salen de los datos; el modelo solo explica.

import Link from "next/link";
import Chat from "./Chat";

type Search = Promise<Record<string, string | undefined>>;

export default async function ChatPage({ searchParams }: { searchParams: Search }) {
  const { q } = await searchParams;
  return (
    <main>
      <Link className="back" href="/">← Mercado</Link>
      <h1 style={{ marginTop: 12 }}>Pregúntale al asistente</h1>
      <p className="muted">Responde con los datos de hoy: notas, valores, onces probables y calendario.</p>
      <Chat initial={q?.slice(0, 2000)} />
    </main>
  );
}
