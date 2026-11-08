import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { blockInPlace, metaSnapClearActions, netKeyOf, tickNetSelectActions, tickNetClearActions, viewEntryActions, clickActions, cohortToggleActions, compositionToggleActions, countryToggleActions, countryClearActions, filterToggleActions, followToggleActions, nodeSelectActions, sameCohort, sameComposition, snapshotSelectActions, pickActive, pickNetId, metaSnapSelectActions, metaSnapArrivalActions, bandSelectActions, sameMetaSnap, trendPlaneActions, railNetActions, noteCohortActions, noteDayActions, snapshotClearActions, blockSelectActions, blockClearActions, blockFollowActions, dataBlockSelectActions, dataBlockClearActions, sameDataBlock, registerSwitchActions, globalPick, tickContextOf, type ClickAction } from "./pickActions";
import { finerLevels } from "./focusLadder";
import { METAGRAPHS } from "@/src/net/current";
import type { PickDescriptor, MetaSnapSel, BlockSel } from "@/src/data/types";

// Minimal pick fixtures — only the fields the table reads.
const nodePick = (cc: string | null = "DE"): PickDescriptor =>
  ({ kind: "metanode", meta: { id: "dor" }, node: { ip: "1.2.3.4" }, geo: cc ? { cc } : {} }) as unknown as PickDescriptor;
const validatorPick = (): PickDescriptor =>
  ({ kind: "l0", node: { id: "abc" }, geo: { cc: "US" } }) as unknown as PickDescriptor;
const hubPick = (): PickDescriptor => ({ kind: "meta", cfg: { id: "dor" } }) as unknown as PickDescriptor;
type SnapPick = Extract<PickDescriptor, { kind: "snapshot" }>;
const snapPick = (): SnapPick => ({ kind: "snapshot", data: { ordinal: 42 } }) as unknown as SnapPick;
const state = (
  over: Partial<{
    filter: string;
    country: string | null;
    hasInspect: boolean;
    cohort: { cc: string; city: string | null; isp: string | null } | null;
  }> = {},
) => ({
  filter: "all",
  country: null,
  hasInspect: false,
  cohort: null,
  ...over,
});

const kinds = (a: ClickAction[]) => a.map((x) => x.kind);

describe("pickNetId", () => {
  it("maps a metagraph node to its metagraph and a validator to the DAG core", () => {
    expect(pickNetId(nodePick())).toBe("dor");
    expect(pickNetId(validatorPick())).toBe("dag");
    expect(pickNetId(hubPick())).toBeNull();
  });
});

describe("clickActions — empty click (the land-sphere country toggle, geo)", () => {
  it("does nothing over ocean / outside geo (no resolved country)", () => {
    expect(clickActions({ mode: "geo", pick: null, countryCc: null, current: state() })).toEqual([]);
  });
  it("commits the country under the cursor", () => {
    expect(clickActions({ mode: "geo", pick: null, countryCc: "DE", current: state() })).toEqual([
      { kind: "country", cc: "DE" },
    ]);
  });
  it("toggles OFF when the same country is already drilled", () => {
    expect(
      clickActions({ mode: "geo", pick: null, countryCc: "DE", current: state({ country: "DE" }) }),
    ).toEqual([{ kind: "country", cc: null }]);
  });
  it("drops a selected node BEFORE moving the drill level (zoom-level rule)", () => {
    const acts = clickActions({
      mode: "geo",
      pick: null,
      countryCc: "FI",
      current: state({ country: "DE", hasInspect: true }),
    });
    expect(acts).toEqual([
      { kind: "inspect", pick: null },
      { kind: "country", cc: "FI" },
    ]);
  });
});

describe("clickActions — hub / snapshot", () => {
  it("a hub click selects its metagraph, nothing else", () => {
    expect(clickActions({ mode: "hyper", pick: hubPick(), countryCc: null, current: state() })).toEqual([
      { kind: "railNet", id: "dor" },
    ]);
  });
  it("a snapshot tile PINS that snapshot (a scene tile is never the strip's live tip)", () => {
    const p = snapPick();
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
  });
});

describe("clickActions — node clicks (the ordering contracts)", () => {
  it("GEO: NO filter — a node is a place first (user, 2026-09-26): country + cohort (full-ancestry rule), inspect LAST", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state() });
    expect(acts).toEqual([
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: { cc: "DE", city: null, isp: null } },
      { kind: "inspect", pick: p },
    ]);
  });
  it("GEO: the same list whatever the committed filter — a node never changes it", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state({ filter: "dor" }) });
    expect(kinds(acts)).toEqual(["country", "cohort", "inspect"]);
    const other = clickActions({ mode: "geo", pick: p, countryCc: null, current: state({ filter: "ded" }) });
    expect(kinds(other)).toEqual(["country", "cohort", "inspect"]);
  });
  it("GEO: a node without a resolvable country skips the drill (no country action)", () => {
    const acts = clickActions({ mode: "geo", pick: nodePick(null), countryCc: null, current: state() });
    expect(kinds(acts)).toEqual(["inspect"]);
  });
  it("GEO: a validator drills its country, and no more commits the DAG core than a metagraph node commits its network", () => {
    const acts = clickActions({ mode: "geo", pick: validatorPick(), countryCc: null, current: state() });
    expect(acts[0]).toEqual({ kind: "country", cc: "US" });
    expect(kinds(acts)).not.toContain("filter");
  });
  it("HYPER: its network + inspect only — no country (a geo concept), no autoRotate stop", () => {
    const p = nodePick("DE");
    expect(kinds(clickActions({ mode: "hyper", pick: p, countryCc: null, current: state() }))).toEqual([
      "railNet",
      "inspect",
    ]);
  });
  it("LEDGER: nothing — the Snapshots view has no node rung (user, 2026-11-08: the node card left it); a tray chip previews on hover and commits nothing", () => {
    const p = nodePick("DE");
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() })).toEqual([]);
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state({ filter: "ded" }) })).toEqual([]);
  });
});

describe("clickActions — flat/placeholder + non-geo safety (the table gates itself)", () => {
  it("an empty click does nothing in ANY non-geo view, even with a (contract-violating) countryCc", () => {
    for (const mode of ["hyper", "ledger", "soon"] as const) {
      expect(clickActions({ mode, pick: null, countryCc: "DE", current: state() })).toEqual([]);
    }
  });
});

// user, 2026-11-02: a filter holds the view, and a node carried in from Snapshots cannot step around it.
describe("viewEntryActions under a filter", () => {
  it("drops a node of another network rather than standing the view on it", () => {
    expect(viewEntryActions({ mode: "hyper", filter: "swap", pick: nodePick() })).toEqual([{ kind: "inspect", pick: null }]);
    expect(viewEntryActions({ mode: "geo", filter: "swap", pick: nodePick() })).toEqual([{ kind: "inspect", pick: null }]);
  });
  it("keeps a node of the filter's own network", () => {
    expect(viewEntryActions({ mode: "hyper", filter: "dor", pick: nodePick() })).not.toContainEqual({ kind: "inspect", pick: null });
  });
  it("still stands a view on a carried node's network under All", () => {
    expect(viewEntryActions({ mode: "hyper", filter: "all", pick: nodePick() })[0]).toEqual({ kind: "railNet", id: "dor" });
  });
  it("leaves Snapshots alone: a tick's own networks stay open there", () => {
    expect(viewEntryActions({ mode: "ledger", filter: "swap", pick: nodePick() })).not.toContainEqual({ kind: "inspect", pick: null });
  });
});

