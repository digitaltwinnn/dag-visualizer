import { describe, it, expect } from "vitest";
import { exploreCards, detailsCards, parentHolds, focusSlotId, ladderLevelOfSlot, ladderSlotIds, type RailManifestState } from "@/components/railCards";
import { LADDERS } from "@/src/engine/domain/focusLadder";
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
  // The About orientation card left the rail on 2026-09-28 (the command bar's ABOUT row is its
  // door now), so every 3D view hosts exactly its tool card and the placeholder hosts nothing.
  it.each(["hyper", "geo", "ledger", "trend"] as const)("%s hosts its one tool card", (mode) => {
    expect(presentKinds(exploreCards({ mode }))).toEqual(["tool"]);
  });
  it.each(["soon"] as const)("placeholder %s hosts no card", (mode) => {
    expect(presentKinds(exploreCards({ mode }))).toEqual([]);
  });
  it("left cards carry stable (non-updating) subjectKeys", () => {
    const cards = exploreCards({ mode: "geo" });
    expect(cards.map((c) => c.subjectKey)).toEqual(["tool"]);
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
  it("slots come in ONE fixed order (snap, context, country, cohort, composition, metaSnap, node)", () => {
    // The manifest agrees with the display lane: the ledger reads tick → dossier → that tick's
    // metagraph snapshot → node (user, 2026-09-15). This order also drives the phone flat stack
    // and the tray icons, so the two can never disagree.
    const ids = detailsCards(details({ filter: "dor", inspect: nodePick, snap: snapPick })).map((c) => c.id);
    expect(ids).toEqual(["snap", "context", "range", "instant", "country", "cohort", "composition", "metaSnap", "node"]);
  });
  it("ledger ghosts: snapshot + context + metaSnap + node invites (nodes pick in the chamber too)", () => {
    expect(ghostIds(detailsCards(details({})))).toEqual(["snap", "context", "metaSnap", "node"]);
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
  // A placeholder view has NO FACTS SCOPE AT ALL (user, 2026-08-10) — not just no ghosts. Its
  // canvas is a wireframe captioned `preview · in development` that deliberately shows no numbers;
  // a live populated card beside it reads as data FROM it. The selection itself is untouched, so
  // this only asserts the view stops speaking for it.
  it.each(["soon"] as const)("placeholder %s hosts NO details cards", (mode) => {
    expect(detailsCards(details({ mode }))).toEqual([]);
    // …including when every subject a 3D view could commit is still selected.
    const held = details({ mode, filter: "dor", inspect: nodePick, snap: snapPick, country: "US" });
    expect(detailsCards(held)).toEqual([]);
  });
  it("a populated slot loses its ghost but keeps rendering in any 3D view (pinned snap in hyper)", () => {
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
  it("is ledger-scoped, and its hint names the STOREY that separates it from the byte bar", () => {
    const inLedger = detailsCards(base).find((c) => c.id === "metaSnap")!;
    expect(inLedger.hint).toBe("Click a tile on a plane above the floor.");
    const inGeo = detailsCards({ ...base, mode: "geo" }).find((c) => c.id === "metaSnap")!;
    expect(inGeo.hint).toBeNull();
  });
  it("is present once a tile is selected", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 42, ts: "t" };
    const c = detailsCards({ ...base, metaSnap: sel }).find((x) => x.id === "metaSnap")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe("DAG0:745190");
  });
  it("stands down under a global snapshot it did not anchor into (user, 2026-10-08)", () => {
    const sel = { metaId: "DAG0", ordinal: 745190, hash: "abc", globalOrdinal: 42, ts: "t" };
    const snapAt = (ordinal: number) => ({ kind: "snapshot", title: "", data: { ordinal } }) as unknown as typeof base.snap;
    const at = (ordinal: number) => detailsCards({ ...base, metaSnap: sel, snap: snapAt(ordinal) }).find((x) => x.id === "metaSnap")!;
    expect(at(42).present).toBe(true);
    expect(at(43).present).toBe(false);
  });
});

describe("parentHolds (a child card states its parent or does not render)", () => {
  const none = { snap: null, metaSnap: null, country: null, cohort: null };
  it("a cohort belongs to the committed country", () => {
    const cohort = { cc: "de", city: null, isp: null };
    expect(parentHolds({ ...none, country: "de", cohort }, "cohort")).toBe(true);
    expect(parentHolds({ ...none, country: "fr", cohort }, "cohort")).toBe(false);
    expect(parentHolds({ ...none, cohort }, "cohort")).toBe(true);
  });
  it("no parent on screen is no disagreement", () => {
    const metaSnap = { metaId: "DAG0", ordinal: 1, hash: "", globalOrdinal: 9, ts: "t" };
    expect(parentHolds({ ...none, metaSnap }, "metaSnap")).toBe(true);
  });
});

// ── THE HISTORY VIEW'S CURSOR SLOT (2026-09-19) ─────────────────────────────────────────────
// `instant` is a card slot with NO focus rung — the two snapshot slots' precedent
// (`railLadderBoundary` asserts rung → slot, never the reverse). Its subject is the committed
// time cursor, which the timeline writes once per bucket, so the tray highlight and the title
// roll fire once per bucket change rather than once per pointermove.
describe("the instant slot — History's cursor card", () => {
  const trend = (over: Partial<RailManifestState> = {}) => details({ mode: "trend", ...over });

  it("sits under the network dossier in History's lane, and is not a rung", () => {
    expect(ladderSlotIds("trend")).toEqual(["context", "range", "instant"]);
    expect(ladderLevelOfSlot("instant")).toBeNull();
  });

  it("ghosts with the GESTURE and nothing else while no instant is picked", () => {
    const c = detailsCards(trend()).find((x) => x.id === "instant")!;
    expect(c.present).toBe(false);
    expect(c.hint).toBe("Click a chart, or the timeline below.");
  });

  it("is History-scoped — no other view can produce it", () => {
    for (const mode of ["hyper", "geo", "ledger"] as const) {
      expect(detailsCards(details({ mode })).find((c) => c.id === "instant")?.hint).toBeNull();
    }
  });

  it("populates on a committed cursor, keyed on the instant the timeline wrote", () => {
    const c = detailsCards(trend({ trendCursorMs: 1_726_704_000_000 })).find((x) => x.id === "instant")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe(1_726_704_000_000);
  });

  it("History ghosts are exactly the network dossier, the range and the cursor", () => {
    expect(ghostIds(detailsCards(trend()))).toEqual(["context", "range", "instant"]);
  });
});

// THE RANGE (user, 2026-10-07): a brushed span is a committed subject of History like the cursor,
// and the cursor's PARENT — so it sits between the dossier and the Moment, and like the Moment it
// is a card slot with no rung.
describe("the range slot — History's brushed span", () => {
  const trend = (over: Partial<RailManifestState> = {}) => details({ mode: "trend", ...over });
  const R = { fromMs: 1_726_000_000_000, toMs: 1_726_600_000_000 };

  it("sits between the dossier and the Moment, and is not a rung", () => {
    expect(ladderLevelOfSlot("range")).toBeNull();
  });
  it("ghosts with the gesture while no range is brushed", () => {
    const c = detailsCards(trend()).find((x) => x.id === "range")!;
    expect(c.present).toBe(false);
    expect(c.hint).toBe("Drag across a chart or the timeline.");
  });
  it("is History-scoped", () => {
    for (const mode of ["hyper", "geo", "ledger"] as const) {
      expect(detailsCards(details({ mode, trendRange: R })).find((c) => c.id === "range")?.present).toBe(false);
      expect(detailsCards(details({ mode })).find((c) => c.id === "range")?.hint).toBeNull();
    }
  });
  it("populates on a brushed range, keyed on its two ends", () => {
    const c = detailsCards(trend({ trendRange: R })).find((x) => x.id === "range")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe(`${R.fromMs}-${R.toMs}`);
  });
  it("is the focus slot when it is the most recent commit, and yields to a later moment", () => {
    expect(focusSlotId({ ...trend({ trendRange: R }), selStack: ["range"] })).toBe("range");
    expect(focusSlotId({ ...trend({ trendRange: R, trendCursorMs: R.fromMs }), selStack: ["instant", "range"] })).toBe("instant");
  });
});

describe("ladderSlotIds — the descent-spine lane (display order = reversed rung order)", () => {
  it("mirrors focusLadder.LADDERS coarsest→coarsest per 3D view", () => {
    expect(ladderSlotIds("geo")).toEqual(["context", "country", "cohort", "node"]);
    expect(ladderSlotIds("hyper")).toEqual(["context", "composition", "node"]);
    // Ledger: the SNAPSHOT CHAIN rides the display lane between the network and the node —
    // GLOBAL SNAPSHOT ABOVE the metagraph snapshot it anchors (user, 2026-08-08, settled with
    // the slab): once the lane's committed cards abut as ONE body, adjacency reads as
    // CONTAINMENT, so the pair runs coarse→fine like every other rung — the tick carries the
    // metagraph snapshot. Card slots, not focus rungs.
    // Ledger: the TICK LEADS (user, 2026-09-15) — tick → metagraph → that tick's metagraph
    // snapshot → node. The lane is a containment claim and neither order is literally true, but
    // a tick at least contains the network's ANCHOR, and its card already lists exactly that;
    // the old lane asserted that a network contains a global tick. It also opens with a card
    // that speaks, since the tick follows live without any commit. Card slots, not focus rungs.
    expect(ladderSlotIds("ledger")).toEqual(["snap", "context", "metaSnap", "node"]);
  });
  it("flat views have no ladder", () => {
    expect(ladderSlotIds("soon")).toEqual([]);
  });
  it("every ladder slot id exists in the details manifest (the lane can't invent a slot)", () => {
    const ids = detailsCards(details({ mode: "geo" })).map((c) => c.id);
    for (const view of ["geo", "hyper", "ledger", "trend"] as const)
      for (const slot of ladderSlotIds(view)) expect(ids).toContain(slot);
  });
});

describe("ladderLevelOfSlot — the inverse read (which RUNG does a slot stand for)", () => {
  it("names the rung of every slot that is one", () => {
    expect(ladderLevelOfSlot("context")).toBe("network");
    expect(ladderLevelOfSlot("country")).toBe("country");
    expect(ladderLevelOfSlot("cohort")).toBe("cohort");
    expect(ladderLevelOfSlot("composition")).toBe("composition");
    expect(ladderLevelOfSlot("node")).toBe("node");
  });
  it("slots that are NOT rungs answer null — the camera can only be asked for a real pose", () => {
    // The two snapshot slots ride the lane without being focus rungs, and the tool card isn't
    // in the lane at all. Expanding one of these must not request a camera flight.
    expect(ladderLevelOfSlot("snap")).toBeNull();
    expect(ladderLevelOfSlot("metaSnap")).toBeNull();
    expect(ladderLevelOfSlot("tool")).toBeNull();
  });
  it("every lane slot either names a rung or is a known non-rung slot", () => {
    for (const view of ["geo", "hyper", "ledger", "trend"] as const)
      for (const slot of ladderSlotIds(view)) {
        const level = ladderLevelOfSlot(slot);
        if (!level) expect(["snap", "metaSnap", "range", "instant"]).toContain(slot);
        else expect(LADDERS[view].some((r) => r.level === level)).toBe(true);
      }
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
  it("a filter commit focuses the CONTEXT dossier over a follow-pinned snapshot (2026-08-14)", () => {
    // The user's gesture was the network; the snap/metaSnap pins arrived from the live follow
    // (advance*, non-bumping) — so "network" leads the stack and the dossier is the box.
    expect(
      focusSlotId({ ...details({ mode: "ledger", filter: "dor", snap: snapPick }), selStack: ["network", "snap"] }),
    ).toBe("context");
    // A later explicit snapshot click still wins — recency is the rule, filter is just IN it now.
    expect(
      focusSlotId({ ...details({ mode: "ledger", filter: "dor", snap: snapPick }), selStack: ["snap", "network"] }),
    ).toBe("snap");
  });

  it("flat views have no focus rung", () => {
    expect(focusSlotId(details({ mode: "soon", filter: "dag", inspect: nodePick }))).toBeNull();
  });
});

// The ghost-hint COPY RULE, made executable (2026-08-12). The prose rule lives in railCards.ts;
// what a test can hold is the two failure modes it has now hit twice — a refrain shared down the
// stack, and a hint spending its subject on the noun its own slot label already says. Both were
// re-introduced by the very edit that fixed the first version of them, which is why they are here
// rather than in a comment. The exact wording stays free: only the SHAPE is pinned.
describe("ghost hints — the copy rule", () => {
  const VIEWS = ["hyper", "geo", "ledger", "trend"] as const;
  // The noun each slot's own eyebrow already carries. A hint that repeats it has spent its one
  // sentence restating the label ("Country — Drill a country on the globe.").
  const OWN_NOUN: Record<string, string> = {
    context: "network", country: "country", cohort: "provider",
    composition: "composition", snap: "snapshot", metaSnap: "snapshot", node: "node",
    instant: "instant", range: "range",
  };
  const hintsIn = (mode: (typeof VIEWS)[number]) =>
    detailsCards(details({ mode })).filter((c) => !c.present && c.hint).map((c) => ({ id: c.id, hint: c.hint! }));

  it.each(VIEWS)("%s: no two ghosts in one stack share a trailing clause", (mode) => {
    const tails = hintsIn(mode).map(({ hint }) => hint.toLowerCase().split(/\s+/).slice(-3).join(" "));
    expect(new Set(tails).size).toBe(tails.length);
  });
  it.each(VIEWS)("%s: no ghost restates the noun its own slot label carries", (mode) => {
    for (const { id, hint } of hintsIn(mode)) {
      // The no-locatable-nodes variant is an honest STATEMENT, not an invite — it has to name the
      // network it is reporting on, so it is exempt.
      if (hint.includes("has no locatable nodes")) continue;
      // The defect is the noun standing as the hint's OBJECT ("Drill a country…", "Click a node…"),
      // which spends the sentence on what the eyebrow just said. The same word used as a DESCRIPTOR
      // is fine and sometimes necessary: "Open any provider · city row" names the row's own two
      // columns so you can spot it in the list, and the object is the row.
      expect(hint.toLowerCase(), `${mode}/${id}`).not.toMatch(
        new RegExp(`\\b(a|an|the|one)\\s+${OWN_NOUN[id]}\\b`),
      );
    }
  });
  it("no ghost carries the retired ', or in the explorer.' refrain", () => {
    for (const mode of VIEWS) {
      for (const { hint } of hintsIn(mode)) expect(hint).not.toMatch(/in the explorer\.?$/);
    }
  });

  // ── The pointer's own verb (2026-09-04) ──────────────────────────────────────────────────────
  const coarseHintsIn = (mode: (typeof VIEWS)[number]) =>
    detailsCards({ ...details({ mode }), coarse: true }).filter((c) => !c.present && c.hint).map((c) => ({ id: c.id, hint: c.hint! }));

  it.each(VIEWS)("%s: a coarse pointer is never told to Click — the hints say Tap", (mode) => {
    for (const { id, hint } of coarseHintsIn(mode)) {
      expect(hint, `${mode}/${id}`).not.toMatch(/\bclick\b/i);
    }
    // …and the default (fine/unspecified) hints never say Tap, so the two registers can't blur.
    for (const { id, hint } of hintsIn(mode)) {
      expect(hint, `${mode}/${id}`).not.toMatch(/\btap\b/i);
    }
  });

  it("EXACTLY ONE hint advertises the long-press preview, on touch, in geo", () => {
    // The advertisement exists because long-press has no visible affordance (railCards' node-hint
    // note); ONE mention is the rule — a refrain across slots would be the shared-tail defect.
    const mentions = VIEWS.flatMap((mode) => coarseHintsIn(mode).filter(({ hint }) => /press and hold/i.test(hint)).map(({ id }) => `${mode}/${id}`));
    expect(mentions).toEqual(["geo/node"]);
    // Never on a fine pointer, whose preview is the resting hover itself.
    for (const mode of VIEWS) {
      for (const { hint } of hintsIn(mode)) expect(hint).not.toMatch(/press and hold/i);
    }
  });
});

// ── THE LEDGER LANE OPENS ON A CARD THAT SPEAKS (user, 2026-09-15) ──────────────────────────
// The reorder is what fixes the leading ghost, structurally: the tick needs no commit to be
// populated, so putting it at the head means the pile never opens by inviting. An earlier cut
// suppressed the leading ghost instead; it was retired here rather than kept, because a second
// mechanism for a problem the order already solves is what convention 8 forbids.
describe("the ledger lane leads with the tick", () => {
  it("at 'all' with a live tick, the head card is populated and no ghost sits above it", () => {
    const cards = detailsCards(details({ mode: "ledger", filter: "all", snap: snapPick }));
    const lane = ladderSlotIds("ledger");
    expect(lane[0]).toBe("snap");
    expect(cards.find((c) => c.id === "snap")!.present).toBe(true);
  });

  it("the dossier sits UNDER the tick, where the tick's own anchor list points", () => {
    const lane = ladderSlotIds("ledger");
    expect(lane.indexOf("context")).toBeGreaterThan(lane.indexOf("snap"));
    expect(lane.indexOf("metaSnap")).toBeGreaterThan(lane.indexOf("context"));
  });

  it("hyper and geo are untouched — their coarsest subject still needs a commit", () => {
    expect(ladderSlotIds("hyper")[0]).toBe("context");
    expect(ladderSlotIds("geo")[0]).toBe("context");
  });
});

// History's Metagraph card stands on the plane brought forward (2026-10-07), never on a written filter.
describe("the Metagraph card in History follows the plane focus", () => {
  const trend = (over: Partial<RailManifestState> = {}) => details({ mode: "trend", ...over });
  it("a focus under All populates it, keyed on the focused network", () => {
    const c = detailsCards(trend({ trendFocus: "dor" })).find((x) => x.id === "context")!;
    expect(c.present).toBe(true);
    expect(c.subjectKey).toBe("dor");
  });
  it("is the focus slot after a plane click", () => {
    expect(focusSlotId({ ...trend({ trendFocus: "dor" }), selStack: ["network"] })).toBe("context");
  });
  it("no focus and no filter is still the ghost", () => {
    expect(detailsCards(trend()).find((x) => x.id === "context")!.present).toBe(false);
  });
});
