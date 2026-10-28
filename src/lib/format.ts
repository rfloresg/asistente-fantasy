export const POS = ["", "POR", "DEF", "MED", "DEL", "ENT"];
export const STATUS: Record<string, string> = { injured: "Lesión", doubtful: "Duda", suspended: "Sanción" };
export const ACTION: Record<string, string> = { fichar: "Fichar", mantener: "Mantener", vender: "Vender" };

export const n1 = (x: number | null) =>
  x === null ? "–" : x.toLocaleString("es-ES", { maximumFractionDigits: 1 });
export const money = (x: number | null) =>
  x === null ? "–" : `${(x / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M`;
export const pct = (x: number | null) =>
  x === null ? "–" : `${x > 0 ? "+" : ""}${x.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
export const fmtDate = (d: Date) =>
  d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" });
export const notaClass = (n: number) => (n >= 70 ? "nota hi" : n >= 40 ? "nota mid" : "nota lo");
