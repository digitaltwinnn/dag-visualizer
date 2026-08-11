import { describe, it, expect } from "vitest";
import {
  SLOT_SP,
  SLOT_N,
  BLOCK_SIZE,
  LANE_GAP_Z,
  slotFade,
  HORIZON_X,
  HORIZON_SPAN,
  horizonAt,
  anchorTiles,
  LedgerModel,
  LEAD_SETTLE_MS, LANE_IDS } from "./ledgerModel";
import { METAGRAPHS } from "../config";
import { UNLISTED_KEY } from "./ledgerBands";
import { ledgerSite, LEAD_X } from "./ledgerLayout";
import type { GlobalSnapshot, Anchor } from "@/src/data/types";

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

describe("the horizon (user, 2026-08-09: the chamber must read as continuing into history)", () => {
  it("is fully opaque at the lead — the front of the trail is never touched", () => {
    expect(horizonAt(LEAD_X)).toBe(1);
  });

  it("reaches zero AT the horizon and clamps beyond it (nothing draws past the end)", () => {
    expect(horizonAt(HORIZON_X)).toBe(0);
    expect(horizonAt(HORIZON_X - 10)).toBe(0);
  });

  it("is back to full one span in front of the horizon, and clamps above it", () => {
    expect(horizonAt(HORIZON_X + HORIZON_SPAN)).toBe(1);
    expect(horizonAt(HORIZON_X + HORIZON_SPAN + 10)).toBe(1);
  });

  it("leaves 8 of the 9 visible rows at full brightness — a terminal dissolve, not a depth fade", () => {
    for (let s = 0; s <= SLOT_N - 2; s++) expect(horizonAt(LEAD_X - s * SLOT_SP)).toBe(1);
    const last = horizonAt(LEAD_X - (SLOT_N - 1) * SLOT_SP);
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(1);
  });

  it("sits beyond the last slot but in FRONT of the floor's own back edge, so the glass ends first", () => {
    expect(HORIZON_X).toBeLessThan(LEAD_X - (SLOT_N - 1) * SLOT_SP);
    expect(HORIZON_X).toBeGreaterThan(-33); // LedgerView's FLOOR_CX - FLOOR_W / 2
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

  it("a mid-tick re-anchor CARRIES the lead cluster's eased brightness, so the tiles never flash", () => {
    // The live tick keeps collecting anchors for its whole settling window, and each growth
    // REBUILDS the lane's slot-0 cluster. `bright` is eased render state living on the block (next
    // to `x` and `fade`), so the rebuild has to salvage it exactly as it salvages those two —
    // otherwise every re-anchor would reset the lead's tiles to black and ease them up again.
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 3);
    model.setData([s1], () => anchor({ [idA]: 2 }));
    const lane = model.lanes.get(idA)!;
    for (const b of lane.blocks) if (b.slot === 0) b.bright = 0.8; // what the view eased it to

    model.setData([s1], () => anchor({ [idA]: 5 })); // grew mid-tick -> cluster rebuilt
    const lead = lane.blocks.filter((b) => b.slot === 0);
    expect(lead.length).toBe(anchorTiles(5).length);
    expect(lead.every((b) => b.bright === 0.8)).toBe(true);
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
    // the tick that just completed (100) drops into the trail at slot 1, carrying its OWN
    // timestamp ("T1") — not the new live tick's ("T2").
    expect(model.trail).toEqual([{ ordinal: 100, slot: 1, ts: "T1" }]);

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
    expect(model.isRowHot(0)).toBe(true);
    expect(model.isRowHot(1)).toBe(false);
    expect(model.isRowHot(-1)).toBe(true);
  });

  it("selecting an older ordinal follows its block leftward as ticks advance, and flips the hot row", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 1);
    model.setData([s1], () => anchor({ [idA]: 1 }));

    const s2 = snap(101, "T2", 1);
    model.setData([s1, s2], (ts) => (ts === "T2" ? anchor({ [idA]: 1 }) : null));

    model.setSelected(100); // the ordinal now sitting in the trail
    expect(model.selectedSlot).toBe(1);
    expect(model.isRowHot(1)).toBe(true); // selected older row is hot
    expect(model.isRowHot(0)).toBe(false); // live lead goes neutral once an older row is selected

    // one more tick: ordinal 100's block should keep following, now at slot 2.
    const s3 = snap(102, "T3", 1);
    model.setData([s1, s2, s3], (ts) => (ts === "T3" ? anchor({ [idA]: 1 }) : null));
    expect(model.selectedSlot).toBe(2);
    expect(model.isRowHot(2)).toBe(true);
    expect(model.isRowHot(1)).toBe(false);
  });

  it("slotOf maps an ordinal to its current slot without touching the selection", () => {
    const model = new LedgerModel();
    const s1 = snap(100, "T1", 1);
    model.setData([s1], () => anchor({ [idA]: 1 }));
    const s2 = snap(101, "T2", 1);
    model.setData([s1, s2], (ts) => (ts === "T2" ? anchor({ [idA]: 1 }) : null));
    expect(model.slotOf(101)).toBe(0); // the live lead
    expect(model.slotOf(100)).toBe(1); // in the trail
    expect(model.slotOf(42)).toBe(-1); // not visible
    expect(model.selectedSlot).toBe(-1); // a pure lookup — no selection side effect
  });

  it("setSelected(null) clears the selection back to live-lead-hot", () => {
    const model = new LedgerModel();
    model.setSelected(100);
    model.setSelected(null);
    expect(model.selectedSlot).toBe(-1);
    expect(model.isRowHot(0)).toBe(true);
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
      { ordinal: 101, slot: 1, ts: "T1" },
      { ordinal: 100, slot: 2, ts: "T0" },
    ]);
    const lane = model.lanes.get(idA)!;
    expect(lane.blocks.filter((b) => b.slot === 1 && b.filled).length).toBe(anchorTiles(2).length);
    expect(lane.blocks.some((b) => b.slot === 2 && !b.filled)).toBe(true);
    expect(changes).toEqual([]); // the live tick (T2) itself reported no anchor in this call
  });
});

