import { describe, expect, it } from "vitest";

import { NOTE_CHANGES_CAP, RHYTHM_CHANGE, countChange, eventChange, largestGlobalChange, longestGapChange, pauseChange, pickChanges, siteMoves, rateChange, rhythmChange, siteOfChange, withExtremes } from "@/src/data/noteChanges";
import type { NoteChange } from "@/src/data/noteTypes";

const NET = { kind: "network", id: "dor" } as const;

// A ROW IS A BRIEF THE MODEL WORDS (user, 2026-11-03: "the notable-change rows all must come from AI"):
// code decides the row and hands over what it is about and its measured figures.
const briefOf = (c: NoteChange | null) => c && { about: c.brief!.about, facts: c.brief!.facts.map((f) => [f.label, f.text]) };

describe("countChange", () => {
  it("hands over the move: what moved, by how many, both ends and how far", () => {
    expect(countChange("Germany", 34, 30, NET)).toMatchObject({ kind: "lost", text: "", size: 4 });
    expect(briefOf(countChange("Germany", 34, 30, NET))).toEqual({
      about: "Germany's nodes",
      facts: [["Nodes lost", "4"], ["Nodes at the start of the span", "34"], ["Nodes at the end of the span", "30"], ["Nodes, change against the start of the span, down", "12%"]],
    });
    expect(countChange("Germany", 30, 34, NET)).toMatchObject({ kind: "gained", size: 4 });
  });
  it("names a place when it was measured, and its counts are that place's", () => {
    expect(briefOf(countChange("Hetzner", 51, 48, NET, { city: "Falkenstein", was: 12 }))).toEqual({
      about: "Hetzner's nodes in Falkenstein",
      facts: [["Nodes lost", "3"], ["Nodes in Falkenstein at the start of the span", "12"], ["Nodes in Falkenstein at the end of the span", "9"], ["Nodes in Falkenstein, change against the start of the span, down", "25%"]],
    });
  });
  it("tells a first arrival and a last departure apart from a move, with no change against a start", () => {
    expect(briefOf(countChange("Japan", 0, 2, NET))).toEqual({ about: "Japan gained its first nodes", facts: [["Nodes gained", "2"]] });
    expect(briefOf(countChange("Japan", 2, 0, NET))).toEqual({ about: "Japan lost its last nodes", facts: [["Nodes lost", "2"]] });
    // A provider's first nodes in a city: its own move, with no change against a start of nothing.
    expect(briefOf(countChange("Hetzner", 48, 51, NET, { city: "Falkenstein", was: 0 }))).toEqual({
      about: "Hetzner's nodes in Falkenstein",
      facts: [["Nodes gained", "3"], ["Nodes in Falkenstein at the start of the span", "0"], ["Nodes in Falkenstein at the end of the span", "3"]],
    });
  });
  it("is nothing when nothing moved", () => {
    expect(countChange("Germany", 30, 30, NET)).toBeNull();
  });
});

describe("eventChange", () => {
  it("states a network starting and stopping", () => {
    expect(briefOf(eventChange("Dor", "active", NET))).toEqual({ about: "Dor became active over the span", facts: [] });
    expect(briefOf(eventChange("Dor", "quiet", NET))).toEqual({ about: "Dor went quiet over the span", facts: [] });
  });
});

describe("a row's size", () => {
  it("survives the note's JSON, and an event still outranks any count", () => {
    const event = eventChange("Dor", "quiet", NET);
    expect(JSON.parse(JSON.stringify(event)).size).toBe(event.size);
    expect(event.size).toBeGreaterThan(countChange("Germany", 100000, 0, NET)!.size);
  });
});

describe("the chamber's extremes (user, 2026-11-01)", () => {
  it("states the largest global snapshot by what it anchored, with no network to name", () => {
    expect(largestGlobalChange(18)).toMatchObject({ kind: "peak", size: 0, subject: { kind: "self" } });
    expect(briefOf(largestGlobalChange(18))).toEqual({ about: "The span's largest global snapshot", facts: [["Metagraph snapshots it anchored", "18"]] });
  });

  it("names who held the longest gap, the unit written out", () => {
    expect(longestGapChange("Dor", 720, NET)).toMatchObject({ kind: "longest", subject: NET });
    expect(briefOf(longestGapChange("Dor", 720, NET))).toEqual({ about: "Dor had the span's longest gap", facts: [["Longest gap", "12 minutes"]] });
  });

  it("gives way to anything that moved, and leads with the snapshot", () => {
    const moved = [eventChange("BioFi", "quiet", NET), eventChange("Dor", "active", NET), eventChange("USDC", "quiet", NET)];
    const extremes = [longestGapChange("Dor", 720, NET), largestGlobalChange(18)];
    expect(withExtremes(moved, extremes).map((c) => c.kind)).toEqual(["quiet", "active", "quiet"]);
    expect(withExtremes(moved.slice(0, 2), extremes).map((c) => c.kind)).toEqual(["quiet", "active", "peak"]);
    expect(withExtremes([], extremes).map((c) => c.kind)).toEqual(["peak", "longest"]);
  });
});

