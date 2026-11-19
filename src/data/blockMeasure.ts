import type { BlockRead } from "@/src/engine/domain/blockBraid";
import { movedChainOf } from "@/src/data/blockStats";
import { compactDag } from "@/src/util/format";

// WHAT A BLOCK ROW LEADS WITH in the Blocks register — the `ledgerMeasure.ts` pattern for the
// block level: amount moved, fee paid, or height. Each is a stored fact about the block, read off
// its `BlockRead`; the value and the text share one source so a bar is never drawn from a number
// the row does not state (rule 10). A SETTING, not a selection — like `ledgerMeasure`, it writes
// its store setter directly (`selectionBoundary.test.ts`'s scope note).

export type BlockMeasure = "amount" | "fee" | "height";

export const BLOCK_MEASURE_ORDER: readonly BlockMeasure[] = ["amount", "fee", "height"];

export const BLOCK_MEASURE_LABELS: Readonly<Record<BlockMeasure, string>> = {
  amount: "Amount",
  fee: "Fees",
  height: "Height",
};

/** ONE UNIT PER LIST (user, 2026-11-10: block amounts under All). A block's amount and its fee are in
 *  its CHAIN's unit — DAG for the DAG's own blocks, the token for a metagraph's — so a list that bars
 *  them on one scale under one heading must hold ONE chain's: the window's own network
 *  (`blockStats.movedChainOf`, the band's MOVED rule) — the DAG's under All and under the DAG filter,
 *  the token's under its filter (whose window holds its blocks alone). Height is a count, no unit. */
const unitBound = (m: BlockMeasure): boolean => m === "amount" || m === "fee";

/** Does block `blockChain` state measure `m` in a list over the window read for `windowChain` (null:
 *  every network)? A token block under All states no amount and no fee there — it is not the DAG's. */
export function blockMeasureCounts(m: BlockMeasure, blockChain: string, windowChain: string | null): boolean {
  return !unitBound(m) || blockChain === movedChainOf(windowChain);
}

/** The measure tile's UNIT SYMBOL (the explorer's tile grammar): "DAG only" under All — the list
 *  mixes chains and counts the DAG's alone, so the tile says so — the chain's ticker under a filter
 *  ("DAG" for the DAG's), "height" for the height. */
export function blockMeasureUnit(m: BlockMeasure, windowChain: string | null, ticker: (id: string) => string): string {
  if (!unitBound(m)) return "height";
  return windowChain == null ? "DAG only" : ticker(windowChain);
}

/** THE TILES' ROW PLAN (`tileRows.planFor`): the two unit-bearing measures on a half-width row, Height
 *  alone under them — three in a row cut "Amount" to "A…" beside "DAG only" (2026-11-10). */
export const BLOCK_MEASURE_ROWS: readonly number[] = [2, 1];

/** The level's measure tiles, in order, each with its unit for this window. */
export function blockMeasureOptions(windowChain: string | null, ticker: (id: string) => string): { id: BlockMeasure; label: string; unit: string }[] {
  return BLOCK_MEASURE_ORDER.map((id) => ({ id, label: BLOCK_MEASURE_LABELS[id], unit: blockMeasureUnit(id, windowChain, ticker) }));
}

export function blockMeasureValue(m: BlockMeasure, b: BlockRead): number | null {
  switch (m) {
    case "amount":
      return b.amount;
    case "fee":
      return b.fee;
    case "height":
      return b.height;
  }
}

export function blockMeasureText(m: BlockMeasure, b: BlockRead): string {
  switch (m) {
    case "amount":
      return compactDag(b.amount);
    case "fee":
      return compactDag(b.fee);
    case "height":
      return b.height.toLocaleString();
  }
}
