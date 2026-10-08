import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { applyClickActions } from "./applyClickActions";
import type { PickDescriptor } from "@/src/data/types";
import { VISIBLE_PLANES, scrollToShow } from "@/src/engine/domain/trendStack";

// End-to-end for the pick pipeline's LAST hop: a ClickAction always maps to exactly one store
// effect (the decision tables are tested in domain/pickActions.test.ts; this file pins what
// executing their output DOES to the store all callers share).

type SnapPick = Extract<PickDescriptor, { kind: "snapshot" }>;
const nodePick = { kind: "metanode", meta: { id: "dor" }, node: { ip: "1.2.3.4" }, geo: { cc: "DE" } } as unknown as PickDescriptor;
const snapPick = { kind: "snapshot", data: { ordinal: 7 } } as unknown as SnapPick;

beforeEach(() => {
  const st = useStore.getState();
  st.setFilter("all");
  st.setCountry(null);
  st.setInspect(null);
  st.setSnap(null);
  st.setMetaSnap(null);
  st.setTickNet(null);
  st.setFollowing(true);
});

describe("applyClickActions", () => {
  it("applies each action kind to its one store effect", () => {
    applyClickActions([
      { kind: "filter", id: "dor" },
      { kind: "country", cc: "DE" },
      { kind: "inspect", pick: nodePick },
    ]);
    const st = useStore.getState();
    expect(st.filter).toBe("dor");
    expect(st.country).toBe("DE");
    expect(st.inspect).toBe(nodePick);
  });

  it("a snapshot action sets BOTH the card subject and the follow state", () => {
    applyClickActions([{ kind: "snapshot", pick: snapPick, follow: false }]);
    let st = useStore.getState();
    expect(st.snap).toBe(snapPick);
    expect(st.following).toBe(false); // an older bar PINS
    applyClickActions([{ kind: "snapshot", pick: snapPick, follow: true }]);
    st = useStore.getState();
    expect(st.following).toBe(true); // the live tip (re-)follows
  });

  it("a snapshot CLEAR (pick null, follow omitted) leaves the follow state untouched", () => {
    const st = useStore.getState();
    st.setSnap(snapPick);
    st.setFollowing(false);
    applyClickActions([{ kind: "snapshot", pick: null }]);
    const after = useStore.getState();
    expect(after.snap).toBeNull();
    expect(after.following).toBe(false); // untouched — FollowController owns the re-follow
  });

  it("clears via null payloads (deselect / un-drill)", () => {
    const st = useStore.getState();
    st.setCountry("DE");
    st.setInspect(nodePick);
    applyClickActions([
      { kind: "inspect", pick: null },
      { kind: "country", cc: null },
    ]);
    const after = useStore.getState();
    expect(after.inspect).toBeNull();
    expect(after.country).toBeNull();
  });

  it("an empty action list is a no-op", () => {
    const before = useStore.getState();
    applyClickActions([]);
    expect(useStore.getState().filter).toBe(before.filter);
  });

  it('"cohort" maps to setCohort (and only that)', () => {
    const CO = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };
    applyClickActions([{ kind: "cohort", sel: CO }]);
    expect(useStore.getState().cohort).toEqual(CO);
    applyClickActions([{ kind: "cohort", sel: null }]);
    expect(useStore.getState().cohort).toBeNull();
  });
  it("setCohort participates in the selStack (the provider card slot)", () => {
    useStore.getState().setCohort({ cc: "DE", city: null, isp: null });
    expect(useStore.getState().selStack[0]).toBe("cohort");
    useStore.getState().setCohort(null);
    expect(useStore.getState().selStack).not.toContain("cohort");
  });

  it('"composition" maps to setComposition (and only that)', () => {
    const CP = { netId: "dor", key: "Hybrid|L0·dL1" };
    applyClickActions([{ kind: "composition", sel: CP }]);
    expect(useStore.getState().composition).toEqual(CP);
    expect(useStore.getState().selStack[0]).toBe("composition");
    applyClickActions([{ kind: "composition", sel: null }]);
    expect(useStore.getState().composition).toBeNull();
    expect(useStore.getState().selStack).not.toContain("composition");
  });
});

