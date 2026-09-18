import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DOC_PAGES, type DocPage } from "@/components/views";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// WHICH SURFACE THE RAW LAYER SHOWS IS A POLICY ROW (2026-09-18, the History view's two
// registers). `section` is the app's PRESENTATION axis — one subject, two presentations — so the
// question "what does RAW show here" belongs to the view, not to the layer: the structural views
// show their RECORDS (the anchor log, the node roster) and the History view shows the measured
// history DOCUMENT, which is that view's other register (root CLAUDE.md convention 12).
//
// Three agreements keep that from drifting:
//
//  1. THE DISPATCH READS `VIEW_POLICIES[mode].rawSurface`, and `DataSection` carries no mode
//     compare at all. Convention 7: a sixth view answers for itself by filling in a row, and is
//     never handed a surface by silence or by a deny-list. The per-surface files below may still
//     compare modes — which TABLE the records surface draws is a records-internal question, not
//     the surface decision — which is exactly why the dispatch is its own file.
//  2. THE DOCUMENT IS THE RAW REGISTER, NOT A DOC OVERLAY. `store.docPage` forces `section` back
//     to `"scene"` and the command bar hides the presentation pair under any open doc, so a
//     document rendered through DocLayer could never be toggled back off. `trends` therefore has
//     no DOC_PAGES entry, DocLayer does not know the component, and nothing opens it by id.
//  3. THE DOCUMENT CHUNK STAYS SPLIT. TrendsDoc is the app's largest single component; the raw
//     layer mounts in every view, so it must reach the document through `dynamic()` exactly as
//     DocLayer did.
//
// ⚠️ THE LAST TWO CASES ARE INHERITED, and they were never about the flag that died (review,
// 2026-09-18). `components/docScopeBoundary.test.ts` held four cases when `trends` was a doc
// overlay; two of them tested `scoped`/`docReadsFilter` and went with the flag, and two did not:
//
//  4. THE DOCUMENT SUBSCRIBES TO THE FILTER. A one-shot `getState()` read would keep the promise
//     on arrival and break it on every pick after, and the symptom is a DEAD CONTROL, not a stack
//     trace. The confusion is live rather than hypothetical: `initialTab` sits two lines below the
//     roster and reads `getState()` ON PURPOSE (a mount-once default), so the two reads are
//     adjacent and only one of them may be one-shot. Moving the document behind RAW changed
//     nothing about this — the bar keeps its filter over a raw layer, so the chips still cut the
//     charts the reader is looking at, and this case simply moved home with the document.
//  5. THE COMMAND BAR NEVER GATES ON A DOC ID. With `docReadsFilter` gone the bar's gate is the
//     plain `doc != null`, and the shortcut that rule existed to prevent — `doc === "about" || …`
//     growing a page list inside TopBar — is exactly as available as it ever was. It is convention
//     7's shape for docs, and it costs one line to keep pinned.
const ROOTS = ["components", "app"];
const DISPATCH = "components/DataSection.tsx";
const DOCUMENT_SURFACE = "components/datasection/DocumentSurface.tsx";

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

  it("the document surface lazy-loads TrendsDoc, and it is the only thing that does", () => {
    const doc = read(DOCUMENT_SURFACE);
    expect(doc).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["'@/\w.-]*TrendsDoc["']\)/);
    const importers: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const norm = file.replace(/\\/g, "/");
        if (norm === DOCUMENT_SURFACE || norm.endsWith("docs/TrendsDoc.tsx")) continue;
        if (/TrendsDoc/.test(read(norm))) importers.push(norm);
      }
    }
    expect(
      importers,
      `the Trends document has ONE mount — the History view's raw register: ${importers.join(", ")}`,
    ).toEqual([]);
  });

  it("trends is not a doc-overlay page, and nothing opens it as one", () => {
    expect(Object.keys(DOC_PAGES)).not.toContain("trends");
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const norm = file.replace(/\\/g, "/");
        if (/setDocPage\(\s*["']trends["']\s*\)/.test(read(norm))) offenders.push(norm);
      }
    }
    expect(offenders, `the doc overlay cannot host the raw register: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the document SUBSCRIBES to the committed filter — a one-shot read would be a dead control", () => {
    const doc = read("components/docs/TrendsDoc.tsx");
    expect(doc).toMatch(/useStore\(\(s\)\s*=>\s*s\.filter\)/);
  });

  it("the command bar gates the filter on whether a doc is open, never on a doc id", () => {
    const bar = read("components/TopBar.tsx");
    for (const id of Object.keys(DOC_PAGES) as DocPage[]) {
      expect(bar, `TopBar must not name the "${id}" page`).not.toContain(`doc === "${id}"`);
      expect(bar, `TopBar must not name the "${id}" page`).not.toContain(`doc !== "${id}"`);
    }
  });
});
