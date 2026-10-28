// Control de cifras: toda cifra de la respuesta tiene que salir de las herramientas
// (o de la pregunta del usuario). Así el LLM no puede inventarse valores ni pujas.

const NUM = /\d+(?:[.,]\d+)?/g;

const parse = (s: string) => Number(s.replace(",", "."));

export function numbersIn(text: string): number[] {
  // fechas ISO y horas no cuentan como cifras a comprobar
  const clean = text.replace(/\d{4}-\d{2}-\d{2}/g, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ");
  return [...clean.matchAll(NUM)].map((m) => parse(m[0]));
}

// Cifras permitidas: las de las herramientas y la pregunta, más sus redondeos.
export function allowedNumbers(sources: string[]): Set<string> {
  const set = new Set<string>();
  for (const src of sources) {
    for (const n of numbersIn(src)) {
      set.add(String(n));
      set.add(String(Math.round(n)));
      set.add(String(Math.round(n * 10) / 10));
    }
  }
  return set;
}

// Devuelve las cifras de la respuesta que no salen de ninguna fuente.
export function unsupportedNumbers(answer: string, sources: string[]): number[] {
  const allowed = allowedNumbers(sources);
  const bad = numbersIn(answer).filter((n) => {
    if (Number.isInteger(n) && n <= 10) return false; // "3 jugadores", "top 5"...
    return !allowed.has(String(n));
  });
  return [...new Set(bad)];
}
