import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOC_PAGES, docReadsFilter, type DocPage } from "@/components/views";

// WHICH DOCS READ THE NETWORK FILTER IS THE REGISTRY'S ANSWER, NOT THE COMMAND BAR'S
// (2026-09-14). The doc overlay strips the bar's scene-action controls because they act on
// something the reader cannot see — true of /about and /design, and false of a doc built from
// per-network charts, where the filter cuts what is right there. So `DOC_PAGES[doc].scoped`
// carries the answer and `docReadsFilter` is its one reader.
//
// The regression this guards is the obvious shortcut: a second doc gains charts, and TopBar
// grows `doc === "trends" || doc === "…"` instead of the flag. That list drifts silently — the
// new doc keeps the bar's ordinary face on one surface and loses it on the next — and it is
// exactly the shape convention 7 rejects for views ("gate on the behaviour, never a mode list").
// Adding a scoped doc must therefore be ONE edit, in views.ts.
//
// Scope: the FILTER only. The presentation pair (SCENE⇄HUD, RAW) stands down under every doc by
// design — those act on the layer the overlay covers, scoped or not — so `viewControls` keeps
// its plain `doc == null` test and nothing here asks otherwise.
const DOC_IDS = Object.keys(DOC_PAGES) as DocPage[];
const src = (f: string): string => readFileSync(f, "utf8");
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("doc scope boundary", () => {
  it("no doc is open means no doc reads the filter", () => {
    expect(docReadsFilter(null)).toBe(false);
  });

  it("every doc answers the question, and the prose docs answer no", () => {
    // Named rather than counted: the point is that a doc's answer is DECLARED, and that the two
    // prose pages are deliberately out — their copy has no network in it to scope.
    expect(docReadsFilter("trends")).toBe(true);
    expect(docReadsFilter("about")).toBe(false);
    expect(docReadsFilter("design")).toBe(false);
    // …and the flag decides it for every id in the registry, present and future.
    for (const id of DOC_IDS) {
      expect(docReadsFilter(id)).toBe("scoped" in DOC_PAGES[id]);
    }
  });

  it("the command bar gates the filter on the flag, never on a doc id", () => {
    const bar = stripComments(src("components/TopBar.tsx"));
    expect(bar).toContain("docReadsFilter");
    for (const id of DOC_IDS) {
      expect(bar).not.toContain(`doc === "${id}"`);
      expect(bar).not.toContain(`doc !== "${id}"`);
    }
  });

  it("a scoped doc actually subscribes to the filter", () => {
    // The flag promises the reader that picking a chip changes what they are looking at. A doc
    // that read the filter with a one-shot `getState()` would keep that promise on arrival and
    // break it on every pick after — the failure would look like a dead control, not a bug here.
    const doc = stripComments(src("components/docs/TrendsDoc.tsx"));
    expect(doc).toMatch(/useStore\(\(s\)\s*=>\s*s\.filter\)/);
  });
});
