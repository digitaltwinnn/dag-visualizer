import { describe, expect, it } from "vitest";
import type { SnapshotExact } from "@/src/data/types";
import {
  LEDGER_MEASURE_LABELS,
  LEDGER_MEASURE_OPTIONS,
  LEDGER_MEASURE_ORDER,
  SNAP_MEASURE_OPTIONS,
  SNAP_MEASURES,
  kbFigure,
  TICK_NET_MEASURE_OPTIONS,
  TICK_NET_MEASURES,
  snapMeasureValue,
  tickMeasureValue,
  tickNetMeasure,
  NO_MEASURE,
  snapMeasure,
  tickMeasure,
  DATA_MEASURE_OPTIONS,
  DATA_MEASURE_ORDER,
  DATA_TICK_NET_MEASURES,
  DATA_TICK_NET_MEASURE_OPTIONS,
  DATA_SNAP_MEASURES,
  DATA_SNAP_MEASURE_OPTIONS,
  tickDataUpdates,
  dataUpdatesOf,
  REGISTER_MEASURES,
  REGISTER_SUBJECTS,
} from "./ledgerMeasure";

// The Snapshots explorer's tick-row figure, as a vocabulary (2026-09-26). The stepper walks the
// order; each measure is read off the tick honestly or answers the dash.

const EXACT: SnapshotExact = {
  ordinal: 10,
  anchored: 8,
  channels: 4,
  totalFee: 4_600_000, // datum → 0.0460 DAG
  totalSizeKB: 312.4,
  rewardsDatum: 0,
  listedFee: 4_600_000,
  unlistedFee: 0,
  listedCount: 8,
  unlistedCount: 0,
  perMeta: {},
  rows: [],
};

describe("the order and its labels", () => {
  it("leads with the fee — the figure the rows have shown since 2026-09-13 — and names every measure", () => {
    expect(LEDGER_MEASURE_ORDER[0]).toBe("fee");
    for (const m of LEDGER_MEASURE_ORDER) expect(LEDGER_MEASURE_LABELS[m].length).toBeGreaterThan(0);
    expect(new Set(LEDGER_MEASURE_ORDER).size).toBe(LEDGER_MEASURE_ORDER.length);
  });

  it("answers the dash without an exact read for fee, metagraphs and size — never a derived number (rule 10)", () => {
    for (const m of ["fee", "metagraphs", "size"] as const) {
      expect(tickMeasure(m, { metagraphSnapshotCount: 8 }, undefined)).toBe(NO_MEASURE);
    }
  });

  it("anchors is the ONE measure the polled feed states itself, so it needs no exact read — and the exact count is the fallback", () => {
    expect(tickMeasure("anchors", { metagraphSnapshotCount: 8 }, undefined)).toBe("8");
    expect(tickMeasure("anchors", {}, EXACT)).toBe("8");
    expect(tickMeasure("anchors", {}, undefined)).toBe(NO_MEASURE);
  });
});

describe("snapMeasure — a snapshot states its own fee or its own size, bare", () => {
  it("kbFigure keeps a small size readable and never leaves KB", () => {
    expect(kbFigure(1229)).toBe("1,229");
    expect(kbFigure(9.96)).toBe("10.0");
    expect(kbFigure(0.5)).toBe("0.50");
  });
  it("leads with the fee for fee and with its own bytes for size", () => {
    const row = { fee: 4_600_000, bytes: 14 };
    expect(snapMeasure("fee", row)).toBe("0.05"); // shortened (user, 2026-10-07: "instead of 0.0480 … 0.05")
    // Always KB, the unit the heading names — a 14-byte state is "0.01", never a bare "0".
    expect(snapMeasure("size", row)).toBe("0.01");
    expect(snapMeasure("size", { fee: 0, bytes: 20_480 })).toBe("20");
    // The explorer's log rows carry the size as sizeInKB: read the same way.
    expect(snapMeasure("size", { fee: 0, sizeInKB: 20 })).toBe("20");
    expect(snapMeasure("size", { fee: 0, sizeInKB: 14 / 1024 })).toBe("0.01");
    expect(snapMeasure("size", { fee: 0, sizeInKB: 2.25 })).toBe("2.3");
    // A leaf whose source measured no size answers the dash under SIZE, never a number.
    expect(snapMeasure("size", { fee: 4_600_000 })).toBe(NO_MEASURE);
  });
});

