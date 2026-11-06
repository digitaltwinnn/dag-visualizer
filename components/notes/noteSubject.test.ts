import { describe, it, expect } from "vitest";
import { noteModeOf, noteSpanWords, noteSubjectOf, type NoteSubjectState } from "./noteSubject";

const base: NoteSubjectState = {
  metagraphNetwork: "all",
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

  // ONE SCOPE (user, 2026-11-02: "make top card scope be the network, and apply either the filter or
  // the network that is selected in the rung"), which replaces the filter-only rule of 2026-10-30.
  it("trend stands on the rung's network too, folding all and dag into dag", () => {
    expect(noteSubjectOf("trend", s({ metagraphNetwork: "all" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ metagraphNetwork: "dag" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ metagraphNetwork: "DAG123" }))).toEqual({ view: "trend", subject: "DAG123" });
  });

  // Its chains publish no nodes or places, but the sampler measures them: History has a record.
  it("the unlisted set has a note in History alone", () => {
    for (const m of ["hyper", "geo", "ledger"] as const) expect(noteSubjectOf(m, s({ metagraphNetwork: "unlisted" }))).toBeNull();
    expect(noteSubjectOf("trend", s({ metagraphNetwork: "unlisted" }))).toEqual({ view: "trend", subject: "unlisted" });
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
    expect(noteSpanWords("blocks")).toBe("last 24 hours");
  });
});

describe("noteModeOf", () => {
  it("is the note's own view, and the block DAG's is the Snapshots view it is a register of", () => {
    for (const v of ["hyper", "geo", "ledger", "trend"] as const) expect(noteModeOf(v)).toBe(v);
    expect(noteModeOf("blocks")).toBe("ledger");
  });
});
