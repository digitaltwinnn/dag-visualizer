import { describe, it, expect } from "vitest";
import { sceneFeeds } from "./sceneFeeds";
import { VIEW_POLICIES } from "./viewPolicy";

const sorted = (a: string[]) => [...a].sort();

describe("sceneFeeds (the feeds a 3D view draws, from its own policy flags)", () => {
  it("the Hypergraph draws the nodes, the hubs, the core flash and the anchor packets", () => {
    expect(sorted(sceneFeeds(VIEW_POLICIES.hyper))).toEqual(sorted(["clusters", "api-metagraphs", "api-geo", "global", "metasnaps"]));
  });
  it("Geography draws the located nodes, not the snapshot feeds", () => {
    expect(sorted(sceneFeeds(VIEW_POLICIES.geo))).toEqual(sorted(["clusters", "api-metagraphs", "api-geo"]));
  });
  it("Snapshots draws the chamber, the exact reads and the nodes in their trays — not their geolocations", () => {
    expect(sorted(sceneFeeds(VIEW_POLICIES.ledger))).toEqual(sorted(["clusters", "api-metagraphs", "global", "metasnaps", "exact"]));
  });
  it("History parks the fleet and draws no feed in the scene (its charts are HUD readers)", () => {
    expect(sceneFeeds(VIEW_POLICIES.trend)).toEqual([]);
  });
  it("the placeholder view draws nothing", () => {
    expect(sceneFeeds(VIEW_POLICIES.soon)).toEqual([]);
  });
});
