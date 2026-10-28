import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente Fantasy",
  description: "Análisis de mercado de LaLiga Fantasy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
