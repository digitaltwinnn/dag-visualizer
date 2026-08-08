import { describe, it, expect } from "vitest";
import { viewEntryActions, clearAllActions, clickActions, cohortToggleActions, compositionToggleActions, countryToggleActions, filterToggleActions, followToggleActions, nodeSelectActions, sameCohort, sameComposition, snapshotSelectActions, pickActive, pickNetId, metaSnapSelectActions, bandSelectActions, sameMetaSnap, type ClickAction } from "./pickActions";
import { finerLevels } from "./focusLadder";
import { METAGRAPHS } from "../config";
import type { PickDescriptor, MetaSnapSel } from "@/src/data/types";

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
      { kind: "filter", id: "dor" },
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
  it("GEO: filter FIRST, then the node's country + cohort (full-ancestry rule), inspect LAST", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state() });
    expect(acts).toEqual([
      { kind: "filter", id: "dor" },
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: { cc: "DE", city: null, isp: null } },
      { kind: "inspect", pick: p },
    ]);
  });
  it("GEO: the filter step is SKIPPED when the node's network is already selected (no drill churn)", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state({ filter: "dor" }) });
    expect(kinds(acts)).toEqual(["country", "cohort", "inspect"]);
  });
  it("GEO: a node without a resolvable country skips the drill (no country action)", () => {
    const acts = clickActions({ mode: "geo", pick: nodePick(null), countryCc: null, current: state() });
    expect(kinds(acts)).toEqual(["filter", "inspect"]);
  });
  it("GEO: a validator drills the DAG core + its country", () => {
    const acts = clickActions({ mode: "geo", pick: validatorPick(), countryCc: null, current: state() });
    expect(acts[0]).toEqual({ kind: "filter", id: "dag" });
    expect(acts[1]).toEqual({ kind: "country", cc: "US" });
  });
  it("HYPER: filter + inspect only — no country (a geo concept), no autoRotate stop", () => {
    const p = nodePick("DE");
    expect(kinds(clickActions({ mode: "hyper", pick: p, countryCc: null, current: state() }))).toEqual([
      "filter",
      "inspect",
    ]);
  });
  it("LEDGER: filter + inspect — no floor ancestry (layers retired 2026-08-06), no geo drills", () => {
    const p = nodePick("DE");
    expect(kinds(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() }))).toEqual([
      "filter",
      "inspect",
    ]);
  });
});

describe("clickActions — flat/placeholder + non-geo safety (the table gates itself)", () => {
  it("an empty click does nothing in ANY non-geo view, even with a (contract-violating) countryCc", () => {
    for (const mode of ["hyper", "ledger", "status", "transactions", "staking"] as const) {
      expect(clickActions({ mode, pick: null, countryCc: "DE", current: state() })).toEqual([]);
    }
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
  it("nodeSelectActions: the row's re-click deselects (one toggle language everywhere)", () => {
    expect(nodeSelectActions(nodePick(), { mode: "geo", currentFilter: "dor", deselect: true })).toEqual([
      { kind: "inspect", pick: null },
    ]);
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

  it("snapshotSelectActions: the filter RELEASES when its network is absent from the tick", () => {
    const p = snapPick();
    // Absent → the filter steps back to "all" before the pin.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: null, filter: "dor", tickHasFilter: false })).toEqual([
      { kind: "filter", id: "all" },
      { kind: "snapshot", pick: p, follow: false },
    ]);
    // Present → the filter holds (the tick is part of its story).
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: null, filter: "dor", tickHasFilter: true })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
    // "all" / unknown membership → untouched.
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: null, filter: "all", tickHasFilter: false })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
    expect(snapshotSelectActions(p, false, { pinnedOrdinal: null, metaSnap: null, filter: "dor" })).toEqual([
      { kind: "snapshot", pick: p, follow: false },
    ]);
  });

  it("followToggleActions: the card's live switch flips following, keeping the shown subject", () => {
    const p = snapPick();
    expect(followToggleActions(p, false)).toEqual([{ kind: "snapshot", pick: p, follow: true }]);
    expect(followToggleActions(p, true)).toEqual([{ kind: "snapshot", pick: p, follow: false }]);
  });
});

