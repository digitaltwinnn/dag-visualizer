// Coarse relative recency — freshness, not a ticking clock. Guarded against NaN/future.
// The d/mo/y tiers exist for the anchor log's history mode (2026-08-14): a genesis-era row is
// years old, and "24118h ago" states a subtraction, not an age. Single rounded unit throughout
// (the moment.js/GitHub convention) — the user read "2.8y" as strange and a compound
// "2y 9mo" doesn't fit the cell, so the months tier carries the sub-year range instead.
const DAY = 86_400_000;
/** `bare` drops the " ago" suffix — for the anchor log's phone tier only (2026-09-02), where the
 *  AGE header already names the quantity and the suffix's ~26px is what stood between the four
 *  surviving columns and sideways scroll. An option HERE rather than a `.replace()` at the call
 *  site, per this module's own rule: two registers, one home, never a third ad-hoc formatter. */
export function relativeAge(ageMs: number, bare = false): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s${bare ? "" : " ago"}`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m${bare ? "" : " ago"}`;
  if (ageMs < 24 * 3_600_000) return `${Math.round(ageMs / 3_600_000)}h${bare ? "" : " ago"}`;
  if (ageMs < 30 * DAY) return `${Math.round(ageMs / DAY)}d${bare ? "" : " ago"}`;
  if (ageMs < 345 * DAY) return `${Math.max(1, Math.round(ageMs / (30.44 * DAY)))}mo${bare ? "" : " ago"}`;
  return `${Math.max(1, Math.round(ageMs / (365.25 * DAY)))}y${bare ? "" : " ago"}`;
}

/** THE SAME AGE, SPELLED OUT — the app's ONE long-form span (user, 2026-09-01: "there must be some
 *  standard way of representing age; I want this consistently across the whole app", pointing at
 *  the archive card's "~15 months").
 *
 *  ⚠️ TWO REGISTERS, ONE HOME. `relativeAge` above abbreviates because its consumer is a table
 *  COLUMN repeated down 25 rows under a header that already names the quantity — there, `16d ago`
 *  is a value in a series and the unit letter is read once. This form is for a SENTENCE, where the
 *  age is the point of the sentence and a reader should not have to decode a letter to get it
 *  ("d = days? write it in full so people actually understand" — same user, same day). Both live
 *  here so a third ad-hoc formatter is never written: `fmtReach` (components/useArchive.ts) and the
 *  vitals' idle card are the two consumers, and they now agree by construction.
 *
 *  Tiers match `relativeAge`'s and the archive census's: whole days to two months, whole months to
 *  ~two years, then years. One rounded unit throughout — a compound "2 years 9 months" reads as a
 *  measurement where this is a characterisation, and the archive card says "~" for that reason. */
export function ageWords(ageMs: number): string {
  if (Number.isNaN(ageMs) || ageMs < 0) return "";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (ageMs < 3_600_000) return unit(Math.max(1, Math.round(ageMs / 60_000)), "minute");
  if (ageMs < 2 * DAY) return unit(Math.round(ageMs / 3_600_000), "hour");
  if (ageMs < 60 * DAY) return unit(Math.round(ageMs / DAY), "day");
  if (ageMs < 700 * DAY) return unit(Math.round(ageMs / (30.44 * DAY)), "month");
  return unit(Math.round(ageMs / (365.25 * DAY)), "year");
}
