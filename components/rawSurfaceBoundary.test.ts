import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DOC_PAGES, type DocPage } from "@/components/views";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// WHAT RAW DOES IS A POLICY ROW (2026-09-18; rewritten 2026-10-07 when History's document was
// retired — user: "the raw page for trends is not really raw and has been mostly replaced by the
// scene"; and again 2026-10-08, when History's RAW became the stored buckets — user: "just show
// upstash records"). RAW IS THE RECORDS in every view: a structural view shows its own records in
// the layer ("records"), History the buckets of the measured history ("buckets"). Three agreements
// keep that from drifting:
//
//  1. THE DISPATCH READS `VIEW_POLICIES[mode].rawSurface`, and `DataSection` carries no mode
//     compare at all (convention 7: a new view answers for itself by filling in a row).
//  2. THE TOGGLE ONLY RAISES THE LAYER: it opens no door and decides nothing by mode — which surface
//     rises is the dispatch's reading of the row. (The one-day door of 2026-10-07 lived in the
//     toggle; the cards' "Snapshot records" is the anchor log's only exit from History now.)
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

  it("the RAW toggle only raises the layer — no door, no mode compare", () => {
    const code = read(TOGGLE);
    expect(code).not.toMatch(/openRecords\s*\(/);
    expect(code).not.toMatch(/from\s+["']@\/components\/trendDoors["']/);
    expect(code).not.toMatch(/rawSurface/);
    for (const form of [/mode\s*===\s*["']trend["']/, /mode\s*!==\s*["']trend["']/]) {
      expect(code, `the toggle decides nothing by mode (${form.source})`).not.toMatch(form);
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