describe("pickActive — which picks respond at all, per view", () => {
  it("a node-less metagraph hub is never selectable; a located one is", () => {
    const active = new Set(["dor"]);
    expect(pickActive(hubPick(), "hyper", "all", active)).toBe(true);
    const emptyHub = { kind: "meta", cfg: { id: "leet" } } as unknown as PickDescriptor;
    expect(pickActive(emptyHub, "hyper", "all", active)).toBe(false);
  });
  it("before the located counts load (null set), every hub is allowed", () => {
    expect(pickActive(hubPick(), "hyper", "all", null)).toBe(true);
  });
  it("GEO: off-filter nodes are not pickable (they're genuinely hidden)", () => {
    expect(pickActive(nodePick(), "geo", "all", null)).toBe(true);
    expect(pickActive(nodePick(), "geo", "dor", null)).toBe(true);
    expect(pickActive(nodePick(), "geo", "swap", null)).toBe(false);
    expect(pickActive(validatorPick(), "geo", "dag", null)).toBe(true);
    expect(pickActive(validatorPick(), "geo", "dor", null)).toBe(false);
  });
  it("HYPER/LEDGER: every node stays interactive — off-focus ones are only dimmed", () => {
    expect(pickActive(nodePick(), "hyper", "swap", null)).toBe(true);
    expect(pickActive(nodePick(), "ledger", "swap", null)).toBe(true);
  });
  // user, 2026-11-02: with a filter on, you stay inside that network until the top bar changes it.
  it("a filter holds the browsing views: another network's hub and nodes do not respond", () => {
    const other = { kind: "meta", cfg: { id: "swap" } } as unknown as PickDescriptor;
    expect(pickActive(other, "hyper", "dor", null, "dor")).toBe(false);
    expect(pickActive(other, "geo", "dor", null, "dor")).toBe(false);
    expect(pickActive(hubPick(), "hyper", "dor", null, "dor")).toBe(true);
    expect(pickActive(nodePick(), "hyper", "swap", null, "swap")).toBe(false);
    expect(pickActive(nodePick(), "hyper", "dor", null, "dor")).toBe(true);
    expect(pickActive(validatorPick(), "hyper", "dor", null, "dor")).toBe(false);
  });
  it("the core is the DAG's: a metagraph filter holds it out, a DAG filter keeps it", () => {
    const core = { kind: "core" } as unknown as PickDescriptor;
    expect(pickActive(core, "hyper", "dor", null, "dor")).toBe(false);
    expect(pickActive(core, "hyper", "dag", null, "dag")).toBe(true);
    expect(pickActive(core, "hyper", "all", null, "all")).toBe(true);
  });
  it("a browse holds nothing in Hypergraph: under All another hub still answers", () => {
    const other = { kind: "meta", cfg: { id: "swap" } } as unknown as PickDescriptor;
    expect(pickActive(other, "hyper", "dor", null, "all")).toBe(true);
    expect(pickActive(nodePick(), "hyper", "swap", null, "all")).toBe(true);
  });
  it("Snapshots is not held here: its tick decides, and a tick's own networks stay open", () => {
    expect(pickActive(nodePick(), "ledger", "swap", null, "swap")).toBe(true);
  });
  it("non-node picks (snapshot) pass — their view gating is pickSources", () => {
    expect(pickActive(snapPick(), "ledger", "dor", null)).toBe(true);
  });
});

describe("the shared component builders (GeoExplore rows + LiveStrip bars run the SAME table)", () => {
  it("countryToggleActions === the scene's empty-click semantics (drill, toggle, deselect-first)", () => {
    expect(countryToggleActions("DE", { country: null, hasInspect: false, cohort: null })).toEqual([
      { kind: "country", cc: "DE" },
    ]);
    expect(countryToggleActions("DE", { country: "DE", hasInspect: false, cohort: null })).toEqual([
      { kind: "country", cc: null },
    ]);
    expect(countryToggleActions("FI", { country: "DE", hasInspect: true, cohort: null })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "country", cc: "FI" },
    ]);
  });
  it("a click on the committed country with a node or provider under it steps UP to the country, never off it", () => {
    expect(countryToggleActions("DE", { country: "DE", hasInspect: true, cohort: CO })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "cohort", sel: null },
      { kind: "country", cc: "DE" },
    ]);
    expect(countryToggleActions("DE", { country: "DE", hasInspect: false, cohort: CO })).toEqual([
      { kind: "cohort", sel: null },
      { kind: "country", cc: "DE" },
    ]);
  });
  it("countryClearActions (the Country card's ×) releases the country and everything under it", () => {
    expect(countryClearActions({ hasInspect: true, cohort: CO })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "cohort", sel: null },
      { kind: "country", cc: null },
    ]);
    expect(countryClearActions({ hasInspect: false, cohort: null })).toEqual([{ kind: "country", cc: null }]);
  });
  it("nodeSelectActions: the row's re-click deselects (one toggle language everywhere)", () => {
    expect(nodeSelectActions(nodePick(), { mode: "geo", currentFilter: "dor", deselect: true })).toEqual([
      { kind: "inspect", pick: null },
    ]);
  });
  it("nodeSelectActions: commitNetwork false never moves the network, even where the view's policy would", () => {
    const hyper = nodeSelectActions(nodePick(), { mode: "hyper", currentFilter: "all" });
    expect(hyper.some((a) => a.kind === "railNet")).toBe(true);
    const raw = nodeSelectActions(nodePick(), { mode: "hyper", currentFilter: "all", commitNetwork: false });
    expect(raw.some((a) => a.kind === "railNet")).toBe(false);
    expect(raw[raw.length - 1]).toEqual({ kind: "inspect", pick: nodePick() });
  });
  it("nodeSelectActions: a row select == a scene node click (same ordered actions)", () => {
    const p = nodePick("DE");
    const row = nodeSelectActions(p, { mode: "geo", currentFilter: "all" });
    const scene = clickActions({ mode: "geo", pick: p, countryCc: null, current: state() });
    expect(row).toEqual(scene);
  });
  it("snapshotSelectActions: the live tip (re-)follows, an older bar pins", () => {
    const p = snapPick();
    expect(snapshotSelectActions(p, true)).toEqual([{ kind: "snapshot", pick: p, follow: true }]);
    expect(snapshotSelectActions(p, false)).toEqual([{ kind: "snapshot", pick: p, follow: false }]);
  });

  it("snapshotSelectActions: re-clicking the PINNED tick deselects, dropping the metaSnap child", () => {
    const p = snapPick();
    const ord = (p as unknown as { data: { ordinal: number } }).data.ordinal;
    const child = { metaId: "dor", ordinal: 1, hash: "h", globalOrdinal: ord, ts: "T" } as MetaSnapSel;
    // Pinned + re-clicked → clear (finer slot first); following is left to the FollowController.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: ord, metaSnap: child })).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: null, follow: true },
    ]);
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: ord, metaSnap: null })).toEqual([
      { kind: "snapshot", pick: null, follow: true },
    ]);
    // A DIFFERENT pinned tick, or the live tip itself, still selects normally.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: ord + 1, metaSnap: null })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
    expect(snapshotSelectActions(p, true, { pinnedOrdinal: ord, metaSnap: null })).toEqual([
      { kind: "snapshot", pick: p, follow: true },
    ]);
  });

  // ⚠️ CLEARING A TICK CLEARS WHAT HANGS UNDER IT (user, 2026-09-29: "deleting a snapshot card will
  // clear the rung that is there at that moment"; live stays the default). The × used to clear the
  // tick alone, and the re-click dropped only the metaSnap — so a committed metagraph survived,
  // and with live resuming, `followLatest` re-grew its metagraph-snapshot card on the next beat.
  it("snapshotClearActions: the tick's rungs present right now clear finest-first, then live resumes — never the filter", () => {
    const child = { metaId: "dor", ordinal: 7, hash: "", globalOrdinal: 42, ts: "T" };
    const a = snapshotClearActions({ metaSnap: child });
    expect(a).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: null, follow: true },
    ]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
    // A validator opened under the snapshot (∨) is the finest rung: it clears first.
    expect(snapshotClearActions({ metaSnap: child, hasInspect: true })[0]).toEqual({ kind: "inspect", pick: null });
    // Only what is there: a bare tick clears alone.
    expect(snapshotClearActions({ metaSnap: null })).toEqual([{ kind: "snapshot", pick: null, follow: true }]);
  });
  it("the pinned tick's RE-CLICK clears what hangs under it and resumes live — and never the filter", () => {
    const p = { kind: "snapshot", title: "Global snapshot #42", data: { ordinal: 42 } } as unknown as Parameters<typeof snapshotSelectActions>[0];
    const child = { metaId: "dor", ordinal: 7, hash: "", globalOrdinal: 42, ts: "T" };
    // The same clear as the card's × — one toggle language.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: 42, metaSnap: child })).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: null, follow: true },
    ]);
  });

  it("snapshotSelectActions: committing a DIFFERENT tick drops the metaSnap it can't contain", () => {
    const p = snapPick();
    const ord = (p as unknown as { data: { ordinal: number } }).data.ordinal;
    const here = { metaId: "dor", ordinal: 1, hash: "h", globalOrdinal: ord, ts: "T" } as MetaSnapSel;
    const elsewhere = { ...here, globalOrdinal: ord - 7 } as MetaSnapSel;
    // A metagraph snapshot anchors into exactly ONE tick, so one from another tick is released —
    // in the pile it would sit under this tick's card claiming to be part of it.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: elsewhere })).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: p, follow: false },
    ]);
    // Its OWN tick keeps it — this is the ancestry a metaSnap select already committed.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: here })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
    // The live tip is no exception: re-following a different tick can't keep a foreign child.
    expect(snapshotSelectActions(p, true, { pinnedOrdinal: null, metaSnap: elsewhere })).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: p, follow: true },
    ]);
  });

  it("snapshotSelectActions never writes the filter — the reader's lens is not a selection's to move", () => {
    const p = snapPick();
    const a = snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: null });
    expect(a).toEqual([{ kind: "snapshot", pick: p, follow: false }]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
  });

  it("followToggleActions: the card's live switch flips following, keeping the shown subject", () => {
    const p = snapPick();
    // Resuming live releases the tick-local network first — it names a network in the tick being left.
    expect(followToggleActions(p, false, null)).toEqual([{ kind: "tickNet", sel: null }, { kind: "snapshot", pick: p, follow: true }]);
    expect(followToggleActions(p, true, null)).toEqual([{ kind: "snapshot", pick: p, follow: false }]);
    // …and the held NODE (a snapshot's signer) is released first on a resume (user, 2026-11-08).
    expect(kinds(followToggleActions(p, false, null, true))).toEqual(["inspect", "tickNet", "snapshot"]);
    expect(kinds(followToggleActions(p, true, null, true))).toEqual(["snapshot"]);
  });
});

