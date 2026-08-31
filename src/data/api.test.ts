import { describe, it, expect } from "vitest";
import { staleTickKeys, isGlobalActivityScope, shortHash } from "./api";

// api.ts is exempt from dataExportCoverage (it IS the live feed). These cover the PURE parts only
// — nothing here touches the singleton, the network or timers.

describe("staleTickKeys", () => {
  const t = (iso: string) => iso;

  it("keeps everything while under the cap", () => {
    expect(staleTickKeys([t("2026-08-31T15:00:00.000Z")], 400)).toEqual([]);
    expect(staleTickKeys([], 400)).toEqual([]);
  });

  it("drops the CHRONOLOGICALLY oldest, not the first inserted", () => {
    // The real ordering: a dormant metagraph seeds its year-old ticks AFTER a live one's recent
    // ticks, so insertion order puts the OLD entries last. An insertion-order cap would evict the
    // recent ones — the only ones any consumer reads, since every lookup is by a global snapshot's
    // timestamp and that buffer holds the 52 most recent ticks.
    const insertionOrder = [
      t("2026-08-31T15:05:00.000Z"), // live metagraph responded first
      t("2026-08-31T15:04:00.000Z"),
      t("2025-09-05T20:54:12.534Z"), // dormant metagraph responded second
      t("2025-10-22T04:09:53.599Z"),
    ];
    expect(staleTickKeys(insertionOrder, 2)).toEqual([
      "2025-09-05T20:54:12.534Z",
      "2025-10-22T04:09:53.599Z",
    ]);
  });

  it("drops exactly the overflow", () => {
    const keys = Array.from({ length: 428 }, (_, i) =>
      new Date(Date.UTC(2026, 0, 1) + i * 28_000).toISOString(),
    );
    // The measured live shape: 428 distinct seed timestamps against the 400 cap.
    expect(staleTickKeys(keys, 400)).toHaveLength(28);
    expect(staleTickKeys(keys, 428)).toHaveLength(0);
  });

  it("assumes ONE timestamp format — equal-length ISO-8601 UTC, so string order is time order", () => {
    // staleTickKeys sorts as strings. That is only chronological while every key is the
    // explorer's own format. This pins the assumption: if the feed ever emits a numeric offset
    // or variable precision, string sort stops being time sort and this test is where it shows.
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const samples = ["2026-08-31T15:05:28.132Z", "2025-09-05T20:54:12.534Z"];
    for (const s of samples) expect(s).toMatch(iso);
    expect(samples.every((s) => s.length === samples[0].length)).toBe(true);
    // and string order agrees with time order for that format
    const byString = [...samples].sort();
    const byTime = [...samples].sort((a, b) => Date.parse(a) - Date.parse(b));
    expect(byString).toEqual(byTime);
  });
});

describe("isGlobalActivityScope", () => {
  it("treats no filter, 'all' and 'dag' as the global stream", () => {
    expect(isGlobalActivityScope(undefined)).toBe(true);
    expect(isGlobalActivityScope("all")).toBe(true);
    expect(isGlobalActivityScope("dag")).toBe(true);
  });
  it("treats a metagraph filter as its own stream", () => {
    expect(isGlobalActivityScope("DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM")).toBe(false);
  });
});

describe("shortHash", () => {
  it("renders the em-dash placeholder for an absent hash, never an empty string", () => {
    // The placeholder is the point: these land in the cards' foot, where a blank cell would read
    // as a value rather than as "no hash".
    expect(shortHash(undefined)).toBe("—");
    expect(shortHash("")).toBe("—");
  });
  it("elides the middle, keeping both ends addressable", () => {
    expect(shortHash("245916e12f200122a3943e2ed4c525148bb8f80c5a583")).toBe("245916e1…c5a583");
  });
});
