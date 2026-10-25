import { describe, it, expect } from "vitest";
import { staleTickKeys, isGlobalActivityScope, shortHash, fanOut, cycleOk, touchPoll, reportPoll, pollHealthRows, BEAT_CAP, BEAT_KEEP_MS, NetworkData } from "./api";
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

describe("reportPoll's beats", () => {
  // The pulse strip draws each poll where it LANDED on one time axis (2026-10-25, rhythm lanes),
  // so the registry keeps each outcome with its time, oldest first, bounded by age and count.
  it("keeps each outcome with the time it landed, oldest first, at most BEAT_CAP", () => {
    for (let i = 0; i < BEAT_CAP + 5; i++) reportPoll("exact", i % 3 !== 0);
    const row = pollHealthRows().find((r) => r.id === "exact")!;
    expect(row.beats).toHaveLength(BEAT_CAP);
    const all = Array.from({ length: BEAT_CAP + 5 }, (_, i) => i % 3 !== 0);
    expect(row.beats.map((b) => b.ok)).toEqual(all.slice(-BEAT_CAP));
    expect(row.beats.every((b, i, a) => i === 0 || b.at >= a[i - 1]!.at)).toBe(true);
  });

  it("drops beats older than BEAT_KEEP_MS", () => {
    const t0 = Date.now();
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(t0);
    reportPoll("metasnaps", true);
    spy.mockReturnValue(t0 + BEAT_KEEP_MS + 1);
    reportPoll("metasnaps", true);
    spy.mockRestore();
    const row = pollHealthRows().find((r) => r.id === "metasnaps")!;
    expect(row.beats.every((b) => b.at > t0)).toBe(true);
  });

  it("takes the data's own time: a late older beat sorts in and never moves lastOkAt back", () => {
    const t0 = Date.now() - 1_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(t0 + 2000);
    reportPoll("global", true, t0 + 1000);
    reportPoll("global", true, t0);
    spy.mockRestore();
    const row = pollHealthRows().find((r) => r.id === "global")!;
    expect(row.beats.map((b) => b.at)).toEqual([t0, t0 + 1000]);
    expect(row.lastOkAt).toBe(t0 + 1000);
    // The attempt is the tab's own wall time, whatever age the data carried.
    expect(row.lastAttemptAt).toBe(t0 + 2000);
  });

  it("a touched row has no beats, not a claimed one", () => {
    touchPoll("api-trends");
    expect(pollHealthRows().find((r) => r.id === "api-trends")!.beats).toEqual([]);
  });
});

describe("_fetchClusters (the shared node lists)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reads our own /api/live/clusters, never a load balancer's cluster/info", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify({ l0: [{ id: "a" }], l1: [{ id: "b" }], memoAgeMs: 0 }), { status: 200 });
    });
    const nd = new NetworkData();
    await nd._fetchClusters();
    expect(urls.length).toBe(1);
    expect(urls[0]).toMatch(/\/api\/live\/clusters(\?|$)/);
    expect(urls.some((u) => u.includes("cluster/info"))).toBe(false);
    expect(nd.clusters.l0.length).toBe(1);
  });
  it("an empty list is a failure, keeping what is held", async () => {
    const nd = new NetworkData();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ l0: [{ id: "a" }], l1: [{ id: "b" }], memoAgeMs: 0 }), { status: 200 }));
    await nd._fetchClusters();
    const held = nd.clusters;
    const errBefore = row("clusters").err;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ l0: [], l1: [{ id: "b" }] }), { status: 200 }));
    await nd._fetchClusters();
    expect(nd.clusters).toBe(held);
    expect(nd.clusters.l0).toEqual([{ id: "a" }]);
    expect(row("clusters").err).toBe(errBefore + 1);
  });
  it("the ok report carries the data's own time (receipt less memoAgeMs)", async () => {
    const T = Date.now() + 10_000_000; // later than any beat an earlier test left
    const spy = vi.spyOn(Date, "now").mockReturnValue(T);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ l0: [{ id: "a" }], l1: [{ id: "b" }], memoAgeMs: 3000 }), { status: 200 }));
    await new NetworkData()._fetchClusters();
    spy.mockRestore();
    expect(row("clusters").lastOkAt).toBe(T - 3000);
    expect(row("clusters").beats.at(-1)).toEqual({ at: T - 3000, ok: true });
  });
});

