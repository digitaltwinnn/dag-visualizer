import { describe, expect, it } from "vitest";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { BeyondReach, TRAIL_DEADLINE_MS, assembleTrail, type TrailDeps, type TrailRow } from "./trail";

// A fake explorer: the DAG's transfer list (key = the global snapshot) and a token chain's
// (key = its own snapshot, tick = `globalSnapshotOrdinal`), both newest first, paged by a number cursor.
const glob = (o: number): GlobalSnapshot => ({ ordinal: o, timestamp: `t${o}`, hash: `g${o}`, metagraphSnapshotCount: 1 });
const meta = (o: number): RawMetaSnapshot => ({ ordinal: o, timestamp: "x", hash: `m${o}`, blocks: [`b${o}`] } as RawMetaSnapshot);

function deps(over: Partial<TrailDeps> & { pages?: Record<string, TrailRow[]>; size?: number } = {}): TrailDeps & { reads: string[] } {
  const pages: Record<string, TrailRow[]> = over.pages ?? {
    dag: [300, 300, 200, 100].map((o, i) => ({ snapshotOrdinal: o, blockHash: `d${o}${i}` })),
    dor: [
      { snapshotOrdinal: 9050, globalSnapshotOrdinal: 250, blockHash: "k250" },
      { snapshotOrdinal: 9000, globalSnapshotOrdinal: 200, blockHash: "k200" },
      { snapshotOrdinal: 8000, blockHash: "kx" }, // no global ordinal: skipped, never invented
    ],
  };
  const size = over.size ?? 2;
  const reads: string[] = [];
  return {
    reads,
    transfers: async (chain, next) => {
      const all = pages[chain] ?? [];
      const at = next ? Number(next) : 0;
      return { rows: all.slice(at, at + size), next: at + size < all.length ? String(at + size) : undefined };
    },
    global: async (o) => (reads.push(`g${o}`), glob(o)),
    metaSnap: async (c, o) => (reads.push(`${c}${o}`), meta(o)),
    chains: async () => ["dor"],
    ...over,
  };
}

