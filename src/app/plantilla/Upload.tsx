"use client";

// Sube la captura, deja corregir los emparejados y guarda la lista en este navegador.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Option { id: string; nickname: string; team: string | null }
interface Item {
  leido: { nombre: string; equipo: string | null };
  id: string | null;
  opciones: Option[];
}

const KEY = (tipo: string) => `fantasy:${tipo}`;
const load = (tipo: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY(tipo)) ?? "[]");
  } catch {
    return [];
  }
};
const save = (tipo: string, ids: string[]) => {
  try {
    localStorage.setItem(KEY(tipo), JSON.stringify(ids));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
};

function Search({ onPick }: { onPick: (o: Option) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Option[]>([]);
  useEffect(() => {
    if (q.length < 2) return setRes([]);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`).then((x) => x.json());
      setRes(r.resultados ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <span>
      <input className="mini" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador" />
      {res.map((o) => (
        <button key={o.id} className="chip" onClick={() => onPick(o)}>{o.nickname} {o.team}</button>
      ))}
    </span>
  );
}

// Reduce la captura antes de subirla: lado largo máx. 1600 px, JPEG. Suficiente para leer nombres.
async function compress(file: File): Promise<File> {
  if (file.size < 1_000_000) return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "captura.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export default function Upload({ tipo, hasIds }: { tipo: "plantilla" | "mercado"; hasIds: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al entrar sin lista, recupera la guardada en este navegador
  useEffect(() => {
    if (hasIds) return;
    const ids = load(tipo);
    if (ids.length) router.replace(`/plantilla?tipo=${tipo}&ids=${ids.join(",")}`);
  }, [tipo, hasIds, router]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      const fd = new FormData();
      fd.append("imagen", await compress(file));
      const res = await fetch("/api/captura", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const pick = (i: number, id: string | null) => setItems((xs) => xs!.map((x, k) => (k === i ? { ...x, id } : x)));
  const remove = (i: number) => setItems((xs) => xs!.filter((_, k) => k !== i));

  function confirm() {
    const ids = [...new Set(items!.flatMap((x) => (x.id ? [x.id] : [])))];
    save(tipo, ids);
    setItems(null);
    router.push(`/plantilla?tipo=${tipo}&ids=${ids.join(",")}`);
  }

  return (
    <div>
      <label className="upload">
        <span style={{ display: "block" }}>{busy ? "Leyendo la captura…" : `Sube una captura de ${tipo === "plantilla" ? "tu plantilla" : "los jugadores en venta"}`}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p className="bad">{error}</p>}

      {items && (
        <>
          <p className="muted">Revisa que cada nombre leído es el jugador correcto.</p>
          <table>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.leido.nombre}{it.leido.equipo ? <span className="muted"> {it.leido.equipo}</span> : null}</td>
                  <td>
                    {it.id ? (
                      <span>
                        <span className="up">✓ {it.opciones.find((o) => o.id === it.id)?.nickname ?? "Emparejado"}</span>{" "}
                        <button className="chip" onClick={() => setItems((xs) => xs!.map((x, k) => (k === i ? { ...x, id: null, opciones: [] } : x)))}>Cambiar</button>
                      </span>
                    ) : it.opciones.length ? (
                      <select defaultValue="" onChange={(e) => pick(i, e.target.value || null)}>
                        <option value="">¿Cuál es?</option>
                        {it.opciones.map((o) => <option key={o.id} value={o.id}>{o.nickname} {o.team}</option>)}
                      </select>
                    ) : (
                      <Search onPick={(o) => setItems((xs) => xs!.map((x, k) => (k === i ? { ...x, id: o.id, opciones: [o] } : x)))} />
                    )}
                  </td>
                  <td><button className="chip" onClick={() => remove(i)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary" onClick={confirm} disabled={!items.some((x) => x.id)}>
            Analizar {items.filter((x) => x.id).length} jugadores
          </button>
        </>
      )}

      {!items && hasIds && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Guardada en este navegador. Sube otra captura para cambiarla.{" "}
          <button className="chip" onClick={() => { save(tipo, []); router.push(`/plantilla?tipo=${tipo}`); }}>Borrar</button>
        </p>
      )}
    </div>
  );
}
