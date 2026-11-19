import type { ChannelSnapRow, GlobalSnapshot, SnapshotExact } from "@/src/data/types";
import { fmtDagShort } from "@/src/util/format";
import { levelOptions } from "@/src/data/explorerMeasure";
import type { LedgerRegister } from "@/src/store/mode";

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

export type LedgerMeasure = "fee" | "anchors" | "metagraphs" | "size" | "data";

/** The heading control's order — the reader steps through these with the chevrons, ends inactive. Fees
 *  first: it is the figure the rows have led with since 2026-09-13, so the default is unchanged. */
export const LEDGER_MEASURE_ORDER: readonly LedgerMeasure[] = ["fee", "anchors", "metagraphs", "size"];

/** THE DATA BLOCKS REGISTER'S SET (D6, 2026-11-07; D7, user: "instead of adding 'data updates' use
 *  it to replace 'anchors'"): Data updates · Fees · Metagraphs · Size — "Data updates" takes Anchors'
 *  place in the four and LEADS, since that register is read for the data its snapshots carry. Four
 *  tiles sit two by two (`explorer/tileRows.ts`), so its longest word has a half-row to itself. The
 *  Metagraph snapshots register keeps Fees · Anchors · Metagraphs · Size. */
export const DATA_MEASURE_ORDER: readonly LedgerMeasure[] = ["data", "fee", "metagraphs", "size"];

/** The word the heading control shows — what every tick row's figure IS. */
export const LEDGER_MEASURE_LABELS: Readonly<Record<LedgerMeasure, string>> = {
  fee: "Fees",
  anchors: "Anchors",
  metagraphs: "Metagraphs",
  size: "Size",
  // The protocol's word for what a dL1 validates (`composition.ts`, the metagraph snapshot card's row).
  data: "Data updates",
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

/** DATA UPDATES OF THESE ROWS — their `dataTxCount` summed, or UNKNOWN (undefined) when any of them
 *  could not be decoded (the row leaves the count off an undecodable payload,
 *  `app/api/snapshot/exactRow.ts`). A sum that counted an unreadable payload as none would state a
 *  zero (or a total) the payload never gave (rule 10, review M5). THE ONE HOME of the rule: the exact
 *  read's per-network figure (`perMeta`), a tick row's figure below and the Data blocks band
 *  (`dataStats.ts`) all ask it, so one undecodable snapshot reads as unknown on every surface. */
export function dataUpdatesOf(rows: readonly Pick<ChannelSnapRow, "dataTxCount">[]): number | undefined {
  let n = 0;
  for (const r of rows) {
    if (r.dataTxCount == null) return undefined;
    n += r.dataTxCount;
  }
  return n;
}

/** A tick's DATA UPDATES — its anchored snapshots' counts summed off the exact read, or null without
 *  the read AND when any of its snapshots could not be decoded (`dataUpdatesOf`): unknown, never 0. */
export function tickDataUpdates(exact: Pick<SnapshotExact, "rows"> | undefined): number | null {
  return exact ? (dataUpdatesOf(exact.rows) ?? null) : null;
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
      return exact?.totalFee != null ? fmtDagShort(exact.totalFee) : NO_MEASURE;
    case "anchors": {
      const n = snap.metagraphSnapshotCount ?? exact?.anchored;
      return n != null ? n.toLocaleString() : NO_MEASURE;
    }
    case "metagraphs":
      return exact?.channels != null ? exact.channels.toLocaleString() : NO_MEASURE;
    case "size":
      return exact?.totalSizeKB != null ? kbFigure(exact.totalSizeKB) : NO_MEASURE;
    case "data": {
      const n = tickDataUpdates(exact);
      return n != null ? n.toLocaleString() : NO_MEASURE;
    }
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
export function snapMeasure(m: SnapLevelMeasure, row: { fee: number; bytes?: number; sizeInKB?: number; dataTxCount?: number }): string {
  if (m === "fee") return fmtDagShort(row.fee);
  if (m === "data") return row.dataTxCount != null ? row.dataTxCount.toLocaleString() : NO_MEASURE;
  const kb = row.sizeInKB ?? (row.bytes != null ? row.bytes / 1024 : undefined);
  return kb != null ? kbFigure(kb) : NO_MEASURE;
}

/** The heading control's list for the TICK level — each measure with the unit its figure is in. */
const LEDGER_MEASURE_UNITS: Readonly<Record<LedgerMeasure, string>> = { fee: "DAG", anchors: "count", metagraphs: "count", size: "KB", data: "count" };
const optionsOf = (order: readonly LedgerMeasure[]): readonly { id: LedgerMeasure; label: string; unit: string }[] =>
  order.map((id) => ({ id, label: LEDGER_MEASURE_LABELS[id], unit: LEDGER_MEASURE_UNITS[id] }));
export const LEDGER_MEASURE_OPTIONS = optionsOf(LEDGER_MEASURE_ORDER);
/** The Data blocks register's tick list — Data updates first. */
export const DATA_MEASURE_OPTIONS = optionsOf(DATA_MEASURE_ORDER);

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
    case "data":
      return tickDataUpdates(exact);
  }
}

