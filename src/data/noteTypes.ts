import type { MetaSnapSel } from "@/src/data/types";
// THE SHAPES OF AN AI NOTE — types only, no value exports, so nothing here needs a sibling test
// (`dataExportCoverage.test.ts` reads a module with no value export as covered). Every later
// piece of the notes pipeline imports from here: the fact builders produce `Fact[]`, the honesty
// gate (`noteHonesty.ts`) checks a model's answer against them, the generator stores the answer
// and the route serves a `NoteResponse`.

/** What a note can describe: the four 3D views, and the Snapshots view's Blocks register (the block
 *  DAG, the Briefing's blocks stop) — a register, not a Mode, with its own facts and question. */
export type NoteView = "hyper" | "geo" | "ledger" | "trend" | "blocks";

/** What a note leads with (R71): the changes the builder found worth leading with, named by
 *  their pair keys, or the reading itself when nothing moved. The Snapshots builder decides it
 *  from its own pairs; the other views always lead with change and carry none. */
export type NoteLead = { kind: "change"; moved: string[] } | { kind: "now" };

/** A fact the model may cite. `text` is exactly what the model is shown. */
export interface Fact {
  label: string;
  value: number;
  kind: "count" | "amount" | "ratio" | "share" | "duration" | "date";
  text: string;
  /** THE PAIR (R54): this fact is the earlier (`from`) or later (`to`) reading of ONE quantity,
   *  and `key` names that quantity — the same key on both ends, unique to it within one facts
   *  list. The gate lets a value only a `from` end holds appear only beside its key's `to` end
   *  (R60, R63); the model never sees the key (`factsBlock` prints `label: text`). */
  pair?: FactPair;
  /** A CHANGE fact's direction (`changeShare`): the gate refuses its percentage in a sentence that
   *  moves the other way, since the model, not code, writes the verb (review, 2026-11-03). */
  move?: "up" | "down";
}

export interface FactPair {
  key: string;
  end: "from" | "to";
  /** The ends are two whole spans, this one and the one before it: never a start and an end. */
  span?: true;
}

/** high/low/first/last/pause are THRESHOLDED events; peak/trough/longest/broadest are the range's
 *  own EXTREMES, filled in only when the events fall short of the floor (`notableDays`). */
export type NotableKind = "high" | "low" | "first" | "last" | "pause" | "peak" | "trough" | "longest" | "broadest";

export interface NotableDay {
  dayMs: number;
  kind: NotableKind;
  networkId: string | null;
  /** Set when `value` is not the snapshots anchored a day reads by default: global snapshots, fees
   *  (datums) or data (KB), stored as they are. */
  measure?: "globals" | "fees" | "kb";
  value: number;
  level: number;
  score: number;
}

export interface NoteDay {
  dayMs: number;
  kind: NotableKind;
  networkId: string | null;
  /** The measure the day was notable on, when it is not the snapshots anchored. */
  measure?: NotableDay["measure"];
  caption: string;
}

/** What moved over a view note's span (`noteChanges.ts`), as the row's coin says it. */
export type NoteChangeKind = "gained" | "lost" | "new" | "gone" | "active" | "quiet" | "faster" | "slower" | "peak" | "longest" | "pause" | "high" | "low";

/** The subject a change row commits: what the view's own explorer row for it commits. */
export type NoteChangeSubject =
  | { kind: "network"; id: string }
  | { kind: "type"; netId: string; type: string } // a `roleKey`
  | { kind: "country"; cc: string }
  | { kind: "provider"; keys: string[]; cc: string | null; city: string | null }
  | { kind: "metaSnap"; sel: MetaSnapSel; global: NoteGlobal } // one snapshot and the global it anchored into
  | { kind: "global"; global: NoteGlobal }
  | { kind: "self" }; // the card the row sits on: stated, with nowhere to go

/** A global snapshot as a row carries it: what the card needs of a tick the live buffer has left. */
export interface NoteGlobal {
  ordinal: number;
  timestamp: string;
  hash: string;
  lastSnapshotHash?: string;
}

/** The search a row asks of the explorer when its note is written (`app/api/notes/snapshotAt.ts`),
 *  never stored: a snapshot in a bucket by what it anchored or the gap it ended, or a chain's last
 *  one. A null chain is the global chain. */
export type NoteChangeFind =
  | { chain: string | null; fromMs: number; toMs: number; count?: number; gapS?: number }
  | { chain: string | null; last: true };

/** One row of a view note's notable changes. `text` is the model's line, written from the row's brief: a
 *  row states one measured move in one plain sentence, so it has nothing to get wrong. */
/** WHAT A ROW IS ABOUT, FOR THE MODEL TO WORD (user, 2026-11-03: "the notable-change rows all must
 *  come from AI"): a short label naming the subject and what happened, and its measured figures. Code
 *  picks the row; the model writes its line from this, held to the gate like any caption. Never
 *  stored or served: the row's `text` is the model's line. */
export interface ChangeBrief {
  about: string;
  facts: Fact[];
  /** The subject the row commits, by name: its line must name it (`namesSubject`), since the gate
   *  checks figures and the click goes to this subject (review, 2026-11-03). */
  name?: string;
}

export interface NoteChange {
  kind: NoteChangeKind;
  subject: NoteChangeSubject;
  /** The model's line for the row (empty until it is written; a row with no line is never stored). */
  text: string;
  /** Present while the row is being written, gone once it is (`ChangeBrief`). */
  brief?: ChangeBrief;
  /** How much it moved: nodes for a count, a rhythm's ratio off 1, which rows outrank which. */
  size: number;
  find?: NoteChangeFind;
}

export type NoteResponse =
  | { state: "ok"; text: string; writtenAt: number; spanFrom: number; spanTo: number; days: NoteDay[]; changes?: NoteChange[]; line?: string }
  | { state: "pending" }
  | { state: "none" }
  | { state: "unavailable" }
  | { state: "request" };
