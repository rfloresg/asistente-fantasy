import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { currentLeague } from "@/lib/ligas";
import { LeagueSwitch, Nav } from "./_ui/Nav";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], display: "swap", variable: "--font" });

export const metadata: Metadata = {
  title: "Asistente Fantasy",
  description: "Qué hacer hoy en tus ligas de LaLiga Fantasy",
};

export const viewport: Viewport = { themeColor: "#102A1E", width: "device-width", initialScale: 1 };

async function safeLeagues() {
  try {
    return await currentLeague();
  } catch {
    return { all: [], current: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { all, current } = await safeLeagues();
  return (
    <html lang="es" className={archivo.variable}>
      <body>
        <header className="top">
          <div className="top-in">
            <Link href="/" className="brand">Asistente Fantasy</Link>
            <Nav />
            <LeagueSwitch leagues={all} current={current?.id ?? null} />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
