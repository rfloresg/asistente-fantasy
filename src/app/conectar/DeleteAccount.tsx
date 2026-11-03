"use client";

import { useState } from "react";
import { Spinner } from "../_ui/Refresh";

export default function DeleteAccount({ admin }: { admin: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!window.confirm("¿Borrar tu cuenta? Se borran tu sesión de LaLiga, tus planes y tus ligas. No se puede deshacer.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/cuenta/borrar", { method: "POST" });
    if (res.ok) {
      window.location.href = "/login?borrada=1";
      return;
    }
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo borrar. Prueba otra vez.");
    setBusy(false);
  }
  return (
    <details className="danger-zone">
      <summary>Borrar mi cuenta</summary>
      <p className="small">Se borra todo lo tuyo: la sesión de LaLiga, tus planes, lo que marcaste como hecho y tus ligas. Si el Espía leía un grupo con tu cuenta, pasa a otro miembro; si no hay nadie, deja de publicar en ese grupo.</p>
      {admin ? (
        <p className="small muted">Eres el administrador: tu cuenta no se borra desde aquí.</p>
      ) : (
        <button type="button" className="chip danger with-spin" disabled={busy} onClick={go}>{busy && <Spinner />}Borrar mi cuenta para siempre</button>
      )}
      {error && <p className="bad">{error}</p>}
    </details>
  );
}
