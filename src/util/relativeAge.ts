// Coarse relative recency — freshness, not a ticking clock. Guarded against NaN/future.
export function relativeAge(ageMs: number): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return `${Math.round(ageMs / 3_600_000)}h ago`;
}
