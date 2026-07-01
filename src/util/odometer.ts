// The vitals number format (extracted from the old TopBar `fmt`, now shared + tested):
// nullish → em-dash; small values keep one decimal; larger values round + group.
export function formatVital(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}
