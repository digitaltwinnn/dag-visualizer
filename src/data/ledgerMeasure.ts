import type { GlobalSnapshot, SnapshotExact } from "@/src/data/types";
import { fmtBytes, fmtDag, fmtKB } from "@/src/util/format";

// WHAT A TICK ROW LEADS WITH (user, 2026-09-26: "Snapshots view, like the new trends view, could
// benefit from the control you're moving to the explorer, to switch between different values shown
// in the explorer row. Currently it always shows the DAG for the snapshot; add other options like
// anchors, metagraphs, size (kb)"). The Snapshots explorer's tick rows carried one figure — the fee
// paid, in DAG (2026-09-13, before that the size) — and the choice of WHICH figure was made once, in
// the component. This module states the choices, their order and how each is read off a tick, so
// the explorer's stepper (`components/MeasureStepper.tsx`, the History view's own control) can walk
// them and the row can never show a figure this module does not know how to derive honestly.
//
// Every measure is a FACT ABOUT THE TICK, read from the exact per-tick decode (`SnapshotExact`,
// /api/snapshot/[ordinal]) where it lives there, and from the polled global snapshot where the
// feed already carries it. Rule 10 governs the absent case: a tick whose exact read has not
// arrived (or fell outside the route's window) answers the dash, never a number derived from
// something else — with ONE honest exception, `anchors`, which the polled feed states for every
// tick as `metagraphSnapshotCount` and which the exact read merely confirms.
//
// A SETTING, not a selection — like `trendMetric`, it writes its store setter directly and stays
// outside the click decision table (`selectionBoundary.test.ts`'s scope note).

export type LedgerMeasure = "fee" | "anchors" | "metagraphs" | "size";

/** The stepper's order — the reader steps through these with the chevrons, ends inactive. Fees
 *  first: it is the figure the rows have led with since 2026-09-13, so the default is unchanged. */
export const LEDGER_MEASURE_ORDER: readonly LedgerMeasure[] = ["fee", "anchors", "metagraphs", "size"];

/** The word the stepper shows — what every tick row's figure IS. */
export const LEDGER_MEASURE_LABELS: Readonly<Record<LedgerMeasure, string>> = {
  fee: "Fees",
  anchors: "Anchors",
  metagraphs: "Metagraphs",
  size: "Size",
};

/** The neighbour in the order, or null at an end — the stepper dims that chevron. */
export function stepLedgerMeasure(m: LedgerMeasure, dir: -1 | 1): LedgerMeasure | null {
  const i = LEDGER_MEASURE_ORDER.indexOf(m);
  if (i < 0) return null;
  return LEDGER_MEASURE_ORDER[i + dir] ?? null;
}

/** The dash: the exact read is not here, so the figure is not either. Shared with the row's
 *  accessible name, which drops a "—" metric entirely rather than reading it aloud. */
export const NO_MEASURE = "—";

/**
 * The figure a tick row shows for `m`, formatted, or `NO_MEASURE` where the tick cannot honestly
 * state it. `exact` is the tick's exact read when it has arrived.
 *
 *   fee        — the anchoring fee the tick collected, in DAG (exact `totalFee`, which includes the
 *                unlisted channels so it matches the rows disclosed beneath).
 *   anchors    — how many metagraph snapshots anchored into it: the polled feed's own count, the
 *                exact read's where the feed has none.
 *   metagraphs — how many DISTINCT metagraphs anchored (exact `channels`).
 *   size       — the measured serialized size of everything anchored (exact `totalSizeKB`).
 */
export function tickMeasure(m: LedgerMeasure, snap: Pick<GlobalSnapshot, "metagraphSnapshotCount">, exact: SnapshotExact | undefined): string {
  switch (m) {
    case "fee":
      return exact?.totalFee != null ? `${fmtDag(exact.totalFee)} DAG` : NO_MEASURE;
    case "anchors": {
      const n = snap.metagraphSnapshotCount ?? exact?.anchored;
      return n != null ? n.toLocaleString() : NO_MEASURE;
    }
    case "metagraphs":
      return exact?.channels != null ? exact.channels.toLocaleString() : NO_MEASURE;
    case "size":
      return exact?.totalSizeKB != null ? fmtKB(exact.totalSizeKB) : NO_MEASURE;
  }
}

/**
 * The figure a METAGRAPH-SNAPSHOT leaf row shows for `m` — one anchored snapshot under its tick.
 * A single snapshot has no anchor count and no metagraph count of its own (it IS one anchor, of
 * one metagraph), so its figure of record stays the FEE for those two measures; only SIZE changes
 * what a leaf leads with, to its own measured size. The explorer's log rows (`anchorLog.ts`) carry
 * it as `sizeInKB`; the exact read's rows as `bytes` — either is read, in BYTES below a kilobyte so
 * a 14-byte snapshot never rounds to "0.0 KB" (`fmtBytes`'s own rule), and a row with neither
 * answers the dash rather than a number (rule 10).
 */
export function snapMeasure(m: LedgerMeasure, row: { fee: number; bytes?: number; sizeInKB?: number }): string {
  if (m !== "size") return `${fmtDag(row.fee)} DAG`;
  const bytes = row.bytes ?? (row.sizeInKB != null ? row.sizeInKB * 1024 : undefined);
  return bytes != null ? fmtBytes(bytes) : NO_MEASURE;
}
