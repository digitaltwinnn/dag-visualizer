import type { GlobalSnapshot, SnapshotExact } from "@/src/data/types";
import { fmtDag } from "@/src/util/format";

// WHAT A TICK ROW LEADS WITH (user, 2026-09-26: "Snapshots view, like the new trends view, could
// benefit from the control you're moving to the explorer, to switch between different values shown
// in the explorer row. Currently it always shows the DAG for the snapshot; add other options like
// anchors, metagraphs, size (kb)"). The Snapshots explorer's tick rows carried one figure — the fee
// paid, in DAG (2026-09-13, before that the size) — and the choice of WHICH figure was made once, in
// the component. This module states the choices, their order and how each is read off a tick, so
// the explorer's heading control (`components/explorer/ExplorerHeading.tsx`) can list
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

/** The heading control's order — the reader steps through these with the chevrons, ends inactive. Fees
 *  first: it is the figure the rows have led with since 2026-09-13, so the default is unchanged. */
export const LEDGER_MEASURE_ORDER: readonly LedgerMeasure[] = ["fee", "anchors", "metagraphs", "size"];

/** The word the heading control shows — what every tick row's figure IS. */
export const LEDGER_MEASURE_LABELS: Readonly<Record<LedgerMeasure, string>> = {
  fee: "Fees",
  anchors: "Anchors",
  metagraphs: "Metagraphs",
  size: "Size",
};


/** The dash: the exact read is not here, so the figure is not either. Shared with the row's
 *  accessible name, which drops a "—" metric entirely rather than reading it aloud. */
export const NO_MEASURE = "—";

/** A size as a BARE number of KB — the explorer's heading names the unit (design 2026-09-26,
 *  decision 7: the figure column is headed, so a row states the number alone), and it names KB,
 *  so the figure never switches to MB or B on its own. Decimals keep a small value readable:
 *  a 14-byte state is "0.01", never "0". */
export function kbFigure(kb: number): string {
  return kb >= 10 ? Math.round(kb).toLocaleString() : kb >= 1 ? kb.toFixed(1) : kb.toFixed(2);
}

/**
 * The figure a tick row shows for `m` — BARE, in the unit the heading names — or `NO_MEASURE`
 * where the tick cannot honestly state it. `exact` is the tick's exact read when it has arrived.
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
      return exact?.totalFee != null ? fmtDag(exact.totalFee) : NO_MEASURE;
    case "anchors": {
      const n = snap.metagraphSnapshotCount ?? exact?.anchored;
      return n != null ? n.toLocaleString() : NO_MEASURE;
    }
    case "metagraphs":
      return exact?.channels != null ? exact.channels.toLocaleString() : NO_MEASURE;
    case "size":
      return exact?.totalSizeKB != null ? kbFigure(exact.totalSizeKB) : NO_MEASURE;
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
export function snapMeasure(m: SnapLevelMeasure, row: { fee: number; bytes?: number; sizeInKB?: number }): string {
  if (m === "fee") return fmtDag(row.fee);
  const kb = row.sizeInKB ?? (row.bytes != null ? row.bytes / 1024 : undefined);
  return kb != null ? kbFigure(kb) : NO_MEASURE;
}

/** The heading control's list for the TICK level — each measure with the unit its figure is in. */
const LEDGER_MEASURE_UNITS: Readonly<Record<LedgerMeasure, string>> = { fee: "DAG", anchors: "count", metagraphs: "count", size: "KB" };
export const LEDGER_MEASURE_OPTIONS: readonly { id: LedgerMeasure; label: string; unit: string }[] = LEDGER_MEASURE_ORDER.map((id) => ({
  id,
  label: LEDGER_MEASURE_LABELS[id],
  unit: LEDGER_MEASURE_UNITS[id],
}));

/** The tick's figure as a NUMBER, for the bar — the same reads `tickMeasure` formats, or null
 *  where it would answer the dash. A bar drawn from a number the row does not state is the
 *  honesty rule's own failure case, so the two share one source. */
export function tickMeasureValue(m: LedgerMeasure, snap: Pick<GlobalSnapshot, "metagraphSnapshotCount">, exact: SnapshotExact | undefined): number | null {
  switch (m) {
    case "fee":
      return exact?.totalFee ?? null;
    case "anchors":
      return snap.metagraphSnapshotCount ?? exact?.anchored ?? null;
    case "metagraphs":
      return exact?.channels ?? null;
    case "size":
      return exact?.totalSizeKB ?? null;
  }
}

/** A NETWORK UNDER A TICK — the Snapshots explorer's second level (design 2026-09-26: each level
 *  has its own measures). How many snapshots it anchored into the tick, what they cost, what they
 *  weighed — the count from the rows the explorer lists, the fee and size from the exact read's
 *  per-metagraph breakdown where it has arrived. */
export type TickNetMeasure = "snapshots" | "fee" | "size";
export const TICK_NET_MEASURE_OPTIONS: readonly { id: TickNetMeasure; label: string; unit: string }[] = [
  { id: "snapshots", label: "Snapshots", unit: "count" },
  { id: "fee", label: "Fees", unit: "DAG" },
  { id: "size", label: "Size", unit: "KB" },
];
export function tickNetMeasure(m: TickNetMeasure, count: number, per: { fee: number; bytes: number } | undefined): { value: number | null; text: string } {
  switch (m) {
    case "snapshots":
      return { value: count, text: count.toLocaleString() };
    case "fee":
      return per ? { value: per.fee, text: fmtDag(per.fee) } : { value: null, text: NO_MEASURE };
    case "size":
      return per ? { value: per.bytes, text: kbFigure(per.bytes / 1024) } : { value: null, text: NO_MEASURE };
  }
}

/** A METAGRAPH SNAPSHOT — the third level: its own fee, or its own size. */
export type SnapLevelMeasure = "fee" | "size";
export const SNAP_MEASURE_OPTIONS: readonly { id: SnapLevelMeasure; label: string; unit: string }[] = [
  { id: "fee", label: "Fee", unit: "DAG" },
  { id: "size", label: "Size", unit: "KB" },
];
export function snapMeasureValue(m: SnapLevelMeasure, row: { fee: number; bytes?: number; sizeInKB?: number }): number | null {
  if (m === "fee") return row.fee;
  return row.bytes ?? (row.sizeInKB != null ? row.sizeInKB * 1024 : null);
}
