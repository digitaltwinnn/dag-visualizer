import { describe, expect, it } from "vitest";
import type { SnapshotExact } from "@/src/data/types";
import {
  LEDGER_MEASURE_LABELS,
  LEDGER_MEASURE_ORDER,
  NO_MEASURE,
  snapMeasure,
  stepLedgerMeasure,
  tickMeasure,
  type LedgerMeasure,
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

  it("steps through the order and stops at the ends (the plank's rule: an exhausted direction is inactive)", () => {
    const first = LEDGER_MEASURE_ORDER[0]!;
    const last = LEDGER_MEASURE_ORDER[LEDGER_MEASURE_ORDER.length - 1]!;
    expect(stepLedgerMeasure(first, -1)).toBeNull();
    expect(stepLedgerMeasure(last, 1)).toBeNull();
    expect(stepLedgerMeasure(first, 1)).toBe(LEDGER_MEASURE_ORDER[1]);
    expect(stepLedgerMeasure("bogus" as LedgerMeasure, 1)).toBeNull();
  });
});

describe("tickMeasure — every figure is read off the tick, or it is the dash", () => {
  it("reads each measure from the exact decode", () => {
    expect(tickMeasure("fee", { metagraphSnapshotCount: 8 }, EXACT)).toBe("0.0460 DAG");
    expect(tickMeasure("metagraphs", { metagraphSnapshotCount: 8 }, EXACT)).toBe("4");
    expect(tickMeasure("size", { metagraphSnapshotCount: 8 }, EXACT)).toBe("312 KB");
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

describe("snapMeasure — a leaf is one anchor of one metagraph, so only SIZE changes its figure", () => {
  it("leads with the fee for fee, anchors and metagraphs, and with its own bytes for size", () => {
    const row = { fee: 4_600_000, bytes: 14 };
    for (const m of ["fee", "anchors", "metagraphs"] as const) expect(snapMeasure(m, row)).toBe("0.0460 DAG");
    expect(snapMeasure("size", row)).toBe("14 B");
    expect(snapMeasure("size", { fee: 0, bytes: 20_480 })).toBe("20 KB");
    // The explorer's log rows carry the size as sizeInKB: read the same way, in bytes under 1 KB.
    expect(snapMeasure("size", { fee: 0, sizeInKB: 20 })).toBe("20 KB");
    expect(snapMeasure("size", { fee: 0, sizeInKB: 14 / 1024 })).toBe("14 B");
    // A leaf whose source measured no size answers the dash under SIZE, never a number.
    expect(snapMeasure("size", { fee: 4_600_000 })).toBe(NO_MEASURE);
  });
});
