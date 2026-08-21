// src/data/dataExportCoverage.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// RULE. Every value export of a `src/data/` module is referenced by its sibling `<name>.test.ts` —
// the same enforcement rule 4 applies to `src/engine/domain/`, reaching the OTHER directory the
// repo puts pure logic in. `src/data/` holds the row builders, the display vocabularies and the
// resolvers the cards, the explorer and the scene all read; a builder that no test names can
// change its output with nothing to notice.
//
// SCOPE. This is deliberately NOT a strict copy of rule 4. `domain/` is pure BY CONSTRUCTION —
// rule 1 (`layerBoundaries.test.ts`) forbids it from importing react, the store or an addon — so
// there every module can be tested and the rule needs no exemptions. `src/data/` has no such
// guarantee: it is where the live singleton, the geo cache and the follow bridge live, alongside
// the pure logic. So the rule carries an EXPLICIT exemption list.
//
// ⚠️ WHY THE LIST IS HAND-WRITTEN. A mechanical purity classifier was tried first and rejected: a
// regex for `fetch|localStorage|window|document|useStore` reported hits in five pure modules,
// every one of them the WORD inside a comment — this repo's own prose says "the retained window"
// and "the read failed" constantly. A rule whose scope is decided by a matcher that wrong is worse
// than no rule, because it silently exempts whatever happens to mention a browser noun. An
// exemption is therefore a visible, reasoned line in a diff, the same idiom every other boundary
// test here uses.
//
// EXEMPTIONS — modules with no sibling test required. Each is I/O or a live singleton whose
// behaviour IS the network, not logic that can be stated as inputs and outputs.
const EXEMPT_MODULES: Record<string, string> = {
  "api.ts":
    "the live NetworkData singleton: polling, buffers and event emission. Its behaviour is the " +
    "feed's, and the pure parts it feeds (roster, anchorLog, ledgerStory, unlisted) are tested.",
  "geoResolve.ts":
    "network + localStorage I/O — the client-side IP→geo fill behind /api/geo's misses.",
  "follow.ts":
    "the follow bridge: reads the live singleton AND the store, so it has no inputs to state. " +
    "The follow DECISION table is tested end-to-end in src/store/followFlow.test.ts.",
  "site.ts": "one build constant, SITE_ORIGIN.",
};

// EXEMPTIONS — named exports inside a module that IS otherwise covered. `network.ts` is the one
// place the two kinds sit together: its pure signer/co-location logic is pinned by network.test.ts
// (and its signer matcher additionally by signerMatchBoundary.test.ts), while these twelve are
// live-singleton accessors, config mirrors and catalog lookups. Listing them per EXPORT rather
// than exempting the module keeps the rule live: a new PURE function in network.ts still demands
// coverage, and a new accessor costs a deliberate line here.
const EXEMPT_EXPORTS: Record<string, string[]> = {
  "network.ts": [
    // live-singleton accessors
    "initNetwork", "getNetwork", "getAnchor", "isAnchorSettling",
    // config mirrors (config.ts is pure static data; these re-expose it to the HUD)
    "COLORS", "CORE_HEX", "DEFAULT_META_COLOR", "ANCHOR_SETTLE_MS",
    // catalog lookups over the CATALOG (via src/net/current)
    "metagraphById", "filterAccent", "allMetagraphs",
    // re-export of api.ts's own helper, covered where it is defined
    "shortHash",
  ],
};

const DIR = import.meta.dirname;

// Value exports (functions/consts/classes) declared on `export` lines, excluding `export type` and
// `export interface`, and skipping `export { x } from` re-exports. Same house grep as
// src/engine/domainExportCoverage.test.ts — kept identical on purpose so the two rules can't drift
// in what they consider an export.
function valueExports(src: string): string[] {
  const out: string[] = [];
  const re = /^export\s+(?:(const|let|var|function|class|async function)\s+([A-Za-z0-9_]+)|\{([^}]*)\})/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[2]) out.push(m[2]);
    else if (m[3] && !/from\s+["']/.test(src.slice(m.index, m.index + 200))) {
      for (const part of m[3].split(",")) {
        const id = part.trim().split(/\s+as\s+/)[0].trim();
        if (id && !id.startsWith("type ")) out.push(id);
      }
    }
  }
  return out;
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .sort();

describe("src/data export coverage", () => {
  for (const f of files) {
    const exemptReason = EXEMPT_MODULES[f];
    const label = exemptReason
      ? `${f}: exempt — ${exemptReason.split(":")[0]}`
      : `${f}: every value export is referenced by ${f.replace(".ts", ".test.ts")}`;

    it(label, () => {
      if (exemptReason) return;
      const src = readFileSync(join(DIR, f), "utf8");
      const skip = new Set(EXEMPT_EXPORTS[f] ?? []);
      const exports = valueExports(src).filter((e) => !skip.has(e));
      if (exports.length === 0) return; // types-only module, or wholly per-export exempt
      const testPath = join(DIR, f.replace(".ts", ".test.ts"));
      expect(existsSync(testPath), `${f} has value exports but no sibling test file`).toBe(true);
      const testSrc = readFileSync(testPath, "utf8");
      const missing = exports.filter((e) => !new RegExp(`\\b${e}\\b`).test(testSrc));
      expect(missing, `${f}: exports not referenced in its test: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

// An exemption list is a standing invitation to grow, so it carries its own guards. Without these
// the rule can be satisfied by exempting whatever fails, which is the failure mode a boundary test
// is supposed to make impossible.
describe("the exemption list stays honest", () => {
  it("names only modules that still exist", () => {
    const gone = Object.keys(EXEMPT_MODULES).filter((f) => !files.includes(f));
    expect(gone, `exempt modules no longer present (stale free pass): ${gone.join(", ")}`).toEqual([]);
  });

  it("names only exports that still exist", () => {
    for (const [f, names] of Object.entries(EXEMPT_EXPORTS)) {
      expect(files, `${f} is per-export exempt but no longer present`).toContain(f);
      const actual = new Set(valueExports(readFileSync(join(DIR, f), "utf8")));
      const gone = names.filter((n) => !actual.has(n));
      expect(gone, `${f}: exempt exports that no longer exist: ${gone.join(", ")}`).toEqual([]);
    }
  });

  it("does not exempt a module it also covers per-export", () => {
    // Both lists reaching one file would make the per-export list decorative.
    const both = Object.keys(EXEMPT_EXPORTS).filter((f) => f in EXEMPT_MODULES);
    expect(both).toEqual([]);
  });

  it("leaves the clear majority of the directory covered", () => {
    // The rule's value is the modules it REACHES. If exemptions ever approach half the directory,
    // src/data has drifted into an I/O layer and this rule needs rethinking, not another line.
    expect(Object.keys(EXEMPT_MODULES).length * 2).toBeLessThan(files.length);
  });
});
