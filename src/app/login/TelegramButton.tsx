"use client";

// Botón oficial "Iniciar sesión con Telegram". Telegram nos devuelve tus datos firmados a /api/auth/telegram.
import { useEffect, useRef } from "react";

export default function TelegramButton({ bot, next }: { bot: string; next: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-request-access", "write"); // para poder mandarte tu plan en privado
    s.setAttribute("data-auth-url", `/api/auth/telegram?next=${encodeURIComponent(next)}`);
    el.appendChild(s);
  }, [bot, next]);
  return <div ref={box} style={{ minHeight: 48 }} />;
}