/** A NETWORK UNDER A TICK — the Snapshots explorer's second level. The tick level's own measures
 *  minus Metagraphs (a network IS one metagraph), in the same words (user, 2026-09-29 — the level
 *  said "Snapshots" for what the tick level calls Anchors: the snapshots it anchored into the tick
 *  ARE its anchors there). The count from the rows the explorer lists, the fee and size from the
 *  exact read's per-metagraph breakdown where it has arrived. */
export const TICK_NET_MEASURES = ["fee", "anchors", "size"] as const satisfies readonly LedgerMeasure[];
export type TickNetMeasure = (typeof TICK_NET_MEASURES)[number];
export const TICK_NET_MEASURE_OPTIONS = levelOptions(LEDGER_MEASURE_OPTIONS, TICK_NET_MEASURES);
/** …and in the Data blocks register, its data updates first (the exact breakdown's `dataTxCount`) and
 *  no Anchors — the register's set has none (D7). */
export const DATA_TICK_NET_MEASURES = ["data", "fee", "size"] as const satisfies readonly LedgerMeasure[];
export const DATA_TICK_NET_MEASURE_OPTIONS = levelOptions(DATA_MEASURE_OPTIONS, DATA_TICK_NET_MEASURES);
export function tickNetMeasure(
  m: TickNetMeasure | "data",
  count: number,
  per: { fee: number; bytes: number; dataTxCount?: number } | undefined,
): { value: number | null; text: string } {
  switch (m) {
    case "data":
      return per?.dataTxCount != null ? { value: per.dataTxCount, text: per.dataTxCount.toLocaleString() } : { value: null, text: NO_MEASURE };
    case "anchors":
      return { value: count, text: count.toLocaleString() };
    case "fee":
      return per ? { value: per.fee, text: fmtDagShort(per.fee) } : { value: null, text: NO_MEASURE };
    case "size":
      return per ? { value: per.bytes, text: kbFigure(per.bytes / 1024) } : { value: null, text: NO_MEASURE };
  }
}

/** A METAGRAPH SNAPSHOT — the third level: its own fee, or its own size, in the tick level's words.
 *  It IS one anchor of one metagraph, so the two counts do not apply. */
export const SNAP_MEASURES = ["fee", "size"] as const satisfies readonly LedgerMeasure[];
export const SNAP_MEASURE_OPTIONS = levelOptions(LEDGER_MEASURE_OPTIONS, SNAP_MEASURES);
/** …and in the Data blocks register, its own data updates first (its exact row's `dataTxCount`). */
export const DATA_SNAP_MEASURES = ["data", ...SNAP_MEASURES] as const satisfies readonly LedgerMeasure[];
export const DATA_SNAP_MEASURE_OPTIONS = levelOptions(DATA_MEASURE_OPTIONS, DATA_SNAP_MEASURES);
export type SnapLevelMeasure = (typeof DATA_SNAP_MEASURES)[number];
export function snapMeasureValue(m: SnapLevelMeasure, row: { fee: number; bytes?: number; sizeInKB?: number; dataTxCount?: number }): number | null {
  if (m === "fee") return row.fee;
  if (m === "data") return row.dataTxCount ?? null;
  return row.bytes ?? (row.sizeInKB != null ? row.sizeInKB * 1024 : null);
}

