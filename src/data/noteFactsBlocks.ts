import { fact } from "@/src/data/noteFacts";
import type { Fact, NoteLead } from "@/src/data/noteTypes";
import type { TipRead } from "@/src/engine/domain/blockBraid";

// THE BLOCK DAG'S FACTS BUILDER — what the Blocks register's note (the Briefing's blocks stop) is
// shown. Its subject is the second clock in the chamber: the blocks that move value, against the
// snapshot chain that ticks whatever happens. So it states how many blocks each chain accepted over
// the last day, the tips its frontier holds open right now, and where the DAG's height stands.
//
// The block counts are the SAMPLER'S OWN SERIES — `g.blocks` (the DAG's, a field of each global's
// record) and `m.<id>.blocks` (a network's token blocks) — read from the hourly tier over the last 24
// whole hours, so the note and History's Blocks measure state one figure. The frontier is a live read
// of each chain's newest snapshot (`app/api/notes/blockFrontier.ts`); the height and sub-height are
// the newest global's own fields.
//
// HONESTY (rule 10):
//   · a null bucket is NOT MEASURED: a chain whose every hour is null states nothing; one with an
//     unmeasured hour states its sum as a floor, labelled ", at least";
//   · a token chain with no block over the span is not listed (a network that moved no value is no
//     news, and twenty zeros would bury the two that did); the DAG's own zero is a reading and
//     stands;
//   · a frontier that could not be read (null) states no tips: no read is not zero tips; likewise
//     an unread height or sub-height is left out, never a zero;
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
  /** Per chain, the tips of its newest snapshot; null where the read failed. */
  frontier: Record<string, TipRead | null>;
  /** The newest global snapshot's height and sub-height (the DAG's), null when unread. */
  height: number | null;
  subHeight: number | null;
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
  }
  if (!measured) return null;

  for (const id of chainOrder(Object.keys(input.frontier), names)) {
    const tips = input.frontier[id];
    if (!tips) continue;
    facts.push(fact(`${nameOf(id)} open tips`, tips.active.length, "count"));
  }
  if (input.height != null) facts.push(fact("DAG height", input.height, "count"));
  if (input.subHeight != null) facts.push(fact("Global snapshots since the DAG height last moved", input.subHeight, "count"));

  // No pair here to have moved: the note reads the block DAG as it stands.
  return { facts, names: Object.values(names), lead: { kind: "now" } };
}