// Arriving in a view with a node still selected: the view-scoped rungs (cleared on the way out
// by focusLadder.LEVEL_CARRY) must come back, so every parent card up to the selection is on the
// rail again. The drift guard is the equality with nodeSelectActions' own ancestry — the two
// must always name the same rungs.
describe("viewEntryActions (a carried node's ancestry in the destination view)", () => {
  // user, 2026-11-02: "as they fly between the views their focus should be kept". A browse clears on
  // leaving and the node carries, so arriving where a node stands the view on its network does so
  // again, node last, because a network change clears what was picked under the old one.
  it("hyper stands on a carried node's network again, under All, with the node after it", () => {
    const p = nodePick();
    expect(viewEntryActions({ filter: "all", mode: "hyper", pick: p, compositionSel: COMP })).toEqual([
      { kind: "railNet", id: "dor" },
      { kind: "composition", sel: COMP },
      { kind: "inspect", pick: p },
    ]);
  });
  it("no browse where the filter already stands on it", () => {
    expect(viewEntryActions({ filter: "dor", mode: "hyper", pick: nodePick(), compositionSel: COMP }).map((a) => a.kind)).toEqual(["composition"]);
  });
  it("a view that does not commit a node's network stays out of it", () => {
    expect(viewEntryActions({ filter: "all", mode: "ledger", pick: nodePick() })).toEqual([]);
  });

  const COMP = { netId: "dor", key: "Hybrid|L0,cL1" };
  const ancestryOf = (acts: ClickAction[]) => acts.filter((a) => a.kind !== "filter" && a.kind !== "inspect");

  it("geo: re-commits the node's country AND provider cohort", () => {
    const p = nodePick("DE");
    expect(viewEntryActions({ filter: "dor", mode: "geo", pick: p })).toEqual([
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: { cc: "DE", city: null, isp: null } },
    ]);
  });

  it("hyper: re-commits the node's composition group", () => {
    expect(viewEntryActions({ filter: "dor", mode: "hyper", pick: nodePick(), compositionSel: COMP })).toEqual([
      { kind: "composition", sel: COMP },
    ]);
  });

  it("ledger: contributes nothing — its floors/containers are visual aid (layer retired 2026-08-06)", () => {
    expect(viewEntryActions({ filter: "dor", mode: "ledger", pick: nodePick() })).toEqual([]);
  });

  it("names exactly the rungs a node CLICK in that view commits (no drift)", () => {
    const p = nodePick("DE");
    for (const mode of ["geo", "hyper", "ledger"] as const) {
      expect(viewEntryActions({ filter: "dor", mode, pick: p, compositionSel: COMP })).toEqual(
        ancestryOf(nodeSelectActions(p, { mode, currentFilter: "dor", compositionSel: COMP })),
      );
    }
  });

  it("has nothing to say without a node selection (a dossier or a snapshot carries no ancestry)", () => {
    expect(viewEntryActions({ filter: "dor", mode: "geo", pick: null })).toEqual([]);
    expect(viewEntryActions({ filter: "dor", mode: "geo", pick: hubPick() })).toEqual([]);
    expect(viewEntryActions({ filter: "dor", mode: "ledger", pick: snapPick() })).toEqual([]);
  });
});

describe("filterToggleActions (the remaining rail interaction)", () => {
  it("re-picking the filter's own network while browsing ends the browse and keeps the filter", () => {
    expect(filterToggleActions("dor", "dor", "usdc")).toEqual([{ kind: "railNet", id: null }]);
    expect(filterToggleActions("bio", "dor", "usdc")).toEqual([{ kind: "filter", id: "bio" }]);
    expect(filterToggleActions("all", "all", "usdc")).toEqual([{ kind: "railNet", id: null }]);
  });

  it("the filter picker's committed-row rule: re-picking steps back to 'all'; 'all' never toggles", () => {
    expect(filterToggleActions("dor", "all")).toEqual([{ kind: "filter", id: "dor" }]);
    expect(filterToggleActions("dor", "dor")).toEqual([{ kind: "filter", id: "all" }]);
    expect(filterToggleActions("all", "all")).toEqual([{ kind: "filter", id: "all" }]);
  });
});

const CO = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };

describe("cohortToggleActions — the provider/cohort rung toggle (spec Part 4)", () => {
  it("commits the cohort, dropping a selected node first (zoom-level rule)", () => {
    expect(cohortToggleActions(CO, { cohort: null, hasInspect: true })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "cohort", sel: CO },
    ]);
  });
  it("re-clicking the committed cohort clears it (one toggle language)", () => {
    expect(cohortToggleActions(CO, { cohort: CO, hasInspect: false })).toEqual([
      { kind: "cohort", sel: null },
    ]);
  });
  it("sameCohort matches by cc+city+isp, null-safe", () => {
    expect(sameCohort(CO, { ...CO })).toBe(true);
    expect(sameCohort(CO, { ...CO, isp: "OVH" })).toBe(false);
    expect(sameCohort(null, CO)).toBe(false);
    expect(sameCohort(null, null)).toBe(false); // no committed cohort ≠ "same"
  });
});

const COMP = { netId: "dor", key: "Hybrid|L0·dL1" };

describe("compositionToggleActions — the hyper composition rung toggle (user, 2026-08-02)", () => {
  it("commits the group, standing on its network FIRST and dropping a selected node", () => {
    expect(compositionToggleActions(COMP, { composition: null, hasInspect: true, filter: "all" })).toEqual([
      { kind: "railNet", id: "dor" },
      { kind: "inspect", pick: null },
      { kind: "composition", sel: COMP },
    ]);
  });
  it("no filter churn when the group's network is already committed", () => {
    expect(compositionToggleActions(COMP, { composition: null, hasInspect: false, filter: "dor" })).toEqual([
      { kind: "composition", sel: COMP },
    ]);
  });
  it("re-clicking the committed group clears it (one toggle language)", () => {
    expect(compositionToggleActions(COMP, { composition: COMP, hasInspect: false, filter: "dor" })).toEqual([
      { kind: "composition", sel: null },
    ]);
  });
  it("sameComposition matches by netId+key, null-safe", () => {
    expect(sameComposition(COMP, { ...COMP })).toBe(true);
    expect(sameComposition(COMP, { ...COMP, key: "Data|dL1" })).toBe(false);
    expect(sameComposition(COMP, { ...COMP, netId: "ded" })).toBe(false);
    expect(sameComposition(null, COMP)).toBe(false);
    expect(sameComposition(null, null)).toBe(false); // no committed group ≠ "same"
  });
});

