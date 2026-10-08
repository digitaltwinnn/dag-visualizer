import { describe, expect, it } from "vitest";
import { UNLISTED_ID } from "@/src/data/unlistedId";
import { appliedChips, clearedBy, logMode, rangePage, searchCriterion, spanOfSearch } from "./logSearch";

// THE RAW LOG'S SEARCH RULES, PURE (2026-10-07 — the tester pass found four bugs in this logic
// while it lived only in component state). Each block names the bug it pins.

describe("logMode — which rows the log is reading", () => {
  it("a network's chain when one is in scope; chains merged under All and under Unlisted; the latest rows otherwise", () => {
    expect(logMode({ chain: "DAGx", lens: "all" })).toBe("chain");
    expect(logMode({ chain: null, lens: "all" })).toBe("merged");
    expect(logMode({ chain: null, lens: UNLISTED_ID })).toBe("merged"); // their chains page since 2026-10-08
    expect(logMode({ chain: null, lens: "somethingElse" })).toBe("latest");
  });
});

describe("searchCriterion and clearedBy — one search at a time", () => {
  it("runs the most specific criterion typed", () => {
    expect(searchCriterion({ snapshot: "12", tick: "5", from: "2026-01-01" })).toBe("snapshot");
    expect(searchCriterion({ snapshot: "", tick: "5", from: "2026-01-01" })).toBe("tick");
    expect(searchCriterion({ snapshot: "", tick: "", from: "2026-01-01" })).toBe("date");
    expect(searchCriterion({ snapshot: "", tick: "", from: "" })).toBeNull();
  });
  it("a search clears every OTHER criterion (bug: a global search and a date range both showed as applied)", () => {
    expect(clearedBy("snapshot")).toEqual(["tick", "date"]);
    expect(clearedBy("tick")).toEqual(["snapshot", "date"]);
    expect(clearedBy("date")).toEqual(["snapshot", "tick"]);
  });
});

describe("spanOfSearch — what a date search means", () => {
  const D = 86_400_000;
  it("a door's exact span while its words stand (bug: Search widened an hour's hand-off to a whole day)", () => {
    expect(spanOfSearch({ door: { fromMs: 1000, toMs: 2000 }, from: "2026-09-30", to: "2026-09-30" })).toEqual({ fromMs: 1000, toMs: 2000 });
  });
  it("typed fields are whole UTC days, the end exclusive; a from-date alone is open-ended", () => {
    expect(spanOfSearch({ door: null, from: "2026-09-30", to: "2026-10-01" })).toEqual({ fromMs: Date.UTC(2026, 8, 30), toMs: Date.UTC(2026, 9, 1) + D });
    expect(spanOfSearch({ door: null, from: "2026-09-30", to: "" })).toEqual({ fromMs: Date.UTC(2026, 8, 30), toMs: null });
    expect(spanOfSearch({ door: null, from: "", to: "2026-10-01" })).toBeNull();
  });
});

describe("rangePage — pages inside a range count from its newest snapshot (bug: page 1 held 11 rows)", () => {
  it("states the ordinal a page starts from, and the page's place in the range", () => {
    const span = { first: 1000, last: 1100 }; // 101 snapshots
    expect(rangePage(span, 1, 25)).toEqual({ before: 1100, pages: 5, fromPos: 1 });
    expect(rangePage(span, 5, 25)).toEqual({ before: 1000, pages: 5, fromPos: 101 });
  });
  it("an empty range has one empty page", () => {
    expect(rangePage({ first: 50, last: 49 }, 1, 25)).toEqual({ before: null, pages: 1, fromPos: 0 });
  });
});

describe("appliedChips — what the toolbar says is in force", () => {
  const ticker = (id: string) => (id === "DAGded" ? "DED" : id);
  const day = (d: string) => (d === "2026-09-08" ? "Sep 8" : d === "2026-10-07" ? "Oct 7" : d);
  it("names the chain beside a snapshot number and a date range, as the fields do", () => {
    expect(appliedChips({ snapshot: "2617537", tick: "", from: "", to: "", chain: "DAGded", doorLabel: null }, ticker, day)).toEqual([
      { key: "snapshot", text: "DED 2,617,537" },
    ]);
    expect(appliedChips({ snapshot: "", tick: "", from: "2026-09-08", to: "2026-10-07", chain: "DAGded", doorLabel: null }, ticker, day)).toEqual([
      { key: "date", text: "DED Sep 8 – Oct 7" },
    ]);
  });
  it("a door's own words stand in for the dates it filled, still led by the chain", () => {
    expect(appliedChips({ snapshot: "", tick: "", from: "2026-08-22", to: "2026-08-31", chain: "DAGded", doorLabel: "Aug 22 – Aug 31" }, ticker, day)).toEqual([
      { key: "date", text: "DED Aug 22 – Aug 31" },
    ]);
    expect(appliedChips({ snapshot: "", tick: "", from: "2026-09-08", to: "2026-09-08", chain: null, doorLabel: "Sep 8, 2:00 AM GMT+2" }, ticker, day)).toEqual([
      { key: "date", text: "Sep 8, 2:00 AM GMT+2" },
    ]);
  });
  it("a global snapshot reads as the global it is", () => {
    expect(appliedChips({ snapshot: "", tick: "6700000", from: "", to: "", chain: null, doorLabel: null }, ticker, day)).toEqual([
      { key: "tick", text: "in global 6,700,000" },
    ]);
  });
});
