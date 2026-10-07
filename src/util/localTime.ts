// DATES IN THE READER'S OWN CLOCK — the one home for how the app writes a point in time (user,
// 2026-10-07: "Instead of saying UTC, can we show all the dates in the actual locale? It will save
// some space here + more user friendly"). Every stamp is in the reader's locale format (their
// date order, their 12- or 24-hour clock) and their timezone, with no zone suffix.
//
// ⚠️ ONE EXCEPTION, AND IT IS NOT A UTC LABEL: a DAILY bucket is a UTC day (the store cuts days at
// UTC midnight), so its date is read in UTC — in a western zone the local reading of that midnight
// is the evening BEFORE, and the chart's "Sep 22" bar would be labelled Sep 21. A date with no
// clock names a day, and the day is the bucket's own.

const DAY_MS = 86_400_000;

/** A bucket at the precision its cadence earns: a daily bucket's own day; a finer one's local date
 *  and clock. `year` adds the year (the overview spans years, and "Sep 18" names five of them). */
export function bucketStamp(ms: number, stepMs: number, opts: { year?: boolean } = {}): string {
  const year = opts.year ? ("numeric" as const) : undefined;
  if (stepMs >= DAY_MS) {
    return new Date(ms).toLocaleDateString(undefined, { year, month: "short", day: "numeric", timeZone: "UTC" });
  }
  return new Date(ms).toLocaleString(undefined, { year, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** One sealed record, to the SECOND (the raw layer's rung: a batching network seals dozens inside
 *  one minute, so a minute-rounded stamp would print the same value for different rows). */
export function recordStamp(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    ", " + // a comma, not a mid-dot (user, 2026-10-03)
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

/** The reader's calendar day of an instant, as the `YYYY-MM-DD` the date fields hold. */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
