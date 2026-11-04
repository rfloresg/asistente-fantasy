import type { MetadataRoute } from "next";

// Para instalar la web en el móvil como una app (Android: menú del navegador → Instalar app)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asistente Fantasy",
    short_name: "Fantasy",
    description: "Qué hacer hoy en tus ligas de LaLiga Fantasy",
    start_url: "/",
    display: "standalone",
    background_color: "#060A07",
    theme_color: "#060A07",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
