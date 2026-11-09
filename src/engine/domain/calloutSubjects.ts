import type { LedgerRegister } from "@/src/store/mode";

// WHICH SUBJECT THE SNAPSHOTS VIEW LABELS ON THE SCENE (2026-11-07, user: the Data block "has no
// callout yet, instead I see both global and metagraph snapshot callouts", and in Transaction blocks
// the block label stood "even if the metagraph rung is selected" — "needs proper code and testing";
// 2026-11-08: "Two callouts is too much in the snapshot view, 1 callout that relates to the subject,
// nothing else"). The decision used to live twice, inline: `SceneCallout` chose the MODEL and
// `CalloutSync` chose the ANCHOR, each with its own chain of ifs, and the two drifted by register.
// This is the one chain both consult: the component draws the label it names, the projector anchors
// the same subject, so a label can never point at one thing while naming another.
//
// ONE LABEL, THE BOX'S: the open card is the subject, so its label is the scene's one — the Global
// snapshot card's bar, the Metagraph snapshot card's tile, the Transaction block's place, the Data
// block's mark on its tile, the Metagraph card's lane (else, with no lane, the snapshot inside it,
// else the global). With no subject card open (the note is the box, or none is), the register's
// OWN subject, its seat (user, 2026-11-09: "the 'default' callout should be a 'metagraph snapshot' |
// 'transaction block' | 'data block'" — the card the note folds onto, `REGISTER_SEAT`): the live
// metagraph snapshot, block or data block; else the snapshot, else the global (never in Transaction
// blocks, where the live global is not drawn, D3), else the lane. The pair's second label
// (2026-10-03, the global under the snapshot) is retired.

export type CalloutSubject = "global" | "block" | "dataBlock" | "metaSnap" | "lane" | null;

export interface CalloutSubjectInput {
  register: LedgerRegister;
  boxedCard: string | null;
  hasSnap: boolean;
  hasMetaSnap: boolean;
  hasBlock: boolean;
  hasDataBlock: boolean;
  /** The network the chamber resolves against HAS A LANE to point at (not all, the DAG, or the
   *  unlisted set — `ledgerNetwork`, then the lane test both owners already applied). */
  lane: boolean;
}

/** The one subject the scene labels, or null for no label. */
export function calloutSubject(i: CalloutSubjectInput): CalloutSubject {
  const inBlocks = i.register === "blocks";
  const global = i.hasSnap && !inBlocks ? "global" : null;
  switch (i.boxedCard) {
    case "snap": if (global) return global; break;
    case "metaSnap": if (i.hasMetaSnap) return "metaSnap"; break;
    case "block": if (inBlocks && i.hasBlock) return "block"; break;
    case "dataBlock": if (i.register === "data" && i.hasDataBlock) return "dataBlock"; break;
    case "context": return i.lane ? "lane" : i.hasMetaSnap ? "metaSnap" : global;
  }
  // No subject card open: the register's own subject, then up its ladder.
  if (inBlocks && i.hasBlock) return "block";
  if (i.register === "data" && i.hasDataBlock) return "dataBlock";
  return i.hasMetaSnap ? "metaSnap" : (global ?? (i.lane ? "lane" : null));
}
