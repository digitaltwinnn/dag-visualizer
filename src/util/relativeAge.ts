// Coarse relative recency — freshness, not a ticking clock. Guarded against NaN/future.
// The d/mo/y tiers exist for the anchor log's history mode (2026-08-14): a genesis-era row is
// years old, and "24118h ago" states a subtraction, not an age. Single rounded unit throughout
// (the moment.js/GitHub convention) — the user read "2.8y" as strange and a compound
// "2y 9mo" doesn't fit the cell, so the months tier carries the sub-year range instead.
const DAY = 86_400_000;
export function relativeAge(ageMs: number): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 24 * 3_600_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
  if (ageMs < 30 * DAY) return `${Math.round(ageMs / DAY)}d ago`;
  if (ageMs < 345 * DAY) return `${Math.max(1, Math.round(ageMs / (30.44 * DAY)))}mo ago`;
  return `${Math.max(1, Math.round(ageMs / (365.25 * DAY)))}y ago`;
}
