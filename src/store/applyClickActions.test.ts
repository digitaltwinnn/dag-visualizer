import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { applyClickActions } from "./applyClickActions";
import type { PickDescriptor } from "@/src/data/types";

// End-to-end for the pick pipeline's LAST hop: a ClickAction always maps to exactly one store
// effect (the decision tables are tested in domain/pickActions.test.ts; this file pins what
// executing their output DOES to the store all callers share).

type SnapPick = Extract<PickDescriptor, { kind: "snapshot" }>;
type LayerPick = Extract<PickDescriptor, { kind: "layer" }>;
const nodePick = { kind: "metanode", meta: { id: "dor" }, node: { ip: "1.2.3.4" }, geo: { cc: "DE" } } as unknown as PickDescriptor;
const snapPick = { kind: "snapshot", data: { ordinal: 7 } } as unknown as SnapPick;
const layerPick = { kind: "layer", layerId: "ml0" } as unknown as LayerPick;

beforeEach(() => {
  const st = useStore.getState();
  st.setFilter("all");
  st.setCountry(null);
  st.setInspect(null);
  st.setSnap(null);
  st.setFollowing(true);
  st.setLayer(null);
});

describe("applyClickActions", () => {
  it("applies each action kind to its one store effect", () => {
    applyClickActions([
      { kind: "filter", id: "dor" },
      { kind: "country", cc: "DE" },
      { kind: "inspect", pick: nodePick },
      { kind: "layer", pick: layerPick },
    ]);
    const st = useStore.getState();
    expect(st.filter).toBe("dor");
    expect(st.country).toBe("DE");
    expect(st.inspect).toBe(nodePick);
    expect(st.layer).toBe(layerPick);
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

  it("clears via null payloads (deselect / un-drill / layer off)", () => {
    const st = useStore.getState();
    st.setCountry("DE");
    st.setInspect(nodePick);
    st.setLayer(layerPick);
    applyClickActions([
      { kind: "inspect", pick: null },
      { kind: "country", cc: null },
      { kind: "layer", pick: null },
    ]);
    const after = useStore.getState();
    expect(after.inspect).toBeNull();
    expect(after.country).toBeNull();
    expect(after.layer).toBeNull();
  });

  it("an empty action list is a no-op", () => {
    const before = useStore.getState();
    applyClickActions([]);
    expect(useStore.getState().filter).toBe(before.filter);
  });
});
