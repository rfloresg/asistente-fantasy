"use client";

// "Entrar con Telegram" con un toque: el código se pide al cargar (así el enlace abre Telegram directamente
// y no lo bloquea el navegador). Al volver de Telegram, la página ya está preguntando y entra sola.
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 2000;
const REFRESH_MS = 9 * 60 * 1000; // el código caduca a los 10 minutos
const KEY = "fa_entrar";

export default function EntrarTelegram({ next = "/", label = "Entrar con Telegram", className = "primary" }: { next?: string; label?: string; className?: string }) {
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "expired" | "error">("idle");
  const waiting = useRef(false);

  const newCode = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/codigo", { method: "POST" });
      if (!r.ok) throw new Error();
      setLink(await r.json());
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // Si el móvil recargó la página al volver de Telegram, seguimos esperando con el mismo código
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { code: string; url: string; at: number } | null;
      if (saved && Date.now() - saved.at < REFRESH_MS) {
        setLink(saved);
        waiting.current = true;
        setState("waiting");
      } else newCode();
    } catch {
      newCode();
    }
    const t = setInterval(() => { if (!waiting.current) newCode(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [newCode]);

  const check = useCallback(async () => {
    if (!link) return;
    try {
      const r = await fetch(`/api/auth/codigo?c=${link.code}`, { cache: "no-store" });
      const j = (await r.json()) as { state: string };
      if (j.state === "ok") { try { sessionStorage.removeItem(KEY); } catch {} window.location.replace(next); }
      else if (j.state === "expired") { try { sessionStorage.removeItem(KEY); } catch {} waiting.current = false; setState("expired"); newCode(); }
    } catch { /* sin red: se vuelve a probar */ }
  }, [link, next, newCode]);

  useEffect(() => {
    if (state !== "waiting") return;
    const t = setInterval(check, POLL_MS);
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [state, check]);

  if (state === "error") return <p className="bad">No he podido preparar la entrada. Recarga la página.</p>;
  return (
    <div className="entrar">
      <a
        className={className}
        href={link?.url ?? "#"}
        target="_blank"
        rel="noopener"
        aria-disabled={!link}
        onClick={(e) => {
          if (!link) { e.preventDefault(); return; }
          waiting.current = true;
          setState("waiting");
          try { sessionStorage.setItem(KEY, JSON.stringify({ ...link, at: Date.now() })); } catch {}
        }}
      >
        {label}
      </a>
      {state === "waiting" && (
        <p className="small" role="status">
          Se ha abierto Telegram: pulsa <b>Iniciar</b> y luego <b>Sí, soy yo</b>. Al volver aquí entras solo.{" "}
          <a href={link?.url} target="_blank" rel="noopener">¿No se abrió? Pulsa aquí</a>
        </p>
      )}
      {state === "expired" && <p className="small">Ha caducado. Pulsa otra vez el botón.</p>}
    </div>
  );
}