/** A REGISTER'S MEASURE SET — what each level of the Snapshots explorer's tick ladder offers, and
 *  which of the store's picks it reads and writes (refactor round R1, L2: the explorer chose
 *  between the two registers' lists with seven `inData ? A : B` ternaries). `dataOnly`: the tick's
 *  levels list only the snapshots that carried data blocks (`ladderLevels.dataCarryingNetworks`; user,
 *  2026-11-07: "a metagraph that anchored but had no datablock … don't show it"), and a tick none of
 *  whose snapshots did steps back (faint — the tick itself is a global snapshot and stays). */
export type RegisterMeasureSet = {
  order: readonly LedgerMeasure[];
  tickOptions: readonly { id: LedgerMeasure; label: string; unit: string }[];
  netMeasures: readonly (TickNetMeasure | "data")[];
  netOptions: readonly { id: LedgerMeasure; label: string; unit: string }[];
  snapMeasures: readonly SnapLevelMeasure[];
  snapOptions: readonly { id: LedgerMeasure; label: string; unit: string }[];
  /** The store field holding this register's pick, and its setter. */
  pick: "ledgerMeasure" | "dataMeasure";
  setPick: "setLedgerMeasure" | "setDataMeasure";
  dataOnly: boolean;
};
const SNAPSHOT_MEASURES: RegisterMeasureSet = {
  order: LEDGER_MEASURE_ORDER,
  tickOptions: LEDGER_MEASURE_OPTIONS,
  netMeasures: TICK_NET_MEASURES,
  netOptions: TICK_NET_MEASURE_OPTIONS,
  snapMeasures: SNAP_MEASURES,
  snapOptions: SNAP_MEASURE_OPTIONS,
  pick: "ledgerMeasure",
  setPick: "setLedgerMeasure",
  dataOnly: false,
};
/** Keyed by register, so a fourth register is a compile error here. Transaction blocks lists BLOCKS
 *  (its own set, `blockMeasure.ts`); the tick levels it never shows read the Metagraph snapshots set. */
/** A REGISTER'S SUBJECTS (2026-11-08 — user: in Transaction blocks a Global snapshot holding only DAG
 *  blocks still opened the DED metagraph as its child, "this must be much more structurally sound"):
 *  which metagraph snapshots a register is ABOUT — every anchored one, the block-carrying ones, the
 *  data-carrying ones. ONE home for the scene's tiles (`LedgerView`'s cargo), the explorer's and the
 *  rail's tick levels (`ladderLevels.registerNetworks`), so no surface lists a snapshot the chamber
 *  does not draw. */
export type RegisterSubjects = "all" | "blocks" | "data";
export const REGISTER_SUBJECTS: Readonly<Record<LedgerRegister, RegisterSubjects>> = { snapshots: "all", blocks: "blocks", data: "data" };

export const REGISTER_MEASURES: Readonly<Record<LedgerRegister, RegisterMeasureSet>> = {
  snapshots: SNAPSHOT_MEASURES,
  blocks: SNAPSHOT_MEASURES,
  data: {
    order: DATA_MEASURE_ORDER,
    tickOptions: DATA_MEASURE_OPTIONS,
    netMeasures: DATA_TICK_NET_MEASURES,
    netOptions: DATA_TICK_NET_MEASURE_OPTIONS,
    snapMeasures: DATA_SNAP_MEASURES,
    snapOptions: DATA_SNAP_MEASURE_OPTIONS,
    pick: "dataMeasure",
    setPick: "setDataMeasure",
    dataOnly: true,
  },
};

