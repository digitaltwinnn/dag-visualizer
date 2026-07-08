import { describe, it, expect } from "vitest";
import { exploreCards, detailsCards, type RailManifestState } from "@/components/railCards";
import type { PickDescriptor } from "@/src/data/types";
import type { SelSlot } from "@/src/store/store";

// Present card kinds in render order — the exact set/order both the rail and the tray consume.
const presentKinds = (cards: { kind: string; present: boolean }[]) =>
  cards.filter((c) => c.present).map((c) => c.kind);

const nodePick = { kind: "metanode", node: { ip: "9.9.9.9" } } as unknown as PickDescriptor;
const snapPick = { kind: "snapshot", data: { ordinal: 42 } } as unknown as Extract<
  PickDescriptor,
  { kind: "snapshot" }
>;

const details = (over: Partial<RailManifestState>): RailManifestState => ({
  mode: "ledger",
  filter: "all",
  inspect: null,
  snap: null,
  layer: null,
  selStack: [],
  ...over,
});

describe("exploreCards — LEFT rail (Explore)", () => {
  it("hyper hosts About only (no tool card)", () => {
    expect(presentKinds(exploreCards({ mode: "hyper" }))).toEqual(["about"]);
  });
  it("geo hosts About + the Nodes-by-country tool", () => {
    expect(presentKinds(exploreCards({ mode: "geo" }))).toEqual(["about", "tool"]);
  });
  it("ledger hosts About + the layer-explainer tool", () => {
    expect(presentKinds(exploreCards({ mode: "ledger" }))).toEqual(["about", "tool"]);
  });
  it.each(["status", "transactions", "staking"] as const)("placeholder %s hosts About only", (mode) => {
    expect(presentKinds(exploreCards({ mode }))).toEqual(["about"]);
  });
  it("left cards carry stable (non-updating) subjectKeys", () => {
    const cards = exploreCards({ mode: "geo" });
    expect(cards.map((c) => c.subjectKey)).toEqual(["about", "tool"]);
  });
});

describe("detailsCards — RIGHT rail (Details)", () => {
  it("all filter, nothing picked → NO cards (the old bug: Context icon showed here)", () => {
    expect(presentKinds(detailsCards(details({ filter: "all" })))).toEqual([]);
  });
  it("a metagraph filter → Context dossier", () => {
    expect(presentKinds(detailsCards(details({ filter: "dor" })))).toEqual(["context"]);
  });
  it("the DAG filter → Context dossier", () => {
    expect(presentKinds(detailsCards(details({ filter: "dag" })))).toEqual(["context"]);
  });
  it("a node inspected on the all filter → node card only (no Context)", () => {
    expect(presentKinds(detailsCards(details({ inspect: nodePick, selStack: ["node"] })))).toEqual(["node"]);
  });
  it("a snapshot followed on the all filter → snap card only (no Context)", () => {
    expect(presentKinds(detailsCards(details({ snap: snapPick, selStack: ["snap"] })))).toEqual(["snap"]);
  });
  it("a settlement layer selected → layer card, stacked in recency order with a snapshot", () => {
    const layerPick = { kind: "layer", layerId: "hypl0", name: "Hypergraph L0", desc: "" } as Extract<
      PickDescriptor,
      { kind: "layer" }
    >;
    expect(presentKinds(detailsCards(details({ layer: layerPick, selStack: ["layer"] })))).toEqual(["layer"]);
    expect(
      presentKinds(detailsCards(details({ layer: layerPick, snap: snapPick, selStack: ["layer", "snap"] }))),
    ).toEqual(["layer", "snap"]);
  });
  it("Context + a node when a metagraph is filtered AND a node is picked", () => {
    const s = details({ filter: "dor", inspect: nodePick, selStack: ["node"] });
    expect(presentKinds(detailsCards(s))).toEqual(["context", "node"]);
  });
  it("orders the Detail cards by selStack recency (most-recent first, after Context)", () => {
    const base = { filter: "dor", inspect: nodePick, snap: snapPick } as const;
    const nodeFirst = details({ ...base, selStack: ["node", "snap"] as SelSlot[] });
    const snapFirst = details({ ...base, selStack: ["snap", "node"] as SelSlot[] });
    expect(presentKinds(detailsCards(nodeFirst))).toEqual(["context", "node", "snap"]);
    expect(presentKinds(detailsCards(snapFirst))).toEqual(["context", "snap", "node"]);
  });
  it("subjectKeys track each card's EdgePulse subject (filter / node ip / snapshot ordinal)", () => {
    const s = details({ filter: "dor", inspect: nodePick, snap: snapPick, selStack: ["snap", "node"] });
    const byId = Object.fromEntries(detailsCards(s).map((c) => [c.id, c.subjectKey]));
    expect(byId.context).toBe("dor");
    expect(byId.node).toBe("9.9.9.9");
    expect(byId.snap).toBe(42);
  });
});
