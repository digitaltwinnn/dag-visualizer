import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { applyClickActions } from "./applyClickActions";
import {
  snapshotSelectActions,
  followToggleActions,
  metaSnapSelectActions,
  blockSelectActions,
  blockFollowActions,
} from "@/src/engine/domain/pickActions";
import { followLatest } from "@/src/data/follow";
import { setBlockWindow } from "@/src/data/pastWindow";
import { foldBlockWindow } from "@/src/data/blockWindow";
import { METAGRAPHS } from "@/src/net/current";
import type { GlobalSnapshot, MetaSnapSel, PickDescriptor, RawMetaSnapshot } from "@/src/data/types";

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

  it("LIVE → step to another snapshot of the live pair: still following, the global unpinned, the step held", () => {
    const live = { ...child(100), ordinal: 2, hash: "mh2" };
    useStore.setState({ following: true, snap: snapPick(100), metaSnap: live });
    applyClickActions(metaSnapSelectActions(child(100), snapPick(100), { block: null, metaSnap: live, following: true, inspect: null }));
    expect(st().following).toBe(true);
    expect(st().snap?.data.ordinal).toBe(100);
    expect(st().metaSnap).toEqual({ ...child(100), held: true });
  });

  it("any state → the live tip re-follows", () => {
    useStore.setState({ following: false, snap: snapPick(90) });
    applyClickActions(snapshotSelectActions(snapPick(100), true, { pinnedOrdinal: 90, metaSnap: null }));
    expect(st().following).toBe(true);
    expect(st().snap?.data.ordinal).toBe(100);
  });

  it("the card's aside toggle: LIVE pins in place, PINNED resumes", () => {
    useStore.setState({ following: true, snap: snapPick(100) });
    applyClickActions(followToggleActions(snapPick(100), true, null));
    expect(st().following).toBe(false);
    expect(st().snap?.data.ordinal).toBe(100);
    applyClickActions(followToggleActions(snapPick(100), false, null));
    expect(st().following).toBe(true);
  });

  it("LIVE → clicking the auto-followed metagraph snapshot CONVERTS it to a pin (never a silent deselect)", () => {
    useStore.setState({ following: true, snap: snapPick(100), metaSnap: child(100), filter: LISTED });
    applyClickActions(
      metaSnapSelectActions(child(100), snapPick(100), { block: null, metaSnap: child(100), following: true, inspect: null }),
    );
    expect(st().following).toBe(false);
    expect(st().metaSnap?.globalOrdinal).toBe(100);
    expect(st().snap?.data.ordinal).toBe(100);
  });

  it("PINNED → re-click the pinned metagraph snapshot: only the finer slot drops (parent stays)", () => {
    useStore.setState({ following: false, snap: snapPick(100), metaSnap: child(100), filter: LISTED });
    applyClickActions(
      metaSnapSelectActions(child(100), snapPick(100), { block: null, metaSnap: child(100), following: false, inspect: null }),
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

  it("COMPOSED: a pin from another network's snapshot leaves the filter alone and wins over live", () => {
    // Filter-first is gone from this builder (2026-09-26, decision 13): a snapshot is a record in a
    // tick, and the filter is a lens only the top bar's picker (and hyper's hubs) may move. The
    // ordered pin still beats the live follow.
    useStore.setState({ following: true, snap: snapPick(100), filter: "all" });
    applyClickActions(metaSnapSelectActions(child(100), snapPick(100), { block: null, metaSnap: null, following: true, inspect: null }));
    expect(st().filter).toBe("all");
    expect(st().following).toBe(false);
    expect(st().metaSnap?.globalOrdinal).toBe(100);
  });

  it("pinning a tick the filtered network sat out leaves the filter as the reader set it", () => {
    useStore.setState({ filter: LISTED, following: true, snap: snapPick(100) });
    applyClickActions(snapshotSelectActions(snapPick(90), false, { pinnedOrdinal: null, metaSnap: null }));
    expect(st().filter).toBe(LISTED);
    expect(st().snap?.data.ordinal).toBe(90);
    expect(st().following).toBe(false);
  });
});

// LIVE IN THE BLOCKS REGISTER FOLLOWS THE NEWEST BLOCK (D3, user 2026-11-07: "live mode should be
// applied to the block and not the snapshot"). The same table through the real builders, executor and
// store: `followLatest` (FollowController's heartbeat) seats the window's newest block and its
// accepting global through the non-bumping advances; a click pins; the card's control resumes.
describe("the follow flow in the Blocks register (D3)", () => {
  const tick = (ord: number, blocks: string[], meta: Record<string, RawMetaSnapshot[]> = {}) => ({ ord, ts: `T${ord}`, hash: `h${ord}`, blocks, metaSnaps: meta });
  const tokenSnap = (ordinal: number, blocks: string[]) => ({ ordinal, hash: `m${ordinal}`, lastSnapshotHash: "", timestamp: "", blocks }) as unknown as RawMetaSnapshot;
  const win = (ticks: ReturnType<typeof tick>[], chain?: string) => setBlockWindow(foldBlockWindow({ ticks, chains: ["dag"], ...(chain ? { chain } : {}) }, {}));
  beforeEach(() => {
    useStore.setState({ mode: "ledger", ledgerRegister: "blocks", following: true, snap: null, block: null, metaSnap: null, tickNet: null, filter: "all", selStack: [], blockWindowStatus: null });
    setBlockWindow(null);
  });

  it("LIVE seats the window's newest block and its accepting global — neither ranks (the view seated them)", () => {
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    expect(st().block).toEqual({ chain: "dag", hash: "b3", ordinal: 300, anchorOrd: 300 });
    expect(st().snap?.data.ordinal).toBe(300);
    expect(st().following).toBe(true);
    expect(st().selStack).toEqual([]);
  });

  it("a newer block tick in the window advances the live block on the next beat", () => {
    win([tick(300, ["b3"])]);
    followLatest();
    win([tick(400, ["b4"]), tick(300, ["b3"])]);
    followLatest();
    expect(st().block?.hash).toBe("b4");
    expect(st().snap?.data.ordinal).toBe(400);
  });

  it("LIVE → click the live block: it PINS (never a silent deselect), and the pin ranks", () => {
    win([tick(300, ["b3"])]);
    followLatest();
    const b = st().block!;
    applyClickActions(blockSelectActions(b, snapPick(300), { block: b, snapOrd: null, following: true }));
    expect(st().following).toBe(false);
    expect(st().block?.hash).toBe("b3");
    expect(st().selStack[0]).toBe("block");
  });

  it("LIVE → click an older block pins it; the next beat does not walk it away", () => {
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    const old = { chain: "dag", hash: "b2", ordinal: 200, anchorOrd: 200 };
    applyClickActions(blockSelectActions(old, snapPick(200), { block: st().block, snapOrd: null, following: true }));
    expect(st().following).toBe(false);
    expect(st().block?.hash).toBe("b2");
    expect(st().snap?.data.ordinal).toBe(200);
  });

  it("the Block card's control: LIVE pins in place and ranks the block; PINNED resumes live → the newest block", () => {
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    applyClickActions(blockFollowActions(st().block!, snapPick(300), true));
    expect(st().following).toBe(false);
    expect(st().selStack[0]).toBe("block");
    const old = { chain: "dag", hash: "b2", ordinal: 200, anchorOrd: 200 };
    applyClickActions(blockSelectActions(old, snapPick(200), { block: st().block, snapOrd: 300, following: false }));
    applyClickActions(blockFollowActions(st().block!, snapPick(200), false));
    expect(st().following).toBe(true);
    followLatest(); // FollowController's `following` effect
    expect(st().block?.hash).toBe("b3");
    expect(st().snap?.data.ordinal).toBe(300);
    // …and the Block card stays the box the reader pressed (the block ranks first).
    expect(st().selStack[0]).toBe("block");
  });

  it("a window read around a pin is not the live edge: a resume waits for the live window", () => {
    win([tick(200, ["b2"])]);
    useStore.setState({ blockWindowStatus: { around: 200, status: "ready" }, block: { chain: "dag", hash: "b2", ordinal: 200, anchorOrd: 200 } });
    followLatest();
    expect(st().block?.hash).toBe("b2");
    useStore.setState({ blockWindowStatus: { around: null, status: "ready" } });
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    expect(st().block?.hash).toBe("b3");
  });

  it("under a network filter LIVE follows THAT network's newest block, never another network's window", () => {
    useStore.setState({ filter: LISTED });
    // The All window, still held while the filter's refetch is in flight: not this network's.
    win([tick(300, ["b3"])]);
    followLatest();
    expect(st().block).toBeNull();
    win([tick(250, ["d25"], { [LISTED]: [tokenSnap(9, ["t9"])] }), tick(200, ["d2"])], LISTED);
    followLatest();
    expect(st().block).toEqual({ chain: LISTED, hash: "t9", ordinal: 9, anchorOrd: 250 });
    expect(st().snap?.data.ordinal).toBe(250);
  });

  it("in the Snapshots register the same beat follows the newest global, as before", () => {
    win([tick(300, ["b3"])]);
    useStore.setState({ ledgerRegister: "snapshots" });
    followLatest();
    expect(st().block).toBeNull();
  });
});
