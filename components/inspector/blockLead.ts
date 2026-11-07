import { tickerOf } from "@/components/explorer/nodeRow";
import type { BlockRead } from "@/src/engine/domain/blockBraid";
import type { BlockSel } from "@/src/data/types";
import { compactDag, midHash } from "@/src/util/format";

/** A wallet address the lead names in a sentence: the app's one mid-ellipsis, head and tail kept. */
const addr = (a: string) => midHash(a, 12);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** THE BLOCK'S LEAD — what it moved, in the chain's own unit: ONE transfer names it ("Moved N DAG from
 *  DAG1ab…cd to DAG9ef…01"), several are counted ("Moved N DAG in M transfers"); with nothing moved or
 *  its read not landed, the relation the feed already names ("Accepted into global N"). One home for
 *  the Block card's lead and the block callout's (D3: the callout follows the card's head and lead). */
export function blockLead(sel: BlockSel, read: BlockRead | null | undefined): string {
  const unit = tickerOf(sel.chain);
  const transfers = read?.transfers ?? [];
  const one = transfers.length === 1 ? transfers[0]! : null;
  return read && read.txCount > 0 && read.amount > 0
    ? one && one.from && one.to
      ? `Moved ${compactDag(one.amount)} ${unit} from ${addr(one.from)} to ${addr(one.to)}`
      : `Moved ${compactDag(read.amount)} ${unit} in ${plural(read.txCount, "transfer", "transfers")}`
    : `Accepted into global ${sel.anchorOrd.toLocaleString()}`;
}
