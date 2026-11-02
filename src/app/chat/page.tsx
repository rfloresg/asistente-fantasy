// Chat con el asistente. Las cifras salen de los datos; el modelo solo explica.

import Chat from "./Chat";

type Search = Promise<Record<string, string | undefined>>;

export default async function ChatPage({ searchParams }: { searchParams: Search }) {
  const { q } = await searchParams;
  return (
    <main>
      <h1>Pregunta</h1>
      <p className="lead">Responde con los datos de hoy: notas, valores, onces probables y tu plan.</p>
      <Chat initial={q?.slice(0, 2000)} />
    </main>
  );
}
