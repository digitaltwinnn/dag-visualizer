import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { bucketStamp, recordStamp, localDayKey } from "./localTime";

// DATES IN THE READER'S OWN CLOCK (user, 2026-10-07: "Instead of saying UTC, can we show all the
// dates in the actual locale? It will save some space here + more user friendly"). Pinned in a
// zone far from UTC, so a formatter that still reads UTC fails here.
const prevTz = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/New_York"; });
afterAll(() => { process.env.TZ = prevTz; });

const H = 3_600_000;
const D = 86_400_000;

describe("bucketStamp — a bucket at the precision its cadence earns", () => {
  it("a sub-day bucket is the reader's local date and clock, with no zone suffix", () => {
    const s = bucketStamp(Date.UTC(2026, 8, 22, 15), H); // 11:00 in New York
    expect(s).not.toMatch(/UTC/);
    expect(s).toMatch(/Sep 22/);
    expect(s).toMatch(/11:00/);
  });
  it("a daily bucket is its own UTC day, never the evening before it in a western zone", () => {
    const s = bucketStamp(Date.UTC(2026, 8, 22), D);
    expect(s).toMatch(/Sep 22/);
    expect(s).not.toMatch(/UTC|:/);
  });
  it("the year rides only where asked", () => {
    expect(bucketStamp(Date.UTC(2026, 8, 22), D, { year: true })).toMatch(/2026/);
    expect(bucketStamp(Date.UTC(2026, 8, 22), D)).not.toMatch(/2026/);
  });
});

describe("recordStamp — one sealed record, to the second, in local time", () => {
  it("dates and clocks the record locally, seconds included, no zone suffix", () => {
    const s = recordStamp(Date.UTC(2026, 8, 14, 14, 34, 42));
    expect(s).not.toMatch(/UTC/);
    expect(s).toMatch(/Sep 14, 2026/);
    expect(s).toMatch(/10:34:42/);
  });
});

describe("localDayKey — the reader's calendar day of an instant, as YYYY-MM-DD", () => {
  it("is the LOCAL day: 02:00 UTC is still the previous evening in New York", () => {
    expect(localDayKey(Date.UTC(2026, 8, 22, 2))).toBe("2026-09-21");
    expect(localDayKey(Date.UTC(2026, 8, 22, 15))).toBe("2026-09-22");
  });
});