describe("slot identity + the forming lead row (redesign 2026-08-04)", () => {
  const anchorAt = (touched: number, counts: [string, number][]): Anchor => ({
    fee: 0,
    count: counts.reduce((a, [, n]) => a + n, 0),
    metaIds: new Set(counts.map(([id]) => id)),
    metaCounts: new Map(counts),
    touched,
  });

  it("carries each trail slot's own timestamp, so a tile can name its snapshot", () => {
    const m = new LedgerModel();
    const id = METAGRAPHS[0].id;
    m.setData([snap(1, "t1"), snap(2, "t2")], () => anchorAt(Date.now(), [[id, 2]]));
    // NOTE (deviation from the task brief, see task-4-report.md "Deviations from the brief"):
    // `trail` does NOT gain a "t2" entry here. Slot 0 (the live tick) is never a trail member —
    // it's tracked separately via `tickOrdinal`/the lanes' slot-0 blocks; `trail` is completed
    // ticks only (`recomputeSelectedSlot` special-cases `selectedOrd === tickOrdinal` as slot 0
    // precisely because the trail doesn't carry it, and `seedHistory` deliberately loops only
    // `n-1` ticks behind the latest). The live tick's identity is asserted via `tickTs` below.
    expect(m.tickTs).toBe("t2");
    const lane = m.lanes.get(id)!;
    const lead = lane.blocks.find((b) => b.slot === 0)!;
    expect(lead.ts).toBe("t2");
    expect(lead.count).toBe(2);
  });

  it("says the lead row is forming until the anchor count goes quiet", () => {
    const m = new LedgerModel();
    const id = METAGRAPHS[0].id;
    m.setData([snap(1, "t1")], () => anchorAt(Date.now(), [[id, 1]]));
    expect(m.leadForming).toBe(true);
    m.setData([snap(1, "t1")], () => anchorAt(Date.now() - LEAD_SETTLE_MS - 1, [[id, 1]]));
    expect(m.leadForming).toBe(false);
  });

  it("holds the ~7s settling idiom AnchoredTags already uses", () => {
    expect(LEAD_SETTLE_MS).toBe(7000);
  });
});

describe("LANE_IDS (the unknown lane, 2026-08-07)", () => {
  it("is every listed metagraph plus the unknown lane LAST (the +Z / screen-left end)", () => {
    expect(LANE_IDS.slice(0, -1)).toEqual(METAGRAPHS.map((m) => m.id));
    expect(LANE_IDS[LANE_IDS.length - 1]).toBe(UNLISTED_KEY);
  });

  it("gives the unknown lane real tiles when the anchor aggregate carries its count", () => {
    const model = new LedgerModel();
    const snaps = [
      { ordinal: 1, timestamp: "t1" },
      { ordinal: 2, timestamp: "t2" },
    ] as never[];
    const anchor = () =>
      ({ fee: 0, count: 3, metaIds: new Set([UNLISTED_KEY]), metaCounts: new Map([[UNLISTED_KEY, 3]]), touched: 0 }) as never;
    model.setData(snaps as never, anchor as never);
    const lane = model.lanes.get(UNLISTED_KEY)!;
    expect(lane).toBeTruthy();
    expect(lane.blocks.filter((b) => b.filled).length).toBeGreaterThan(0);
  });
});
