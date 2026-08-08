import { describe, it, expect } from "vitest";
import { exploreCards, detailsCards, focusSlotId, ladderSlotIds, type RailManifestState } from "@/components/railCards";
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
  country: null,
  cohort: null,
  composition: null,
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
  it("ledger hosts About + the snapshots-browser tool", () => {
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
  it("slots come in ONE fixed order (context, country, cohort, composition, snap, metaSnap, node) regardless of selection", () => {
    const ids = detailsCards(details({ filter: "dor", inspect: nodePick, snap: snapPick })).map((c) => c.id);
    expect(ids).toEqual(["context", "country", "cohort", "composition", "snap", "metaSnap", "node"]);
  });
  it("ledger ghosts: context + snapshot + metaSnap + node invites (nodes pick in the chamber too)", () => {
    expect(ghostIds(detailsCards(details({})))).toEqual(["context", "snap", "metaSnap", "node"]);
  });
  it("hyper ghosts: context + composition + node (the snapshot slot is ledger-scoped, spec 2026-08-01)", () => {
    expect(ghostIds(detailsCards(details({ mode: "hyper" })))).toEqual(["context", "composition", "node"]);
  });
  it("geo ghosts cover the whole ladder: context + country + cohort + node invites (snapshot ledger-only)", () => {
    expect(ghostIds(detailsCards(details({ mode: "geo" })))).toEqual([
      "context", "country", "cohort", "node",
    ]);
  });
  it("the composition card never ghosts outside hyper (its rung is hyper-scoped)", () => {
    for (const mode of ["geo", "ledger"] as const) {
      expect(detailsCards(details({ mode })).find((c) => c.id === "composition")?.hint).toBeNull();
    }
  });
  it("country/cohort cards never ghost outside geo", () => {
    for (const mode of ["hyper", "ledger"] as const) {
      const s = details({ mode });
      for (const id of ["country", "cohort"]) {
        expect(detailsCards(s).find((c) => c.id === id)?.hint).toBeNull();
      }
    }
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
    expect(ghostIds(cards)).toEqual(["context", "composition", "node"]); // snap populated → no snap ghost
  });
  it("subjectKeys track each card's EdgePulse subject (filter / node ip / snapshot ordinal)", () => {
    const s = details({ filter: "dor", inspect: nodePick, snap: snapPick });
    const byId = Object.fromEntries(detailsCards(s).map((c) => [c.id, c.subjectKey]));
    expect(byId.context).toBe("dor");
    expect(byId.node).toBe("9.9.9.9");
    expect(byId.snap).toBe(42);
  });
  it("a committed country/cohort populates its slot with a stable joined subjectKey", () => {
    const cards = detailsCards(
      details({ mode: "geo", country: "de", cohort: { cc: "de", city: "Falkenstein", isp: "Hetzner" } }),
    );
    const country = cards.find((c) => c.id === "country")!;
    const cohort = cards.find((c) => c.id === "cohort")!;
    expect(country.present).toBe(true);
    expect(country.subjectKey).toBe("de");
    expect(cohort.present).toBe(true);
    expect(cohort.subjectKey).toBe("de|Falkenstein|Hetzner");
  });
});

describe("the metagraph snapshot slot", () => {
  const base = {
    mode: "ledger" as const, filter: "all", inspect: null, snap: null,
    metaSnap: null, selNodesCount: 0, filterLabel: "All networks",
    country: null, cohort: null, composition: null,
  };
  it("sits between the network and the node slots", () => {
    const ids = detailsCards(base).map((c) => c.id);
    expect(ids.indexOf("metaSnap")).toBeGreaterThan(ids.indexOf("context"));
    expect(ids.indexOf("metaSnap")).toBeLessThan(ids.indexOf("node"));
  });
  it("is ledger-scoped, and its hint names the route rather than the verb", () => {
    const inLedger = detailsCards(base).find((c) => c.id === "metaSnap")!;
    expect(inLedger.hint).toBe("Click a tile under a lane, or a snapshot in the explorer.");
    const inGeo = detailsCards({ ...base, mode: "geo" }).find((c) => c.id === "metaSnap")!;
    expect(inGeo.hint).toBeNull();
  });
  it("is present once a tile is selected", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 42, ts: "t" };
    const c = detailsCards({ ...base, metaSnap: sel }).find((x) => x.id === "metaSnap")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe("DAG0:745190");
  });
});

