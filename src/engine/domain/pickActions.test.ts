import { describe, it, expect } from "vitest";
import { clickActions, pickNetId, type ClickAction } from "./pickActions";
import type { PickDescriptor } from "@/src/data/types";

// Minimal pick fixtures — only the fields the table reads.
const nodePick = (cc: string | null = "DE"): PickDescriptor =>
  ({ kind: "metanode", meta: { id: "dor" }, node: { ip: "1.2.3.4" }, geo: cc ? { cc } : {} }) as unknown as PickDescriptor;
const validatorPick = (): PickDescriptor =>
  ({ kind: "l0", node: { id: "abc" }, geo: { cc: "US" } }) as unknown as PickDescriptor;
const hubPick = (): PickDescriptor => ({ kind: "meta", cfg: { id: "dor" } }) as unknown as PickDescriptor;
const snapPick = (): PickDescriptor => ({ kind: "snapshot", data: { ordinal: 42 } }) as unknown as PickDescriptor;
const layerPick = (id = "ml0"): PickDescriptor => ({ kind: "layer", layerId: id }) as unknown as PickDescriptor;

const state = (over: Partial<{ country: string | null; hasInspect: boolean; layerId: string | null }> = {}) => ({
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
  it("a snapshot tile pins that snapshot", () => {
    const p = snapPick();
    expect(clickActions({ mode: "ledger", pick: p, countryCc: null, current: state() })).toEqual([
      { kind: "snapshot", pick: p },
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
  it("GEO: stopAutoRotate, filter FIRST, then the node's country, inspect LAST", () => {
    const p = nodePick("DE");
    const acts = clickActions({ mode: "geo", pick: p, countryCc: null, current: state() });
    expect(kinds(acts)).toEqual(["stopAutoRotate", "filter", "country", "inspect"]);
    expect(acts[1]).toEqual({ kind: "filter", id: "dor" });
    expect(acts[2]).toEqual({ kind: "country", cc: "DE" });
    expect(acts[3]).toEqual({ kind: "inspect", pick: p });
  });
  it("GEO: a node without a resolvable country skips the drill (no country action)", () => {
    const acts = clickActions({ mode: "geo", pick: nodePick(null), countryCc: null, current: state() });
    expect(kinds(acts)).toEqual(["stopAutoRotate", "filter", "inspect"]);
  });
  it("GEO: a validator drills the DAG core + its country", () => {
    const acts = clickActions({ mode: "geo", pick: validatorPick(), countryCc: null, current: state() });
    expect(acts[1]).toEqual({ kind: "filter", id: "dag" });
    expect(acts[2]).toEqual({ kind: "country", cc: "US" });
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
