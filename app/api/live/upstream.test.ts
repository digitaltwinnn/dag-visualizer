import { afterEach, describe, expect, it, vi } from "vitest";
import { MEMO_SWEEP_AT, memo, memoSize, readChain, readClusters, readGlobals } from "./upstream";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("memo", () => {
  it("serves the cached value inside the ttl and reads once", async () => {
    const read = vi.fn(async () => "v");
    let t = 0;
    await memo("a", 4000, read, () => t);
    t = 3999;
    const r = await memo("a", 4000, read, () => t);
    expect(r.value).toBe("v");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again at the ttl and reports the age of what it serves", async () => {
    const read = vi.fn(async () => "v");
    let t = 0;
    await memo("b", 4000, read, () => t);
    t = 3000;
    expect((await memo("b", 4000, read, () => t)).ageMs).toBe(3000);
    t = 4000;
    const fresh = await memo("b", 4000, read, () => t);
    expect(read).toHaveBeenCalledTimes(2);
    expect(fresh.ageMs).toBe(0);
  });

  it("shares one in-flight read across concurrent callers", async () => {
    let resolve!: (v: string) => void;
    const read = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const p1 = memo("c", 4000, read, () => 0);
    const p2 = memo("c", 4000, read, () => 0);
    resolve("v");
    await Promise.all([p1, p2]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejection", async () => {
    const read = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("x")).mockResolvedValue("v");
    await expect(memo("d", 4000, read, () => 0)).rejects.toThrow("x");
    expect((await memo("d", 4000, read, () => 0)).value).toBe("v");
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("upstream readers", () => {
  it("readGlobals asks for exactly the limited list, uncached, with a timeout", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => ok({ data: [{ ordinal: 2 }, { ordinal: 1 }] }));
    vi.stubGlobal("fetch", f);
    const out = await readGlobals("https://be.x", 12);
    expect(f.mock.calls[0][0]).toBe("https://be.x/global-snapshots?limit=12");
    expect(f.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(out).toEqual([{ ordinal: 2 }, { ordinal: 1 }]);
  });

  it("readChain returns [] for an empty data list", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => ok({ data: [] }));
    vi.stubGlobal("fetch", f);
    expect(await readChain("https://be.x", "DAG1", 5)).toEqual([]);
    expect(f.mock.calls[0][0]).toBe("https://be.x/currency/DAG1/snapshots?limit=5");
  });

  it("readClusters returns both lists and throws unless both are non-empty", async () => {
    vi.stubGlobal("fetch", async (u: string) => ok(u.startsWith("https://l0") ? [{ id: "a" }] : [{ id: "b" }]));
    expect(await readClusters("https://l0", "https://l1")).toEqual({ l0: [{ id: "a" }], l1: [{ id: "b" }] });
    vi.stubGlobal("fetch", async (u: string) => ok(u.startsWith("https://l0") ? [] : [{ id: "b" }]));
    await expect(readClusters("https://l0", "https://l1")).rejects.toThrow();
    vi.stubGlobal("fetch", async (u: string) => ok(u.startsWith("https://l0") ? [{ id: "a" }] : []));
    await expect(readClusters("https://l0", "https://l1")).rejects.toThrow();
  });
});

describe("memo eviction", () => {
  it("deletes an expired entry when it is read", async () => {
    let t = 0;
    await memo("e1", 1000, async () => "v", () => t);
    const before = memoSize();
    t = 5000;
    let release!: () => void;
    const p = memo("e1", 1000, () => new Promise<string>((r) => (release = () => r("w"))), () => t);
    expect(memoSize()).toBe(before - 1); // the stale entry is gone while the fresh read is in flight
    release();
    expect((await p).value).toBe("w");
  });

  it("sweeps expired entries once the map grows past MEMO_SWEEP_AT", async () => {
    let t = 0;
    for (let i = 0; i < MEMO_SWEEP_AT + 10; i++) await memo(`s${i}`, 1000, async () => i, () => t);
    expect(memoSize()).toBeGreaterThan(MEMO_SWEEP_AT);
    t = 10_000;
    await memo("s-fresh", 1000, async () => 0, () => t);
    expect(memoSize()).toBe(1); // every earlier entry has expired by now; only the fresh one survives
  });
});
