"use client";

// Registra el service worker (para poder instalar la web como app) y guarda el aviso de instalación
// de Android, que llega una sola vez y antes de que se pinte el botón "Instalar app".
import { useEffect } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };
declare global {
  interface Window { __installPrompt?: InstallEvent | null }
}

export default function InstallSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const keep = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as InstallEvent;
      window.dispatchEvent(new Event("fa-install"));
    };
    const done = () => { window.__installPrompt = null; window.dispatchEvent(new Event("fa-install")); };
    window.addEventListener("beforeinstallprompt", keep);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", keep); window.removeEventListener("appinstalled", done); };
  }, []);
  return null;
}
