import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A FILTER HOLDS THE VIEW (user, 2026-11-02): with one set, you stay inside that network until the
// top bar changes it. The rules are `heldOut` and `tickLocked`; this pins the surfaces that ask them.
const read = (path: string) => readFileSync(path, "utf8");

describe("the surfaces a filter holds", () => {
  it("Hypergraph's rows stay listed, dimmed, with no click and no preview", () => {
    const src = read("components/HyperExplore.tsx");
    expect(src).toMatch(/const held = heldOut\(appFilter, m\.id\);/);
    expect(src).toMatch(/faint: dead \|\| m\.nodes\.length === 0 \|\| held,/);
    expect(src).toMatch(/onClick: held \? undefined : \(\) => toggleNetwork\(m\.id\),/);
    expect(src).toMatch(/pair: held \? undefined : subjectPairing\(hoverFilter, m\.id,/);
  });

  it("a Snapshots row the read rules out has no click and no preview, unless it is on screen", () => {
    const src = read("components/LedgerPanel.tsx");
    expect(src).toMatch(/const locked = !on && tickLocked\(filter, snapshotExact\[d\.ordinal\]\);/);
    expect(src).toMatch(/onClick: locked \? undefined : \(\) => \{/);
    expect(src).toMatch(/pair: locked \? undefined : subjectPairing\(hoverSnapOrd, d\.ordinal,/);
  });

  it("the global pager learns which ticks are locked", () => {
    expect(read("components/useSiblingState.ts")).toMatch(/locked: tickLocked\(filter, snapshotExact\[d\.ordinal\]\),/);
  });

  it("the scene asks the same two rules, with the real filter", () => {
    const src = read("src/engine/Picking.ts");
    expect(src).toMatch(/pickActive\(pick, this\.h\.mode, this\.h\.filter, this\.h\.activeMetaIds, st\.filter\)/);
    expect(src).toMatch(/tickLocked\(st\.filter, st\.snapshotExact\[ordinal\]\)/);
  });
});
