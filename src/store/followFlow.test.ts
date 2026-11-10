import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStore } from "./store";

// THE NETWORK SINGLETON, FAKED (2026-11-08): `followLatest` reads the live buffer off it, and the real
// one needs a window and polls. The fake holds what the follow reads — empty until a test fills it.
const fakeNet = vi.hoisted(() => ({ globalSnapshots: [] as unknown[], metaSnaps: new Map(), unlistedSnaps: new Map(), latest: null as unknown }));
vi.mock("@/src/data/network", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/src/data/network")>();
  return { ...mod, getNetwork: () => fakeNet };
});
import { applyClickActions, switchLedgerRegister } from "./applyClickActions";
import {
  snapshotSelectActions,
  followToggleActions,
  metaSnapSelectActions,
  blockSelectActions,
  blockFollowActions,
} from "@/src/engine/domain/pickActions";
import { followLatest } from "@/src/data/follow";
import { getBlockWindow, setBlockWindow } from "@/src/data/pastWindow";
import { blockWanted, foldBlockWindow, liveControlCard } from "@/src/data/blockWindow";
import { METAGRAPHS } from "@/src/engine/config";
import type { GlobalSnapshot, MetaSnapSel, PickDescriptor, RawMetaSnapshot, SnapshotExact } from "@/src/data/types";

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

  it("PINNED → LIVE with a signer node held: the node card goes with the snapshot it signed (user, 2026-11-08)", () => {
    const node = { kind: "metanode", meta: { id: LISTED }, node: { ip: "1.2.3.4", id: "n1" }, title: "n", sub: "" } as unknown as PickDescriptor;
    useStore.setState({ following: false, snap: snapPick(100), metaSnap: child(100), inspect: node });
    applyClickActions(followToggleActions(snapPick(100), false, st().block, st().inspect != null));
    expect(st().following).toBe(true);
    expect(st().inspect).toBeNull();
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
  const win = (ticks: ReturnType<typeof tick>[], chain?: string, around?: number) => setBlockWindow(foldBlockWindow({ ticks, chains: ["dag"], ...(chain ? { chain } : {}), ...(around != null ? { around } : {}) }, {}));
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

  it("LIVE seats a token block's accepting metagraph snapshot with it — neither ranks", () => {
    setBlockWindow(foldBlockWindow({ ticks: [tick(300, [], { dor: [tokenSnap(5, ["t1"])] })], chains: ["dag", "dor"] }, {}));
    followLatest();
    expect(st().block).toEqual({ chain: "dor", hash: "t1", ordinal: 5, anchorOrd: 300 });
    expect(st().metaSnap).toEqual({ metaId: "dor", ordinal: 5, hash: "m5", globalOrdinal: 300, ts: "T300" });
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
    applyClickActions(blockSelectActions(b, snapPick(300), { block: b, pinnedOrdinal: null, following: true }));
    expect(st().following).toBe(false);
    expect(st().block?.hash).toBe("b3");
    expect(st().selStack[0]).toBe("block");
  });

  it("LIVE → click an older block pins it; the next beat does not walk it away", () => {
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    const old = { chain: "dag", hash: "b2", ordinal: 200, anchorOrd: 200 };
    applyClickActions(blockSelectActions(old, snapPick(200), { block: st().block, pinnedOrdinal: null, following: true }));
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
    applyClickActions(blockSelectActions(old, snapPick(200), { block: st().block, pinnedOrdinal: 300, following: false }));
    applyClickActions(blockFollowActions(st().block!, snapPick(200), false));
    expect(st().following).toBe(true);
    followLatest(); // FollowController's `following` effect
    expect(st().block?.hash).toBe("b3");
    expect(st().snap?.data.ordinal).toBe(300);
    // …and the Block card stays the box the reader pressed (the block ranks first).
    expect(st().selStack[0]).toBe("block");
  });

  it("a window read around a pin is not the live edge: a resume waits for the live window", () => {
    win([tick(200, ["b2"])], undefined, 200);
    useStore.setState({ blockWindowStatus: { around: 200, status: "ready" }, block: { chain: "dag", hash: "b2", ordinal: 200, anchorOrd: 200 } });
    followLatest();
    expect(st().block?.hash).toBe("b2");
    useStore.setState({ blockWindowStatus: { around: null, status: "ready" } });
    win([tick(300, ["b3"]), tick(200, ["b2"])]);
    followLatest();
    expect(st().block?.hash).toBe("b3");
  });

  it("THE RESUME GAP (review M1): the request already says live, the held window is still the pin's — nothing is seated from it", () => {
    win([tick(200, ["b2"]), tick(150, ["b1"])], undefined, 200);
    useStore.setState({ snap: snapPick(150), block: { chain: "dag", hash: "b1", ordinal: 150, anchorOrd: 150 } });
    // The bridge flips the request to the live edge the moment the resume asks…
    useStore.setState({ blockWindowStatus: { around: null, status: "loading" } });
    followLatest();
    // …but the window held is the PAST one: its newest block is not live, so the cards hold still.
    expect(st().block?.hash).toBe("b1");
    expect(st().snap?.data.ordinal).toBe(150);
    // The live window lands: the follow seats its newest block.
    win([tick(300, ["b3"])]);
    useStore.setState({ blockWindowStatus: { around: null, status: "ready" } });
    followLatest();
    expect(st().block?.hash).toBe("b3");
  });

  it("A PIN CARRIED IN FROM ANOTHER REGISTER (review I1): the Global card says PINNED and offers LIVE; LIVE seats the newest block", () => {
    win([tick(300, ["b3"])]);
    useStore.setState({ ledgerRegister: "snapshots", following: true });
    // Pin a recent global in Metagraph snapshots, newer than the window's newest block tick…
    applyClickActions(snapshotSelectActions(snapPick(310), false, { pinnedOrdinal: null, metaSnap: null, block: null }));
    expect(st().following).toBe(false);
    expect(st().snap?.data.ordinal).toBe(310);
    // …then press "Transaction blocks" on the scene switch.
    switchLedgerRegister("blocks");
    expect(st().ledgerRegister).toBe("blocks");
    expect(st().block).toBeNull();
    // No Block card stands, so the Global snapshot card carries the control: it reads PINNED.
    expect(liveControlCard(st().ledgerRegister, st().block)).toBe("snapshot");
    // The pin lies in the live edge's silence: the live window is kept, no past-window fetch.
    const w = getBlockWindow()!;
    expect(blockWanted({ ledger: true, register: "blocks", pin: 310, held: { from: w.from, to: w.to, chain: w.chain, around: w.around }, liveNewest: 320 })).toEqual({ kind: "keep" });
    // Its LIVE: the card's own write (`followToggleActions`) resumes, and the next beat seats the newest block.
    applyClickActions(followToggleActions(snapPick(310), st().following, st().block));
    expect(st().following).toBe(true);
    followLatest();
    expect(st().block?.hash).toBe("b3");
    expect(st().snap?.data.ordinal).toBe(300);
    // A Block card stands again: the control rides it.
    expect(liveControlCard(st().ledgerRegister, st().block)).toBe("block");
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

  it("a filter's refetch that fails clears the old network's window, and the live block goes with it (review M2)", () => {
    win([tick(300, ["b3"])]);
    followLatest();
    expect(st().block?.hash).toBe("b3");
    useStore.setState({ filter: LISTED });
    // The bridge's spent read (`failedReadKeeps` false: the held window is All's) clears the window.
    setBlockWindow(null);
    useStore.setState({ blockWindowStatus: { around: null, status: "failed" } });
    followLatest();
    expect(st().block).toBeNull();
  });

  it("in the Snapshots register the same beat follows the newest global, as before", () => {
    win([tick(300, ["b3"])]);
    useStore.setState({ ledgerRegister: "snapshots" });
    followLatest();
    expect(st().block).toBeNull();
  });
});

// THE DATA BLOCKS REGISTER'S LIVE (2026-11-08): the newest read tick that carried data, and its newest
// data-carrying snapshot — a tick with none is skipped, as a metagraph filter skips its empty ticks.
describe("the follow flow in the Data blocks register", () => {
  const g = (ordinal: number) => ({ ordinal, timestamp: `T${ordinal}`, hash: `h${ordinal}` }) as GlobalSnapshot;
  const row = (metaId: string, ordinal: number, dataBlocks: number) => ({ metaId, ordinal, decoded: true, fee: 0, bytes: 0, signers: [], blocks: 0, hasState: false, stateBytes: 0, stateProof: null, dataBlocks, dataTxCount: dataBlocks * 3 });
  const exact = (ordinal: number, rows: ReturnType<typeof row>[]) => ({ ordinal, anchored: rows.length, channels: 1, totalFee: 0, totalSizeKB: 0, rewardsDatum: 0, listedFee: 0, unlistedFee: 0, listedCount: 0, unlistedCount: 0, perMeta: {}, rows }) as unknown as SnapshotExact;
  beforeEach(() => {
    useStore.setState({ mode: "ledger", ledgerRegister: "data", following: true, snap: null, metaSnap: null, filter: "all", selStack: [], snapshotExact: {} });
    fakeNet.globalSnapshots = [g(100), g(101), g(102)];
  });
  it("seats the newest tick that carried data and its newest data-carrying snapshot; a dataless newer tick is skipped", () => {
    useStore.setState({ snapshotExact: { 101: exact(101, [row(LISTED, 7, 1), row(LISTED, 8, 2)]), 102: exact(102, [row(LISTED, 9, 0)]) } });
    followLatest();
    expect(st().snap?.data.ordinal).toBe(101);
    expect(st().metaSnap).toMatchObject({ metaId: LISTED, ordinal: 8, globalOrdinal: 101 });
    // …and that snapshot's FIRST data block (user, 2026-11-08: "entering data blocks, open the data
    // block card"), through the non-bumping advance: no rank, so the card is the register's own box.
    expect(st().dataBlock).toMatchObject({ snap: { metaId: LISTED, ordinal: 8 }, index: 0 });
    expect(st().selStack).toEqual([]);
    // A second beat on the same snapshot keeps the data block (a reader's step to another index holds).
    useStore.getState().setDataBlock({ snap: st().metaSnap!, index: 1 });
    useStore.setState({ selStack: [] });
    followLatest();
    expect(st().dataBlock?.index).toBe(1);
  });
  it("with no read tick carrying data yet, the plain follow stands (never behind the live edge for want of a read)", () => {
    followLatest();
    expect(st().snap?.data.ordinal).toBe(102);
  });
});
