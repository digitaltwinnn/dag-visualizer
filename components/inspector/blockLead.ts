import { tickerOf } from "@/components/explorer/nodeRow";
import type { BlockRead } from "@/src/engine/domain/blockBraid";
import type { BlockSel } from "@/src/data/types";
import { compactDag } from "@/src/util/format";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** THE BLOCK'S LEAD — what it moved, in the chain's own unit: "Moved N DAG", and with several
 *  transfers "in M transfers"; with nothing moved or its read not landed, the relation the feed
 *  already names ("Accepted into global N"). One home for the Block card's lead and the block
 *  callout's (D3: the callout follows the card's head and lead) — the callout takes the SHORT form,
 *  how much moved and nothing more. No addresses in either (user, 2026-11-07, twice: "keep it simple
 *  and just say how much moved (no 'from' 'to')", then the card's lead "already shown in the table
 *  below"): the transfers table is where from and to are read. */
export function blockLead(sel: BlockSel, read: BlockRead | null | undefined, short = false): string {
  const unit = tickerOf(sel.chain);
  return read && read.txCount > 0 && read.amount > 0
    ? short || read.txCount === 1
      ? `Moved ${compactDag(read.amount)} ${unit}`
      : `Moved ${compactDag(read.amount)} ${unit} in ${plural(read.txCount, "transfer", "transfers")}`
    : `Accepted into global ${sel.anchorOrd.toLocaleString()}`;
}
