import { describe, expect, it } from "vitest";
import { motionHint, type HintNames, type MotionCause } from "./motionHint";

// The motion hint's copy (2026-09-26): one sentence per cause, names resolved by the caller.

const NAMES: HintNames = {
  view: (m) => ({ hyper: "Hypergraph", geo: "Geography", ledger: "Snapshots", trend: "History", soon: "Coming soon" })[m],
  network: (id) => (id === "dor" ? "Dor Technologies" : id),
  country: (cc) => (cc === "DE" ? "Germany" : cc),
  window: (id) => id.toUpperCase(),
  measure: (id) => ({ snapshots: "Snapshots", blocks: "Blocks", fees: "Fees", kb: "Data", nodes: "Nodes", continuity: "Continuity" })[id],
  rung: (level) => (level === "network" ? "Dor Technologies" : `the ${level}`),
};

describe("motionHint", () => {
  it("a view switch says LEAVING through the OUT phase and ENTERING through the IN phase — and only entering with no phase (the boot)", () => {
    const sw = { kind: "view", from: "hyper", to: "trend" } as const;
    expect(motionHint(sw, "trend", NAMES, "out")).toBe("Leaving Hypergraph");
    expect(motionHint(sw, "trend", NAMES, "in")).toBe("Entering History");
    expect(motionHint(sw, "trend", NAMES, null)).toBe("Entering History");
  });

  it("says what a selection frames, and what its release returns to", () => {
    expect(motionHint({ kind: "filter", id: "dor" }, "hyper", NAMES)).toBe("Filter set to Dor Technologies");
    expect(motionHint({ kind: "filter", id: "all" }, "hyper", NAMES)).toBe("Filter cleared");
    expect(motionHint({ kind: "focus", id: "dor" }, "trend", NAMES)).toBe("Bringing Dor Technologies to the front");
    expect(motionHint({ kind: "focus", id: null }, "trend", NAMES)).toBe("Returning the stack to its order");
    expect(motionHint({ kind: "snapshot", ordinal: 6955314 }, "ledger", NAMES)).toBe("Framing snapshot 6,955,314");
    expect(motionHint({ kind: "snapshot", ordinal: null }, "ledger", NAMES)).toBe("Back to the live snapshot");
    expect(motionHint({ kind: "metaSnap", metaId: "dor", ordinal: 12 }, "ledger", NAMES)).toBe("Framing Dor Technologies's snapshot 12");
    expect(motionHint({ kind: "country", cc: "DE" }, "geo", NAMES)).toBe("Drilling into Germany");
    expect(motionHint({ kind: "node", title: "Dor Technologies", sub: "Frankfurt, Germany" }, "geo", NAMES)).toBe("Framing a Dor Technologies node in Frankfurt, Germany");
    expect(motionHint({ kind: "node", title: "DAG" }, "hyper", NAMES)).toBe("Framing a DAG node");
    // A release has no sentence of its own — the executor restamps it as the landing rung.
    expect(motionHint({ kind: "node", title: null }, "hyper", NAMES)).toBeNull();
    expect(motionHint({ kind: "cohort", on: false }, "geo", NAMES)).toBeNull();
    expect(motionHint({ kind: "composition", on: false }, "hyper", NAMES)).toBeNull();
  });

  it("stamps a range in the reader's days and names a window by its label", () => {
    const span = { fromMs: new Date(2026, 3, 7).getTime(), toMs: new Date(2026, 4, 2).getTime() };
    expect(motionHint({ kind: "range", span }, "trend", NAMES)).toBe("Zooming the history to Apr 7 – May 2");
    expect(motionHint({ kind: "range", span: null }, "trend", NAMES)).toBe("Showing the whole window");
    expect(motionHint({ kind: "window", id: "7d" }, "trend", NAMES)).toBe("Showing the last 7D");
    expect(motionHint({ kind: "window", id: "all" }, "trend", NAMES)).toBe("Showing the whole measured history");
  });

  it("a measure step re-orders the History stack; elsewhere it moves nothing and says nothing", () => {
    expect(motionHint({ kind: "measure", id: "fees" }, "trend", NAMES)).toBe("Reordering by fees, busiest network first");
    expect(motionHint({ kind: "measure", id: "fees" }, "ledger", NAMES)).toBeNull();
  });

  it("a rail card's framing names the rung's subject (the rail click has no click-table action behind it)", () => {
    expect(motionHint({ kind: "rung", level: "network" }, "hyper", NAMES)).toBe("Framing Dor Technologies");
    expect(motionHint({ kind: "rung", level: "node" }, "geo", NAMES)).toBe("Framing the node");
  });

  it("a drag is the reader's own hand and needs no words", () => {
    expect(motionHint({ kind: "orbit" }, "hyper", NAMES)).toBeNull();
  });

  it("every cause kind answers a string or null, never throws", () => {
    const causes: MotionCause[] = [
      { kind: "view", from: "hyper", to: "geo" }, { kind: "filter", id: "x" }, { kind: "focus", id: null }, { kind: "node", title: null },
      { kind: "snapshot", ordinal: null }, { kind: "metaSnap", metaId: null }, { kind: "country", cc: null },
      { kind: "cohort", on: true }, { kind: "cohort", on: false }, { kind: "composition", on: true }, { kind: "composition", on: false },
      { kind: "range", span: null }, { kind: "window", id: "1h" }, { kind: "measure", id: "nodes" }, { kind: "page" }, { kind: "orbit" },
      { kind: "rung", level: "all" },
    ];
    for (const c of causes) {
      const out = motionHint(c, "trend", NAMES);
      expect(out === null || (typeof out === "string" && out.length > 0)).toBe(true);
    }
  });
});
