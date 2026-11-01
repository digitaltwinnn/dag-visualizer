// THE SHAPES OF AN AI NOTE — types only, no value exports, so nothing here needs a sibling test
// (`dataExportCoverage.test.ts` reads a module with no value export as covered). Every later
// piece of the notes pipeline imports from here: the fact builders produce `Fact[]`, the honesty
// gate (`noteHonesty.ts`) checks a model's answer against them, the generator stores the answer
// and the route serves a `NoteResponse`.

/** The four 3D views a note can describe. */
export type NoteView = "hyper" | "geo" | "ledger" | "trend";

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
}

export interface FactPair {
  key: string;
  end: "from" | "to";
}

/** high/low/first/last/pause are THRESHOLDED events; peak/trough/longest/broadest are the range's
 *  own EXTREMES, filled in only when the events fall short of the floor (`notableDays`). */
export type NotableKind = "high" | "low" | "first" | "last" | "pause" | "peak" | "trough" | "longest" | "broadest";

export interface NotableDay {
  dayMs: number;
  kind: NotableKind;
  networkId: string | null;
  /** Set when `value` counts global snapshots, not the snapshots anchored every other day reads. */
  measure?: "globals";
  value: number;
  level: number;
  score: number;
}

export interface NoteDay {
  dayMs: number;
  kind: NotableKind;
  networkId: string | null;
  caption: string;
}

/** What moved over a view note's span (`noteChanges.ts`), as the row's coin says it. */
export type NoteChangeKind = "gained" | "lost" | "new" | "gone" | "active" | "quiet" | "faster" | "slower" | "peak" | "longest";

/** The subject a change row commits: what the view's own explorer row for it commits. */
export type NoteChangeSubject =
  | { kind: "network"; id: string }
  | { kind: "type"; netId: string; type: string } // a `roleKey`
  | { kind: "country"; cc: string }
  | { kind: "provider"; keys: string[]; cc: string | null; city: string | null };

/** One row of a view note's notable changes. `text` is written here by code, never by the model: a
 *  row states one measured move in one plain sentence, so it has nothing to get wrong. */
export interface NoteChange {
  kind: NoteChangeKind;
  subject: NoteChangeSubject;
  text: string;
  /** How much it moved: nodes for a count, a rhythm's ratio off 1, which rows outrank which. */
  size: number;
}

export type NoteResponse =
  | { state: "ok"; text: string; writtenAt: number; spanFrom: number; spanTo: number; days: NoteDay[]; changes?: NoteChange[]; line?: string }
  | { state: "pending" }
  | { state: "none" }
  | { state: "unavailable" }
  | { state: "request" };
