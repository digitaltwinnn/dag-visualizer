import { describe, it, expect } from "vitest";
import type { ChannelSnapRow, SnapshotExact } from "@/src/data/types";
import { dataByNetwork, dataInWindow, dataPerTick, lastDataTick } from "./dataStats";

// THE DATA BLOCKS REGISTER'S BAND (D6, 2026-11-07): DATA UPDATES · BY NETWORK · LAST DATA BLOCK, read
// off the exact reads of the ticks the ledger source holds. A tick whose read has not landed is
// unknown — a gap and a "read" floor — never a zero.

const row = (metaId: string, ordinal: number, dataTxCount: number | undefined, dataBlocks: number | undefined): ChannelSnapRow => ({
  metaId, ordinal, decoded: dataTxCount != null, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null,
  ...(dataTxCount != null ? { dataTxCount } : {}), ...(dataBlocks != null ? { dataBlocks } : {}),
});
const exact = (ordinal: number, rows: ChannelSnapRow[]): SnapshotExact => ({
  ordinal, anchored: rows.length, channels: 1, totalFee: 0, totalSizeKB: 0, rewardsDatum: 0, listedFee: 0, unlistedFee: 0, listedCount: 0, unlistedCount: 0, perMeta: {}, rows,
});

const ticks = [
  { ordinal: 1, timestamp: "2026-11-07T10:00:00.000Z" },
  { ordinal: 2, timestamp: "2026-11-07T10:00:20.000Z" },
  { ordinal: 3, timestamp: "2026-11-07T10:00:40.000Z" },
  { ordinal: 4, timestamp: "2026-11-07T10:01:00.000Z" },
];
const reads: Record<number, SnapshotExact> = {
  1: exact(1, [row("DED", 10, 40, 1), row("DOR", 5, 2, 1)]),
  2: exact(2, [row("DOR", 6, 0, 0)]),
  // tick 3: not read
  4: exact(4, [row("DED", 11, 8, 1), row("odd", 1, undefined, undefined)]),
};
const all = () => true;

describe("dataInWindow", () => {
  it("sums the data updates of the ticks read, and says how many were", () => {
    // Tick 4 holds an undecodable snapshot ("odd"): its count is unknown, so under All the tick is
    // UNREAD — outside the sum and the read count — never a 0 for that snapshot (review N1).
    expect(dataInWindow(ticks, reads, all)).toEqual({ count: 42, read: 2, total: 4 });
  });
  it("counts only the scope's networks — an undecodable row outside the scope leaves the tick read", () => {
    expect(dataInWindow(ticks, reads, (id) => id === "DOR")).toEqual({ count: 2, read: 3, total: 4 });
    expect(dataInWindow(ticks, reads, (id) => id === "DED")).toEqual({ count: 48, read: 3, total: 4 });
    expect(dataInWindow(ticks, reads, (id) => id === "odd")).toEqual({ count: 0, read: 2, total: 4 });
  });
});

describe("dataPerTick", () => {
  it("one point per tick, oldest first, a gap where the read has not landed or a row is undecodable", () => {
    expect(dataPerTick(ticks, reads, all)).toEqual([42, 0, null, null]);
    expect(dataPerTick(ticks, reads, (id) => id === "DED")).toEqual([40, 0, null, 8]);
  });
});

describe("dataByNetwork", () => {
  it("shares the updates by network, in the given order, leaving out networks with none", () => {
    const key = (id: string) => (id === "odd" ? "unlisted" : id);
    // Tick 4 is unread under All (its "odd" row is undecodable), so DED's 8 there is not counted: the
    // bars read the ticks the lead reads and never sum past it.
    expect(dataByNetwork(ticks, reads, all, key, ["DOR", "DED"])).toEqual([
      { key: "DOR", count: 2 },
      { key: "DED", count: 40 },
    ]);
    // Under a filter the lens is the scope's: DED's tick 4 is read there.
    expect(dataByNetwork(ticks, reads, (id) => id === "DED", key, ["DOR", "DED"])).toEqual([{ key: "DED", count: 48 }]);
    // A network outside the order comes after it.
    expect(dataByNetwork(ticks, { 1: exact(1, [row("NEW", 1, 3, 1), row("DED", 2, 1, 1)]) }, all, key, ["DED"])).toEqual([
      { key: "DED", count: 1 },
      { key: "NEW", count: 3 },
    ]);
  });
});

describe("lastDataTick", () => {
  it("is the newest read tick holding a snapshot that carried data blocks, and whose", () => {
    expect(lastDataTick(ticks, reads, all)).toEqual({ ordinal: 4, ts: "2026-11-07T10:01:00.000Z", metaId: "DED" });
    expect(lastDataTick(ticks, reads, (id) => id === "DOR")).toEqual({ ordinal: 1, ts: "2026-11-07T10:00:00.000Z", metaId: "DOR" });
    expect(lastDataTick(ticks, reads, (id) => id === "NDT")).toBeNull();
  });
});