describe("assembleTrail", () => {
  it("merges the chains into one tick per global, newest first, a tick holding both kinds once", async () => {
    const a = await assembleTrail(deps(), null, 10);
    expect(a.ticks.map((t) => t.ord)).toEqual([300, 250, 200, 100]);
    const t200 = a.ticks.find((t) => t.ord === 200)!;
    expect(t200.blocks).toEqual(["d2002"]);
    expect(t200.metaSnaps.dor!.map((r) => r.ordinal)).toEqual([9000]);
    expect(a.ticks.find((t) => t.ord === 300)!.blocks).toEqual(["d3000", "d3001"]);
    expect(a.ticks.find((t) => t.ord === 250)!.blocks).toEqual([]);
    expect(a.ticks[0]).toMatchObject({ ts: "t300", hash: "g300" });
    expect(a.chains).toEqual(["dor"]);
  });

  it("stops at n ticks", async () => {
    expect((await assembleTrail(deps(), null, 3)).ticks.map((t) => t.ord)).toEqual([300, 250, 200]);
  });

  it("starts at or below the ordinal asked around", async () => {
    expect((await assembleTrail(deps(), 250, 10)).ticks.map((t) => t.ord)).toEqual([250, 200, 100]);
  });

  it("folds a former chain address under its current id", async () => {
    const a = await assembleTrail(deps({ currentId: (id) => (id === "dor" ? "DOR" : id) }), null, 10);
    expect(a.ticks.find((t) => t.ord === 250)!.metaSnaps).toEqual({ DOR: [meta(9050)] });
    expect(a.chains).toEqual(["DOR"]);
  });

  it("fails on a failed read rather than answering fewer blocks", async () => {
    await expect(assembleTrail(deps({ metaSnap: async () => { throw new Error("be 504"); } }), null, 10)).rejects.toThrow();
    await expect(assembleTrail(deps({ transfers: async () => { throw new Error("be 504"); } }), null, 10)).rejects.toThrow();
  });

  it("a dormant chain whose list is absent (the route answers it as no rows) adds nothing", async () => {
    const d = deps({ chains: async () => ["dor", "old"] });
    expect((await assembleTrail(d, null, 10)).ticks.map((t) => t.ord)).toEqual([300, 250, 200, 100]);
  });

  it("fails when the walk passes its deadline, never a short answer", async () => {
    let t = 0;
    await expect(assembleTrail(deps({ size: 1, now: () => (t += TRAIL_DEADLINE_MS / 2) }), null, 10)).rejects.toThrow(/deadline/);
  });

  it("the deadline bounds the WHOLE request: a hit in the record reads after the walk is a failure too", async () => {
    let t = 0;
    // The walk is quick; the clock passes the deadline while the global records are read.
    const d = deps({ now: () => t, global: async (o) => ((t += TRAIL_DEADLINE_MS), glob(o)) });
    await expect(assembleTrail(d, null, 10)).rejects.toThrow(/deadline/);
  });

  it("a TOKEN chain past its page cap contributes what it reached — only the DAG's cap is BeyondReach", async () => {
    // DOR's list never ends and every row sits above the pin; the DAG reaches the pin at once.
    const transfers: TrailDeps["transfers"] = async (chain, next) =>
      chain === "dag"
        ? { rows: [{ snapshotOrdinal: 10, blockHash: "d10" }, { snapshotOrdinal: 5, blockHash: "d5" }] }
        : { rows: [{ snapshotOrdinal: 1e6, globalSnapshotOrdinal: 1e6 - Number(next ?? 0), blockHash: "k" }], next: String(Number(next ?? 0) + 1) };
    const a = await assembleTrail(deps({ transfers }), 10, 5);
    expect(a.ticks.map((t) => t.ord)).toEqual([10, 5]);
    expect(a.beyond).toBeUndefined();
  });

  it("is BeyondReach (not a failure) when a walk reaches its page cap before the window is whole", async () => {
    const endless: TrailDeps["transfers"] = async (chain, next) => ({ rows: chain === "dag" ? [{ snapshotOrdinal: 1e6 - Number(next ?? 0), blockHash: "h" }] : [], next: String(Number(next ?? 0) + 1) });
    await expect(assembleTrail(deps({ transfers: endless }), 10, 5)).rejects.toBeInstanceOf(BeyondReach);
  });

  describe("under a chain (a network filter)", () => {
    // DOR's list holds ticks 250, 200, 150; the DAG's list is never read — the global records carry
    // the DAG blocks of those ticks.
    const withG = (o: number): GlobalSnapshot => ({ ...glob(o), blocks: o === 200 ? ["G200"] : [] });
    const pages = {
      dag: [300, 300, 200, 100].map((o, i) => ({ snapshotOrdinal: o, blockHash: `d${o}${i}` })),
      dor: [
        { snapshotOrdinal: 9050, globalSnapshotOrdinal: 250, blockHash: "k250" },
        { snapshotOrdinal: 9000, globalSnapshotOrdinal: 200, blockHash: "k200" },
        { snapshotOrdinal: 8500, globalSnapshotOrdinal: 150, blockHash: "k150" },
      ],
    };
    const walked = () => {
      const chains: string[] = [];
      const d = deps({ pages, global: async (o) => withG(o) });
      const inner = d.transfers;
      d.transfers = (c, n) => (chains.push(c), inner(c, n));
      return { d, chains };
    };

    it("counts THAT chain's block ticks, with the DAG blocks those ticks' own records carry, and never walks the DAG", async () => {
      const { d, chains } = walked();
      const a = await assembleTrail(d, null, 2, "dor");
      expect(a.ticks.map((t) => t.ord)).toEqual([250, 200]);
      expect(a.ticks.find((t) => t.ord === 200)!.blocks).toEqual(["G200"]);
      expect(a.ticks.find((t) => t.ord === 200)!.metaSnaps.dor!.map((r) => r.ordinal)).toEqual([9000]);
      expect(new Set(chains)).toEqual(new Set(["dor"]));
      expect(a.chain).toBe("dor");
      expect(a.chains).toEqual(["dor"]);
    });

    it("walks every address of the network, a former one folded under the current id", async () => {
      const d = deps({
        pages: { ...pages, old: [{ snapshotOrdinal: 10, globalSnapshotOrdinal: 120, blockHash: "o120" }] },
        chains: async () => ["dor", "old", "ded"],
        currentId: (id) => (id === "dor" || id === "old" ? "DOR" : id),
      });
      const a = await assembleTrail(d, null, 10, "DOR");
      expect(a.ticks.map((t) => t.ord)).toEqual([250, 200, 150, 120]);
      expect(a.ticks.find((t) => t.ord === 120)!.metaSnaps).toEqual({ DOR: [meta(10)] });
      expect(a.chains).toEqual(["DOR"]);
    });

    it("the DAG filter reads the DAG's own block ticks alone", async () => {
      const { d, chains } = walked();
      const a = await assembleTrail(d, null, 10, "dag");
      expect(a.ticks.map((t) => t.ord)).toEqual([300, 200, 100]);
      expect(a.ticks.every((t) => Object.keys(t.metaSnaps).length === 0)).toBe(true);
      expect(new Set(chains)).toEqual(new Set(["dag"]));
      expect(a.chains).toEqual([]);
    });

    it("a token chain whose capped walk reached nothing at or below the pin is BeyondReach under its own filter", async () => {
      const endless: TrailDeps["transfers"] = async (_c, next) => ({ rows: [{ snapshotOrdinal: 1, globalSnapshotOrdinal: 1e6, blockHash: "k" }], next: String(Number(next ?? 0) + 1) });
      await expect(assembleTrail(deps({ transfers: endless }), 10, 5, "dor")).rejects.toBeInstanceOf(BeyondReach);
    });
  });

  describe("partial: a token chain cut by its page cap is named", () => {
    // DOR's list never ends: one row a page, a tick a page, from 1000 down.
    const dorEndless = (_chain: string, next?: string) => {
      const at = Number(next ?? 0);
      return { rows: [{ snapshotOrdinal: 5000 - at, globalSnapshotOrdinal: 1000 - at, blockHash: `k${at}` }], next: String(at + 1) };
    };
    it("under its own filter, the short window it reached names it", async () => {
      const transfers: TrailDeps["transfers"] = async (c, n) => (c === "dor" ? dorEndless(c, n) : { rows: [] });
      const a = await assembleTrail(deps({ transfers }), null, 52, "dor");
      expect(a.ticks).toHaveLength(12);
      expect(a.partial).toEqual(["dor"]);
    });
    it("under All, named when its reach stops inside the window; not when it reached past the window's oldest tick", async () => {
      // The DAG's twenty ticks reach down to 962; DOR's capped walk stopped at 989, inside the window.
      const dagRows = Array.from({ length: 20 }, (_, i) => ({ snapshotOrdinal: 1000 - i * 2, blockHash: `d${i}` }));
      const inside: TrailDeps["transfers"] = async (c, n) => (c === "dor" ? dorEndless(c, n) : { rows: dagRows });
      expect((await assembleTrail(deps({ transfers: inside }), null, 20)).partial).toEqual(["dor"]);
      // DOR caps first (at 989); the DAG's twenty NEWER ticks then fill the window, all above it.
      const newer = Array.from({ length: 20 }, (_, i) => ({ snapshotOrdinal: 1020 - i, blockHash: `d${i}` }));
      const past: TrailDeps["transfers"] = async (c, n) =>
        c === "dor" ? dorEndless(c, n) : new Promise((ok) => setTimeout(() => ok({ rows: newer }), 5));
      const a = await assembleTrail(deps({ transfers: past }), null, 20);
      expect(a.ticks.at(-1)!.ord).toBe(1001);
      expect(a.partial).toBeUndefined();
    });
    it("names the network by its current id, and is absent when nothing was cut", async () => {
      const transfers: TrailDeps["transfers"] = async (c, n) => (c === "dor" ? dorEndless(c, n) : { rows: [] });
      expect((await assembleTrail(deps({ transfers, currentId: (id) => (id === "dor" ? "DOR" : id) }), null, 52)).partial).toEqual(["DOR"]);
      expect((await assembleTrail(deps(), null, 10)).partial).toBeUndefined();
    });
  });
});