describe("ladderSlotIds — the descent-spine lane (display order = reversed rung order)", () => {
  it("mirrors focusLadder.LADDERS coarsest→coarsest per 3D view", () => {
    expect(ladderSlotIds("geo")).toEqual(["context", "country", "cohort", "node"]);
    expect(ladderSlotIds("hyper")).toEqual(["context", "composition", "node"]);
    // Ledger: the SNAPSHOT CHAIN rides the display lane between the network and the node —
    // METAGRAPH SNAPSHOT ABOVE the global (user reversal 2026-08-08): the rail mirrors the
    // chamber's storeys (metagraph planes on top, ribbons falling into the global floor) and
    // the filtered story flow (network → its snapshot → the global it anchored INTO) — card
    // slots, not focus rungs.
    expect(ladderSlotIds("ledger")).toEqual(["context", "metaSnap", "snap", "node"]);
  });
  it("flat views have no ladder", () => {
    expect(ladderSlotIds("status")).toEqual([]);
    expect(ladderSlotIds("transactions")).toEqual([]);
    expect(ladderSlotIds("staking")).toEqual([]);
  });
  it("every ladder slot id exists in the details manifest (the lane can't invent a slot)", () => {
    const ids = detailsCards(details({ mode: "geo" })).map((c) => c.id);
    for (const view of ["geo", "hyper", "ledger"] as const)
      for (const slot of ladderSlotIds(view)) expect(ids).toContain(slot);
  });
});

describe("focusSlotId — the focus rung both rails read", () => {
  const cohortSel = { cc: "DE", city: "Nuremberg", isp: "Hetzner" };
  it("is null with nothing committed", () => {
    expect(focusSlotId(details({ mode: "geo" }))).toBeNull();
  });
  it("walks to the FINEST committed rung in geo", () => {
    expect(focusSlotId(details({ mode: "geo", filter: "dag" }))).toBe("context");
    expect(focusSlotId(details({ mode: "geo", filter: "dag", country: "DE" }))).toBe("country");
    expect(focusSlotId(details({ mode: "geo", filter: "dag", country: "DE", cohort: cohortSel }))).toBe("cohort");
    expect(
      focusSlotId(details({ mode: "geo", filter: "dag", country: "DE", cohort: cohortSel, inspect: nodePick })),
    ).toBe("node");
  });
  it("uses hyper's composition rung", () => {
    expect(focusSlotId(details({ mode: "hyper", filter: "dag", composition: { netId: "dag", key: "Hybrid|l0" } }))).toBe(
      "composition",
    );
  });
  it("a pinned snapshot IS a ledger lane slot now (item 8) — and recency decides the active card", () => {
    expect(focusSlotId(details({ mode: "ledger", snap: snapPick }))).toBe("snap");
    // With both a node and a snapshot present, the most recently selected one is active…
    expect(
      focusSlotId({ ...details({ mode: "ledger", filter: "dag", snap: snapPick, inspect: nodePick }), selStack: ["snap", "node"] }),
    ).toBe("snap");
    expect(
      focusSlotId({ ...details({ mode: "ledger", filter: "dag", snap: snapPick, inspect: nodePick }), selStack: ["node", "snap"] }),
    ).toBe("node");
    // …and with no recency data, the finest present slot wins (the old rule).
    expect(focusSlotId(details({ mode: "ledger", filter: "dag", snap: snapPick, inspect: nodePick }))).toBe("node");
  });
  it("flat views have no focus rung", () => {
    expect(focusSlotId(details({ mode: "status", filter: "dag", inspect: nodePick }))).toBeNull();
  });
});
