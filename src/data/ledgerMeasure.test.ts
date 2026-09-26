import { describe, expect, it } from "vitest";
import type { SnapshotExact } from "@/src/data/types";
import {
  LEDGER_MEASURE_LABELS,
  LEDGER_MEASURE_OPTIONS,
  LEDGER_MEASURE_ORDER,
  SNAP_MEASURE_OPTIONS,
  kbFigure,
  TICK_NET_MEASURE_OPTIONS,
  snapMeasureValue,
  tickMeasureValue,
  tickNetMeasure,
  NO_MEASURE,
  snapMeasure,
  tickMeasure,
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
    expect(snapMeasure("fee", row)).toBe("0.0460");
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
    expect(TICK_NET_MEASURE_OPTIONS.map((o) => o.id)).toEqual(["snapshots", "fee", "size"]);
    expect(tickNetMeasure("snapshots", 4, undefined)).toEqual({ value: 4, text: "4" });
    expect(tickNetMeasure("fee", 4, { fee: 4_600_000, bytes: 20_480 })).toEqual({ value: 4_600_000, text: "0.0460" });
    expect(tickNetMeasure("size", 4, { fee: 0, bytes: 20_480 })).toEqual({ value: 20_480, text: "20" });
    expect(tickNetMeasure("fee", 4, undefined)).toEqual({ value: null, text: NO_MEASURE });
  });

  it("a snapshot measures its own fee or its own bytes, from either byte field, or nothing", () => {
    expect(SNAP_MEASURE_OPTIONS.map((o) => o.id)).toEqual(["fee", "size"]);
    expect(snapMeasureValue("fee", { fee: 12 })).toBe(12);
    expect(snapMeasureValue("size", { fee: 0, sizeInKB: 2 })).toBe(2048);
    expect(snapMeasureValue("size", { fee: 0, bytes: 14 })).toBe(14);
    expect(snapMeasureValue("size", { fee: 0 })).toBeNull();
  });
});