describe("rhythmChange", () => {
  it("states a real change of pace against the usual one", () => {
    expect(rhythmChange("Dor", 30, 12, NET)).toMatchObject({ kind: "faster" });
    expect(briefOf(rhythmChange("Dor", 30, 12, NET))).toEqual({ about: "Dor sped up", facts: [["Spacing between its metagraph snapshots, recent", "12 seconds"], ["Spacing between its metagraph snapshots, usual", "30 seconds"]] });
    expect(briefOf(rhythmChange("Dor", 60, 300, NET))?.about).toBe("Dor slowed down");
  });
  it("is nothing under the threshold", () => {
    expect(rhythmChange("Dor", 100, 100 * (1 + RHYTHM_CHANGE) - 1, NET)).toBeNull();
  });
  it("is nothing where the two readings would read the same", () => {
    expect(rhythmChange("Dor", 3600, 3610, NET)).toBeNull(); // both read "1 hour"
  });
  it("is nothing without a usual to stand against", () => {
    expect(rhythmChange("Dor", 0, 12, NET)).toBeNull();
  });
});

describe("siteOfChange", () => {
  const f = (s: string) => `f.site.${s}`;
  const then = { [f("DE.Falkenstein.hetzner")]: 9, [f("FI.Helsinki.hetzner")]: 4, [f("US.Boston.aws")]: 2 };
  it("is the one city that holds the whole change", () => {
    const now = { ...then, [f("DE.Falkenstein.hetzner")]: 6 };
    expect(siteOfChange(new Set(["hetzner"]), now, then, -3)).toEqual({ cc: "DE", city: "Falkenstein", was: 9 });
  });
  it("reads a city back out of its segment", () => {
    const a = { [f("US.St%2E%20Louis.aws")]: 1 };
    expect(siteOfChange(new Set(["aws"]), a, {}, 1)).toEqual({ cc: "US", city: "St. Louis", was: 0 });
  });
  it("is nothing when the change spreads over cities", () => {
    const now = { ...then, [f("DE.Falkenstein.hetzner")]: 8, [f("FI.Helsinki.hetzner")]: 2 };
    expect(siteOfChange(new Set(["hetzner"]), now, then, -3)).toBeNull();
  });
  it("is nothing when the city's move is not the provider's whole move", () => {
    const now = { ...then, [f("DE.Falkenstein.hetzner")]: 8 };
    expect(siteOfChange(new Set(["hetzner"]), now, then, -3)).toBeNull();
  });
  it("is nothing without both ends measured", () => {
    expect(siteOfChange(new Set(["hetzner"]), undefined, then, -3)).toBeNull();
    expect(siteOfChange(new Set(["hetzner"]), then, undefined, -3)).toBeNull();
  });
});

describe("pickChanges", () => {
  const row = (about: string, size: number): NoteChange => ({ kind: "lost", subject: NET, text: "", size, brief: { about, facts: [] } });
  it("takes each kind's biggest in turn, so one list cannot fill the rows", () => {
    const countries = [row("a", 5), row("b", 3), row("c", 1)];
    const providers = [row("x", 2), row("y", 1)];
    expect(pickChanges(countries, providers).map((r) => r.brief!.about)).toEqual(["a", "x", "b"]);
  });
  it("ties break on what the row is about, so the order never depends on a map's", () => {
    expect(pickChanges([row("b", 1), row("a", 1)]).map((r) => r.brief!.about)).toEqual(["a", "b"]);
  });
  it("stops at the cap, and nothing moved is no rows", () => {
    expect(pickChanges([row("a", 4), row("b", 3), row("c", 2), row("d", 1)])).toHaveLength(NOTE_CHANGES_CAP);
    expect(pickChanges([], [])).toEqual([]);
  });
});

