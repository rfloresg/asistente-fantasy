// ¿Es Premium la liga? Lo buscamos en lo que devuelve la API al listar tus ligas: cualquier campo
// que se llame algo con "premium" y sea verdadero/falso. Si no hay ninguno, null (no se sabe).
// Función pura; el Espía apunta los nombres de los campos en el registro para afinarlo si cambia.
export function premiumOf(league: unknown, depth = 0): boolean | null {
  if (!league || typeof league !== "object" || depth > 2) return null;
  let found: boolean | null = null;
  for (const [k, v] of Object.entries(league as Record<string, unknown>)) {
    if (/premium/i.test(k) && typeof v === "boolean") found = found || v;
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = premiumOf(v, depth + 1);
      if (inner !== null) found = found || inner;
    }
  }
  return found;
}
