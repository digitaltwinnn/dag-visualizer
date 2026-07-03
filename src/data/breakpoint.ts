export type Breakpoint = "desktop" | "tablet" | "phone";
// Width-based so a portrait tablet (<700) reads as phone. Boundaries: desktop ≥1100, tablet ≥700.
export function breakpointOf(width: number): Breakpoint {
  if (width >= 1100) return "desktop";
  if (width >= 700) return "tablet";
  return "phone";
}
