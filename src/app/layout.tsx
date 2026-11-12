import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import ActualizarApp from "./_ui/ActualizarApp";
import { currentTheme } from "@/lib/tema";
import { currentLeague } from "@/lib/ligas";
import { LeagueSwitch, Nav } from "./_ui/Nav";
import InstallSW from "./_ui/InstallSW";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--font" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Asistente Fantasy",
  description: "Qué hacer hoy en tus ligas de LaLiga Fantasy",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Fantasy", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  // La barra del móvil del color del tema
  return { themeColor: (await currentTheme()) === "claro" ? "#F4F6F2" : "#060A07", width: "device-width", initialScale: 1 };
}

async function safeLeagues() {
  try {
    return await currentLeague(false);
  } catch {
    return { all: [], current: null, viewing: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ all, current, viewing }, theme] = await Promise.all([safeLeagues(), currentTheme()]);
  return (
    <html lang="es" data-theme={theme} className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <div className="top-in">
            <Link href="/" className="brand">Asistente Fantasy</Link>
            <Nav />
            <LeagueSwitch leagues={all} current={current?.id ?? null} />
          </div>
        </header>
        <ActualizarApp />
        {viewing && (
          <div className="viewing" role="status">
            <span>Estás viendo la web como <b>{viewing.name}</b>. Solo para mirar.</span>
            <a href="/api/admin/ver">Dejar de ver</a>
          </div>
        )}
        {children}
        <InstallSW />
      </body>
    </html>
  );
}
