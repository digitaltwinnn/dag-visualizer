import { describe, it, expect } from "vitest";
import { clickActions, countryToggleActions, filterToggleActions, layerToggleActions, nodeSelectActions, snapshotSelectActions, pickActive, pickNetId, type ClickAction } from "./pickActions";
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
  over: Partial<{ filter: string; country: string | null; hasInspect: boolean; layerId: string | null }> = {},
) => ({
  filter: "all",
  country: null,
  hasInspect: false,
  layerId: null,
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
  it("GEO: filter FIRST, then the node's country, inspect LAST", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state() });
    expect(acts).toEqual([
      { kind: "filter", id: "dor" },
      { kind: "country", cc: "DE" },
      { kind: "inspect", pick: p },
    ]);
  });
  it("GEO: the filter step is SKIPPED when the node's network is already selected (no drill churn)", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state({ filter: "dor" }) });
    expect(kinds(acts)).toEqual(["country", "inspect"]);
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
  it("LEDGER: filter + inspect only — the settlement diagram must not gain drills/rotation", () => {
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
    expect(countryToggleActions("DE", { country: null, hasInspect: false })).toEqual([
      { kind: "country", cc: "DE" },
    ]);
    expect(countryToggleActions("DE", { country: "DE", hasInspect: false })).toEqual([
      { kind: "country", cc: null },
    ]);
    expect(countryToggleActions("FI", { country: "DE", hasInspect: true })).toEqual([
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
