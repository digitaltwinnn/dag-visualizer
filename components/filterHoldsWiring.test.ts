import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A FILTER HOLDS THE VIEW (user, 2026-11-02): with one set, you stay inside that network until the
// top bar changes it. The rules are `heldOut` and `tickLocked`; this pins the surfaces that ask them.
const read = (path: string) => readFileSync(path, "utf8");

describe("the surfaces a filter holds", () => {
  it("the moment card and the explorer offer no other network: a filtered list holds only its own", () => {
    expect(read("components/HyperExplore.tsx")).not.toMatch(/heldOut/);
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

// user, 2026-11-02: "top bar only way out". Not one way out and a few exceptions: every release of a
// filter is a write of it, so this scans for writers rather than naming the surfaces that were.
describe("only the top bar writes the filter", () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : sources(path);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
    });
  const all = ["components", "src", "app"].flatMap(sources);
  const matching = (pattern: RegExp) => all.filter((path) => pattern.test(read(path)));

  it("runs the toggle from the picker alone", () => {
    const callers = matching(/filterToggleActions\(/).filter((path) => path !== "src/engine/domain/pickActions.ts");
    expect(callers).toEqual(["components/topbar/FilterPicker.tsx"]);
  });
  it("builds the write in the table alone, and the executor applies it", () => {
    expect(matching(/kind: "filter",/).sort()).toEqual(["src/engine/domain/pickActions.ts", "src/store/applyClickActions.ts"]);
  });
  it("gives a card standing on the filter no close, while a finer commit on the same network keeps one", () => {
    const src = read("components/ContextCard.tsx");
    expect(src).toMatch(/const finer = chartStack \? trendFocus != null : tickNet != null;/);
    expect(src).toMatch(/const clearable = !onNode && \(finer \|\| \(filter !== appFilter && !chartStack\)\);/);
  });
  it("gives Hypergraph's explorer no home under a filter", () => {
    expect(read("components/HyperExplore.tsx")).toMatch(/onRelease: railNet \? \(\) => applyClickActions\(\[\{ kind: "railNet", id: null \}\]\) : undefined/);
  });
  it("draws no step that goes nowhere", () => {
    expect(read("components/explorer/Explorer.tsx")).toMatch(/\.filter\(\(l, i\) => i === levels\.length - 1 \|\| l\.crumb\.onRelease\)/);
  });
});
