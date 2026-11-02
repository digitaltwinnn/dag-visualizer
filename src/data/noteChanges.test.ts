import { describe, expect, it } from "vitest";

import { NOTE_CHANGES_CAP, RHYTHM_CHANGE, changeWords, countChange, withMovePercents, eventChange, largestSnapshotChange, longestGapChange, pauseChange, pickChanges, siteMoves, rateChange, rhythmChange, siteOfChange, withExtremes, withSpanComparisons } from "@/src/data/noteChanges";
import { fact } from "@/src/data/noteFacts";
import type { Fact, NoteChange } from "@/src/data/noteTypes";

const NET = { kind: "network", id: "dor" } as const;

describe("changeWords", () => {
  it("says how far a figure moved, rounded", () => {
    expect(changeWords(34, 30)).toBe("down 12%");
    expect(changeWords(49669, 53959)).toBe("up 9%");
  });
  it("says nothing when it rounds to no change, or there is nothing to move from", () => {
    expect(changeWords(1000, 1002)).toBeNull();
    expect(changeWords(0, 5)).toBeNull();
  });
});

describe("countChange", () => {
  it("says the move in one plain sentence, with how far it moved", () => {
    expect(countChange("Germany", 34, 30, NET)).toMatchObject({ kind: "lost", text: "Germany lost 4 nodes, down 12%", size: 4 });
    expect(countChange("Germany", 30, 34, NET)).toMatchObject({ kind: "gained", text: "Germany gained 4 nodes, up 13%", size: 4 });
  });
  it("names a place when it was measured, and the percentage is that place's", () => {
    expect(countChange("Hetzner", 51, 48, NET, { city: "Falkenstein", was: 12 })?.text).toBe("Hetzner lost 3 nodes in Falkenstein, down 25%");
  });
  it("a provider's first nodes in a city have no percentage", () => {
    expect(countChange("Hetzner", 48, 51, NET, { city: "Falkenstein", was: 0 })?.text).toBe("Hetzner gained 3 nodes in Falkenstein");
  });
  it("tells a first arrival and a last departure apart from a move, with no percentage", () => {
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
    expect(eventChange("Dor", "active", NET)).toMatchObject({ kind: "active", text: "Dor became active" });
    expect(eventChange("Dor", "quiet", NET)).toMatchObject({ kind: "quiet", text: "Dor went quiet" });
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
  it("names who held the largest snapshot", () => {
    expect(largestSnapshotChange("Dor", "1.2 DAG", NET)).toMatchObject({ kind: "peak", subject: NET, text: "Dor had the largest snapshot, 1.2 DAG" });
  });

  it("names who held the longest gap, the unit written out", () => {
    expect(longestGapChange("Dor", 720, NET)).toMatchObject({ kind: "longest", subject: NET, text: "Dor had the longest gap, 12 minutes" });
  });

  it("gives way to anything that moved, and leads with the snapshot", () => {
    const moved = [eventChange("BioFi", "quiet", NET), eventChange("Dor", "active", NET), eventChange("USDC", "quiet", NET)];
    const extremes = [longestGapChange("Dor", 720, NET), largestSnapshotChange("Dor", "1 DAG", NET)];
    expect(withExtremes(moved, extremes).map((c) => c.kind)).toEqual(["quiet", "active", "quiet"]);
    expect(withExtremes(moved.slice(0, 2), extremes).map((c) => c.kind)).toEqual(["quiet", "active", "peak"]);
    expect(withExtremes([], extremes).map((c) => c.kind)).toEqual(["peak", "longest"]);
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

// HOW FAR A FIGURE MOVED, IN THE NOTE (user, 2026-10-31: "also add percentages to these texts"). Code
// adds it after the gate: asked of the model, it wrote "[up 11%]" and failed the gate.
describe("withMovePercents", () => {
  const pair = (key: string, from: number, to: number, kind: Fact["kind"] = "count"): Fact[] => [
    fact(`${key} before`, from, kind, undefined, { key, end: "from" }),
    fact(`${key} now`, to, kind, undefined, { key, end: "to" }),
  ];
  const facts = [...pair("active", 1754, 1941), ...pair("located", 91, 83), ...pair("flat", 1000, 1001), ...pair("gap", 21, 12, "duration")];
  it("puts the percentage on the verb", () => {
    expect(withMovePercents("Active participation rose from 1,754 to 1,941 global snapshots per day.", facts)).toBe("Active participation rose 11% from 1,754 to 1,941 global snapshots per day.");
    expect(withMovePercents("Located nodes fell from 91 to 83.", facts)).toBe("Located nodes fell 9% from 91 to 83.");
  });
  it("reads the weeks-before form the activity sentence takes", () => {
    expect(withMovePercents("Global snapshots rose from 1,754 in the weeks before to 1,941 last week.", facts)).toBe("Global snapshots rose 11% from 1,754 in the weeks before to 1,941 last week.");
  });
  it("takes a duration as the facts write it", () => {
    expect(withMovePercents("Cadence fell from 21 seconds to 12 seconds.", facts)).toBe("Cadence fell 43% from 21 seconds to 12 seconds.");
  });
  it("adds one to each change in a sentence", () => {
    expect(withMovePercents("Nodes dropped from 91 to 83, and activity climbed from 1,754 to 1,941.", facts)).toBe("Nodes dropped 9% from 91 to 83, and activity climbed 11% from 1,754 to 1,941.");
  });
  it("leaves a figure pair the facts do not state, and a wrong order", () => {
    expect(withMovePercents("Nodes fell from 91 to 80.", facts)).toBe("Nodes fell from 91 to 80.");
    expect(withMovePercents("Nodes rose from 83 to 91.", facts)).toBe("Nodes rose from 83 to 91.");
  });
  it("leaves a sentence with no verb to carry it", () => {
    expect(withMovePercents("Nodes went from 91 to 83.", facts)).toBe("Nodes went from 91 to 83.");
  });
  it("leaves a move that rounds to nothing", () => {
    expect(withMovePercents("Blocks rose from 1,000 to 1,001.", facts)).toBe("Blocks rose from 1,000 to 1,001.");
  });
  it("does not stop short of a longer number", () => {
    expect(withMovePercents("Nodes fell from 91 to 830.", facts)).toBe("Nodes fell from 91 to 830.");
  });
  // A SPAN AGAINST THE ONE BEFORE IT (user, 2026-11-02): the current figure first, since "rose from X
  // to Y" read as a climb inside the span.
  it("takes a comparison written current figure first", () => {
    expect(withMovePercents("Activity averaged 1,941 per day, up from 1,754 in the 30 days before.", facts)).toBe("Activity averaged 1,941 per day, up 11% from 1,754 in the 30 days before.");
    expect(withMovePercents("Cadence averaged 12 seconds, down from 21 seconds.", facts)).toBe("Cadence averaged 12 seconds, down 43% from 21 seconds.");
  });
  it("leaves one whose direction or current figure is not the pair's", () => {
    expect(withMovePercents("Activity averaged 1,941 per day, down from 1,754.", facts)).toBe("Activity averaged 1,941 per day, down from 1,754.");
    expect(withMovePercents("Activity averaged 1,800 per day, up from 1,754.", facts)).toBe("Activity averaged 1,800 per day, up from 1,754.");
    expect(withMovePercents("Activity held at 1,941. It is up from 1,754.", facts)).toBe("Activity held at 1,941. It is up from 1,754.");
  });
});

// TWO WHOLE SPANS ARE NOT A START AND AN END (user, 2026-11-02). The model keeps writing "fell to 64
// from 73", and a retry on a note of several figures ran past the sentence limit and lost the note,
// so code writes the comparison the way it adds the percentage.
describe("withSpanComparisons", () => {
  const pair = (key: string, from: number, to: number, kind: Fact["kind"] = "count"): Fact[] => [
    fact(`${key}, previous span`, from, kind, undefined, { key, end: "from", span: true }),
    fact(`${key}, this span`, to, kind, undefined, { key, end: "to", span: true }),
  ];
  const facts = [...pair("globals", 4021, 7478), ...pair("fees", 73, 64), ...pair("gap", 21, 12, "duration")];
  const before = "the 30 days before";
  it("turns a start and an end into a figure and what it stood at before", () => {
    expect(withSpanComparisons("Global snapshots rose from 4,021 to 7,478 per day.", facts, null)).toBe("Global snapshots rose to 7,478, up from 4,021 per day.");
    expect(withSpanComparisons("Fees fell to 64 DAG per day from 73.", facts, null)).toBe("Fees fell to 64 DAG per day, down from 73.");
  });
  it("writes a shared unit out, so the figure reads as the facts state it", () => {
    expect(withSpanComparisons("Cadence widened from 21 to 12 seconds.", facts, null)).toBe("Cadence widened to 12 seconds, down from 21 seconds.");
    expect(withSpanComparisons("Cadence slowed to 12 seconds from 21.", facts, null)).toBe("Cadence slowed to 12 seconds, down from 21 seconds.");
  });
  it("names the span before once, at the first comparison", () => {
    expect(withSpanComparisons("Global snapshots averaged 7,478 per day, up from 4,021 per day. Fees fell to 64 DAG per day from 73.", facts, before))
      .toBe("Global snapshots averaged 7,478 per day, up from 4,021 per day in the 30 days before. Fees fell to 64 DAG per day, down from 73.");
    expect(withSpanComparisons("Fees averaged 64, down from 73 in the 30 days before.", facts, before)).toBe("Fees averaged 64, down from 73 in the 30 days before.");
    expect(withSpanComparisons("Fees averaged 64, down from 73 in the previous span.", facts, before)).toBe("Fees averaged 64, down from 73 in the 30 days before.");
    expect(withSpanComparisons("Fees averaged 64, down from 73 the 30 days before.", facts, before)).toBe("Fees averaged 64, down from 73 in the 30 days before.");
  });
  it("leaves a gauge's start and end, a form already right, and a pair the note does not state", () => {
    const gauge = [fact("Nodes at the start", 163, "count", undefined, { key: "n", end: "from" }), fact("Nodes at the end", 87, "count", undefined, { key: "n", end: "to" })];
    expect(withSpanComparisons("Nodes fell from 163 to 87.", gauge, before)).toBe("Nodes fell from 163 to 87.");
    expect(withSpanComparisons("Fees averaged 64, down from 73.", facts, null)).toBe("Fees averaged 64, down from 73.");
    expect(withSpanComparisons("Fees fell from 73 to 640.", facts, null)).toBe("Fees fell from 73 to 640.");
  });
  it("ends in a sentence the percentage reaches", () => {
    expect(withMovePercents(withSpanComparisons("Fees fell to 64 from 73.", facts, null), facts)).toBe("Fees fell to 64, down 12% from 73.");
  });
});

describe("a pause and a rate, as rows", () => {
  it("states the gap beside the usual widest one", () => {
    expect(pauseChange("Digital Evidence", "2.3 hours", "38 seconds", 8280, NET)).toEqual({ kind: "pause", subject: NET, size: 8280, text: "Digital Evidence paused for 2.3 hours, the longest gap is usually 38 seconds" });
  });
  it("states a rate at least twice or at most 0.4 of its usual one", () => {
    expect(rateChange("Dor fees", 12, 4, "12 DAG", "4 DAG", NET)).toMatchObject({ kind: "high", text: "Dor fees ran at 12 DAG an hour, usually 4 DAG" });
    expect(rateChange("Dor data", 1, 4, "1 MB", "4 MB", NET)).toMatchObject({ kind: "low", text: "Dor data ran at 1 MB an hour, usually 4 MB" });
  });
  it("says nothing inside that band, or against no usual", () => {
    expect(rateChange("Dor fees", 7, 4, "7 DAG", "4 DAG", NET)).toBeNull();
    expect(rateChange("Dor fees", 2, 4, "2 DAG", "4 DAG", NET)).toBeNull();
    expect(rateChange("Dor fees", 2, 0, "2 DAG", "0 DAG", NET)).toBeNull();
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
    expect(countChange("Germany", 33, 29, NET)).toMatchObject({ text: "Germany lost 4 nodes, down 12%" });
    expect(countChange("DAG", 70, 64, NET)).toMatchObject({ text: "DAG lost 6 nodes, down 9%" });
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
    expect(countChange("OVH", 40, 38, NET, { city: "Falkenstein", was: 12 })).toMatchObject({ text: "OVH lost 2 nodes in Falkenstein, down 17%" });
    expect(countChange("OVH", 40, 39, NET, { city: "Falkenstein", was: 30 })).toBeNull();
  });
});
