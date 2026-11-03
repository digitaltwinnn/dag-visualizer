import { afterEach, describe, expect, it } from "vitest";
import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot, RawMetaSnapshot } from "@/src/data/types";
import { CATALOG } from "@/src/engine/config";
import { tickPolledRows } from "@/src/data/ladderLevels";
import { buildPastWindow, foldAnchors, getPastWindow, ledgerSource, onPastWindow, pastWanted, setPastWindow, type LedgerSource } from "@/src/data/pastWindow";

const g = (o: number): GlobalSnapshot => ({ ordinal: o, timestamp: `t${o}`, hash: `g${o}` });
const raw = (o: number, ts: string, fee = 10): RawMetaSnapshot => ({ ordinal: o, timestamp: ts, hash: `m${o}`, lastSnapshotHash: `m${o - 1}`, fee, sizeInKB: 1 } as RawMetaSnapshot);
const rec = (o: number, ts: string, fee = 10): MetaSnapRecord => ({ ordinal: o, hash: `m${o}`, parent: "", ts, fee, sizeInKB: 1, height: 0, subHeight: 0, blocks: 0, epochProgress: 0 });

afterEach(() => setPastWindow(null));

describe("foldAnchors", () => {
  it("folds each chain's records per anchoring timestamp, fees summed and each network counted", () => {
    const a = foldAnchors(new Map([["dor", [rec(1, "t5", 10), rec(2, "t5", 20)]], ["ded", [rec(9, "t5", 5), rec(10, "t6", 1)]]]));
    expect(a.get("t5")).toMatchObject({ fee: 35, count: 3, touched: 0 });
    expect([...a.get("t5")!.metaCounts]).toEqual([["dor", 2], ["ded", 1]]);
    expect(a.get("t6")!.count).toBe(1);
  });
});

describe("buildPastWindow", () => {
  it("answers the live buffer's questions: globals oldest first, records oldest first, anchors by timestamp", () => {
    const w = buildPastWindow({ globals: [g(12), g(10), g(11)], chains: { dor: [raw(3, "t11"), raw(2, "t10")] } }, "mainnet")!;
    expect([w.from, w.to]).toEqual([10, 12]);
    expect(w.globalSnapshots.map((x) => x.ordinal)).toEqual([10, 11, 12]);
    expect(w.metaSnaps.get("dor")!.map((r) => r.ordinal)).toEqual([2, 3]);
    expect(w.getAnchor("t11")!.count).toBe(1);
    expect(w.getAnchor("t12")).toBeNull();
    expect([w.holds(10), w.holds(12), w.holds(13)]).toEqual([true, true, false]);
    expect(w.unlistedSnaps.size).toBe(0);
  });
  it("files a former address under its network's current id, each record keeping its own chain", () => {
    const row = CATALOG.mainnet.find((m) => m.formerIds?.length)!;
    const former = row.formerIds![0]!;
    const w = buildPastWindow({ globals: [g(10)], chains: { [former]: [raw(7, "t10")], [row.id]: [raw(3, "t10")] } }, "mainnet")!;
    expect(w.metaSnaps.has(former)).toBe(false);
    expect(w.metaSnaps.get(row.id)!.map((r) => [r.ordinal, r.chain])).toEqual([[3, undefined], [7, former]]);
    // A selection names the real chain: ordinals are per chain.
    expect(tickPolledRows(w.metaSnaps, g(10)).map((r) => [r.metaId, r.ordinal])).toEqual([[row.id, 3], [former, 7]]);
    expect(w.getAnchor("t10")!.metaCounts.get(row.id)).toBe(2);
  });
  it("is nothing with no global snapshots", () => {
    expect(buildPastWindow({ globals: [], chains: {} }, "mainnet")).toBeNull();
  });
});

describe("pastWanted", () => {
  const base = { ledger: true, following: false, pin: 100, liveOldest: 5000, held: null };
  it("fetches a window around a pin older than the live buffer", () => {
    expect(pastWanted(base)).toEqual({ kind: "fetch", ordinal: 100 });
  });
  it("keeps the held window while the pin stays inside it, and fetches when it leaves", () => {
    expect(pastWanted({ ...base, held: { from: 60, to: 110 } })).toEqual({ kind: "keep" });
    expect(pastWanted({ ...base, pin: 59, held: { from: 60, to: 110 } })).toEqual({ kind: "fetch", ordinal: 59 });
  });
  it("releases it following live, outside the view, with no pin, or for a pin the live buffer holds", () => {
    for (const s of [{ following: true }, { ledger: false }, { pin: null }, { pin: 5000 }, { liveOldest: null }]) expect(pastWanted({ ...base, ...s })).toEqual({ kind: "clear" });
  });
});

describe("the held window", () => {
  it("is the ledger source while held, the live buffer otherwise, and tells its listeners", () => {
    const live = { globalSnapshots: [g(9000)] } as unknown as LedgerSource;
    const w = buildPastWindow({ globals: [g(1)], chains: {} }, "mainnet")!;
    let heard = 0;
    const off = onPastWindow(() => heard++);
    expect(ledgerSource(live)).toBe(live);
    setPastWindow(w);
    expect(getPastWindow()).toBe(w);
    expect(ledgerSource(live)).toBe(w);
    setPastWindow(w); // no change, no word
    setPastWindow(null);
    off();
    setPastWindow(w);
    expect(heard).toBe(2);
  });
});
