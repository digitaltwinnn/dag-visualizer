import type { LedgerRegister } from "@/src/store/mode";

// WHICH SUBJECTS THE SNAPSHOTS VIEW LABELS ON THE SCENE (2026-11-07, user: the Data block "has no
// callout yet, instead I see both global and metagraph snapshot callouts", and in Transaction blocks
// the block label stood "even if the metagraph rung is selected" — "needs proper code and testing").
// The decision used to live twice, inline: `SceneCallout` chose the MODEL and `CalloutSync` chose
// the ANCHOR, each with its own chain of ifs, and the two drifted by register. This is the one chain
// both consult: the component draws the label the `first`/`second` name, the projector anchors the
// same subjects, so a label can never point at one thing while naming another.
//
// The rules, coarse to fine:
//  · THE BOX LEADS (2026-08-15/16): the boxed NODE card owns the scene alone; a boxed METAGRAPH card
//    labels its lane, not the snapshot inside it.
//  · THE PAIR GETS TWO LABELS (2026-10-03): a metagraph snapshot stands with the global it is read
//    against, so the global is the second label — in every register that draws the global's bar.
//  · A REGISTER'S OWN SUBJECT TAKES THE UPPER LABEL where it is committed: the TRANSACTION BLOCK
//    (D3 — and the register draws no global, so no second label there), the DATA BLOCK (on its
//    snapshot's tile, the snapshot's own label stepping aside — one label per tile).
//  · With nothing finer committed, the upper label is the metagraph snapshot's, else the lane's.

export type CalloutFirst = "node" | "block" | "dataBlock" | "metaSnap" | "lane" | null;
export type CalloutSecond = "global" | null;

export interface CalloutSubjectsInput {
  register: LedgerRegister;
  boxedCard: string | null;
  /** The committed node is a node pick (`isNodePick(inspect)`). */
  hasNode: boolean;
  hasSnap: boolean;
  hasMetaSnap: boolean;
  hasBlock: boolean;
  hasDataBlock: boolean;
  /** The network the chamber resolves against HAS A LANE to point at (not all, the DAG, or the
   *  unlisted set — `ledgerNetwork`, then the lane test both owners already applied). */
  lane: boolean;
}

export interface CalloutSubjects {
  first: CalloutFirst;
  second: CalloutSecond;
}

/** The upper label's subject, the box leading. */
function upperOf(i: CalloutSubjectsInput, inBlocks: boolean): CalloutFirst {
  if (i.boxedCard === "context") return i.lane ? "lane" : i.hasMetaSnap ? "metaSnap" : null;
  if (i.boxedCard === "metaSnap" && i.hasMetaSnap) return "metaSnap";
  if (inBlocks && i.hasBlock) return "block";
  if (i.register === "data" && i.hasDataBlock) return "dataBlock";
  if (i.hasMetaSnap) return "metaSnap";
  if (i.lane) return "lane";
  // Nothing committed up the ladder: a carried node may still be named (the Snapshots pair's own
  // fallback), unless a global stands — then the global's label is the scene's one.
  return !i.hasSnap && i.hasNode ? "node" : null;
}

/** `out`, when given, is written and returned — the projector asks once per frame (rule 5). */
export function calloutSubjects(i: CalloutSubjectsInput, out: CalloutSubjects = { first: null, second: null }): CalloutSubjects {
  if (i.boxedCard === "node" && i.hasNode) {
    out.first = "node";
    out.second = null;
    return out;
  }
  const inBlocks = i.register === "blocks";
  // The second label: the global's bar, wherever the register draws it (never in Transaction
  // blocks — the live global is not even drawn there, D3).
  out.second = i.hasSnap && !inBlocks ? "global" : null;
  out.first = upperOf(i, inBlocks);
  return out;
}
