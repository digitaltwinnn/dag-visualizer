// THE SHAPES OF AN AI NOTE — types only, no value exports, so nothing here needs a sibling test
// (`dataExportCoverage.test.ts` reads a module with no value export as covered). Every later
// piece of the notes pipeline imports from here: the fact builders produce `Fact[]`, the honesty
// gate (`noteHonesty.ts`) checks a model's answer against them, the generator stores the answer
// and the route serves a `NoteResponse`.

/** The four 3D views a note can describe. */
export type NoteView = "hyper" | "geo" | "ledger" | "trend";

/** A fact the model may cite. `text` is exactly what the model is shown. */
export interface Fact {
  label: string;
  value: number;
  kind: "count" | "amount" | "ratio" | "share" | "duration" | "date";
  text: string;
  /** THE PAIR (R54): this fact is the earlier (`from`) or later (`to`) reading of ONE quantity,
   *  and `key` names that quantity — the same key on both ends, unique to it within one facts
   *  list. The gate lets a value only a `from` end holds appear only beside its key's `to` end
   *  (R60); the model never sees the key (`factsBlock` prints `label: text`). */
  pair?: FactPair;
}

export interface FactPair {
  key: string;
  end: "from" | "to";
}

export type NotableKind = "high" | "low" | "first" | "last" | "pause";

export interface NotableDay {
  dayMs: number;
  kind: NotableKind;
  networkId: string | null;
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

export type NoteResponse =
  | { state: "ok"; text: string; writtenAt: number; spanFrom: number; spanTo: number; days: NoteDay[] }
  | { state: "pending" }
  | { state: "none" }
  | { state: "unavailable" }
  | { state: "request" };