// Arriving in a view with a node still selected: the view-scoped rungs (cleared on the way out
// by focusLadder.LEVEL_CARRY) must come back, so every parent card up to the selection is on the
// rail again. The drift guard is the equality with nodeSelectActions' own ancestry — the two
// must always name the same rungs.
describe("viewEntryActions (a carried node's ancestry in the destination view)", () => {
  const COMP = { netId: "dor", key: "Hybrid|L0,cL1" };
  const ancestryOf = (acts: ClickAction[]) => acts.filter((a) => a.kind !== "filter" && a.kind !== "inspect");

  it("geo: re-commits the node's country AND provider cohort", () => {
    const p = nodePick("DE");
    expect(viewEntryActions({ mode: "geo", pick: p })).toEqual([
      { kind: "country", cc: "DE" },
      { kind: "cohort", sel: { cc: "DE", city: null, isp: null } },
    ]);
  });

  it("hyper: re-commits the node's composition group", () => {
    expect(viewEntryActions({ mode: "hyper", pick: nodePick(), compositionSel: COMP })).toEqual([
      { kind: "composition", sel: COMP },
    ]);
  });

  it("ledger: contributes nothing — its floors/containers are visual aid (layer retired 2026-08-06)", () => {
    expect(viewEntryActions({ mode: "ledger", pick: nodePick() })).toEqual([]);
  });

  it("names exactly the rungs a node CLICK in that view commits (no drift)", () => {
    const p = nodePick("DE");
    for (const mode of ["geo", "hyper", "ledger"] as const) {
      expect(viewEntryActions({ mode, pick: p, compositionSel: COMP })).toEqual(
        ancestryOf(nodeSelectActions(p, { mode, currentFilter: "dor", compositionSel: COMP })),
      );
    }
  });

  it("has nothing to say without a node selection (a dossier or a snapshot carries no ancestry)", () => {
    expect(viewEntryActions({ mode: "geo", pick: null })).toEqual([]);
    expect(viewEntryActions({ mode: "geo", pick: hubPick() })).toEqual([]);
    expect(viewEntryActions({ mode: "ledger", pick: snapPick() })).toEqual([]);
  });
});

describe("filterToggleActions (the remaining rail interaction)", () => {
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
  it("commits the group, drilling the filter FIRST and dropping a selected node", () => {
    expect(compositionToggleActions(COMP, { composition: null, hasInspect: true, filter: "all" })).toEqual([
      { kind: "filter", id: "dor" },
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
  it("geo: filter → country → cohort → inspect LAST", () => {
    const acts = nodeSelectActions(geoPick, { mode: "geo", currentFilter: "all" });
    expect(acts.map((a) => a.kind)).toEqual(["filter", "country", "cohort", "inspect"]);
    expect(acts[2]).toEqual({ kind: "cohort", sel: { cc: "DE", city: "Falkenstein", isp: "Hetzner" } });
  });
  it("geo: a pick without isp/city still commits its cohort (nullable fields)", () => {
    const p = { kind: "l0", node: { id: "x" }, geo: { cc: "FI" } } as unknown as PickDescriptor;
    const acts = nodeSelectActions(p, { mode: "geo", currentFilter: "dag" });
    expect(acts.find((a) => a.kind === "cohort")).toEqual({ kind: "cohort", sel: { cc: "FI", city: null, isp: null } });
  });
  it("ledger: no layer ancestry (retired 2026-08-06) — filter (if changed) then inspect", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor" });
    expect(acts.map((a) => a.kind)).toEqual(["inspect"]);
  });
  it("hyper: the node's composition GROUP commits before inspect (full ancestry)", () => {
    const acts = nodeSelectActions(geoPick, { mode: "hyper", currentFilter: "all", compositionSel: COMP });
    expect(acts.map((a) => a.kind)).toEqual(["filter", "composition", "inspect"]);
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
  const LISTED = METAGRAPHS[0].id; // the filter-first ancestry only exists for LISTED metagraphs
  const SEL: MetaSnapSel = { metaId: LISTED, ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };

  it("commits ancestry first and the subject last", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: "all", metaSnap: null });
    expect(a.map((x) => x.kind)).toEqual(["filter", "snapshot", "metaSnap"]);
    expect(a[0]).toEqual({ kind: "filter", id: LISTED });
    expect(a[1]).toEqual({ kind: "snapshot", pick: GLOBAL, follow: false });
    expect(a[2]).toEqual({ kind: "metaSnap", sel: SEL });
  });

  it("does not churn the filter when it is already committed", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: LISTED, metaSnap: null });
    expect(a.map((x) => x.kind)).toEqual(["snapshot", "metaSnap"]);
  });

  it("an UNKNOWN-lane tile (raw unlisted address) commits NO filter — just the tick + subject", () => {
    const un: MetaSnapSel = { metaId: "DAGunlisted123", ordinal: 9, hash: "", globalOrdinal: 4200, ts: "t" };
    const a = metaSnapSelectActions(un, GLOBAL, { filter: "all", metaSnap: null });
    expect(a.map((x) => x.kind)).toEqual(["snapshot", "metaSnap"]);
  });

  it("steps back to the tick when the same tile is picked again", () => {
    const a = metaSnapSelectActions(SEL, GLOBAL, { filter: LISTED, metaSnap: { ...SEL } });
    expect(a).toEqual([{ kind: "metaSnap", sel: null }]);
  });
});

