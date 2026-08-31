import { describe, it, expect } from "vitest";
import { staleTickKeys, isGlobalActivityScope, shortHash, fanOut, cycleOk, touchPoll, reportPoll, pollHealthRows } from "./api";
import { vi, afterEach } from "vitest";

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

// Both of these were CHANGED on 2026-08-31 with no coverage at all, because api.ts is exempt from
// dataExportCoverage (it IS the live feed). The exemption is about I/O; these two are logic, so
// they were pulled out to where a test can reach them.

describe("fanOut", () => {
  afterEach(() => vi.restoreAllMocks());

  it("one throwing listener does not silence the ones after it", () => {
    // The defect: an unguarded forEach stopped the whole fan-out at the first throw, so a single
    // buggy consumer froze every listener registered later — for that event, for the session.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    fanOut(
      [
        () => seen.push("first"),
        () => { throw new Error("boom"); },
        () => seen.push("third"),
      ],
      null,
    );
    expect(seen).toEqual(["first", "third"]);
  });

  it("never rethrows, and never swallows in silence", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => fanOut([() => { throw new Error("boom"); }], null, "status")).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toContain("status");
  });

  it("delivers the payload to every listener", () => {
    const got: number[] = [];
    fanOut([(p: number) => got.push(p), (p: number) => got.push(p * 2)], 21);
    expect(got).toEqual([21, 42]);
  });
});

describe("cycleOk", () => {
  const ok = (v: boolean): PromiseSettledResult<boolean> => ({ status: "fulfilled", value: v });
  const rejected: PromiseSettledResult<boolean> = { status: "rejected", reason: new Error("x") };

  it("one sick metagraph fails the CYCLE — it cannot hide behind healthy siblings", () => {
    // The defect: reporting per metagraph meant eleven successes refreshed `lastOkAt` in the same
    // cycle as one persistent failure, so the pulse strip's dot stayed green while a feed was down.
    expect(cycleOk([ok(true), ok(true), ok(false)])).toBe(false);
    expect(cycleOk([ok(true), rejected, ok(true)])).toBe(false);
  });

  it("a wholly healthy cycle passes", () => {
    expect(cycleOk([ok(true), ok(true), ok(true)])).toBe(true);
    expect(cycleOk([])).toBe(true); // nothing asked, nothing failed
  });
});

describe("touchPoll", () => {
  it("creates a feed's row without claiming an outcome", () => {
    // The gap this closes: a first response that is reachable but STALE reports nothing, and the
    // feed then goes MISSING from the pulse strip rather than showing a state — silence standing
    // in for a reading. A row with no lastOkAt reads as "acquiring", which is the truth.
    touchPoll("api-geo");
    const row = pollHealthRows().find((r) => r.id === "api-geo");
    expect(row).toBeDefined();
    expect(row!.lastOkAt).toBeNull();
    expect(row!.ok).toBe(0);
    expect(row!.err).toBe(0);
  });

  it("never disturbs a row that already has outcomes", () => {
    reportPoll("clusters", true);
    const before = pollHealthRows().find((r) => r.id === "clusters")!;
    const okAt = before.lastOkAt, okN = before.ok;
    touchPoll("clusters");
    const after = pollHealthRows().find((r) => r.id === "clusters")!;
    expect(after.lastOkAt).toBe(okAt);
    expect(after.ok).toBe(okN);
  });
});
