import { describe, expect, it } from "vitest";
import { buildAnchorLog, snapsAtTick } from "@/src/data/anchorLog";
import type { MetaSnapRecord } from "@/src/data/api";
import type { GlobalSnapshot } from "@/src/data/types";

const g = (ordinal: number, timestamp: string): GlobalSnapshot => ({ ordinal, timestamp, hash: `h${ordinal}` });
const r = (ordinal: number, ts: string, fee = 100): MetaSnapRecord => ({ ordinal, hash: `m${ordinal}`, parent: "", ts, fee, sizeInKB: 1, height: 0, subHeight: 0, blocks: 0, epochProgress: 0 });

const globals = [g(1, "2026-08-01T10:00:00Z"), g(2, "2026-08-01T10:00:15Z")];
const snaps = new Map<string, MetaSnapRecord[]>([
  ["dor", [r(10, "2026-08-01T10:00:00Z"), r(11, "2026-08-01T10:00:15Z"), r(12, "2026-08-01T10:00:15Z")]],
  ["ded", [r(90, "2026-08-01T10:00:00Z"), r(91, "2026-08-01T09:00:00Z")]], // 09:00 is outside the window
]);

describe("buildAnchorLog", () => {
  it("one row per metagraph snapshot, joined to its anchoring global by timestamp", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    expect(rows).toHaveLength(4); // ded@09:00 dropped — no retained global to click through to
    expect(rows.every((x) => x.global.timestamp === x.ts)).toBe(true);
  });
  it("sorts newest tick first, then metagraph-ordinal desc within a tick", () => {
    const rows = buildAnchorLog(snaps, globals, "all");
    // Within the shared 10:00:00 tick, plain ordinal-desc across metagraphs: ded 90 before dor 10.
    expect(rows.map((x) => x.ordinal)).toEqual([12, 11, 90, 10]);
  });
  it("filter scopes to one metagraph; dag/unknown ids yield an empty log", () => {
    expect(buildAnchorLog(snaps, globals, "ded").map((x) => x.metaId)).toEqual(["ded"]);
    expect(buildAnchorLog(snaps, globals, "dag")).toEqual([]);
  });
});

describe("snapsAtTick", () => {
  const rec = (ordinal: number, ts: string) => ({
    ordinal, hash: `h${ordinal}`, parent: `p${ordinal}`, ts, fee: 1, sizeInKB: 2,
    height: 8, subHeight: ordinal, blocks: 0, epochProgress: 100,
  });
  const map = new Map([["A", [rec(1, "t1"), rec(2, "t2"), rec(3, "t2")]]]);

  it("returns that metagraph's snapshots for one anchoring tick, oldest first", () => {
    expect(snapsAtTick(map, "A", "t2").map((r) => r.ordinal)).toEqual([2, 3]);
  });

  it("returns an empty list for an unknown metagraph or a tick it sat out", () => {
    expect(snapsAtTick(map, "B", "t2")).toEqual([]);
    expect(snapsAtTick(map, "A", "t9")).toEqual([]);
  });
});