describe("a pause and a rate, as rows", () => {
  it("states the gap beside the normal spacing, never beside another gap (user, 2026-11-03)", () => {
    expect(pauseChange("Digital Evidence's anchoring", 8280, 7, "its metagraph snapshots", NET)).toMatchObject({ kind: "pause", subject: NET, size: 8280 });
    expect(briefOf(pauseChange("Digital Evidence's anchoring", 8280, 7, "its metagraph snapshots", NET))).toEqual({
      about: "Digital Evidence's anchoring paused",
      facts: [["Pause length", "2.3 hours"], ["Normal spacing between its metagraph snapshots", "7 seconds"]],
    });
  });
  it("states a rate at least twice or at most 0.4 of its usual one", () => {
    expect(briefOf(rateChange("Dor's fees", 12, 4, "DAG", NET))).toEqual({ about: "Dor's fees ran far above its usual rate", facts: [["DAG an hour, recent", "12"], ["DAG an hour, usual", "4"]] });
    expect(rateChange("Dor's data", 1, 4, "MB", NET)).toMatchObject({ kind: "low" });
  });
  it("says nothing inside that band, or against no usual", () => {
    expect(rateChange("Dor's fees", 7, 4, "DAG", NET)).toBeNull();
    expect(rateChange("Dor's fees", 2, 4, "DAG", NET)).toBeNull();
    expect(rateChange("Dor's fees", 2, 0, "DAG", NET)).toBeNull();
  });
});

describe("siteMoves", () => {
  const f = (cc: string, city: string, key: string) => `f.site.${cc}.${city}.${key}`;
  const then = { [f("DE", "Falkenstein", "ovh")]: 12, [f("DE", "Berlin", "ovh")]: 3, [f("US", "Ashburn", "aws")]: 5 };
  const now = { [f("DE", "Falkenstein", "ovh")]: 10, [f("DE", "Berlin", "ovh")]: 3, [f("US", "Ashburn", "aws")]: 5, [f("DE", "Bonn", "hetzner")]: 2 };
  it("names each provider's move at each place, held counts left out", () => {
    expect(siteMoves(now, then, (cc) => cc === "DE")).toEqual([
      { cc: "DE", city: "Falkenstein", key: "ovh", from: 12, to: 10 },
      { cc: "DE", city: "Bonn", key: "hetzner", from: 0, to: 2 },
    ]);
  });
  it("needs both days", () => {
    expect(siteMoves(now, undefined, () => true)).toEqual([]);
    expect(siteMoves(undefined, then, () => true)).toEqual([]);
  });
});

// A NOTABLE MOVE IS A MOVE WORTH A ROW (user, 2026-11-02: "'United States lost 1 node, down 3%' -> how
// is that notable?"). The note can still say it; a row says something happened.
describe("countChange's bar", () => {
  it("drops a move of one node, or under a twentieth of the count", () => {
    expect(countChange("United States", 36, 35, NET)).toBeNull();
    expect(countChange("Finland", 19, 18, NET)).toBeNull();
    expect(countChange("Germany", 46, 44, NET)).toBeNull();
    expect(countChange("Hetzner", 100, 104, NET)).toBeNull();
  });
  it("keeps a move of two or more that clears it", () => {
    expect(countChange("Germany", 33, 29, NET)).toMatchObject({ kind: "lost", size: 4 });
    expect(countChange("DAG", 70, 64, NET)).toMatchObject({ kind: "lost", size: 6 });
  });
  it("keeps one node that is a large part of a small count", () => {
    expect(countChange("BioFi", 3, 2, NET)).toMatchObject({ kind: "lost" });
    expect(countChange("BioFi", 5, 6, NET)).toMatchObject({ kind: "gained" });
    expect(countChange("Dor", 6, 5, NET)).toBeNull();
  });
  it("always keeps a first and a last", () => {
    expect(countChange("Japan", 0, 1, NET)).toMatchObject({ kind: "new" });
    expect(countChange("Japan", 1, 0, NET)).toMatchObject({ kind: "gone" });
  });
  it("judges a place by that place's own count", () => {
    expect(briefOf(countChange("OVH", 40, 38, NET, { city: "Falkenstein", was: 12 }))?.facts.at(-1)).toEqual(["Nodes in Falkenstein, change against the start of the span, down", "17%"]);
    expect(countChange("OVH", 40, 39, NET, { city: "Falkenstein", was: 30 })).toBeNull();
  });
});
