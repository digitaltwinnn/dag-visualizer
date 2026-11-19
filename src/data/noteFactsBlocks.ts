import { fact } from "@/src/data/noteFacts";
import type { Fact, NoteLead } from "@/src/data/noteTypes";

// THE BLOCK DAG'S FACTS BUILDER — what the Blocks register's note is
// shown. Its subject is the second clock in the chamber: the blocks that move value, against the
// snapshot chain that ticks whatever happens. So it states how many blocks each chain accepted over
// the last day and how many transfers they carried — what a block is FOR, the Block card's own lead.
// It states no open tips (design round D5, 2026-11-07: tips left every surface) and no DAG height
// (user, 2026-11-09: a technical confirmation "of no use to the reader" — the height is a counter that
// answers no question the register raises, which is why the Global snapshot card dropped it too).
//
// The counts are the SAMPLER'S OWN SERIES — `g.blocks` / `g.tx` (the DAG's, fields of each global's
// record) and `m.<id>.blocks` / `m.<id>.tx` (a network's token blocks and transfers) — read from the
// hourly tier over the last 24 whole hours, so the note and History's Blocks and Transfers measures
// state one figure. Transfers are COUNTED, never their amount: the chains' tokens are not one unit.
//
// HONESTY (rule 10):
//   · a null bucket is NOT MEASURED: a chain whose every hour is null states nothing; one with an
//     unmeasured hour states its sum as a floor, labelled ", at least";
//   · a token chain with no block over the span is not listed (a network that moved no value is no
//     news, and twenty zeros would bury the two that did); the DAG's own zero is a reading and
//     stands;
//   · transfers are measured only where the sampler read the transfer lists (`measuredTx` applies
//     `x.cov` at the source): an unmeasured hour makes the sum a floor, none measured states nothing;
//   · null when no block series was measured at all: no note rather than a note about nothing.
//
// Counts only, so no ratio needs attributing: a label still starts with its chain's display name, the
// gate's one way to tell whose figure a sentence states. `names` is the FULL catalog list.
//
// Pure: no store values, react or I/O (the colocated test is the specification — rule 4).

/** The whole hours the note reads (the hourly tier's buckets over its span). */
export const BLOCK_NOTE_HOURS = 24;

export interface BlocksFactsInput {
  /** Per chain (`dag` or a catalog id), the hourly block counts over the span; null = not measured. */
  blocks: Record<string, (number | null)[]>;
  /** Per chain, the hourly transfer counts over the span (already coverage-cut); null = not measured. */
  transfers?: Record<string, (number | null)[]>;
  /** catalog id → display name, the DAG core included. */
  names: Record<string, string>;
}

/** The DAG first, then the catalog's own order. */
function chainOrder(ids: string[], names: Record<string, string>): string[] {
  const rank = Object.keys(names);
  return [...ids].sort((a, b) => (a === "dag" ? -1 : b === "dag" ? 1 : rank.indexOf(a) - rank.indexOf(b)));
}

export function blocksFacts(input: BlocksFactsInput): { facts: Fact[]; names: string[]; lead: NoteLead } | null {
  const { names } = input;
  const nameOf = (id: string) => names[id] ?? id;
  const facts: Fact[] = [];
  let measured = false;

  for (const id of chainOrder(Object.keys(input.blocks).filter((id) => id === "dag" || id in names), names)) {
    const points = input.blocks[id] ?? [];
    const read = points.filter((v): v is number => v != null);
    if (!read.length) continue;
    measured = true;
    const sum = read.reduce((s, v) => s + v, 0);
    if (id !== "dag" && sum === 0) continue;
    const floor = read.length < points.length;
    const what = id === "dag" ? "DAG blocks" : `${nameOf(id)} token blocks`;
    facts.push(fact(floor ? `${what}, at least` : what, sum, "count"));
    // What those blocks carried: a chain's transfers beside its blocks, only where it had blocks.
    const tx = input.transfers?.[id];
    const txRead = tx?.filter((v): v is number => v != null) ?? [];
    if (!txRead.length || sum === 0) continue;
    const txSum = txRead.reduce((s, v) => s + v, 0);
    const txWhat = id === "dag" ? "DAG transfers" : `${nameOf(id)} token transfers`;
    facts.push(fact(txRead.length < tx!.length ? `${txWhat}, at least` : txWhat, txSum, "count"));
  }
  if (!measured) return null;

  // No pair here to have moved: the note reads the block DAG as it stands.
  return { facts, names: Object.values(names), lead: { kind: "now" } };
}
