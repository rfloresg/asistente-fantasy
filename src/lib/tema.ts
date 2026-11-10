// Tema de la interfaz. Oscuro por defecto (el del vídeo); claro para quien lo prefiera.
import { cookies } from "next/headers";

export const THEME_COOKIE = "fa_tema";
export type Theme = "oscuro" | "claro";

export async function currentTheme(): Promise<Theme> {
  try {
    return (await cookies()).get(THEME_COOKIE)?.value === "claro" ? "claro" : "oscuro";
  } catch {
    return "oscuro";
  }
}