describe("ladder-derived stepping — pickActions cannot drift from focusLadder", () => {
  it("the country toggle drops exactly geo's finer levels (node + cohort)", () => {
    const acts = countryToggleActions("DE", { country: null, hasInspect: true, cohort: CO });
    const dropped = acts.filter((a) => (a.kind === "inspect" && a.pick === null) || (a.kind === "cohort" && a.sel === null));
    // finerLevels("geo","country") = ["node","cohort"] — one clearing action per finer level.
    expect(finerLevels("geo", "country")).toEqual(["node", "cohort"]);
    expect(dropped).toHaveLength(2);
    expect(acts[acts.length - 1]).toEqual({ kind: "country", cc: "DE" });
  });
  it("the cohort toggle drops exactly geo's finer levels (node)", () => {
    expect(finerLevels("geo", "cohort")).toEqual(["node"]);
    const acts = cohortToggleActions(CO, { cohort: null, hasInspect: true });
    expect(acts.filter((a) => a.kind === "inspect")).toHaveLength(1);
  });
  it("the composition toggle drops exactly hyper's finer levels (node)", () => {
    expect(finerLevels("hyper", "composition")).toEqual(["node"]);
    const acts = compositionToggleActions(COMP, { composition: null, hasInspect: true, filter: "dor" });
    expect(acts.filter((a) => a.kind === "inspect")).toHaveLength(1);
  });
});

describe("nodeSelectActions ancestry (spec Part 3 — full-ancestry rule)", () => {
  const geoPick = {
    kind: "metanode", meta: { id: "dor" },
    geo: { cc: "DE", city: "Falkenstein", isp: "Hetzner" },
  } as unknown as PickDescriptor;
  it("geo: country → cohort → inspect LAST, and never the filter (2026-09-26)", () => {
    const acts = nodeSelectActions(geoPick, { mode: "geo", currentFilter: "all" });
    expect(acts.map((a) => a.kind)).toEqual(["country", "cohort", "inspect"]);
    expect(acts[1]).toEqual({ kind: "cohort", sel: { cc: "DE", city: "Falkenstein", isp: "Hetzner" } });
  });
  it("geo: a pick without isp/city still commits its cohort (nullable fields)", () => {
    const p = { kind: "l0", node: { id: "x" }, geo: { cc: "FI" } } as unknown as PickDescriptor;
    const acts = nodeSelectActions(p, { mode: "geo", currentFilter: "dag" });
    expect(acts.find((a) => a.kind === "cohort")).toEqual({ kind: "cohort", sel: { cc: "FI", city: null, isp: null } });
  });
  it("ledger: no layer ancestry (retired 2026-08-06) and no filter — inspect only", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor" });
    expect(acts.map((a) => a.kind)).toEqual(["inspect"]);
  });
  it("hyper: the node's composition GROUP commits before inspect (full ancestry)", () => {
    const acts = nodeSelectActions(geoPick, { mode: "hyper", currentFilter: "all", compositionSel: COMP });
    expect(acts.map((a) => a.kind)).toEqual(["railNet", "composition", "inspect"]);
    expect(acts[1]).toEqual({ kind: "composition", sel: COMP });
  });
  it("hyper: no resolvable group → the node still selects (no empty commit)", () => {
    const acts = nodeSelectActions(geoPick, { mode: "hyper", currentFilter: "dor", compositionSel: null });
    expect(acts.map((a) => a.kind)).toEqual(["inspect"]);
  });
  it("deselect stays a bare inspect-clear", () => {
    expect(nodeSelectActions(geoPick, { mode: "geo", currentFilter: "all", deselect: true }))
      .toEqual([{ kind: "inspect", pick: null }]);
  });
});

describe("metaSnapSelectActions (a tile on the upper floor)", () => {
  const LISTED = METAGRAPHS[0].id;
  const SEL: MetaSnapSel = { metaId: LISTED, ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };

  // FULL ANCESTRY, WITHOUT THE FILTER (user, 2026-10-02: "clicking a metagraph snapshot row opens
  // that card, but the parent rung is incomplete; it should ensure it is complete and also select
  // the related details card"). Decision 13 stopped the tile committing the app filter, which left
  // the Metagraph rung between the tick and the snapshot EMPTY — that rung had no state but the
  // filter. It has one now: the tick-local network (`tickNet`), so the pile is tick → network →
  // snapshot and the top bar is never written.
  // A SNAPSHOT DROPS THE NODE IT CANNOT CONTAIN (user, 2026-10-03: "remove node"). A node carried
  // in from another view stayed in the pile under a snapshot of a different network, where
  // adjacency is containment.
  it("drops a held node of ANOTHER network first, and keeps one of the snapshot's own", () => {
    const dagNode = { kind: "l0", title: "n" } as unknown as PickDescriptor;
    const other = { kind: "metanode", title: "n", meta: { id: "some-other-metagraph" } } as unknown as PickDescriptor;
    const own = { kind: "metanode", title: "n", meta: { id: SEL.metaId } } as unknown as PickDescriptor;
    for (const foreign of [dagNode, other]) {
      const a = metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: null, inspect: foreign });
      expect(a[0]).toEqual({ kind: "inspect", pick: null }); // finest first
      expect(a.map((x) => x.kind)).toEqual(["inspect", "snapshot", "tickNet", "metaSnap"]);
    }
    const kept = metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: null, inspect: own });
    expect(kept.map((x) => x.kind)).toEqual(["snapshot", "tickNet", "metaSnap"]);
    expect(kept.some((x) => x.kind === "filter")).toBe(false);
  });

  it("a step inside the LIVE pair holds the snapshot and pins nothing; another tick or network still pins", () => {
    const live = { ...SEL, ordinal: 745191, hash: "h2" };
    expect(metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: live, following: true, inspect: null })).toEqual([
      { kind: "metaSnap", sel: { ...SEL, held: true } },
    ]);
    // The shown subject converts to a pin, as ever; a step while pinned pins.
    expect(metaSnapSelectActions(live, GLOBAL, { block: null, metaSnap: live, following: true, inspect: null })[0]).toMatchObject({ kind: "snapshot", follow: false });
    expect(metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: live, following: false, inspect: null })[0]).toMatchObject({ kind: "snapshot", follow: false });
    // Another network in the same global is a different story: it pins.
    expect(metaSnapSelectActions({ ...SEL, metaId: "other" }, GLOBAL, { block: null, metaSnap: live, following: true, inspect: null })[0]).toMatchObject({ kind: "snapshot", follow: false });
  });

  it("commits the tick, then the network INSIDE that tick, then the subject — and NEVER the filter", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: null, inspect: null });
    expect(a).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: LISTED, globalOrdinal: 4200 } },
      { kind: "metaSnap", sel: SEL },
    ]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
  });

  it("an UNKNOWN-lane tile (raw unlisted address) commits the UNLISTED network as its rung", () => {
    const un: MetaSnapSel = { metaId: "DAGunlisted123", ordinal: 9, hash: "", globalOrdinal: 4200, ts: "t" };
    const a = metaSnapSelectActions(un, GLOBAL, { block: null, metaSnap: null, inspect: null });
    expect(netKeyOf("DAGunlisted123")).toBe("unlisted");
    expect(a).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: "unlisted", globalOrdinal: 4200 } },
      { kind: "metaSnap", sel: un },
    ]);
  });

  it("steps back ONE rung — to the network in the tick — when the same tile is picked again", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: { ...SEL }, inspect: null });
    expect(a).toEqual([{ kind: "metaSnap", sel: null }]);
  });

  it("while FOLLOWING, re-picking the auto-selected tile converts it to a pin rather than deselecting", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { block: null, metaSnap: { ...SEL }, following: true, inspect: null });
    // The pin commits the same full ancestry a fresh select does: tick → network → snapshot.
    expect(a.map((x) => x.kind)).toEqual(["snapshot", "tickNet", "metaSnap"]);
  });
});

