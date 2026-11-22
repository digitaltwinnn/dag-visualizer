import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// GEOGRAPHY DIMS, IT NEVER REMOVES (user, 2026-11-02: "in geo I'd like to dim the other nodes not
// remove them"). The globe keeps the same stacks whatever the scope, so a network never re-tiles the
// world under the reader, and the rest stay in place, muted, as Hypergraph's and Snapshots' do.
const globe = readFileSync("src/engine/scene/Globe.ts", "utf8");

describe("the globe under a network", () => {
  it("stacks every node, whatever the scope", () => {
    expect(globe).toMatch(/\[\.\.\.vFan\.map\(\(u\) => u\.geoDir!\), \.\.\.mFan\.map\(\(r\) => r\.geoDir\)\]/);
  });

  it("runs arcs between the scope's nodes alone", () => {
    expect(globe).toMatch(/for \(const u of vFan\) if \(u\.ready && this\._nodeActive\("dag", geoOf\(u\.pick\)\)\)/);
    expect(globe).toMatch(/for \(const r of mFan\) \{\s*if \(!this\._nodeActive\(r\.metaId, geoOf\(r\.pick\)\)\) continue;/);
  });

  it("rebuilds a pool at its scope, so a data poll never flashes the rest", () => {
    expect(globe).toMatch(/this\._applyGlowFilter\(\);\s*for \(const m of this\._densityGlow\) m\.userData\.scopeNow = m\.userData\.scope;/);
  });

  // A browse or a hover preview dims the pools off the scope; a HELD filter takes them with their
  // nodes (user, 2026-11-23: the other networks' coloured pools stayed on the ground after their
  // nodes had gone). Either way the change is eased, never a visibility flip.
  it("dims a pool off a browsed scope, clears it under a held filter, and eases both", () => {
    expect(globe).not.toMatch(/m\.visible = sel === "all"/);
    expect(globe).toMatch(/const off = this\._filterHeld && !this\._previewing\(\) \? 0 : POOL_OFF_SCOPE;/);
    expect(globe).toMatch(/m\.userData\.scope = sel === "all" \|\| m\.userData\.net === sel \? 1 : off/);
    expect(globe).toMatch(/g\.userData\.scopeNow \+= \(g\.userData\.scope - g\.userData\.scopeNow\) \* Math\.min\(1, dt \* 3\)/);
  });
});

// user, 2026-11-02, reversing 2026-08-30: under a network the DAG's nodes dim in Snapshots as they
// do in every other view. The floor and its snapshots are not nodes, and they stay as they were.
describe("the DAG's nodes under a network", () => {
  it("dim in every view, Snapshots included", () => {
    expect(globe).toMatch(/const dagLit = sel === "all" \|\| sel === "dag";/);
  });
});

