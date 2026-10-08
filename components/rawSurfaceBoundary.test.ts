import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DOC_PAGES, type DocPage } from "@/components/views";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// WHAT RAW DOES IS A POLICY ROW (2026-09-18; rewritten 2026-10-07 when History's document was
// retired — user: "the raw page for trends is not really raw and has been mostly replaced by the
// scene"). RAW IS THE RECORDS in every view: a structural view shows its own records in the layer
// ("records"), and the History view, which has none of its own, opens a DOOR onto the anchor log for
// the span on screen ("door"). Three agreements keep that from drifting:
//
//  1. THE DISPATCH READS `VIEW_POLICIES[mode].rawSurface`, and `DataSection` carries no mode
//     compare at all (convention 7: a new view answers for itself by filling in a row).
//  2. A DOOR VIEW'S RAW RUNS THE SHARED DOOR — `trendDoors.openRecords`, the Moment card's own —
//     over the span the view has on screen (`windowSpan`), so the two exits can never land a reader
//     in different places. The toggle decides by the policy row, never by a mode.
//  3. THE COMMAND BAR NEVER GATES ON A DOC ID (convention 7's shape for docs).
const ROOTS = ["components", "app"];
const DISPATCH = "components/DataSection.tsx";
const TOGGLE = "components/topbar/PresentationToggle.tsx";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (p: string) => stripComments(readFileSync(p, "utf8"));

describe("raw-surface boundary", () => {
  it("the raw layer's dispatch reads the policy row and compares no mode", () => {
    const code = read(DISPATCH);
    expect(code).toContain("rawSurface");
    // Every value the policy can hold is answered BY NAME (a keyed map, so a third register is a
    // compile error here rather than a silent fall-through to the records layer).
    for (const surface of new Set(Object.values(VIEW_POLICIES).map((p) => p.rawSurface))) {
      expect(code, `the dispatch must name the "${surface}" surface`).toMatch(
        new RegExp(`(^|[\\s{])["']?${surface}["']?\\s*:`, "m"),
      );
    }
    // The near-miss forms too (review, 2026-09-18): a deny-list reads `mode !==`, a fall-through
    // reads `switch (mode`, and a set membership reads `.includes(mode)`. All three are the same
    // mistake wearing different syntax, and pinning only `===` invites whichever one the next
    // author reaches for.
    for (const form of [/mode\s*===/, /mode\s*!==/, /switch\s*\(\s*mode/, /\.includes\(\s*mode/]) {
      expect(code, `the surface decision is the policy's, never a mode list (${form.source})`).not.toMatch(form);
    }
  });

  it("a door view's RAW runs the shared door over the span on screen, decided by the policy row", () => {
    const code = read(TOGGLE);
    expect(code).toMatch(/rawSurface\s*===\s*["']door["']/);
    expect(code).toMatch(/openRecords\s*\(/);
    expect(code).toMatch(/windowSpan\s*\(/);
    expect(code).toMatch(/from\s+["']@\/components\/trendDoors["']/);
    for (const form of [/mode\s*===\s*["']trend["']/, /mode\s*!==\s*["']trend["']/]) {
      expect(code, `the RAW door is the policy's, never a mode compare (${form.source})`).not.toMatch(form);
    }
  });

  it("the retired History document has no mount anywhere", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const norm = file.replace(/\\/g, "/");
        if (/TrendsDoc|DocumentSurface/.test(read(norm))) offenders.push(norm);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the command bar gates the filter on whether a doc is open, never on a doc id", () => {
    const bar = read("components/TopBar.tsx");
    for (const id of Object.keys(DOC_PAGES) as DocPage[]) {
      expect(bar, `TopBar must not name the "${id}" page`).not.toContain(`doc === "${id}"`);
      expect(bar, `TopBar must not name the "${id}" page`).not.toContain(`doc !== "${id}"`);
    }
  });
});
