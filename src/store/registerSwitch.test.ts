import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { switchLedgerRegister } from "./applyClickActions";
import type { BlockSel, MetaSnapSel } from "@/src/data/types";

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
});

describe("switchLedgerRegister", () => {
  it("entering Blocks releases the metagraph snapshot and keeps the pin", () => {
    const pin = { kind: "snapshot", data: { ordinal: 90 } } as never;
    useStore.getState().setSnap(pin);
    useStore.getState().setMetaSnap(metaSnap);
    switchLedgerRegister("blocks");
    const s = useStore.getState();
    expect(s.ledgerRegister).toBe("blocks");
    expect(s.metaSnap).toBeNull();
    expect(s.snap).toBe(pin);
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
});