describe("metaSnapArrivalActions (the raw layer opens on a subject)", () => {
  const LISTED = METAGRAPHS[0].id;
  const SEL: MetaSnapSel = { metaId: LISTED, ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };

  it("pins the tick and the subject but NEVER the filter — an arrival is not a click on a network", () => {
    const a = metaSnapArrivalActions(SEL, GLOBAL, null);
    expect(a).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: SEL.metaId, globalOrdinal: GLOBAL.data.ordinal } },
      { kind: "metaSnap", sel: SEL },
    ]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
  });

  it("a seam row (no snapshot) clears the tick-local network with the snapshot", () => {
    expect(metaSnapArrivalActions(null, GLOBAL, null)).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: null },
      { kind: "metaSnap", sel: null },
    ]);
  });

  it("moving to another network in the tick drops a node committed under the old one", () => {
    const a = tickNetSelectActions("paca", GLOBAL, { block: null, metaSnap: null, hasInspect: true, net: "dor" });
    expect(a[0]).toEqual({ kind: "inspect", pick: null });
    expect(tickNetSelectActions("dor", GLOBAL, { block: null, metaSnap: null, hasInspect: true, net: "dor" }).some((x) => x.kind === "inspect")).toBe(false);
  });

  it("follow is false so the pane's deep read actually fires — the arrival IS the gesture", () => {
    const snap = metaSnapArrivalActions(SEL, GLOBAL, null).find((x) => x.kind === "snapshot");
    expect(snap).toMatchObject({ follow: false });
  });
});

describe("bandSelectActions (a band on the byte bar)", () => {
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };
  const SEL: MetaSnapSel = { metaId: "DAG-A", ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };

  // A band is the metagraph × the tick — the PAIR — and since 2026-10-02 the network half is the
  // tick-local commit, not the app filter (the same rule the tile and the pager's ∨ take): only the
  // top bar's picker and the Hypergraph's hub and rows set the filter.
  it("selects the tick and the network inside it, drops the finer tile, and never the filter", () => {
    const a = bandSelectActions("DAG-A", GLOBAL, { block: null, metaSnap: SEL });
    expect(a).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: "DAG-A", globalOrdinal: 4200 } },
    ]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
  });

  it("an unlisted band commits the unlisted network inside the tick, and no filter", () => {
    const a = bandSelectActions("unlisted", GLOBAL, { block: null, metaSnap: null });
    expect(a).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: "unlisted", globalOrdinal: 4200 } },
    ]);
  });
});

describe("the tick-local network (the ledger's Metagraph rung without the filter)", () => {
  // Two CATALOGUED networks: an id the catalog does not know is the unlisted network's (`netKeyOf`).
  const NET_A = METAGRAPHS[0]!.id;
  const NET_B = METAGRAPHS[1]!.id;
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };
  const NET = { metaId: NET_A, globalOrdinal: 4200 };
  const CHILD: MetaSnapSel = { metaId: NET_A, ordinal: 7, hash: "h", globalOrdinal: 4200, ts: "t" };

  // The pager's ∨ from the tick card and its ‹ › between the tick's networks (user, 2026-10-02:
  // "it correctly filters out the related metagraphs but it should not actually set the metagraph
  // as the global application filter").
  it("tickNetSelectActions: pins the tick and commits the network inside it — never the filter", () => {
    const a = tickNetSelectActions(NET_A, GLOBAL, { block: null, metaSnap: null });
    expect(a).toEqual([
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: NET },
    ]);
    expect(a.some((x) => x.kind === "filter")).toBe(false);
  });

  it("tickNetSelectActions: stepping to ANOTHER network drops the snapshot that belonged to the first", () => {
    const a = tickNetSelectActions(NET_B, GLOBAL, { block: null, metaSnap: CHILD });
    expect(a).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: GLOBAL, follow: false },
      { kind: "tickNet", sel: { metaId: NET_B, globalOrdinal: 4200 } },
    ]);
    // …and re-committing the SAME network keeps the snapshot under it.
    expect(tickNetSelectActions(NET_A, GLOBAL, { block: null, metaSnap: CHILD }).some((x) => x.kind === "metaSnap")).toBe(false);
  });

  it("tickNetClearActions: the card's × clears what hangs under it, finest first, and leaves the tick", () => {
    expect(tickNetClearActions({ metaSnap: CHILD, hasInspect: true })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "metaSnap", sel: null },
      { kind: "tickNet", sel: null },
    ]);
    expect(tickNetClearActions({ metaSnap: null })).toEqual([{ kind: "tickNet", sel: null }]);
  });

  it("a DIFFERENT tick drops the network that was committed inside the old one", () => {
    const other = { ...GLOBAL, data: { ...GLOBAL.data, ordinal: 4201 }, title: "Global snapshot #4201" };
    expect(snapshotSelectActions(other, false, { pinnedOrdinal: 4200, metaSnap: null, tickNet: NET })).toEqual([
      { kind: "tickNet", sel: null },
      { kind: "snapshot", pick: other, follow: false },
    ]);
    // The same tick re-committed (a band, a tile) keeps it.
    expect(snapshotSelectActions(GLOBAL, false, { pinnedOrdinal: null, metaSnap: null, tickNet: NET }).some((x) => x.kind === "tickNet")).toBe(false);
  });

  it("clearing the tick clears the network inside it", () => {
    expect(snapshotClearActions({ metaSnap: CHILD, tickNet: NET })).toEqual([
      { kind: "metaSnap", sel: null },
      { kind: "tickNet", sel: null },
      { kind: "snapshot", pick: null, follow: true },
    ]);
  });
});

describe("sameMetaSnap", () => {
  const SEL: MetaSnapSel = { metaId: "DAG-A", ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };

  it("matches on the metagraph and its own ordinal", () => {
    expect(sameMetaSnap(SEL, { ...SEL })).toBe(true);
    expect(sameMetaSnap(SEL, { ...SEL, ordinal: 1 })).toBe(false);
    expect(sameMetaSnap(SEL, null)).toBe(false);
    expect(sameMetaSnap(null, null)).toBe(true);
  });
});

// A NOTABLE DAY BELONGS TO A CHART (user, 2026-10-30: "if we click it and it selects the range it
// should also set the related explorer filter accordingly so the correct chart shows up"): under
// All the click brings that day's plane forward, the explorer row's own commit. It is a focus and
// never the filter, and it never toggles a plane already forward off.
describe("noteDayActions — a notable day's plane", () => {
  it("under All, focuses the day's network, or the hypergraph's plane for a whole-network day", () => {
    expect(noteDayActions("dor", "all", null)).toEqual([{ kind: "trendFocus", id: "dor" }]);
    expect(noteDayActions(null, "all", null)).toEqual([{ kind: "trendFocus", id: "dag" }]);
    expect(noteDayActions("dor", "all", "bio")).toEqual([{ kind: "trendFocus", id: "dor" }]);
  });
  it("a plane already forward stays forward: no toggle off", () => {
    expect(noteDayActions("dor", "all", "dor")).toEqual([]);
    expect(noteDayActions(null, "all", "dag")).toEqual([]);
  });
  it("a filter already scopes the stack, and the click never writes it", () => {
    expect(noteDayActions("dor", "dor", null)).toEqual([]);
    expect(noteDayActions("bio", "dag", null)).toEqual([]);
    for (const a of noteDayActions("dor", "all", null)) expect(a.kind).not.toBe("filter");
  });
});

describe("trendPlaneActions — a plane click in the History view (2026-09-18)", () => {
  // ⚠️ A PLANE CLICK IS FOCUS ONLY, and that is a decision, not an omission. In this view a
  // committed network FILTER scopes the stack down to that one network — so committing the
  // plane's network on a click would make the other four planes VANISH, which is the opposite of
  // the focused state the gesture exists to reach ("the clicked layer comes forward, the rest
  // hold their depth order behind it"). The top-bar filter stays the separate way to scope.
  it("focuses the plane that was clicked", () => {
    expect(trendPlaneActions("elpaca", null)).toEqual([{ kind: "trendFocus", id: "elpaca" }]);
  });

  it("re-clicking the FOCUSED plane releases it (one toggle language everywhere)", () => {
    expect(trendPlaneActions("elpaca", "elpaca")).toEqual([{ kind: "trendFocus", id: null }]);
  });

  it("moves the focus straight across from another plane", () => {
    expect(trendPlaneActions("elpaca", "dor-metagraph")).toEqual([{ kind: "trendFocus", id: "elpaca" }]);
  });

  it("leaves the filter, the inspect and the snapshot subjects untouched", () => {
    // The whole action list, in every state the click can be made from — nothing else commits.
    for (const current of [null, "elpaca", "dor-metagraph"]) {
      expect(kinds(trendPlaneActions("elpaca", current))).toEqual(["trendFocus"]);
    }
  });
});

