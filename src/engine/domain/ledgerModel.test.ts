import * as THREE from "three";
import { describe, it, expect } from "vitest";
import {
  SLOT_SP,
  SLOT_N,
  BLOCK_SIZE,
  LANE_GAP_Z,
  slotFade,
  curvePoint,
  anchorTiles,
  LedgerModel,
} from "./ledgerModel";
import { LEDGER, METAGRAPHS, ledgerSite } from "../config";
import type { GlobalSnapshot, Anchor } from "@/src/data/types";

// LINK_VFRAC (js/ledger.js:49) — kept module-private in ledgerModel.ts (not part of the brief's
// export list); hardcoded here same as the other domain tests hardcode source constants verbatim.
const LINK_VFRAC = 0.55;

function snap(ordinal: number, ts: string, count = 0): GlobalSnapshot {
  return { ordinal, timestamp: ts, hash: `h${ordinal}`, metagraphSnapshotCount: count };
}

function anchor(metaCounts: Record<string, number>): Anchor {
  const m = new Map(Object.entries(metaCounts));
  let count = 0;
  for (const n of m.values()) count += n;
  return { fee: 0, count, metaIds: new Set(m.keys()), metaCounts: m, touched: 0 };
}

const idA = METAGRAPHS[0].id;
const idB = METAGRAPHS[1].id;

describe("anchorTiles (js/ledger.js:217-233, _anchorTiles verbatim)", () => {
  it("count<=1 -> a single centred, linking tile", () => {
    expect(anchorTiles(1)).toEqual([{ ox: 0, oz: 0, size: BLOCK_SIZE, link: true }]);
    expect(anchorTiles(0)).toEqual([{ ox: 0, oz: 0, size: BLOCK_SIZE, link: true }]);
  });

  it("count=12 -> a uniform-pitch grid, inset within the tick/lane cell, exactly one linking tile", () => {
    const tiles = anchorTiles(12);
    expect(tiles.length).toBe(12);
    expect(tiles.filter((t) => t.link).length).toBe(1);
    for (const t of tiles) {
      expect(Math.abs(t.ox)).toBeLessThanOrEqual(SLOT_SP / 2);
      expect(Math.abs(t.oz)).toBeLessThanOrEqual(LANE_GAP_Z / 2);
      expect(t.size).toBeGreaterThan(0);
      expect(t.size).toBeLessThanOrEqual(BLOCK_SIZE);
    }
  });

  it("lays tiles out with UNIFORM pitch (equal spacing between column neighbours)", () => {
    const tiles = anchorTiles(12);
    // 4 columns (cols = round(sqrt(12 * SLOT_SP/LANE_GAP_Z))) -> the first row's ox values step evenly.
    const row0 = tiles.filter((t) => t.oz === tiles[0].oz).map((t) => t.ox).sort((a, b) => a - b);
    const steps = row0.slice(1).map((v, i) => v - row0[i]);
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 10);
  });
});

describe("slotFade (js/ledger.js:53 verbatim)", () => {
  it("slotFade(1) === 1 (the freshest completed slot is fully bright)", () => {
    expect(slotFade(1)).toBe(1);
  });

  it(`slotFade(SLOT_N=${SLOT_N}) === 0 (the oldest visible slot is fully faded)`, () => {
    expect(slotFade(SLOT_N)).toBe(0);
  });

  it("clamps to [0,1] outside the visible range", () => {
    expect(slotFade(0)).toBe(1);
    expect(slotFade(SLOT_N + 5)).toBe(0);
  });
});

