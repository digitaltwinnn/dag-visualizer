import { describe, it, expect } from "vitest";
import { noteSpanWords, noteSubjectOf, type NoteSubjectState } from "./noteSubject";

const base: NoteSubjectState = {
  metagraphNetwork: "all",
  trendCard: null,
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

  it("trend folds all / dag / no card into dag, else the plane", () => {
    expect(noteSubjectOf("trend", s({ trendCard: "all" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ trendCard: "dag" }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ trendCard: null }))).toEqual({ view: "trend", subject: "dag" });
    expect(noteSubjectOf("trend", s({ trendCard: "DAG123" }))).toEqual({ view: "trend", subject: "DAG123" });
  });

  it("trend reads trendCard, not the metagraph network", () => {
    expect(noteSubjectOf("trend", s({ trendCard: "dag", metagraphNetwork: "DAG123" }))).toEqual({ view: "trend", subject: "dag" });
  });

  it("an unlisted network has no note, in every view", () => {
    for (const m of ["hyper", "geo", "ledger"] as const) expect(noteSubjectOf(m, s({ metagraphNetwork: "unlisted" }))).toBeNull();
    expect(noteSubjectOf("trend", s({ trendCard: "unlisted" }))).toBeNull();
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
