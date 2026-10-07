import { describe, expect, it } from "vitest";
import { levelsForBox } from "./boxLevel";

// Geography's ladder: the countries under the network, a country's providers, a provider's nodes.
const geo = [
  { key: "countries", parent: "context" },
  { key: "cohorts", parent: "country" },
  { key: "nodes", parent: "cohort" },
];
const keys = (l: readonly { key: string }[]) => l.map((x) => x.key);

describe("levelsForBox — the explorer shows the open card's children", () => {
  it("opening a selected card higher up cuts the path back to that card's children", () => {
    expect(keys(levelsForBox(geo, "country"))).toEqual(["countries", "cohorts"]);
    expect(keys(levelsForBox(geo, "context"))).toEqual(["countries"]);
  });
  it("the deepest selection's card shows its children — nothing is cut", () => {
    expect(keys(levelsForBox(geo, "cohort"))).toEqual(["countries", "cohorts", "nodes"]);
  });
  it("a leaf, a card off this ladder or no open card keeps every level", () => {
    expect(keys(levelsForBox(geo, "node"))).toEqual(["countries", "cohorts", "nodes"]);
    expect(keys(levelsForBox(geo, "snap"))).toEqual(["countries", "cohorts", "nodes"]);
    expect(keys(levelsForBox(geo, null))).toEqual(["countries", "cohorts", "nodes"]);
  });
  it("a card whose children the selection has not opened cuts nothing", () => {
    expect(keys(levelsForBox(geo.slice(0, 1), "country"))).toEqual(["countries"]);
  });
});