describe("curvePoint (js/ledger.js:66-74 verbatim)", () => {
  it("is continuous across the t=LINK_VFRAC seam (straight-down segment meets the swing-in cubic)", () => {
    const out = new THREE.Vector3();
    const sx = 2.5, sz = -3.1, gx = 0;
    curvePoint(LINK_VFRAC, sx, sz, gx, out);
    expect(out.x).toBeCloseTo(sx, 10);
    expect(out.y).toBeCloseTo(LEDGER.rowMSnap, 10);
    expect(out.z).toBeCloseTo(sz, 10);

    // just past the seam the point must be close to the seam value, not jump (the two branches'
    // SLOPES need not match — only the position — so keep epsilon tight relative to the tolerance).
    const after = new THREE.Vector3();
    curvePoint(LINK_VFRAC + 0.0001, sx, sz, gx, after);
    expect(after.distanceTo(out)).toBeLessThan(0.01);
  });

  it("lands exactly at (gx, LEDGER.rowGL0, 0) at t=1", () => {
    const out = new THREE.Vector3();
    curvePoint(1, 2.5, -3.1, 7.3, out);
    expect(out.x).toBeCloseTo(7.3, 10);
    expect(out.y).toBeCloseTo(LEDGER.rowGL0, 10);
    expect(out.z).toBeCloseTo(0, 10);
  });

  it("starts straight down the column at t=0: (sx, LEDGER.rowProducers, sz)", () => {
    const out = new THREE.Vector3();
    curvePoint(0, 2.5, -3.1, 7.3, out);
    expect(out.x).toBeCloseTo(2.5, 10);
    expect(out.y).toBeCloseTo(LEDGER.rowProducers, 10);
    expect(out.z).toBeCloseTo(-3.1, 10);
  });

  it("returns the same `out` reference it was given (no allocation)", () => {
    const out = new THREE.Vector3();
    const ret = curvePoint(0.2, 1, 1, 1, out);
    expect(ret).toBe(out);
  });
});

describe("LedgerModel.setData — first tick (no history to seed, snaps.length===1)", () => {
  it("does not seed the trail, sets tickOrdinal, and reports an anchoring metagraph", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 3);
    const changes = model.setData([s1], (ts) => (ts === "T1" ? anchor({ [idA]: 3 }) : null));

    expect(model.tickOrdinal).toBe(100);
    expect(model.trail).toEqual([]);
    expect(changes).toEqual([{ id: idA, count: 3, delta: 3 }]);

    const lane = model.lanes.get(idA)!;
    expect(lane.z).toBeCloseTo(ledgerSite(0, METAGRAPHS.length).z, 10);
    const live = lane.blocks.filter((b) => b.slot === 0);
    expect(live.length).toBe(anchorTiles(3).length);
    for (const b of live) expect(b.filled).toBe(true);
  });

  it("a metagraph id absent from METAGRAPHS (unlisted) produces no TickChange and no lane", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 1);
    const changes = model.setData([s1], () => anchor({ "unlisted-xyz": 5 }));
    expect(changes).toEqual([]);
    expect(model.lanes.has("unlisted-xyz")).toBe(false);
  });

  it("calling setData again within the SAME tick only reports the NEW delta", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 3);
    model.setData([s1], () => anchor({ [idA]: 2 }));
    const changes = model.setData([s1], () => anchor({ [idA]: 2 })); // unchanged count
    expect(changes).toEqual([]);
    const changes2 = model.setData([s1], () => anchor({ [idA]: 5 })); // grew mid-tick
    expect(changes2).toEqual([{ id: idA, count: 5, delta: 3 }]);
  });
});

describe("LedgerModel.setData — tick advance (js/ledger.js:511-533 verbatim)", () => {
  it("a new tick shifts the trail + every lane's blocks one slot left, seeding a fresh placeholder", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 3);
    model.setData([s1], () => anchor({ [idA]: 3 }));

    const s2 = snap(101, "T2", 2);
    const changes = model.setData([s1, s2], (ts) => (ts === "T2" ? anchor({ [idA]: 2 }) : null));

    expect(model.tickOrdinal).toBe(101);
    // the tick that just completed (100) drops into the trail at slot 1.
    expect(model.trail).toEqual([{ ordinal: 100, slot: 1 }]);

    const lane = model.lanes.get(idA)!;
    // its tick-1 tiles (real, slot 0 at the time) are now at slot 1 ...
    expect(lane.blocks.filter((b) => b.slot === 1).length).toBe(anchorTiles(3).length);
    // ... and the new tick's anchor (2) landed fresh at slot 0.
    expect(lane.blocks.filter((b) => b.slot === 0).length).toBe(anchorTiles(2).length);
    expect(changes).toEqual([{ id: idA, count: 2, delta: 2 }]);

    // every OTHER metagraph also gets an empty placeholder at slot 0 on every new tick.
    const laneB = model.lanes.get(idB)!;
    expect(laneB.blocks.some((b) => b.slot === 0 && !b.filled)).toBe(true);
  });

  it("caps the trail + lane blocks at SLOT_N by dropping the oldest", () => {
    const model = new LedgerModel();
    let snaps: GlobalSnapshot[] = [];
    for (let i = 0; i <= SLOT_N + 3; i++) {
      snaps = [...snaps, snap(100 + i, `T${i}`, 1)];
      model.setData(snaps, (ts) => (ts === `T${i}` ? anchor({ [idA]: 1 }) : null));
    }
    expect(model.trail.length).toBe(SLOT_N);
    const lane = model.lanes.get(idA)!;
    for (const b of lane.blocks) expect(b.slot).toBeLessThanOrEqual(SLOT_N);
  });
});

