import { describe, it, expect } from "vitest";
import { autoLayerForNode, clearAllActions, clickActions, cohortToggleActions, compositionToggleActions, countryToggleActions, filterToggleActions, followToggleActions, layerToggleActions, nodeSelectActions, sameCohort, sameComposition, snapshotSelectActions, pickActive, pickNetId, type ClickAction } from "./pickActions";
import { finerLevels } from "./focusLadder";
import type { PickDescriptor } from "@/src/data/types";

// Minimal pick fixtures — only the fields the table reads.
const nodePick = (cc: string | null = "DE"): PickDescriptor =>
  ({ kind: "metanode", meta: { id: "dor" }, node: { ip: "1.2.3.4" }, geo: cc ? { cc } : {} }) as unknown as PickDescriptor;
const validatorPick = (): PickDescriptor =>
  ({ kind: "l0", node: { id: "abc" }, geo: { cc: "US" } }) as unknown as PickDescriptor;
const hubPick = (): PickDescriptor => ({ kind: "meta", cfg: { id: "dor" } }) as unknown as PickDescriptor;
type SnapPick = Extract<PickDescriptor, { kind: "snapshot" }>;
const snapPick = (): SnapPick => ({ kind: "snapshot", data: { ordinal: 42 } }) as unknown as SnapPick;
type LayerPick = Extract<PickDescriptor, { kind: "layer" }>;
const layerPick = (id = "ml0"): LayerPick => ({ kind: "layer", layerId: id }) as unknown as LayerPick;

const state = (
  over: Partial<{
    filter: string;
    country: string | null;
    hasInspect: boolean;
    layerId: string | null;
    cohort: { cc: string; city: string | null; isp: string | null } | null;
  }> = {},
) => ({
  filter: "all",
  country: null,
  hasInspect: false,
  layerId: null,
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

describe("clickActions — hub / snapshot / layer", () => {
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
  it("a layer plane toggles the committed layer (on, then off on the same plane)", () => {
    const p = layerPick("ml0");
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() })).toEqual([
      { kind: "layer", pick: p },
    ]);
    expect(
      clickActions({ mode: "ledger", pick: p, countryCc: null, current: state({ layerId: "ml0" }) }),
    ).toEqual([{ kind: "layer", pick: null }]);
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
  it("LEDGER: filter + its L0 floor + inspect — no country/cohort drills (those are geo concepts)", () => {
    const p = nodePick("DE");
    expect(kinds(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() }))).toEqual([
      "filter",
      "layer",
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

describe("clickActions — layer SWITCH (a different plane while one is committed)", () => {
  it("commits the newly clicked plane instead of toggling off", () => {
    const p = layerPick("msnap");
    expect(
      clickActions({ mode: "ledger", pick: p, countryCc: null, current: state({ layerId: "ml0" }) }),
    ).toEqual([{ kind: "layer", pick: p }]);
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
  it("non-node picks (snapshot/layer) pass — their view gating is pickSources", () => {
    expect(pickActive(snapPick(), "ledger", "dor", null)).toBe(true);
    expect(pickActive(layerPick(), "ledger", "dor", null)).toBe(true);
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

  it("followToggleActions: the card's live switch flips following, keeping the shown subject", () => {
    const p = snapPick();
    expect(followToggleActions(p, false)).toEqual([{ kind: "snapshot", pick: p, follow: true }]);
    expect(followToggleActions(p, true)).toEqual([{ kind: "snapshot", pick: p, follow: false }]);
  });
});

describe("autoLayerForNode (node selection carrying into Snapshots)", () => {
  it("maps a metagraph node to the metagraph-L0 row", () => {
    expect(autoLayerForNode("metanode")).toBe("ml0");
  });

  it("maps a DAG validator (either shell) to the hypergraph-L0 row", () => {
    expect(autoLayerForNode("l0")).toBe("hypl0");
    expect(autoLayerForNode("l1")).toBe("hypl0");
  });

  it("returns null for non-node picks and no selection (resting overview)", () => {
    expect(autoLayerForNode("meta")).toBe(null);
    expect(autoLayerForNode("snapshot")).toBe(null);
    expect(autoLayerForNode(null)).toBe(null);
    expect(autoLayerForNode(undefined)).toBe(null);
  });
});

describe("layerToggleActions / filterToggleActions (the remaining rail interactions)", () => {
  it("layer rows == the scene's floor-plane toggle (commit, switch, clear)", () => {
    const p = layerPick("ml0");
    expect(layerToggleActions(p, null)).toEqual([{ kind: "layer", pick: p }]);
    expect(layerToggleActions(p, "msnap")).toEqual([{ kind: "layer", pick: p }]);
    expect(layerToggleActions(p, "ml0")).toEqual([{ kind: "layer", pick: null }]);
    // identical to the scene click through clickActions
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state({ layerId: "ml0" }) }))
      .toEqual(layerToggleActions(p, "ml0"));
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
  it("ledger: browser row commits its parent floor before inspect", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor", ledgerLayerId: "ml1" });
    expect(acts.map((a) => a.kind)).toEqual(["layer", "inspect"]);
    expect(acts[0]).toEqual({ kind: "layer", pick: { kind: "layer", layerId: "ml1" } });
  });
  it("ledger: scene click commits the autoLayerForNode L0 floor", () => {
    const acts = nodeSelectActions(geoPick, { mode: "ledger", currentFilter: "dor" });
    expect(acts[0]).toEqual({ kind: "layer", pick: { kind: "layer", layerId: "ml0" } });
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

describe("clearAllActions (the rail-controls sweep)", () => {
  it("drops every committed channel finest→coarsest, filter last", () => {
    const acts = clearAllActions({
      hasInspect: true, hasSnap: true,
      cohort: { cc: "DE", city: "Falkenstein", isp: "Hetzner" },
      composition: { netId: "dor", key: "Hybrid|L0·dL1" },
      country: "DE", layerId: "ml0", filter: "dor",
    });
    expect(kinds(acts)).toEqual(["inspect", "snapshot", "cohort", "composition", "country", "layer", "filter"]);
    expect(acts[acts.length - 1]).toEqual({ kind: "filter", id: "all" });
    // The snapshot clear must not carry `follow` — re-following is the FollowController's.
    expect(acts[1]).toEqual({ kind: "snapshot", pick: null });
  });
  it("already-clear channels emit nothing (a fully clear state is a no-op)", () => {
    expect(clearAllActions({
      hasInspect: false, hasSnap: false, cohort: null, composition: null, country: null, layerId: null, filter: "all",
    })).toEqual([]);
  });
  it("a partial state clears only what is set", () => {
    const acts = clearAllActions({
      hasInspect: false, hasSnap: false, cohort: null, composition: null, country: null, layerId: "hypl0", filter: "dag",
    });
    expect(kinds(acts)).toEqual(["layer", "filter"]);
  });
});
