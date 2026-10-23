export function scorePercent(earned: number | null, maximum: number | null): number | null {
  if (earned === null || maximum === null || maximum <= 0) return null;
  return Math.round(1000 * earned / maximum) / 10;
}
export function csvCell(input: unknown): string {
  let value = String(input ?? "").replace(/[\r\n]+/g, " ");
  if (/^\s*[=+@\-]/.test(value) || /^\t/.test(value)) value = "'" + value;
  return '"' + value.replace(/"/g, '""') + '"';
}
export function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}