const row = (id: string) => pollHealthRows().find((r) => r.id === id)!;
const desc = (hi: number, lo: number) => Array.from({ length: hi - lo + 1 }, (_, i) => ({ ordinal: hi - i, timestamp: "2026-10-25T00:00:00.000Z" }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// `_tick` is private: the poll is driven the way the interval drives it, over a stubbed fetch.
// Answers here carry no `metas`, so the meta refresh stays out of the way.
const tick = (nd: NetworkData) => (nd as unknown as { _tick(): Promise<void> })._tick();
const seedLatest = (nd: NetworkData, ordinal: number) => {
  const s = { ordinal, timestamp: "2026-10-25T00:00:00.000Z" } as never;
  nd.latest = s;
  nd.globalSnapshots = [s];
};

describe("_tick (the shared poll)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("a failed catch-up keeps the shared append", async () => {
    const nd = new NetworkData();
    seedLatest(nd, 80); // behind the shared window 101..112
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      return String(u).includes("/api/live/globals") ? json({ error: "x" }, 503) : json({ globals: desc(112, 101), memoAgeMs: 0 });
    });
    await tick(nd);
    expect(urls.some((u) => u.includes("/api/live/globals"))).toBe(true);
    expect(nd.globalSnapshots.map((s) => s.ordinal)).toEqual([80, ...Array.from({ length: 12 }, (_, i) => 101 + i)]);
    expect(nd.live).toBe(true);
  });

  it("two overlapping ticks append each ordinal once", async () => {
    // Both ticks fall behind the window and await a catch-up: without a guard, each computes its
    // append from the same `latest` and the second pushes every ordinal again.
    const nd = new NetworkData();
    seedLatest(nd, 80);
    const pending: Array<() => void> = [];
    vi.stubGlobal("fetch", (u: string) =>
      new Promise<Response>((r) =>
        pending.push(() => r(String(u).includes("/api/live/globals")
          ? json({ globals: desc(112, 61), memoAgeMs: 0 })
          : json({ globals: desc(112, 101), memoAgeMs: 0 }))),
      ),
    );
    const a = tick(nd);
    const b = tick(nd);
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      pending.splice(0).forEach((go) => go());
    }
    await Promise.all([a, b]);
    expect(nd.globalSnapshots.map((s) => s.ordinal)).toEqual(Array.from({ length: 33 }, (_, i) => 80 + i));
  });

  it("an /api/live failure fails the metasnaps lane too — one request carries both feeds", async () => {
    const nd = new NetworkData();
    const before = row("metasnaps").err;
    vi.stubGlobal("fetch", async () => json({ error: "x" }, 503));
    await tick(nd);
    expect(row("metasnaps").err).toBe(before + 1);
    expect(nd.live).toBe(false);
  });
});

describe("init (the seed)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("seeds the globals from the shared answer when the globals seed fails", async () => {
    const nd = new NetworkData();
    vi.stubGlobal("fetch", async (u: string) => {
      const url = String(u);
      if (url.includes("/api/live/globals")) return json({ error: "x" }, 503);
      if (url.includes("/api/live/clusters")) return json({ error: "x" }, 503);
      if (url.includes("/api/live/meta/")) return json({ snapshots: [], memoAgeMs: 0 });
      return json({ globals: desc(112, 101), metas: {}, unlisted: [], failed: [], memoAgeMs: 0 });
    });
    await nd.init();
    nd.stop();
    expect(nd.globalSnapshots.map((s) => s.ordinal)).toEqual(Array.from({ length: 12 }, (_, i) => 101 + i));
    expect(nd.latest?.ordinal).toBe(112);
    expect(nd.live).toBe(true);
  });
});
