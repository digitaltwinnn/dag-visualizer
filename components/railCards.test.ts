import { describe, it, expect } from "vitest";
import { exploreCards, detailsCards, type RailManifestState } from "@/components/railCards";
import type { PickDescriptor } from "@/src/data/types";

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
  selNodesCount: 10,
  filterLabel: null,
  ...over,
});

// The ghosted slots (view can produce the card, nothing selected) — the hint-state cards.
const ghostIds = (cards: { id: string; present: boolean; hint: string | null }[]) =>
  cards.filter((c) => !c.present && c.hint != null).map((c) => c.id);

describe("exploreCards — LEFT rail (Explore)", () => {
  it("hyper hosts About + the Nodes-by-layer tool", () => {
    expect(presentKinds(exploreCards({ mode: "hyper" }))).toEqual(["about", "tool"]);
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

describe("detailsCards — RIGHT rail (Details): fixed slots + ghost hints", () => {
  it("all filter, nothing picked → no POPULATED cards", () => {
    expect(presentKinds(detailsCards(details({ filter: "all" })))).toEqual([]);
  });
  it("a metagraph filter → Context dossier populated", () => {
    expect(presentKinds(detailsCards(details({ filter: "dor" })))).toEqual(["context"]);
  });
  it("the DAG filter → Context dossier populated", () => {
    expect(presentKinds(detailsCards(details({ filter: "dag" })))).toEqual(["context"]);
  });
  it("slots come in ONE fixed order (context, node, snap, layer) regardless of selection", () => {
    const ids = detailsCards(details({ filter: "dor", inspect: nodePick, snap: snapPick })).map((c) => c.id);
    expect(ids).toEqual(["context", "node", "snap", "layer"]);
  });
  it("ledger ghosts: context + node + snapshot + layer invites (nodes pick in the chamber too)", () => {
    expect(ghostIds(detailsCards(details({})))).toEqual(["context", "node", "snap", "layer"]);
  });
  it("hyper ghosts: context + node + snapshot invites (the strip runs in every view)", () => {
    expect(ghostIds(detailsCards(details({ mode: "hyper" })))).toEqual(["context", "node", "snap"]);
  });
  it("geo ghosts: context + node + snapshot invites (the strip runs in every view)", () => {
    expect(ghostIds(detailsCards(details({ mode: "geo" })))).toEqual(["context", "node", "snap"]);
  });
  it("geo node ghost turns HONEST when the filtered network plots nothing", () => {
    const cards = detailsCards(details({ mode: "geo", filter: "tbc", selNodesCount: 0, filterLabel: "TBC" }));
    const node = cards.find((c) => c.id === "node")!;
    expect(node.hint).toContain("TBC has no locatable nodes");
  });
  it("geo node ghost is SILENT during boot (all filter, 0 nodes — no false invite)", () => {
    const cards = detailsCards(details({ mode: "geo", filter: "all", selNodesCount: 0, filterLabel: null }));
    expect(cards.find((c) => c.id === "node")!.hint).toBeNull();
  });
  it.each(["status", "transactions", "staking"] as const)("placeholder %s has NO ghosts", (mode) => {
    expect(ghostIds(detailsCards(details({ mode })))).toEqual([]);
  });
  it("a populated slot loses its ghost but keeps rendering anywhere (pinned snap in hyper)", () => {
    const cards = detailsCards(details({ mode: "hyper", snap: snapPick }));
    const snap = cards.find((c) => c.id === "snap")!;
    expect(snap.present).toBe(true);
    expect(ghostIds(cards)).toEqual(["context", "node"]); // snap populated → no snap ghost
  });
  it("subjectKeys track each card's EdgePulse subject (filter / node ip / snapshot ordinal)", () => {
    const s = details({ filter: "dor", inspect: nodePick, snap: snapPick });
    const byId = Object.fromEntries(detailsCards(s).map((c) => [c.id, c.subjectKey]));
    expect(byId.context).toBe("dor");
    expect(byId.node).toBe("9.9.9.9");
    expect(byId.snap).toBe(42);
  });
});
