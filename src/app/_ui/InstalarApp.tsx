"use client";

// Botón "Instalar la app". Android/Chrome: instala con un toque. iPhone: Apple no deja hacerlo con un
// botón, así que enseña los dos pasos. Dentro de la app ya instalada no sale.
import Image from "next/image";
import { useEffect, useState } from "react";

type Kind = "prompt" | "ios" | "android" | null;

// Dentro de la app (la de Android lleva "AsistenteFantasyApp" en el navegador) o ya instalada: nada
export const inApp = () => /AsistenteFantasyApp/.test(navigator.userAgent)
  || window.matchMedia("(display-mode: standalone)").matches || !!(navigator as { standalone?: boolean }).standalone;

function detect(): Kind {
  if (inApp()) return null;
  if (/android/i.test(navigator.userAgent)) return "android"; // Android: la app de verdad (el .apk)
  if (window.__installPrompt) return "prompt";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return null; // ordenador sin aviso de instalación: nada
}

export default function InstalarApp({ compact = false }: { compact?: boolean }) {
  const [kind, setKind] = useState<Kind>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setKind(detect());
    update();
    window.addEventListener("fa-install", update);
    return () => window.removeEventListener("fa-install", update);
  }, []);
  if (!kind) return null;

  if (kind === "android") {
    return (
      <div className={`install${compact ? " compact" : ""}`}>
        <a className="install-btn" href="/descargar">
          <Image src="/icons/icon-192.png" alt="" width={28} height={28} />
          <span><b>Descarga la app</b>{!compact && <span className="small"> · tu plan a un toque, sin buscar la web</span>}</span>
        </a>
      </div>
    );
  }

  const click = async () => {
    if (kind === "prompt" && window.__installPrompt) {
      await window.__installPrompt.prompt().catch(() => {});
      window.__installPrompt = null;
      setKind(detect());
    } else setOpen((o) => !o);
  };

  return (
    <div className={`install${compact ? " compact" : ""}`}>
      <button type="button" className="install-btn" onClick={click} aria-expanded={kind === "prompt" ? undefined : open}>
        <Image src="/icons/icon-192.png" alt="" width={28} height={28} />
        <span><b>Instala la app</b>{!compact && <span className="small"> · tu plan a un toque, sin buscar la web</span>}</span>
      </button>
      {open && kind === "ios" && (
        <ol className="install-steps">
          <li>Abre esta página en <b>Safari</b> y pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba, abajo).</li>
          <li>Baja y pulsa <b>Añadir a pantalla de inicio</b>. Te aparece el icono AF.</li>
          <li>Ábrela desde el icono y pulsa <b>Entrar con Telegram</b> una vez: ya se acuerda de ti.</li>
        </ol>
      )}
    </div>
  );
}
