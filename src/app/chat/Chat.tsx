"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner, useElapsed } from "../_ui/Refresh";

interface Msg {
  role: "user" | "assistant";
  content: string;
  players?: { id: string; name: string }[];
  unsupported?: number[];
}

const EXAMPLES = [
  "¿Qué delantero ficho con 5 M?",
  "¿Vendo a Mbappé?",
  "Chollos en defensa por menos de 2 M",
  "¿Quién está subiendo más esta semana?",
];

export default function Chat({ initial }: { initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const secs = useElapsed(busy);
  const [error, setError] = useState<string | null>(null);

  // Pregunta que llega desde otra página (p. ej. Mi plantilla): se envía sola una vez
  const sent = useRef(false);
  useEffect(() => {
    if (initial && !sent.current) {
      sent.current = true;
      send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setMsgs([...next, { role: "assistant", content: data.reply, players: data.players, unsupported: data.unsupported }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {msgs.length === 0 && (
        <div className="examples">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => send(e)}>{e}</button>
          ))}
        </div>
      )}
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          <div className="bubble">{m.content}</div>
          {!!m.players?.length && (
            <div className="links">
              {m.players.map((p) => (
                <Link key={p.id} href={`/jugador/${p.id}`}>{p.name}</Link>
              ))}
            </div>
          )}
          {!!m.unsupported?.length && (
            <p className="bad">Ojo: estas cifras no salen de los datos: {m.unsupported.join(", ")}</p>
          )}
        </div>
      ))}
      {busy && <p className="muted thinking" role="status"><Spinner /> {secs < 6 ? "Consultando tus datos…" : secs < 15 ? "Mirando notas, mercado y tu plan…" : "Escribiendo la respuesta…"} · {secs} s</p>}
      {error && <p className="bad">{error}</p>}
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pregunta sobre jugadores o el mercado" />
        <button type="submit" disabled={busy} className="with-spin">{busy ? <><Spinner /> Pensando</> : "Enviar"}</button>
      </form>
    </div>
  );
}
