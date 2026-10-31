import { describe, expect, it } from "vitest";

import { NOTE_CHANGES_CAP, RHYTHM_CHANGE, countChange, eventChange, pickChanges, rhythmChange, siteOfChange } from "@/src/data/noteChanges";
import type { NoteChange } from "@/src/data/noteTypes";

const NET = { kind: "network", id: "dor" } as const;

describe("countChange", () => {
  it("says the move in one plain sentence, one node or several", () => {
    expect(countChange("Germany", 34, 29, NET)).toMatchObject({ kind: "lost", text: "Germany lost 5 nodes", size: 5 });
    expect(countChange("Germany", 29, 30, NET)).toMatchObject({ kind: "gained", text: "Germany gained 1 node", size: 1 });
  });
  it("names a place when it was measured", () => {
    expect(countChange("Hetzner", 9, 6, NET, "Falkenstein")?.text).toBe("Hetzner lost 3 nodes in Falkenstein");
  });
  it("tells a first arrival and a last departure apart from a move", () => {
    expect(countChange("Japan", 0, 2, NET)).toMatchObject({ kind: "new", text: "Japan gained its first 2 nodes" });
    expect(countChange("Japan", 0, 1, NET)).toMatchObject({ kind: "new", text: "Japan gained its first node" });
    expect(countChange("Japan", 2, 0, NET)).toMatchObject({ kind: "gone", text: "Japan lost its last 2 nodes" });
    expect(countChange("Japan", 1, 0, NET)).toMatchObject({ kind: "gone", text: "Japan lost its last node" });
  });
  it("is nothing when nothing moved", () => {
    expect(countChange("Germany", 30, 30, NET)).toBeNull();
  });
});

describe("eventChange", () => {
  it("states a network starting and stopping", () => {
    expect(eventChange("Dor", "active", NET)).toMatchObject({ kind: "active", text: "Dor became active", size: Infinity });
    expect(eventChange("Dor", "quiet", NET)).toMatchObject({ kind: "quiet", text: "Dor went quiet" });
  });
});

describe("rhythmChange", () => {
  it("states a real change of pace against the usual one", () => {
    expect(rhythmChange("Dor", 30, 12, NET)).toMatchObject({ kind: "faster", text: "Dor sped up: a snapshot every 12 seconds, usually 30 seconds" });
    expect(rhythmChange("Dor", 60, 300, NET)).toMatchObject({ kind: "slower", text: "Dor slowed down: a snapshot every 5 minutes, usually 1 minute" });
  });
  it("is nothing under the threshold", () => {
    expect(rhythmChange("Dor", 100, 100 * (1 + RHYTHM_CHANGE) - 1, NET)).toBeNull();
  });
  it("is nothing where the two readings would read the same", () => {
    expect(rhythmChange("Dor", 3600, 5000, NET)).toBeNull(); // both "1 hour": the "5, usually 5" row
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
    expect(siteOfChange(new Set(["hetzner"]), now, then, -3)).toEqual({ cc: "DE", city: "Falkenstein" });
  });
  it("reads a city back out of its segment", () => {
    const a = { [f("US.St%2E%20Louis.aws")]: 1 };
    expect(siteOfChange(new Set(["aws"]), a, {}, 1)).toEqual({ cc: "US", city: "St. Louis" });
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
  const row = (text: string, size: number): NoteChange => ({ kind: "lost", subject: NET, text, size });
  it("takes each kind's biggest in turn, so one list cannot fill the rows", () => {
    const countries = [row("a", 5), row("b", 3), row("c", 1)];
    const providers = [row("x", 2), row("y", 1)];
    expect(pickChanges(countries, providers).map((r) => r.text)).toEqual(["a", "x", "b"]);
  });
  it("ties break on the sentence, so the order never depends on a map's", () => {
    expect(pickChanges([row("b", 1), row("a", 1)]).map((r) => r.text)).toEqual(["a", "b"]);
  });
  it("stops at the cap, and nothing moved is no rows", () => {
    expect(pickChanges([row("a", 4), row("b", 3), row("c", 2), row("d", 1)])).toHaveLength(NOTE_CHANGES_CAP);
    expect(pickChanges([], [])).toEqual([]);
  });
});
