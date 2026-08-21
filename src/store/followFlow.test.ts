import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { applyClickActions } from "./applyClickActions";
import {
  snapshotSelectActions,
  followToggleActions,
  metaSnapSelectActions,
} from "@/src/engine/domain/pickActions";
import { METAGRAPHS } from "@/src/net/current";
import type { GlobalSnapshot, MetaSnapSel, PickDescriptor } from "@/src/data/types";

// The FOLLOW FLOW as a tested decision table (2026-08-08 — the retrospective's ask: the
// following/pinned/idle transitions span FollowController, pickActions and an Engine
// subscription, and two of the 2026-08-07 bugs — the toggle that deselected instead of
// pinning while following, and the deselect that stranded the idle state — were transition
// bugs). This exercises the REAL builders through the REAL executor against the REAL store,
// so the semantics can't drift per surface. (Entering/leaving the view flips `following` in
// FollowController — a React effect, covered by its own live verification — everything else
// is here.)
const LISTED = METAGRAPHS[0].id;

const snapPick = (ordinal: number): Extract<PickDescriptor, { kind: "snapshot" }> => ({
  kind: "snapshot",
  title: `Global snapshot #${ordinal}`,
  data: { ordinal, timestamp: `T${ordinal}`, hash: `h${ordinal}` } as GlobalSnapshot,
});

const child = (globalOrdinal: number): MetaSnapSel => ({
  metaId: LISTED,
  ordinal: 1,
  hash: "mh",
  globalOrdinal,
  ts: `T${globalOrdinal}`,
});

const st = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ mode: "ledger", following: false, snap: null, metaSnap: null, filter: "all" });
});

describe("the follow flow decision table", () => {
  it("LIVE → pin an older tick: following drops, the tick pins", () => {
    useStore.setState({ following: true, snap: snapPick(100) });
    applyClickActions(snapshotSelectActions(snapPick(90), false, { pinnedOrdinal: null, metaSnap: null }));
    expect(st().following).toBe(false);
    expect(st().snap?.data.ordinal).toBe(90);
  });

  it("PINNED → re-click the pinned tick: deselect RESUMES live (live is the default)", () => {
    useStore.setState({ following: false, snap: snapPick(90), metaSnap: child(90) });
    applyClickActions(snapshotSelectActions(snapPick(90), false, { pinnedOrdinal: 90, metaSnap: child(90) }));
    expect(st().snap).toBeNull();
    expect(st().metaSnap).toBeNull(); // the finer slot drops with its parent
    expect(st().following).toBe(true);
  });

  it("any state → the live tip re-follows", () => {
    useStore.setState({ following: false, snap: snapPick(90) });
    applyClickActions(snapshotSelectActions(snapPick(100), true, { pinnedOrdinal: 90, metaSnap: null }));
    expect(st().following).toBe(true);
    expect(st().snap?.data.ordinal).toBe(100);
  });

  it("the card's aside toggle: LIVE pins in place, PINNED resumes", () => {
    useStore.setState({ following: true, snap: snapPick(100) });
    applyClickActions(followToggleActions(snapPick(100), true));
    expect(st().following).toBe(false);
    expect(st().snap?.data.ordinal).toBe(100);
    applyClickActions(followToggleActions(snapPick(100), false));
    expect(st().following).toBe(true);
  });

  it("LIVE → clicking the auto-followed metagraph snapshot CONVERTS it to a pin (never a silent deselect)", () => {
    useStore.setState({ following: true, snap: snapPick(100), metaSnap: child(100), filter: LISTED });
    applyClickActions(
      metaSnapSelectActions(child(100), snapPick(100), { filter: LISTED, metaSnap: child(100), following: true }),
    );
    expect(st().following).toBe(false);
    expect(st().metaSnap?.globalOrdinal).toBe(100);
    expect(st().snap?.data.ordinal).toBe(100);
  });

  it("PINNED → re-click the pinned metagraph snapshot: only the finer slot drops (parent stays)", () => {
    useStore.setState({ following: false, snap: snapPick(100), metaSnap: child(100), filter: LISTED });
    applyClickActions(
      metaSnapSelectActions(child(100), snapPick(100), { filter: LISTED, metaSnap: child(100), following: false }),
    );
    expect(st().metaSnap).toBeNull();
    expect(st().snap?.data.ordinal).toBe(100); // the anchoring global holds
  });

  it("COMPOSED: a bare filter commit in the ledger (re-)enters live mode", () => {
    // 2026-08-08 review fix: this transition is an ORDERED executor effect, not a React effect
    // on the filter channel — so it composes with pins instead of stomping them.
    useStore.setState({ following: false, snap: snapPick(90) });
    applyClickActions([{ kind: "filter", id: LISTED }]);
    expect(st().filter).toBe(LISTED);
    expect(st().following).toBe(true);
  });

  it("COMPOSED: a filter commit outside the ledger never touches following", () => {
    useStore.setState({ mode: "hyper", following: false });
    applyClickActions([{ kind: "filter", id: LISTED }]);
    expect(st().following).toBe(false);
  });

  it("COMPOSED: a cross-network pin's filter-first does NOT stomp the pin back to live", () => {
    // The bug the review caught: filter-first inside a pin click used to re-enter live via the
    // controller's filter-dep effect, replacing the fresh pin. Ordered actions decide now.
    useStore.setState({ following: true, snap: snapPick(100), filter: "all" });
    applyClickActions(
      metaSnapSelectActions(child(100), snapPick(100), { filter: "all", metaSnap: null, following: true }),
    );
    expect(st().filter).toBe(LISTED); // filter-first committed
    expect(st().following).toBe(false); // …and the PIN won the ordered sequence
    expect(st().metaSnap?.globalOrdinal).toBe(100);
  });

  it("the release rule: pinning an out-of-story tick steps the filter to all first", () => {
    useStore.setState({ filter: LISTED, following: true, snap: snapPick(100) });
    applyClickActions(
      snapshotSelectActions(snapPick(90), false, {
        pinnedOrdinal: null,
        metaSnap: null,
        filter: LISTED,
        tickHasFilter: false,
      }),
    );
    expect(st().filter).toBe("all");
    expect(st().snap?.data.ordinal).toBe(90);
    expect(st().following).toBe(false);
  });
});