describe("tickNet action (the network inside a tick)", () => {
  it("maps to the tickNet channel — and to NOTHING else: never the filter, never the follow state", () => {
    const st0 = useStore.getState();
    st0.setFollowing(false);
    const sel = { metaId: "dor", globalOrdinal: 42 };
    applyClickActions([{ kind: "tickNet", sel }]);
    const st = useStore.getState();
    expect(st.tickNet).toEqual(sel);
    expect(st.filter).toBe("all");
    expect(st.following).toBe(false);
    applyClickActions([{ kind: "tickNet", sel: null }]);
    expect(useStore.getState().tickNet).toBeNull();
  });

  it("is the rail's NETWORK slot, like a committed filter (the Metagraph card's recency)", () => {
    applyClickActions([{ kind: "tickNet", sel: { metaId: "dor", globalOrdinal: 42 } }]);
    expect(useStore.getState().selStack).toContain("network");
    applyClickActions([{ kind: "tickNet", sel: null }]);
    expect(useStore.getState().selStack).not.toContain("network");
  });

  it("re-committing the same network in the same tick is a no-op reference (no second camera move)", () => {
    applyClickActions([{ kind: "tickNet", sel: { metaId: "dor", globalOrdinal: 42 } }]);
    const first = useStore.getState().tickNet;
    applyClickActions([{ kind: "tickNet", sel: { metaId: "dor", globalOrdinal: 42 } }]);
    expect(useStore.getState().tickNet).toBe(first);
    applyClickActions([{ kind: "tickNet", sel: null }]);
  });
});

describe("a filter change clears what was selected under the old lens", () => {
  // User, 2026-10-07: "if I change the filter … it should clear the details pane; currently it does
  // not". The metagraph snapshot (and the network picked inside a tick) belonged to the old lens.
  const sel = { metaId: "DAG0", ordinal: 7, hash: "h", globalOrdinal: 42, ts: "t" };
  it("changing the filter clears the metagraph snapshot and the tick-local network", () => {
    const st = useStore.getState();
    st.setMetaSnap(sel);
    st.setTickNet({ metaId: "dor", globalOrdinal: 42 });
    applyClickActions([{ kind: "filter", id: "ded" }]);
    expect(useStore.getState().metaSnap).toBeNull();
    expect(useStore.getState().tickNet).toBeNull();
  });
  it("re-stating the same filter clears nothing", () => {
    const st = useStore.getState();
    st.setFilter("ded");
    st.setMetaSnap(sel);
    applyClickActions([{ kind: "filter", id: "ded" }]);
    expect(useStore.getState().metaSnap).toEqual(sel);
  });
  it("a later step of the same click may set them again", () => {
    useStore.getState().setMetaSnap(null);
    applyClickActions([{ kind: "filter", id: "dor" }, { kind: "metaSnap", sel }]);
    expect(useStore.getState().metaSnap).toEqual(sel);
  });
});

describe("metaSnap action", () => {
  it("applies a metaSnap action to exactly the metaSnap channel", () => {
    const sel = { metaId: "DAG0", ordinal: 7, hash: "h", globalOrdinal: 42, ts: "t" };
    applyClickActions([{ kind: "metaSnap", sel }]);
    expect(useStore.getState().metaSnap).toEqual(sel);
    applyClickActions([{ kind: "metaSnap", sel: null }]);
    expect(useStore.getState().metaSnap).toBeNull();
  });
});