// THE AI CARD'S PROVIDER ROW (user, 2026-10-31): the row names a provider, not a place the reader
// has drilled into, so it brings its country along.
describe("noteCohortActions", () => {
  const c = { cc: "DE", city: "Falkenstein", isp: "Hetzner" };
  it("commits the country, then the cohort", () => {
    expect(noteCohortActions(c, { country: null, cohort: null, hasInspect: false })).toEqual([
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: c },
    ]);
  });
  it("leaves a country that already stands, and drops a finer node first", () => {
    expect(noteCohortActions(c, { country: "DE", cohort: null, hasInspect: true })).toEqual([
      { kind: "inspect", pick: null },
      { kind: "cohort", sel: c },
    ]);
  });
  it("the same row again releases the cohort, one toggle language", () => {
    expect(noteCohortActions(c, { country: "DE", cohort: c, hasInspect: false })).toEqual([{ kind: "cohort", sel: null }]);
  });
});

// THE HYPERGRAPH RAIL BROWSES (user, 2026-10-31): a step on the Metagraph card changes what the rail
// and the scene stand on, and the top bar stays what the reader set.
describe("railNetActions", () => {
  it("browses a network and never writes the filter", () => {
    expect(railNetActions("dor", "all")).toEqual([{ kind: "railNet", id: "dor" }]);
    expect(railNetActions("dor", "dag")).toEqual([{ kind: "railNet", id: "dor" }]);
  });
  it("stepping onto the filter's own network ends the browse: nothing left to differ", () => {
    expect(railNetActions("dag", "dag")).toEqual([{ kind: "railNet", id: null }]);
  });
});