describe("bandSelectActions (a band on the byte bar)", () => {
  const GLOBAL = {
    kind: "snapshot" as const,
    data: { ordinal: 4200, timestamp: "t", hash: "g" },
    title: "Global snapshot #4200",
  };
  const SEL: MetaSnapSel = { metaId: "DAG-A", ordinal: 745190, hash: "h1", globalOrdinal: 4200, ts: "t" };

  it("selects the metagraph and the tick, and drops the finer tile", () => {
    const a = bandSelectActions("DAG-A", GLOBAL, { filter: "all", metaSnap: SEL });
    expect(a).toEqual([
      { kind: "filter", id: "DAG-A" },
      { kind: "metaSnap", sel: null },
      { kind: "snapshot", pick: GLOBAL, follow: false },
    ]);
  });

  it("leaves an unlisted band without a filter commit", () => {
    const a = bandSelectActions("unlisted", GLOBAL, { filter: "all", metaSnap: null });
    expect(a).toEqual([{ kind: "snapshot", pick: GLOBAL, follow: false }]);
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

describe("clearAllActions (the rail-controls sweep)", () => {
  it("drops every committed channel finest→coarsest, filter last", () => {
    const acts = clearAllActions({
      hasInspect: true, hasSnap: true, hasMetaSnap: false,
      cohort: { cc: "DE", city: "Falkenstein", isp: "Hetzner" },
      composition: { netId: "dor", key: "Hybrid|L0·dL1" },
      country: "DE", filter: "dor",
    });
    expect(kinds(acts)).toEqual(["inspect", "snapshot", "cohort", "composition", "country", "filter"]);
    expect(acts[acts.length - 1]).toEqual({ kind: "filter", id: "all" });
    // The snapshot clear must not carry `follow` — re-following is the FollowController's.
    expect(acts[1]).toEqual({ kind: "snapshot", pick: null });
  });
  it("already-clear channels emit nothing (a fully clear state is a no-op)", () => {
    expect(clearAllActions({
      hasInspect: false, hasSnap: false, hasMetaSnap: false, cohort: null, composition: null, country: null, filter: "all",
    })).toEqual([]);
  });
  it("a partial state clears only what is set", () => {
    const acts = clearAllActions({
      hasInspect: false, hasSnap: false, hasMetaSnap: false, cohort: null, composition: null, country: null, filter: "dag",
    });
    expect(kinds(acts)).toEqual(["filter"]);
  });
  it("sweeps the metagraph-snapshot slot too", () => {
    const a = clearAllActions({
      hasInspect: false, hasSnap: false, hasMetaSnap: true, cohort: null,
      composition: null, country: null, filter: "all",
    });
    expect(a).toContainEqual({ kind: "metaSnap", sel: null });
  });
});
