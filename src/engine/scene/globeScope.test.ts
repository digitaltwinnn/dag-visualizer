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

  it("dims a pool off the scope and eases it, where it used to drop it", () => {
    expect(globe).not.toMatch(/m\.visible = sel === "all"/);
    expect(globe).toMatch(/m\.userData\.scope = sel === "all" \|\| m\.userData\.net === sel \? 1 : POOL_OFF_SCOPE/);
    expect(globe).toMatch(/g\.userData\.scopeNow \+= \(g\.userData\.scope - g\.userData\.scopeNow\) \* Math\.min\(1, dt \* 3\)/);
  });
});
