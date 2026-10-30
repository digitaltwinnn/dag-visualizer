import { describe, it, expect } from "vitest";
import { noteSpanWords, noteSubjectOf, type NoteSubjectState } from "./noteSubject";

const base: NoteSubjectState = {
  metagraphNetwork: "all",
  trendFilter: "all",
  unlisted: (id) => id === "unlisted",
};
const s = (over: Partial<NoteSubjectState>): NoteSubjectState => ({ ...base, ...over });

describe("noteSubjectOf", () => {
  it("is null in a mode with no note (the placeholder)", () => {
    expect(noteSubjectOf("soon", s({ metagraphNetwork: "dag" }))).toBeNull();
  });

  it("hyper and ledger stand on the network, else everything", () => {
    for (const m of ["hyper", "ledger"] as const) {
      expect(noteSubjectOf(m, s({ metagraphNetwork: "DAG123" }))).toEqual({ view: m, subject: "DAG123" });
      expect(noteSubjectOf(m, s({ metagraphNetwork: "all" }))).toEqual({ view: m, subject: "all" });
      expect(noteSubjectOf(m, s({ metagraphNetwork: null }))).toEqual({ view: m, subject: "all" });
    }
  });

  it("the ledger's whole network is one subject: the DAG core is `all` there", () => {
    expect(noteSubjectOf("ledger", s({ metagraphNetwork: "dag" }))).toEqual({ view: "ledger", subject: "all" });
    expect(noteSubjectOf("hyper", s({ metagraphNetwork: "dag" }))).toEqual({ view: "hyper", subject: "dag" });
  });

  it("geo stands on the network, else everything, never a country (the Country card carries its own)", () => {
    expect(noteSubjectOf("geo", s({ metagraphNetwork: "DAG123" }))).toEqual({ view: "geo", subject: "DAG123" });
    expect(noteSubjectOf("geo", s({ metagraphNetwork: "all" }))).toEqual({ view: "geo", subject: "all" });
    expect(noteSubjectOf("geo", s({}))).toEqual({ view: "geo", subject: "all" });
    // A committed country no longer takes the top card over: a state still carrying one is ignored.
    const withCountry = { ...base, country: "DE", metagraphNetwork: "DAG123" } as NoteSubjectState;
    expect(noteSubjectOf("geo", withCountry)).toEqual({ view: "geo", subject: "DAG123" });
  });

  // THE FILTER, NOT THE PLANE (user, 2026-10-30: "trend view AI card takes the filter from
  // explorer it seems (range should, but not the AI card); it should take the actual metagraph
  // filter"). A plane brought forward re-deals the stack and the Range card; the view's note keeps
  // reading what the top bar says, so bringing a plane forward under All keeps the hypergraph's note.
  it("trend folds all / dag into dag, else the FILTER's network", () => {
    expect(noteSubjectOf("trend", s({ trendFilter: "all" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ trendFilter: "dag" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ trendFilter: "DAG123" }))).toEqual({ view: "trend", subject: "DAG123" });
  });

  it("trend reads the filter, never the plane the metagraph card stands on", () => {
    expect(noteSubjectOf("trend", s({ trendFilter: "all", metagraphNetwork: "DAG123" }))).toEqual({ view: "trend", subject: "dag" });
  });

  it("an unlisted network has no note, in every view", () => {
    for (const m of ["hyper", "geo", "ledger"] as const) expect(noteSubjectOf(m, s({ metagraphNetwork: "unlisted" }))).toBeNull();
    expect(noteSubjectOf("trend", s({ trendFilter: "unlisted" }))).toBeNull();
  });
});

// The span under the one title (user, 2026-10-29): the explorer's own span words for the three
// fixed reads; History's is the span on screen, so none here.
describe("noteSpanWords", () => {
  it("names each fixed read in the span vocabulary, and leaves History to the store", () => {
    expect(noteSpanWords("hyper")).toBe("last 7 days");
    expect(noteSpanWords("geo")).toBe("last 7 days");
    expect(noteSpanWords("ledger")).toBe("last 24 hours");
    expect(noteSpanWords("trend")).toBeNull();
  });
});
