"use client";

// Navegación: arriba en escritorio, abajo en el móvil. Y el selector de liga.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Hoy", icon: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" },
  { href: "/liga", label: "Liga", icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" },
  { href: "/mercado", label: "Mercado", icon: "M3 7h18l-2 13H5zM8 7a4 4 0 0 1 8 0" },
  { href: "/plantilla", label: "Plantilla", icon: "M4 5h16v14H4zM4 12h16M12 5v14" },
  { href: "/chat", label: "Pregunta", icon: "M4 5h16v11H9l-5 4z" },
  { href: "/conectar", label: "Cuenta", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/mercado" && path.startsWith("/jugador")));
  return (
    <nav className="nav" aria-label="Secciones">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
          <span>{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function LeagueSwitch({ leagues, current }: { leagues: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter();
  const path = usePathname();
  if (path === "/login") return null;
  if (leagues.length < 2) return leagues[0] ? <span className="liga-one">{leagues[0].name}</span> : null;
  const pick = (id: string) => {
    document.cookie = `liga=${id}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div className="ligas" role="group" aria-label="Liga">
      {leagues.map((l) => (
        <button key={l.id} type="button" aria-pressed={l.id === current} onClick={() => pick(l.id)}>
          {l.name.replace(/^Los /, "")}
        </button>
      ))}
    </div>
  );
}
