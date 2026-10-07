// HOW THE APP WRITES A DATE — one home, one rule (user, 2026-10-07: "Instead of saying UTC, can we
// show all the dates in the actual locale?", then "any figure shown with days will be UTC right? …
// if a user shares a screenshot it should be the same for other users. If we show a local date
// and/or time also use that label"):
//
//  - A DAY-ONLY label is a UTC DAY. The store cuts days at UTC midnight, and a UTC day reads the
//    same for every reader, so a shared screenshot says one thing and the label needs no zone.
//  - A CLOCK TIME is the reader's own — their locale's date order and 12/24-hour clock, their zone —
//    and NAMES that zone ("2:00 PM GMT+2"), so a screenshot of it is never ambiguous either.
//  - UTC itself stays one hover away on a record (`utcStamp`), for matching an explorer.

const DAY_MS = 86_400_000;

/** A bucket at the precision its cadence earns: a daily bucket's UTC day; a finer one's local date
 *  and clock with its zone. `year` adds the year (the overview spans years). */
export function bucketStamp(ms: number, stepMs: number, opts: { year?: boolean } = {}): string {
  const year = opts.year ? ("numeric" as const) : undefined;
  if (stepMs >= DAY_MS) {
    return new Date(ms).toLocaleDateString(undefined, { year, month: "short", day: "numeric", timeZone: "UTC" });
  }
  return new Date(ms).toLocaleString(undefined, { year, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/** One sealed record, to the SECOND (the raw layer's rung: a batching network seals dozens inside
 *  one minute), in local time with its zone. */
export function recordStamp(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    ", " + // a comma, not a mid-dot (user, 2026-10-03)
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })
  );
}

/** The UTC day of an instant, as the `YYYY-MM-DD` the date fields hold (a day is a UTC day). */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The same instant in UTC, for a record's HOVER: explorers and community posts quote UTC, so a
 *  reader matching our local stamp against one can read theirs off the tooltip. */
export function utcStamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

/** A CLOCK TIME SPLIT FOR DISPLAY (2026-10-07 — "looks a lot of text … maybe add timezone as a
 *  tag? what is common practice?"): the time to be set in full ink, the date quieter beside it
 *  with its year only when it is not this year, and the zone for a small tag. No leading zero on
 *  the hour ("7:22 PM", not "07:22 PM"). `seconds` for a record (the raw rung); `now` for tests. */
export function stampParts(ms: number, opts: { seconds?: boolean; now?: number } = {}): { date: string; time: string; zone: string } {
  const d = new Date(ms);
  const thisYear = new Date(opts.now ?? Date.now()).getFullYear() === d.getFullYear();
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: thisYear ? undefined : "numeric" });
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: opts.seconds ? "2-digit" : undefined,
    timeZoneName: "short",
  }).formatToParts(d);
  const zone = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const time = parts.filter((p) => p.type !== "timeZoneName").map((p) => p.value).join("").trim();
  return { date, time, zone };
}

/** A SPAN'S LABEL — its UTC days ("Jul 7 – Aug 22", or "Sep 8" inside one day), the end exclusive:
 *  ONE wording for the Range card's title, the explorer's span chip and the timeline's range chip
 *  (2026-10-07 — the chip once read "Jul 7, 5:57 AM GMT+2–Aug 22, 3:27 PM GMT+2" beside a card
 *  titled "Jul 7 – Aug 22"). A day-only label is a UTC day, the same for every reader; the exact
 *  times are the Range card's Start / End rows, each a `Stamp` with its zone tag. */
export function rangeDays(fromMs: number, toMs: number): string {
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const a = day(fromMs);
  const b = day(Math.max(fromMs, toMs - 1));
  return a === b ? a : `${a} – ${b}`;
}
