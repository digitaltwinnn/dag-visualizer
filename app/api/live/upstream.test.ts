import { afterEach, describe, expect, it, vi } from "vitest";
import { memo, readChain, readClusters, readGlobals } from "./upstream";

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