describe("the levels' lists and their numbers (design 2026-09-26: each level has its own measures)", () => {
  it("lists the tick measures in order with units, and the bar reads the same source the figure does", () => {
    expect(LEDGER_MEASURE_OPTIONS.map((o) => o.id)).toEqual([...LEDGER_MEASURE_ORDER]);
    expect(tickMeasureValue("fee", { metagraphSnapshotCount: 8 }, EXACT)).toBe(4_600_000);
    expect(tickMeasureValue("anchors", { metagraphSnapshotCount: 8 }, undefined)).toBe(8);
    expect(tickMeasureValue("metagraphs", { metagraphSnapshotCount: 8 }, undefined)).toBeNull();
    expect(tickMeasureValue("size", {}, EXACT)).toBeCloseTo(312.4, 6);
  });

  it("a network under a tick counts its snapshots itself and takes fee and size from the exact breakdown", () => {
    // The tick level's own words, minus Metagraphs — a network under a tick IS one metagraph;
    // its snapshots in the tick are its ANCHORS there (was a separate "Snapshots" word).
    expect(TICK_NET_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Fees", "Anchors", "Size"]);
    expect(TICK_NET_MEASURES).toEqual(["fee", "anchors", "size"]); // the tick's list minus Metagraphs
    expect(tickNetMeasure("anchors", 4, undefined)).toEqual({ value: 4, text: "4" });
    expect(tickNetMeasure("fee", 4, { fee: 4_600_000, bytes: 20_480 })).toEqual({ value: 4_600_000, text: "0.05" });
    expect(tickNetMeasure("size", 4, { fee: 0, bytes: 20_480 })).toEqual({ value: 20_480, text: "20" });
    expect(tickNetMeasure("fee", 4, undefined)).toEqual({ value: null, text: NO_MEASURE });
  });

  it("a snapshot measures its own fee or its own bytes, from either byte field, or nothing", () => {
    expect(SNAP_MEASURE_OPTIONS.map((o) => o.id)).toEqual(["fee", "size"]);
    expect(SNAP_MEASURES).toEqual(["fee", "size"]); // one anchor of one metagraph: no counts
    expect(SNAP_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Fees", "Size"]); // the tick level's words
    expect(snapMeasureValue("fee", { fee: 12 })).toBe(12);
    expect(snapMeasureValue("size", { fee: 0, sizeInKB: 2 })).toBe(2048);
    expect(snapMeasureValue("size", { fee: 0, bytes: 14 })).toBe(14);
    expect(snapMeasureValue("size", { fee: 0 })).toBeNull();
  });
});

// THE DATA BLOCKS REGISTER'S MEASURE (D6, 2026-11-07): the Snapshots measures with "Data updates"
// added, and leading — every level's figure the data updates the exact read counts.
describe("the Data blocks register's measure", () => {
  const rows = [
    { metaId: "DED", ordinal: 1, decoded: true, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null, dataTxCount: 40, dataBlocks: 1 },
    { metaId: "DOR", ordinal: 9, decoded: true, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null, dataTxCount: 2, dataBlocks: 1 },
    { metaId: "NDT", ordinal: 3, decoded: true, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null, dataTxCount: 0, dataBlocks: 0 },
  ];
  const ex: SnapshotExact = { ...EXACT, rows };

  it("is Data updates · Fees · Metagraphs · Size — Data updates in Anchors' place, leading (D7)", () => {
    expect(DATA_MEASURE_ORDER).toEqual(["data", "fee", "metagraphs", "size"]);
    expect(DATA_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Data updates", "Fees", "Metagraphs", "Size"]);
    expect(DATA_MEASURE_ORDER).not.toContain("anchors");
    // Four tiles, which `explorer/tileRows` lays two by two, so the long word has a half-row.
    expect(DATA_MEASURE_ORDER).toHaveLength(4);
    // The Metagraph snapshots register keeps its own four.
    expect(LEDGER_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Fees", "Anchors", "Metagraphs", "Size"]);
    expect(DATA_MEASURE_OPTIONS[0]).toEqual({ id: "data", label: "Data updates", unit: "count" });
    expect(DATA_MEASURE_OPTIONS.map((o) => o.id)).toEqual([...DATA_MEASURE_ORDER]);
    // The Snapshots register's list does not grow.
    expect(LEDGER_MEASURE_ORDER).not.toContain("data");
    expect(DATA_TICK_NET_MEASURES).toEqual(["data", "fee", "size"]);
    expect(DATA_TICK_NET_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Data updates", "Fees", "Size"]);
    expect(DATA_SNAP_MEASURES).toEqual(["data", ...SNAP_MEASURES]);
    expect(DATA_SNAP_MEASURE_OPTIONS.map((o) => o.label)).toEqual(["Data updates", "Fees", "Size"]);
  });

  it("a tick's figure is its snapshots' data updates summed, from the exact read or the dash", () => {
    expect(tickDataUpdates(ex)).toBe(42);
    expect(tickDataUpdates(undefined)).toBeNull();
    // A tick holding a snapshot the decoder could not read is UNKNOWN — the dash, never 0 (N1).
    const odd = { ...rows[2], metaId: "odd", decoded: false, dataTxCount: undefined, dataBlocks: undefined };
    expect(tickDataUpdates({ rows: [rows[0], odd] })).toBeNull();
    expect(tickMeasure("data", {}, { ...EXACT, rows: [rows[0], odd] })).toBe(NO_MEASURE);
    expect(tickMeasureValue("data", {}, { ...EXACT, rows: [odd] })).toBeNull();
    expect(tickMeasure("data", {}, ex)).toBe("42");
    expect(tickMeasureValue("data", {}, ex)).toBe(42);
    expect(tickMeasure("data", { metagraphSnapshotCount: 8 }, undefined)).toBe(NO_MEASURE);
    // A tick whose snapshots carried none states 0 — measured, not absent.
    expect(tickMeasure("data", {}, { ...EXACT, rows: [rows[2]] })).toBe("0");
  });

  it("a network and a snapshot under a tick state their own data updates", () => {
    expect(tickNetMeasure("data", 2, { fee: 0, bytes: 0, dataTxCount: 40 })).toEqual({ value: 40, text: "40" });
    expect(tickNetMeasure("data", 2, { fee: 0, bytes: 0 })).toEqual({ value: null, text: NO_MEASURE });
    expect(tickNetMeasure("data", 2, undefined)).toEqual({ value: null, text: NO_MEASURE });
    expect(snapMeasure("data", { fee: 0, dataTxCount: 7 })).toBe("7");
    expect(snapMeasure("data", { fee: 0 })).toBe(NO_MEASURE);
    expect(snapMeasureValue("data", { fee: 0, dataTxCount: 7 })).toBe(7);
    expect(snapMeasureValue("data", { fee: 0 })).toBeNull();
  });
});

describe("dataUpdatesOf — the one data-updates sum (the exact read's perMeta, the tick row, the band)", () => {
  it("sums the rows' counts", () => {
    expect(dataUpdatesOf([{ dataTxCount: 2 }, { dataTxCount: 0 }, { dataTxCount: 5 }])).toBe(7);
    expect(dataUpdatesOf([])).toBe(0);
  });
  it("is UNKNOWN when any row could not be decoded — never the decodable rows' sum, never 0 (M5, N1)", () => {
    expect(dataUpdatesOf([{ dataTxCount: 2 }, {}])).toBeUndefined();
    expect(dataUpdatesOf([{}])).toBeUndefined();
  });
});

describe("REGISTER_SUBJECTS — which snapshots a register is about (2026-11-08)", () => {
  it("every anchored snapshot, the block-carrying ones, the data-carrying ones — and Data blocks' measures agree", () => {
    expect(REGISTER_SUBJECTS).toEqual({ snapshots: "all", blocks: "blocks", data: "data" });
    expect(REGISTER_MEASURES.data.dataOnly).toBe(REGISTER_SUBJECTS.data === "data");
  });
});

describe("REGISTER_MEASURES — each register's measure set, one keyed row (R1, L2)", () => {
  it("Metagraph snapshots and Data blocks each carry their own lists, pick and fade", () => {
    expect(REGISTER_MEASURES.snapshots.order).toBe(LEDGER_MEASURE_ORDER);
    expect(REGISTER_MEASURES.snapshots.tickOptions).toBe(LEDGER_MEASURE_OPTIONS);
    expect(REGISTER_MEASURES.snapshots.netMeasures).toBe(TICK_NET_MEASURES);
    expect(REGISTER_MEASURES.snapshots.netOptions).toBe(TICK_NET_MEASURE_OPTIONS);
    expect(REGISTER_MEASURES.snapshots.snapMeasures).toBe(SNAP_MEASURES);
    expect(REGISTER_MEASURES.snapshots.snapOptions).toBe(SNAP_MEASURE_OPTIONS);
    expect([REGISTER_MEASURES.snapshots.pick, REGISTER_MEASURES.snapshots.setPick, REGISTER_MEASURES.snapshots.dataOnly]).toEqual(["ledgerMeasure", "setLedgerMeasure", false]);
    expect(REGISTER_MEASURES.data.order).toBe(DATA_MEASURE_ORDER);
    expect(REGISTER_MEASURES.data.tickOptions).toBe(DATA_MEASURE_OPTIONS);
    expect(REGISTER_MEASURES.data.netMeasures).toBe(DATA_TICK_NET_MEASURES);
    expect(REGISTER_MEASURES.data.netOptions).toBe(DATA_TICK_NET_MEASURE_OPTIONS);
    expect(REGISTER_MEASURES.data.snapMeasures).toBe(DATA_SNAP_MEASURES);
    expect(REGISTER_MEASURES.data.snapOptions).toBe(DATA_SNAP_MEASURE_OPTIONS);
    expect([REGISTER_MEASURES.data.pick, REGISTER_MEASURES.data.setPick, REGISTER_MEASURES.data.dataOnly]).toEqual(["dataMeasure", "setDataMeasure", true]);
  });
  it("Transaction blocks' tick levels (never shown — it lists blocks) read the Metagraph snapshots set", () => {
    expect(REGISTER_MEASURES.blocks).toBe(REGISTER_MEASURES.snapshots);
  });
});