describe("trendFocus action (the History view's plane click)", () => {
  const ROSTER = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 8 networks, a 5-wide window

  beforeEach(() => {
    const st = useStore.getState();
    st.setTrendIds(ROSTER);
    st.setTrendScroll(0);
    st.setTrendFocus(null);
  });

  it("maps to setTrendFocus — and to NOTHING else, the filter included", () => {
    useStore.getState().setFilter("dor");
    applyClickActions([{ kind: "trendFocus", id: "c" }]);
    const st = useStore.getState();
    expect(st.trendFocus).toBe("c");
    expect(st.filter).toBe("dor"); // a plane click never commits a network — it would cut the stack
    expect(st.inspect).toBeNull();
    expect(st.snap).toBeNull();
  });

  it("releases on null", () => {
    applyClickActions([{ kind: "trendFocus", id: "c" }]);
    applyClickActions([{ kind: "trendFocus", id: null }]);
    expect(useStore.getState().trendFocus).toBeNull();
  });

  it("pages an OFF-WINDOW plane into view, so the focus can be seen", () => {
    // `stackPoses` lifts nothing for a focus outside the window (its own tested rule), so the
    // executor — the one place that may read the published roster — brings it in first.
    applyClickActions([{ kind: "trendFocus", id: "h" }]);
    const st = useStore.getState();
    expect(st.trendFocus).toBe("h");
    expect(st.trendScroll).toBe(scrollToShow(ROSTER, "h", 0));
    expect(st.trendScroll).toBe(ROSTER.indexOf("h") - VISIBLE_PLANES + 1);
  });

  it("leaves the scroll alone for a plane already on screen", () => {
    useStore.getState().setTrendScroll(2);
    applyClickActions([{ kind: "trendFocus", id: "e" }]);
    expect(useStore.getState().trendScroll).toBe(2);
  });

  it("a RELEASE never pages — clearing the focus is not a place to go", () => {
    useStore.getState().setTrendScroll(2);
    applyClickActions([{ kind: "trendFocus", id: null }]);
    expect(useStore.getState().trendScroll).toBe(2);
  });

  it("with an EMPTY roster (the boot state) the focus still lands and the scroll holds still", () => {
    // The roster is React's publish, so it is `[]` until the stack has rendered once — and a click
    // cannot happen before there are planes, but a programmatic caller or a race can still get
    // here. There is no window to page, so paging must be a no-op rather than a clamp to 0 that
    // silently discards wherever the reader had scrolled to.
    const st = useStore.getState();
    st.setTrendIds([]);
    st.setTrendScroll(2);
    applyClickActions([{ kind: "trendFocus", id: "c" }]);
    expect(useStore.getState().trendFocus).toBe("c");
    expect(useStore.getState().trendScroll).toBe(2);
  });

  it("a roster SHORTER than the window never pages — every plane is already on screen", () => {
    const st = useStore.getState();
    st.setTrendIds(["a", "b", "c"]);
    st.setTrendScroll(0);
    applyClickActions([{ kind: "trendFocus", id: "c" }]);
    expect(useStore.getState().trendFocus).toBe("c");
    expect(useStore.getState().trendScroll).toBe(0);
  });
});

describe("the motion cause a click stamps", () => {
  it("a deselect names the rung it lands on, in the select's own words", () => {
    const st = useStore.getState();
    st.setMode("hyper");
    const titled = { ...(nodePick as object), title: "Dor Technologies", sub: "Frankfurt, Germany" } as unknown as PickDescriptor;
    applyClickActions([{ kind: "filter", id: "dor" }, { kind: "inspect", pick: titled }]);
    expect(useStore.getState().motionCause).toEqual({ kind: "node", title: "Dor Technologies", sub: "Frankfurt, Germany" });
    applyClickActions([{ kind: "inspect", pick: null }]);
    // Landing on the committed network — "Framing Dor Technologies", never "Stepping back".
    expect(useStore.getState().motionCause).toEqual({ kind: "rung", level: "network" });
    applyClickActions([{ kind: "filter", id: "all" }]);
    expect(useStore.getState().motionCause).toEqual({ kind: "filter", id: "all" });
  });
});

describe("trendCursor action (a step through the moments of a Range, 2026-10-07)", () => {
  it("moves the History cursor and nothing else", () => {
    useStore.getState().setFilter("dor");
    applyClickActions([{ kind: "trendCursor", ms: 1_726_704_000_000 }]);
    const st = useStore.getState();
    expect(st.trendCursorMs).toBe(1_726_704_000_000);
    expect(st.filter).toBe("dor");
    expect(st.selStack[0]).toBe("instant");
  });
  it("clears on null", () => {
    applyClickActions([{ kind: "trendCursor", ms: 1 }]);
    applyClickActions([{ kind: "trendCursor", ms: null }]);
    expect(useStore.getState().trendCursorMs).toBeNull();
  });
});

// A NEW LENS DROPS THE PLANE FOCUS TOO (the branch review's I6, 2026-10-07): the focus names
// History's Metagraph card and scopes RAW, so a focus from under the old filter kept naming BioFi
// after the top bar moved to DOR.
describe("filter action clears a stale plane focus", () => {
  it("a real filter change releases the focus; re-committing the same filter keeps it", () => {
    useStore.setState({ filter: "all", trendFocus: "bio" });
    applyClickActions([{ kind: "filter", id: "all" }]);
    expect(useStore.getState().trendFocus).toBe("bio");
    applyClickActions([{ kind: "filter", id: "dor" }]);
    expect(useStore.getState().trendFocus).toBeNull();
  });
});
