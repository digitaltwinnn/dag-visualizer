import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { switchLedgerRegister } from "./applyClickActions";
import type { BlockSel, MetaSnapSel, SnapshotExact } from "@/src/data/types";
import { foldBlockWindow } from "@/src/data/blockWindow";
import { setBlockWindow } from "@/src/data/pastWindow";

// `switchLedgerRegister` is how a setting releases subjects through the one executor: what the
// register it leaves drew goes, the pin and the committed network stay.

const block = { chain: "dag", hash: "h1", ordinal: 5, anchorOrd: 90 } as unknown as BlockSel;
const metaSnap = { metaId: "dor", ordinal: 7, globalOrdinal: 90 } as unknown as MetaSnapSel;

beforeEach(() => {
  const st = useStore.getState();
  st.setLedgerRegister("snapshots");
  st.setBlock(null);
  st.setMetaSnap(null);
  st.setHoverBlock(null);
  st.setSnap(null);
  useStore.setState({ snapshotExact: {} });
  setBlockWindow(null);
});

describe("switchLedgerRegister", () => {
  // A REGISTER KEEPS A SNAPSHOT THAT IS ITS SUBJECT (2026-11-08, `snapshotIsSubject`): entering
  // Transaction blocks releases a snapshot the window says carried no block, keeps one it says did,
  // and keeps one the window cannot judge yet; Data blocks reads the exact row the same way.
  it("entering Blocks releases a metagraph snapshot the window says carried no block, and keeps the pin", () => {
    const pin = { kind: "snapshot", data: { ordinal: 90 } } as never;
    useStore.getState().setSnap(pin);
    useStore.getState().setMetaSnap(metaSnap);
    setBlockWindow(foldBlockWindow({ ticks: [{ ord: 90, ts: "T", hash: "g", blocks: ["d1"], metaSnaps: {} }], chains: ["dag"] }, {}));
    switchLedgerRegister("blocks");
    const s = useStore.getState();
    expect(s.ledgerRegister).toBe("blocks");
    expect(s.metaSnap).toBeNull();
    expect(s.snap).toBe(pin);
  });
  it("entering Blocks keeps a snapshot the window says carried a block, and one no window can judge", () => {
    useStore.getState().setMetaSnap(metaSnap);
    switchLedgerRegister("blocks");
    expect(useStore.getState().metaSnap).toBe(metaSnap); // no window: unknown keeps
    switchLedgerRegister("snapshots");
    setBlockWindow(foldBlockWindow({ ticks: [{ ord: 90, ts: "T", hash: "g", blocks: [], metaSnaps: { dor: [{ ordinal: 7, hash: "m7", lastSnapshotHash: "", timestamp: "", blocks: ["t1"] }] } }], chains: ["dag", "dor"] }, {}));
    switchLedgerRegister("blocks");
    expect(useStore.getState().metaSnap).toBe(metaSnap);
  });
  it("entering Data blocks releases a snapshot whose exact row says it carried no data block, keeps a carrying one and an unread one", () => {
    useStore.getState().setMetaSnap(metaSnap);
    useStore.setState({ snapshotExact: { 90: { rows: [{ metaId: "dor", ordinal: 7, dataBlocks: 0, dataTxCount: 0 }] } as unknown as SnapshotExact } });
    switchLedgerRegister("data");
    expect(useStore.getState().metaSnap).toBeNull();
    switchLedgerRegister("snapshots");
    useStore.getState().setMetaSnap(metaSnap);
    useStore.setState({ snapshotExact: { 90: { rows: [{ metaId: "dor", ordinal: 7, dataBlocks: 2, dataTxCount: 5 }] } as unknown as SnapshotExact } });
    switchLedgerRegister("data");
    expect(useStore.getState().metaSnap).toBe(metaSnap);
    switchLedgerRegister("snapshots");
    useStore.setState({ snapshotExact: {} });
    switchLedgerRegister("data");
    expect(useStore.getState().metaSnap).toBe(metaSnap);
  });

  it("leaving Blocks releases the block and its hover preview", () => {
    switchLedgerRegister("blocks");
    useStore.getState().setBlock(block);
    useStore.getState().setHoverBlock({ chain: "dag", hash: "h1" } as never);
    switchLedgerRegister("snapshots");
    const s = useStore.getState();
    expect(s.block).toBeNull();
    expect(s.hoverBlock).toBeNull();
  });

  it("Data blocks keeps the metagraph snapshot and the pin, and drops a block's hover preview (D6)", () => {
    const pin = { kind: "snapshot", data: { ordinal: 90 } } as never;
    useStore.getState().setSnap(pin);
    useStore.getState().setMetaSnap(metaSnap);
    switchLedgerRegister("data");
    let s = useStore.getState();
    expect(s.ledgerRegister).toBe("data");
    expect(s.metaSnap).toBe(metaSnap);
    expect(s.snap).toBe(pin);
    switchLedgerRegister("snapshots");
    s = useStore.getState();
    expect(s.metaSnap).toBe(metaSnap);
    // From Blocks into Data: the block and its hover go.
    switchLedgerRegister("blocks");
    useStore.getState().setBlock(block);
    useStore.getState().setHoverBlock({ chain: "dag", hash: "h1" } as never);
    switchLedgerRegister("data");
    s = useStore.getState();
    expect(s.block).toBeNull();
    expect(s.hoverBlock).toBeNull();
  });
});
