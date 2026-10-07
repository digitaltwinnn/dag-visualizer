import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { bucketStamp, rangeDays, recordStamp, stampParts, utcDayKey, utcStamp } from "./localTime";

// ONE RULE FOR EVERY DATE THE APP WRITES (user, 2026-10-07 — "so any figure shown with days will be
// UTC right? … if a user shares a screenshot it should be the same for other users. If we show a
// local date and/or time also use that label"):
//  - a DAY-ONLY label is a UTC day — identical for every reader, so it needs no label;
//  - a CLOCK TIME is the reader's own, in their locale, and names its zone.
// Pinned in a zone far from UTC, so a formatter reading the wrong clock fails here.
const prevTz = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/New_York"; });
afterAll(() => { process.env.TZ = prevTz; });

const H = 3_600_000;
const D = 86_400_000;

describe("bucketStamp — a bucket at the precision its cadence earns", () => {
  it("a sub-day bucket is the reader's local date and clock, and names its zone", () => {
    const s = bucketStamp(Date.UTC(2026, 8, 22, 15), H); // 11:00 in New York
    expect(s).toMatch(/Sep 22/);
    expect(s).toMatch(/11:00/);
    expect(s).toMatch(/EDT/);
  });
  it("a daily bucket is its own UTC day, the same for every reader, with no zone", () => {
    const s = bucketStamp(Date.UTC(2026, 8, 22), D);
    expect(s).toMatch(/Sep 22/);
    expect(s).not.toMatch(/UTC|EDT|GMT|:/);
  });
  it("the year rides only where asked", () => {
    expect(bucketStamp(Date.UTC(2026, 8, 22), D, { year: true })).toMatch(/2026/);
    expect(bucketStamp(Date.UTC(2026, 8, 22), D)).not.toMatch(/2026/);
  });
});

describe("recordStamp — one sealed record, to the second, in local time with its zone", () => {
  it("dates and clocks the record locally, seconds and zone included", () => {
    const s = recordStamp(Date.UTC(2026, 8, 14, 14, 34, 42));
    expect(s).toMatch(/Sep 14, 2026/);
    expect(s).toMatch(/10:34:42/);
    expect(s).toMatch(/EDT/);
  });
});

describe("utcDayKey — the UTC day of an instant, as the date fields hold it", () => {
  it("is the UTC day, whatever the reader's zone", () => {
    expect(utcDayKey(Date.UTC(2026, 8, 22, 2))).toBe("2026-09-22");
    expect(utcDayKey(Date.UTC(2026, 8, 21, 23, 59))).toBe("2026-09-21");
  });
});

describe("utcStamp — the record's time in UTC, for the hover (cross-checking an explorer)", () => {
  it("states the UTC date and clock to the second, and says it is UTC", () => {
    expect(utcStamp(Date.UTC(2026, 9, 7, 17, 19, 4))).toBe("2026-10-07 17:19:04 UTC");
  });
});

describe("stampParts — a clock time split for display: date, time, zone (2026-10-07)", () => {
  // "Oct 7, 2026, 07:22:41 PM GMT+2" read as a lot of text: the common practice is the time in
  // full ink, the date quieter, the year only when it is not this year, and the zone a small tag.
  it("splits date, time and zone, with no leading zero on the hour", () => {
    const p = stampParts(Date.UTC(2026, 8, 14, 14, 4, 2), { seconds: true, now: Date.UTC(2026, 9, 7) });
    expect(p.date).toBe("Sep 14");
    expect(p.time).toMatch(/^10:04:02/);
    expect(p.zone).toBe("EDT");
  });
  it("carries the year only when it is not the current one", () => {
    expect(stampParts(Date.UTC(2025, 8, 14, 14), { now: Date.UTC(2026, 9, 7) }).date).toBe("Sep 14, 2025");
  });
  it("seconds only where asked", () => {
    expect(stampParts(Date.UTC(2026, 8, 14, 14, 4, 2), { now: Date.UTC(2026, 9, 7) }).time).toMatch(/^10:04(?!:)/);
  });
});

describe("rangeDays — a span's label: its UTC days, ONE wording for the card, the explorer and the timeline", () => {
  // The exact times live in the Range card's Start / End rows, each with its zone tag (2026-10-07):
  // a label with clock times and a zone wrapped the card's title onto three lines and truncated the
  // explorer's chip, so every span LABEL is its days — and a day-only label is a UTC day.
  it("names the span by its UTC days, end exclusive", () => {
    expect(rangeDays(Date.UTC(2026, 6, 7, 3, 57), Date.UTC(2026, 7, 22, 19, 27))).toBe("Jul 7 – Aug 22");
    expect(rangeDays(Date.UTC(2026, 8, 20), Date.UTC(2026, 8, 27))).toBe("Sep 20 – Sep 26");
  });
  it("a span inside one day is that day", () => {
    expect(rangeDays(Date.UTC(2026, 8, 8, 18), Date.UTC(2026, 8, 8, 22))).toBe("Sep 8");
  });
});