// ONE RULE (user, 2026-11-02: "yes make it one rule everywhere"): only the top bar sets the filter.
// Hypergraph's rows, hubs, nodes and groups stand the view on a network the way the rail does.
describe("a network picked in the view", () => {
  it("a row steps onto a network, and back off the one the view stands on", () => {
    expect(railNetActions("dor", "all")).toEqual([{ kind: "railNet", id: "dor" }]);
    expect(railNetActions("dor", "usdc")).toEqual([{ kind: "railNet", id: "dor" }]);
    expect(railNetActions("dor", "dor")).toEqual([{ kind: "railNet", id: null }]);
  });
  it("no gesture in the table sets the filter but the picker's own", () => {
    const src = readFileSync("src/engine/domain/pickActions.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src.match(/\{ kind: "filter", id:[^}]*\}/g)).toEqual(['{ kind: "filter", id: id !== "all" && id === currentFilter ? "all" : id }']);
  });
});

// THE BLOCKS REGISTER'S SUBJECT (2026-11-05): a block is a SLOT under its accepting global, like a
// metagraph snapshot tile, not a focus rung. Selecting one pins the global that carries it, so the
// tick is the card above; the same block again releases the block alone.
describe("blockSelectActions / blockClearActions (a block in the Blocks register)", () => {
  const b: BlockSel = { chain: "dag", hash: "h1", ordinal: 7241523, anchorOrd: 7241523 };
  const global = { kind: "snapshot", data: { ordinal: 7241523 } } as unknown as SnapPick;
  const blockPick = { kind: "block", sel: b, global } as unknown as PickDescriptor;
  it("a new block pins its accepting global, then commits the block, in that order", () => {
    const a = blockSelectActions(b, global, { block: null, pinnedOrdinal: null });
    expect(a).toEqual([
      { kind: "snapshot", pick: global, follow: false },
      { kind: "block", sel: b },
    ]);
    expect(a[0].kind === "snapshot" && a[0].pick?.data.ordinal).toBe(7241523);
  });
  it("the same block again releases the block alone", () => {
    expect(blockSelectActions(b, global, { block: { ...b }, pinnedOrdinal: 7241523 })).toEqual([{ kind: "block", sel: null }]);
  });
  it("another block in the tick already pinned commits the block without re-pinning", () => {
    const other: BlockSel = { ...b, hash: "h2" };
    expect(blockSelectActions(other, global, { block: b, pinnedOrdinal: 7241523 })).toEqual([{ kind: "block", sel: other }]);
  });
  it("a block on another tick drops the snapshot and network held under the old tick first", () => {
    const ms = { metaId: "dor", ordinal: 5, hash: "x", globalOrdinal: 1, ts: "t" } as MetaSnapSel;
    expect(kinds(blockSelectActions(b, global, { block: null, pinnedOrdinal: 1, metaSnap: ms, tickNet: { metaId: "dor", globalOrdinal: 1 } })))
      .toEqual(["metaSnap", "tickNet", "snapshot", "block"]);
  });
  // LIVE FOLLOWS THE NEWEST BLOCK (D3): while following, the Block card shows the live block, which
  // no reader picked — a click on it PINS it (the auto-followed metagraph snapshot's rule: never a
  // silent deselect), and a click on another block pins that one.
  it("while following, clicking the live block pins it in place (never a silent deselect)", () => {
    expect(blockSelectActions(b, global, { block: { ...b }, pinnedOrdinal: null, following: true })).toEqual([
      { kind: "snapshot", pick: global, follow: false },
      { kind: "block", sel: b },
    ]);
  });
  it("while following, another block pins its own global and commits it", () => {
    const other: BlockSel = { ...b, hash: "h2" };
    expect(blockSelectActions(other, global, { block: b, pinnedOrdinal: null, following: true })).toEqual([
      { kind: "snapshot", pick: global, follow: false },
      { kind: "block", sel: other },
    ]);
  });
  it("the Block card's LIVE / PINNED control: LIVE pins the live block and ranks it, PINNED resumes live", () => {
    expect(blockFollowActions(b, global, true)).toEqual([
      { kind: "snapshot", pick: global, follow: false },
      { kind: "block", sel: b },
    ]);
    // Resuming keeps the Block card the reader's box: the block is re-committed LAST (it ranks), and
    // the follow's next beat re-seats it on the newest block.
    expect(blockFollowActions(b, global, false)).toEqual([
      { kind: "tickNet", sel: null },
      { kind: "snapshot", pick: global, follow: true },
      { kind: "block", sel: b },
    ]);
  });
  it("a scene click on the live block runs the same builder", () => {
    const current = { ...state(), pinnedOrdinal: null, metaSnap: null, block: b, following: true };
    expect(clickActions({ mode: "ledger", pick: blockPick, countryCc: null, current })).toEqual(
      blockSelectActions(b, global, { block: b, pinnedOrdinal: null, metaSnap: null, following: true }),
    );
  });
  // A TOKEN BLOCK COMMITS ITS SNAPSHOT TOO (user, 2026-11-07): the rail reads Metagraph → Metagraph
  // snapshot → Block, the block last so its card is the box.
  it("a token block pins its global, commits its network and snapshot, then the block", () => {
    const tb: BlockSel = { chain: "dor", hash: "t1", ordinal: 51, anchorOrd: 7241523 };
    const snap = { metaId: "dor", ordinal: 51, hash: "m51", globalOrdinal: 7241523, ts: "t" } as MetaSnapSel;
    expect(blockSelectActions(tb, global, { block: null, pinnedOrdinal: null }, snap)).toEqual([
      { kind: "snapshot", pick: global, follow: false },
      { kind: "tickNet", sel: { metaId: netKeyOf("dor"), globalOrdinal: 7241523 } },
      { kind: "metaSnap", sel: snap },
      { kind: "block", sel: tb },
    ]);
    // Its snapshot already committed: the network is restated, the snapshot not re-committed.
    expect(kinds(blockSelectActions(tb, global, { block: null, pinnedOrdinal: 7241523, metaSnap: snap }, snap))).toEqual(["tickNet", "block"]);
    // A node of another network cannot sit under the snapshot: released first, as the tile click does.
    const node = { kind: "l0", node: { ip: "1", id: "n" } } as unknown as PickDescriptor; // a DAG validator: not DOR's
    expect(kinds(blockSelectActions(tb, global, { block: null, pinnedOrdinal: null, inspect: node }, snap))).toEqual(["inspect", "snapshot", "tickNet", "metaSnap", "block"]);
    // A scene pick carries the snapshot; the builder reads it.
    const tokenPick = { kind: "block", sel: tb, global, snap } as unknown as PickDescriptor;
    expect(clickActions({ mode: "ledger", pick: tokenPick, countryCc: null, current: { ...state(), pinnedOrdinal: null, metaSnap: null, block: null } })).toEqual(
      blockSelectActions(tb, global, { block: null, pinnedOrdinal: null, metaSnap: null, inspect: null }, snap),
    );
  });
  it("the clear releases the block alone, and nothing when none is held", () => {
    expect(blockClearActions({ block: b })).toEqual([{ kind: "block", sel: null }]);
    expect(blockClearActions({ block: null })).toEqual([]);
  });
  it("a scene click on a block runs the same builder (scene click = row select)", () => {
    const current = { ...state(), pinnedOrdinal: null, metaSnap: null, block: null };
    expect(clickActions({ mode: "ledger", pick: blockPick, countryCc: null, current })).toEqual(
      blockSelectActions(b, global, { block: null, pinnedOrdinal: null, metaSnap: null }),
    );
  });
  // A BLOCK IS IN EXACTLY ONE SNAPSHOT: every builder that pins a tick releases a block of another
  // tick, finest first, and keeps a block of the tick it pins.
  const other = { kind: "snapshot", data: { ordinal: 9 } } as unknown as SnapPick;
  const ms9: MetaSnapSel = { metaId: "dor", ordinal: 5, hash: "x", globalOrdinal: 9, ts: "t" };
  // A BLOCK STANDS ONLY IN ITS PLACE (`blockInPlace`, 2026-11-08 — user: a DAG block had been opened
  // under a DED metagraph snapshot): a DAG block is the global's own, a token block its snapshot's.
  // Every builder that commits a parent releases a block the parent leaves out of place.
  const tb: BlockSel = { chain: "dor", hash: "t1", ordinal: 5, anchorOrd: 7241523 };
  const tbSnap: MetaSnapSel = { metaId: "dor", ordinal: 5, hash: "m5", globalOrdinal: 7241523, ts: "t" };
  it("blockInPlace — a DAG block under the global alone; a token block under its own snapshot and network", () => {
    expect(blockInPlace(b, { globalOrdinal: 7241523 })).toBe(true);
    expect(blockInPlace(b, { globalOrdinal: 9 })).toBe(false);
    expect(blockInPlace(b, { metaSnap: tbSnap })).toBe(false); // a DAG block under a metagraph snapshot
    expect(blockInPlace(b, { tickNet: { metaId: "dor" } })).toBe(false); // …or under a network's card
    expect(blockInPlace(b, { tickNet: { metaId: "dag" } })).toBe(true);
    expect(blockInPlace(tb, { globalOrdinal: 7241523, metaSnap: tbSnap, tickNet: { metaId: "dor" } })).toBe(true);
    expect(blockInPlace(tb, { metaSnap: { ...tbSnap, ordinal: 6 } })).toBe(false); // another snapshot of its network
    expect(blockInPlace(tb, { tickNet: { metaId: "ded" } })).toBe(false); // another network
    expect(blockInPlace(tb, { metaSnap: null })).toBe(true); // no snapshot shown yet: nothing contradicts it
    expect(blockInPlace(tb, {})).toBe(true);
  });
  it("a tile on another tick drops the block; a tile of another network or of the DAG's own tick drops a DAG block too; a token block's own tile keeps it", () => {
    expect(kinds(metaSnapSelectActions(ms9, other, { metaSnap: null, inspect: null, block: b }))).toEqual(["block", "snapshot", "tickNet", "metaSnap"]);
    const own: MetaSnapSel = { ...ms9, globalOrdinal: 7241523 };
    expect(kinds(metaSnapSelectActions(own, global, { metaSnap: null, inspect: null, block: b }))).toEqual(["block", "snapshot", "tickNet", "metaSnap"]);
    expect(kinds(metaSnapSelectActions(tbSnap, global, { metaSnap: null, inspect: null, block: tb }))).toEqual(["snapshot", "tickNet", "metaSnap"]);
    expect(kinds(metaSnapSelectActions({ ...tbSnap, ordinal: 6 }, global, { metaSnap: null, inspect: null, block: tb }))).toEqual(["block", "snapshot", "tickNet", "metaSnap"]);
  });
  it("a step inside the live pair drops a block the new snapshot cannot hold", () => {
    const live: MetaSnapSel = { ...ms9, ordinal: 4 };
    expect(kinds(metaSnapSelectActions(ms9, other, { metaSnap: live, following: true, inspect: null, block: b }))).toEqual(["block", "metaSnap"]);
    const liveOwn: MetaSnapSel = { ...tbSnap, ordinal: 4 };
    expect(kinds(metaSnapSelectActions(tbSnap, global, { metaSnap: liveOwn, following: true, inspect: null, block: tb }))).toEqual(["metaSnap"]);
  });
  it("a band drops a block of another tick or another chain; a token block's own network keeps it", () => {
    expect(kinds(bandSelectActions("dor", other, { metaSnap: null, block: b }))).toEqual(["block", "snapshot", "tickNet"]);
    expect(kinds(bandSelectActions("dor", global, { metaSnap: null, block: b }))).toEqual(["block", "snapshot", "tickNet"]);
    expect(kinds(bandSelectActions("dor", global, { metaSnap: null, block: tb }))).toEqual(["snapshot", "tickNet"]);
    expect(kinds(bandSelectActions("ded", global, { metaSnap: null, block: tb }))).toEqual(["block", "snapshot", "tickNet"]);
  });
  it("a network inside a tick drops a block that is not that network's; its own keeps it", () => {
    expect(kinds(tickNetSelectActions("dor", other, { metaSnap: null, block: b }))).toEqual(["block", "snapshot", "tickNet"]);
    expect(kinds(tickNetSelectActions("dor", global, { metaSnap: null, block: b }))).toEqual(["block", "snapshot", "tickNet"]);
    expect(kinds(tickNetSelectActions("dor", global, { metaSnap: null, block: tb }))).toEqual(["snapshot", "tickNet"]);
  });
  it("a DAG block's commit releases a metagraph snapshot or network standing in its own tick (its place is the global alone)", () => {
    const ms = { metaId: "ded", ordinal: 5, hash: "x", globalOrdinal: 7241523, ts: "t" } as MetaSnapSel;
    expect(kinds(blockSelectActions(b, global, { block: null, pinnedOrdinal: 7241523, metaSnap: ms, tickNet: { metaId: "ded", globalOrdinal: 7241523 } }))).toEqual(["metaSnap", "tickNet", "block"]);
    // A token block restates its own parents and leaves a foreign one through them.
    expect(kinds(blockSelectActions(tb, global, { block: null, pinnedOrdinal: 7241523, metaSnap: ms, tickNet: { metaId: "ded", globalOrdinal: 7241523 } }, tbSnap))).toEqual(["tickNet", "metaSnap", "block"]);
  });
  it("the metagraph snapshot card's × takes what hangs under it: its data block, a token block it accepted — never a DAG block, which is the global's", () => {
    const db = { snap: tbSnap, index: 0 };
    expect(kinds(metaSnapClearActions({ metaSnap: tbSnap, block: tb, dataBlock: db }))).toEqual(["dataBlock", "block", "metaSnap"]);
    expect(kinds(metaSnapClearActions({ metaSnap: tbSnap, block: b }))).toEqual(["metaSnap"]);
    expect(kinds(metaSnapClearActions({ metaSnap: { ...tbSnap, ordinal: 6 }, block: tb }))).toEqual(["metaSnap"]);
    expect(metaSnapClearActions({ metaSnap: null, block: tb })).toEqual([]);
  });
  it("the raw layer's arrival on another tick drops the block; on its own tick keeps it", () => {
    expect(kinds(metaSnapArrivalActions(null, other, b))).toEqual(["block", "snapshot", "tickNet", "metaSnap"]);
    expect(kinds(metaSnapArrivalActions(null, global, b))).toEqual(["snapshot", "tickNet", "metaSnap"]);
  });
  it("resuming live releases the block whatever tick is shown; pinning the shown tick keeps its own block", () => {
    expect(kinds(followToggleActions(global, false, b))).toEqual(["block", "tickNet", "snapshot"]);
    expect(kinds(followToggleActions(global, true, b))).toEqual(["snapshot"]);
    expect(kinds(followToggleActions(other, true, b))).toEqual(["block", "snapshot"]);
    expect(followToggleActions(other, false, null)).toEqual([{ kind: "tickNet", sel: null }, { kind: "snapshot", pick: other, follow: true }]);
  });
  it("a tick select drops a block that tick cannot contain, and the tick's clear takes it along", () => {
    const other = { kind: "snapshot", data: { ordinal: 9 } } as unknown as SnapPick;
    expect(kinds(snapshotSelectActions(other, false, { pinnedOrdinal: null, metaSnap: null, block: b }))).toEqual(["block", "snapshot"]);
    expect(kinds(snapshotSelectActions(global, false, { pinnedOrdinal: null, metaSnap: null, block: b }))).toEqual(["snapshot"]);
    expect(kinds(snapshotClearActions({ metaSnap: null, block: b }))).toEqual(["block", "snapshot"]);
  });
});

describe("registerSwitchActions (switching the Snapshots view's register)", () => {
  const b = { chain: "dag", hash: "h1", anchorOrd: 42 } as unknown as BlockSel;
  const m = { metaId: "dor", ordinal: 7, globalOrdinal: 42 } as unknown as MetaSnapSel;

  it("entering a register releases a metagraph snapshot KNOWN not to be its subject, keeps one that is or one not yet judged (2026-11-08)", () => {
    expect(registerSwitchActions("blocks", { block: null, metaSnap: m }, false)).toEqual([{ kind: "metaSnap", sel: null }]);
    expect(registerSwitchActions("blocks", { block: null, metaSnap: m }, true)).toEqual([]);
    expect(registerSwitchActions("blocks", { block: null, metaSnap: m }, undefined)).toEqual([]);
    expect(registerSwitchActions("data", { block: null, metaSnap: m }, false)).toEqual([{ kind: "metaSnap", sel: null }]);
  });

  it("entering Snapshots releases the block", () => {
    expect(registerSwitchActions("snapshots", { block: b, metaSnap: null })).toEqual([{ kind: "block", sel: null }]);
  });

  it("releases nothing when the subject belongs to the register being entered, or nothing is held", () => {
    expect(registerSwitchActions("blocks", { block: b, metaSnap: null })).toEqual([]);
    expect(registerSwitchActions("snapshots", { block: null, metaSnap: m })).toEqual([]);
    expect(registerSwitchActions("blocks", { block: null, metaSnap: null })).toEqual([]);
    // Finest first: the data block, the block, then the snapshot.
    const db = { snap: m, index: 0 };
    expect(registerSwitchActions("snapshots", { block: b, metaSnap: m, dataBlock: db }, true).map((a) => a.kind)).toEqual(["dataBlock", "block"]);
    expect(registerSwitchActions("blocks", { block: null, metaSnap: m, dataBlock: db }, false).map((a) => a.kind)).toEqual(["dataBlock", "metaSnap"]);
  });

  it("entering Data blocks releases the block and KEEPS the metagraph snapshot — its subjects are the Snapshots register's own (D6)", () => {
    expect(registerSwitchActions("data", { block: b, metaSnap: null })).toEqual([{ kind: "block", sel: null }]);
    expect(registerSwitchActions("data", { block: null, metaSnap: m })).toEqual([]);
    // …and leaving it for Metagraph snapshots releases nothing new.
    expect(registerSwitchActions("snapshots", { block: null, metaSnap: m })).toEqual([]);
  });
});

describe("globalPick and tickContextOf — the descriptor and the context every surface hands the builders (R1, P6)", () => {
  const g = { ordinal: 42, timestamp: "2026-11-07T10:00:00.000Z", hash: "h" } as unknown as Extract<PickDescriptor, { kind: "snapshot" }>["data"];
  it("globalPick: a global snapshot as a pick, titled by its ordinal", () => {
    expect(globalPick(g)).toEqual({ kind: "snapshot", title: "Global snapshot #42", data: g });
  });
  it("tickContextOf: the pin only while pinned; live is no pin; the finer slots as they stand, block always present", () => {
    const snap = globalPick(g);
    const block: BlockSel = { chain: "dag", hash: "b", ordinal: 42, anchorOrd: 42 };
    expect(tickContextOf({ following: false, snap, metaSnap: null, tickNet: null, block })).toEqual({ pinnedOrdinal: 42, metaSnap: null, tickNet: null, block, following: false, inspect: null });
    expect(tickContextOf({ following: true, snap, metaSnap: null, tickNet: null, block: null }).pinnedOrdinal).toBeNull();
    expect(tickContextOf({ following: false, snap: null, metaSnap: null }).pinnedOrdinal).toBeNull();
    // An absent finer slot is null, never undefined — the builders that require `block` get one.
    expect(tickContextOf({ following: false, snap: null, metaSnap: null })).toMatchObject({ block: null, tickNet: null });
    // The context drives the builders as the hand-built one did: re-clicking the pinned tick releases it.
    expect(snapshotSelectActions(snap, false, tickContextOf({ following: false, snap, metaSnap: null, block: null }))).toEqual(
      snapshotSelectActions(snap, false, { pinnedOrdinal: 42, metaSnap: null, tickNet: null, block: null }),
    );
  });
});

// THE DATA BLOCK (the Data blocks register, 2026-11-07): a slot under the metagraph snapshot that
// carried it — the snapshot's chain first, the data block last so its card is the box.
describe("dataBlockSelectActions / dataBlockClearActions", () => {
  const global = { kind: "snapshot", data: { ordinal: 42 } } as unknown as SnapPick;
  const ms = { metaId: "dor", ordinal: 5, hash: "m5", globalOrdinal: 42, ts: "t" } as MetaSnapSel;
  const db = { snap: ms, index: 1 };
  it("commits the snapshot's chain then the data block; the same snapshot pinned, the data block alone", () => {
    expect(kinds(dataBlockSelectActions(db, global, { dataBlock: null, metaSnap: null, inspect: null, block: null }))).toEqual(["snapshot", "tickNet", "metaSnap", "dataBlock"]);
    expect(dataBlockSelectActions(db, global, { dataBlock: null, metaSnap: ms, following: false, inspect: null, block: null })).toEqual([{ kind: "dataBlock", sel: db }]);
    // Another block of the same pinned snapshot: the old one released first, finest first.
    expect(kinds(dataBlockSelectActions({ snap: ms, index: 0 }, global, { dataBlock: db, metaSnap: ms, following: false, inspect: null, block: null }))).toEqual(["dataBlock", "dataBlock"]);
  });
  it("the same data block again releases it alone; following, the snapshot is pinned first", () => {
    expect(dataBlockSelectActions(db, global, { dataBlock: db, metaSnap: ms, inspect: null, block: null })).toEqual([{ kind: "dataBlock", sel: null }]);
    expect(kinds(dataBlockSelectActions(db, global, { dataBlock: null, metaSnap: ms, following: true, inspect: null, block: null }))).toEqual(["snapshot", "tickNet", "metaSnap", "dataBlock"]);
  });
  it("another snapshot's commit releases the data block first (metaSnapSelectActions), and so does the tick's clear and a register switch", () => {
    const other = { ...ms, ordinal: 6 };
    expect(kinds(metaSnapSelectActions(other, global, { metaSnap: ms, inspect: null, block: null, dataBlock: db }))).toContain("dataBlock");
    expect(kinds(metaSnapSelectActions(ms, global, { metaSnap: null, inspect: null, block: null, dataBlock: db }))).not.toContain("dataBlock");
    expect(kinds(snapshotClearActions({ metaSnap: ms, dataBlock: db }))[0]).toBe("dataBlock");
    expect(registerSwitchActions("snapshots", { block: null, metaSnap: ms, dataBlock: db })).toEqual([{ kind: "dataBlock", sel: null }]);
    expect(registerSwitchActions("data", { block: null, metaSnap: ms, dataBlock: db })).toEqual([]);
  });
  it("the clear and the identity", () => {
    expect(dataBlockClearActions({ dataBlock: db })).toEqual([{ kind: "dataBlock", sel: null }]);
    expect(dataBlockClearActions({ dataBlock: null })).toEqual([]);
    expect(sameDataBlock(db, { snap: { ...ms }, index: 1 })).toBe(true);
    expect(sameDataBlock(db, { snap: ms, index: 2 })).toBe(false);
    expect(sameDataBlock(null, db)).toBe(false);
  });
});
