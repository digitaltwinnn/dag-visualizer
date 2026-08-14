// Coarse relative recency — freshness, not a ticking clock. Guarded against NaN/future.
// The d/y tiers exist for the anchor log's history mode (2026-08-14): a genesis-era row is
// years old, and "24118h ago" states a subtraction, not an age. One decimal on years because
// the whole chain is single-digit years old — "2y" would round half the history away.
export function relativeAge(ageMs: number): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
  if (ageMs < 365.25 * 86_400_000) return `${Math.round(ageMs / 86_400_000)}d ago`;
  return `${(ageMs / (365.25 * 86_400_000)).toFixed(1)}y ago`;
}