describe("LedgerModel.setSelected / isRowHot — the binary colour rule (js/ledger.js:572-577, :640)", () => {
  it("with nothing selected, the LIVE lead (slot<=0) is hot and everything else is not", () => {
    const model = new LedgerModel();
    expect(model.selectedSlot).toBe(-1);
    expect(model.isRowHot(false, 0)).toBe(true);
    expect(model.isRowHot(false, 1)).toBe(false);
    expect(model.isRowHot(false, -1)).toBe(true);
  });

  it("a filtered-out lane (laneOff) is never hot, live lead or not", () => {
    const model = new LedgerModel();
    expect(model.isRowHot(true, 0)).toBe(false);
  });

  it("selecting an older ordinal follows its block leftward as ticks advance, and flips the hot row", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 1);
    model.setData([s1], () => anchor({ [idA]: 1 }));

    const s2 = snap(101, "T2", 1);
    model.setData([s1, s2], (ts) => (ts === "T2" ? anchor({ [idA]: 1 }) : null));

    model.setSelected(100); // the ordinal now sitting in the trail
    expect(model.selectedSlot).toBe(1);
    expect(model.isRowHot(false, 1)).toBe(true); // selected older row is hot
    expect(model.isRowHot(false, 0)).toBe(false); // live lead goes neutral once an older row is selected

    // one more tick: ordinal 100's block should keep following, now at slot 2.
    const s3 = snap(102, "T3", 1);
    model.setData([s1, s2, s3], (ts) => (ts === "T3" ? anchor({ [idA]: 1 }) : null));
    expect(model.selectedSlot).toBe(2);
    expect(model.isRowHot(false, 2)).toBe(true);
    expect(model.isRowHot(false, 1)).toBe(false);
  });

  it("setSelected(null) clears the selection back to live-lead-hot", () => {
    const model = new LedgerModel();
    model.setSelected(100);
    model.setSelected(null);
    expect(model.selectedSlot).toBe(-1);
    expect(model.isRowHot(false, 0)).toBe(true);
  });
});

describe("LedgerModel — history seeding (js/ledger.js:370-393, _seedHistory verbatim)", () => {
  it("pre-populates the trail + lanes from a retained window on the FIRST call with >1 snapshot", () => {
    const model = new LedgerModel();
    const snaps = [snap(100, "T0", 1), snap(101, "T1", 2), snap(102, "T2", 0)];
    // latest = snaps[2] (ordinal 102); seedHistory runs for s=1..min(SLOT_N, 3-1)=2
    const changes = model.setData(snaps, (ts) => {
      if (ts === "T1") return anchor({ [idA]: 2 }); // one tick behind latest -> slot 1
      if (ts === "T0") return anchor({}); // two ticks behind -> slot 2, no anchor
      return null; // latest tick (T2) itself: no anchor this call
    });

    expect(model.tickOrdinal).toBe(102);
    expect(model.trail).toEqual([
      { ordinal: 101, slot: 1 },
      { ordinal: 100, slot: 2 },
    ]);
    const lane = model.lanes.get(idA)!;
    expect(lane.blocks.filter((b) => b.slot === 1 && b.filled).length).toBe(anchorTiles(2).length);
    expect(lane.blocks.some((b) => b.slot === 2 && !b.filled)).toBe(true);
    expect(changes).toEqual([]); // the live tick (T2) itself reported no anchor in this call
  });
});
