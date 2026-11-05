import type { BlockRead } from "@/src/engine/domain/blockBraid";
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

const BLOCK_MEASURE_UNITS: Readonly<Record<BlockMeasure, string>> = { amount: "DAG", fee: "DAG", height: "height" };
export const BLOCK_MEASURE_OPTIONS: readonly { id: BlockMeasure; label: string; unit: string }[] = BLOCK_MEASURE_ORDER.map((id) => ({
  id,
  label: BLOCK_MEASURE_LABELS[id],
  unit: BLOCK_MEASURE_UNITS[id],
}));

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
