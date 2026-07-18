# Consistency Hardening — Plan 1: Enforcement Gates + dimModel Un-Mirror

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the tests-first enforcement gates from the consistency-hardening spec, then kill the dimModel inline-mirror contract (the single highest-value unification — it drifted twice and caused real bugs) so the tested domain functions are the ONE source of the node dim/glow math.

**Architecture:** Add house grep-tests (the `layerBoundaries`/`noHardcodedColors`/`sceneViewContract` idiom) that make three spec rules executable: every `domain/` export is referenced by its sibling test; the render loop allocates nothing per frame; and legacy colour literals are barred from `components/` too. Add a type-level `SceneView` interface the three views implement. Then rewire `NodeFabric`/`Globe` to CALL the `dimModel` functions instead of reimplementing their formulas inline, deleting the "change BOTH places" ritual.

**Tech Stack:** TypeScript, Three.js (vanilla), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-consistency-hardening-design.md` (approved). This plan implements Part B tests 1/3/4/5 and Part A #1. Part A #2–7 (FadeSet registry, stage-light coordinator, shared math/texture helpers, fade-curve sweep, transition-window input gate) and Part C land in Plan 2, ON these gates. **Part B #2 (scene mode-ban) already shipped** in `src/engine/sceneViewContract.test.ts` — do not re-add it.

## Global Constraints

- Zero-allocation render loop: per-frame code reuses construction-time scratch; event-time allocation carries a comment. (This plan ADDS the test that enforces it — Task 2.)
- Engine layering (`layerBoundaries.test.ts`): `domain/` imports THREE math + config + types only; `scene/` never touches store/react; `Engine.ts` is the only store bridge.
- The dimModel un-mirror (Task 5) must be **pixel-neutral**: the rendered result is byte-identical before/after (same formulas, now called instead of copied). Verify with the FPS monitor (`?stats` URL flag) that per-frame cost is unchanged, and visually that hyper/geo/ledger render identically.
- Per-change gate: `npx tsc --noEmit && npm test` before every commit. Baseline: **369 tests, 33 files, all green.**
- The dev server is already running on http://localhost:3000 (coordinator-owned) — workers must NOT start/kill servers. Engine/scene constructor changes need a full page reload.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `domainExportCoverage.test.ts` — every domain export is tested

**Files:**
- Create: `src/engine/domainExportCoverage.test.ts`

**Interfaces:**
- Produces: nothing consumed by later tasks (a standalone gate).

**Context:** Spec Part B #1 — makes rule "new domain behaviour lands WITH a colocated test" executable. During the last branch, `hyperFocusFraming` shipped untested and no gate caught it. The test greps each `src/engine/domain/*.ts` for its exported symbols and asserts the sibling `*.test.ts` references each one. Type-only exports (interfaces/type aliases) are allowlisted — they carry no behaviour to test.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/domainExportCoverage.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT (spec Part B #1): every VALUE export of a domain module must be referenced by its
// sibling <name>.test.ts — the executable form of "new domain behaviour lands WITH a colocated
// test". Type-only exports (interface/type) carry no behaviour and are skipped. A house grep,
// same idiom as layerBoundaries.test.ts.
const DOMAIN = join(import.meta.dirname, "domain");

// Value exports (functions/consts/classes) declared on `export` lines, excluding `export type`
// and `export interface`. Also skips re-exports (`export { x } from`) — those are covered where
// defined. Returns the exported identifiers.
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

describe("domain export coverage", () => {
  const files = readdirSync(DOMAIN)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  for (const f of files) {
    it(`${f}: every value export is referenced by ${f.replace(".ts", ".test.ts")}`, () => {
      const src = readFileSync(join(DOMAIN, f), "utf8");
      const exports = valueExports(src);
      if (exports.length === 0) return; // a types-only module (e.g. records.ts) needs no test
      const testPath = join(DOMAIN, f.replace(".ts", ".test.ts"));
      expect(existsSync(testPath), `${f} has value exports but no sibling test file`).toBe(true);
      const testSrc = readFileSync(testPath, "utf8");
      const missing = exports.filter((e) => !new RegExp(`\\b${e}\\b`).test(testSrc));
      expect(missing, `${f}: exports not referenced in its test: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run it — see whether it PASSES or names real gaps**

Run: `npx vitest run src/engine/domainExportCoverage.test.ts`
Expected: either all-green (every domain export is already tested), OR a failure naming specific untested exports. **If it names gaps, that is the test working** — do NOT weaken the test. Instead, for each named export, add a genuine colocated test asserting its behaviour (read the export, write a real assertion), then re-run. Only `records.ts` (types-only) should short-circuit via the `exports.length === 0` guard. Report which exports needed new tests in the task report.

- [ ] **Step 3: Full gate + commit**

Run: `npx tsc --noEmit && npm test` — all green.

```bash
git add src/engine/domainExportCoverage.test.ts src/engine/domain/*.test.ts
git commit -m "test(domain): enforce colocated-test coverage for every domain export"
```

---

### Task 2: `noFrameAllocations.test.ts` — the render loop allocates nothing

**Files:**
- Create: `src/engine/noFrameAllocations.test.ts`

**Interfaces:**
- Produces: nothing consumed later (a standalone gate).

**Context:** Spec Part B #3 + Part C #1 — the zero-allocation invariant is stated everywhere but never enforced. This greps the BODIES of per-frame methods in `scene/` (`update`, `write*`, `place*`, `_apply*`, `setMorph`, `updateRotation`) and fails on `new THREE.`, `.clone()`, or array/object literals assigned to a local, UNLESS the offending line carries an `// event-time` marker (the documented escape hatch for genuine event-driven allocation the method may contain in a branch). Heuristic by design — the allowlist markers are the documentation.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/noFrameAllocations.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ENFORCEMENT (spec Part B #3): the per-frame render path allocates nothing. We scan the BODIES
// of per-frame methods in scene/ and flag `new THREE.*` / `.clone()` on any line lacking an
// `event-time` marker (the escape hatch for genuine event-driven allocation inside a branch).
// Heuristic — the markers ARE the documentation of every intentional allocation.
const SCENE = join(import.meta.dirname, "scene");
// Method names whose bodies run every frame (or per-record within a frame).
const PER_FRAME = /^\s*(?:private\s+|public\s+)?(update|updateRotation|setMorph|write\w+|place\w+|_apply\w+)\s*\(/;
const ALLOC = /new\s+THREE\.\w+\(|\.clone\(\)/;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// Extract the line ranges of per-frame method bodies via brace matching.
function perFrameBodies(lines: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!PER_FRAME.test(lines[i])) continue;
    let depth = 0, started = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth++; started = true; }
        else if (ch === "}") depth--;
      }
      if (started && depth === 0) { ranges.push([i, j]); i = j; break; }
    }
  }
  return ranges;
}

describe("no per-frame allocations in scene/", () => {
  for (const file of tsFiles(SCENE)) {
    it(`${file.split("/scene/")[1]} allocates nothing in per-frame bodies (or marks it event-time)`, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const offenders: string[] = [];
      for (const [a, b] of perFrameBodies(lines)) {
        for (let i = a; i <= b; i++) {
          const code = lines[i].split("//")[0];
          if (ALLOC.test(code) && !lines[i].includes("event-time")) {
            offenders.push(`  line ${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
      expect(offenders, `per-frame allocation without an \`event-time\` marker:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run it — triage every hit**

Run: `npx vitest run src/engine/noFrameAllocations.test.ts`
Expected: it names any `new THREE.`/`.clone()` inside a per-frame body. For EACH hit, decide honestly:
- **Genuine per-frame allocation** (a real zero-alloc violation) → FIX it: hoist the object to a construction-time scratch field, reuse via `.copy()`/`.set()`. This is the test doing its job.
- **Event-driven allocation living in a branch of a per-frame method** (e.g. a rebuild triggered by a data event, already commented as such) → append `// event-time` to that line so the marker documents it.

Do NOT broaden `ALLOC` or the marker to make a genuine violation pass. Record each hit's disposition (fixed vs marked, with reason) in the task report.

- [ ] **Step 3: Full gate + commit**

Run: `npx tsc --noEmit && npm test` — all green. If any hit was a real violation you fixed, full-reload http://localhost:3000 and confirm the affected view still renders correctly.

```bash
git add src/engine/noFrameAllocations.test.ts src/engine/scene/
git commit -m "test(scene): enforce the zero-allocation render loop (event-time markers)"
```

---

### Task 3: `SceneView` interface — the three views are one kind of thing

**Files:**
- Create: `src/engine/scene/views/SceneView.ts`
- Modify: `src/engine/scene/views/HyperView.ts` (implements clause), `src/engine/scene/views/LedgerView.ts` (implements clause)
- Create: `src/engine/scene/views/sceneView.test.ts`

**Interfaces:**
- Produces: `interface SceneView { setViewAlpha(a: number): void }` (Plan 2 extends it with the shared fade/dispose hooks — keep it minimal now).

**Context:** Spec Part B #4 — the grep-based `sceneViewContract` test already asserts `setViewAlpha` is PRESENT; this makes it TYPE-level so the compiler enforces the shape and future views start from the interface. Keep it to the one method both bespoke views share today (`GeoView` is the documented exemption — its furniture alpha rides Globe's `geoFades`, so it is NOT a `SceneView`).

- [ ] **Step 1: Write the interface**

```ts
// src/engine/scene/views/SceneView.ts
// The shared shape of a 3D-view furniture module (spec Part B #4): everything the Engine drives
// uniformly across views. Today that is the transition build/teardown alpha; Plan 2 adds the
// shared fade-registry + dispose hooks here. HyperView and LedgerView implement it; GeoView is
// exempt (its geo-surface furniture rides Globe.setMorph's geoFades choke point, not its own alpha).
export interface SceneView {
  // 0..1 furniture opacity multiplier, fed per frame by the Engine during a view transition
  // (1 at rest in the lit view, 0 while the view is dark/parked).
  setViewAlpha(a: number): void;
}
```

- [ ] **Step 2: Add the `implements` clauses**

In `src/engine/scene/views/HyperView.ts`, add the import and `implements`:
```ts
import type { SceneView } from "./SceneView";
```
and change the class declaration `export class HyperView {` → `export class HyperView implements SceneView {`.

In `src/engine/scene/views/LedgerView.ts`, the same:
```ts
import type { SceneView } from "./SceneView";
```
and `export class LedgerView {` → `export class LedgerView implements SceneView {`.

- [ ] **Step 3: Write the test**

```ts
// src/engine/scene/views/sceneView.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The bespoke views implement the SceneView interface at the TYPE level (spec Part B #4), so the
// compiler — not just the sceneViewContract grep — enforces the shared shape. GeoView is exempt
// (Globe drives its furniture alpha). This test pins the implements-wiring so a refactor can't
// silently drop it.
const VIEWS = join(import.meta.dirname);

describe("SceneView interface", () => {
  it("HyperView and LedgerView declare `implements SceneView`", () => {
    for (const name of ["HyperView.ts", "LedgerView.ts"]) {
      const src = readFileSync(join(VIEWS, name), "utf8");
      expect(src.includes("implements SceneView"), `${name} must implement SceneView`).toBe(true);
    }
  });

  it("the interface exposes exactly setViewAlpha (kept minimal until Plan 2)", () => {
    const src = readFileSync(join(VIEWS, "SceneView.ts"), "utf8");
    expect(src.includes("setViewAlpha(a: number): void")).toBe(true);
  });
});
```

- [ ] **Step 4: Run + gate + commit**

Run: `npx vitest run src/engine/scene/views/sceneView.test.ts` — PASS. Then `npx tsc --noEmit && npm test` — all green (the `implements` clause compiles because both classes already have `setViewAlpha`).

```bash
git add src/engine/scene/views/SceneView.ts src/engine/scene/views/HyperView.ts src/engine/scene/views/LedgerView.ts src/engine/scene/views/sceneView.test.ts
git commit -m "refactor(scene): SceneView interface — views implement one shared shape"
```

---

### Task 4: Extend `noHardcodedColors` to `components/`

**Files:**
- Modify: `src/engine/noHardcodedColors.test.ts` (widen scan scope)
- Modify: the ≤6 `components/*.tsx` files carrying legacy `rgb()`/hex literals (migrate to CSS-var tokens)

**Interfaces:**
- Produces: nothing consumed later.

**Context:** Spec Part B #5 + the CLAUDE.md follow-up the design doc names. Today `noHardcodedColors` guards only `scene/`. There are only 6 legacy chromatic literals in `components/` — migrate them to the existing CSS-var tokens (the JSX colour lane is `var(--…)` per the design system), then widen the guard so new ones can't creep in.

- [ ] **Step 1: Find and read the 6 literals**

Run: `grep -rn "rgb(\|rgba(\|#[0-9a-fA-F]\{6\}" components/ --include=*.tsx | grep -v "//"`
For each: identify which token it should be (match the value against `app/globals.css` `:root` vars — e.g. an accent cyan → `var(--primary)`; a muted text tone → `var(--muted-foreground)`; a panel fill → `var(--panel)`). Grayscale/white/black and `currentColor` are exempt (they carry no identity/structural hue). Record the mapping in the task report BEFORE editing.

- [ ] **Step 2: Migrate each literal to its token**

For each identified literal, replace the hardcoded colour with the CSS-var token (`style={{ color: "var(--primary)" }}` or the Tailwind arbitrary form `text-[var(--primary)]` matching the surrounding code's style). If any literal has NO clean token equivalent (a genuine one-off), leave it and add it to the test's allowlist in Step 3 with a comment — but prefer a token.

- [ ] **Step 3: Widen the guard to components/**

In `src/engine/noHardcodedColors.test.ts`, add a second scan over `components/` (relative to repo root — the test currently scans `ENGINE_DIR`). Read the file first; mirror its existing `tsFiles` walk + chromatic-literal regex over a `COMPONENTS_DIR = join(import.meta.dirname, "..", "..", "components")`. Keep grayscale/`currentColor`/CSS-var forms exempt exactly as the scene scan does. If Step 2 left any documented one-off, add it to the same allowlist the scene scan uses.

- [ ] **Step 4: Run + gate + commit**

Run: `npx vitest run src/engine/noHardcodedColors.test.ts` — PASS (all 6 migrated, guard now covers components). Then `npx tsc --noEmit && npm test`. Full-reload the app and spot-check the migrated components render with the correct colours (they resolve to the same token values).

```bash
git add src/engine/noHardcodedColors.test.ts components/
git commit -m "test(components): extend the colour guard to components; migrate legacy literals to tokens"
```

---

### Task 5: Kill the dimModel inline mirror

**Files:**
- Modify: `src/engine/scene/objects/NodeFabric.ts` (the two write loops call dimModel)
- Modify: `src/engine/scene/Globe.ts` (drop `_dimScale`/`_metaDimScale`, thread dimModel via FrameCtx)
- Modify: `src/engine/domain/dimModel.ts` (delete the "reimplemented inline / change BOTH" header note)

**Interfaces:**
- Consumes: the existing `dimModel` exports — `dimScale(c)`, `metaDimScale(c)`, `focusDim(c)`, `focusBoost(c)`, `validatorDim(c, dim, geoCc)`, `metaNodeDim(c, recDim, geoCc)`, `hubMatchBoost(c, glow, committed)`, `nodeEmissive(c, d, flash, isFocus, dimOthersOnFocus, baseLo, baseHi)`, `metaNodeEmissive(c, d, flash, isFocus, dimOthersOnFocus, base, hubBoost)`.
- Produces: no new exports; the render path now CALLS these instead of copying their formulas.

**Context:** Spec Part A #1 — the highest-value unification. The dimModel module documents itself as a "reference spec the scene reimplements inline … change BOTH places," and that mirror drifted twice in one day (the `hubMatch` fork, the per-view `focusDim` that never made it back). Replace the inline formulas with direct calls. The per-view base VALUES that today are inline literals (`ei = 0.47 - 0.10*m` for validators; `glow` base `0.33 + 0.04*m` for metagraph nodes) are passed as the functions' `baseLo/baseHi` / `base` parameters — those endpoints stay exactly as they are today, so the render is pixel-neutral. **This is a behaviour-preserving refactor: every number stays; only the copy becomes a call.**

- [ ] **Step 1: Establish the pixel-neutral baseline**

Full-reload http://localhost:3000. With the dev-only FPS monitor (`http://localhost:3000/?stats`), note the resting FPS in hyper (all filter), geo, and ledger. This is the before-baseline; Task-end verification compares against it.

- [ ] **Step 2: Import the dimModel functions into NodeFabric**

Read `src/engine/scene/objects/NodeFabric.ts`. It currently imports `discFall, lerp, smooth` from `../../domain/nodeLayout` and uses `DimContext` from `../../domain/dimModel`. Add to the dimModel import: `validatorDim, metaNodeDim, nodeEmissive, metaNodeEmissive, hubMatchBoost, focusDim, focusBoost`.

- [ ] **Step 3: Rewrite `writeValidatorGlow` to call the functions**

The validator glow loop currently inlines (around NodeFabric.ts:438-459):
```ts
    const focusDim = c.ledger ? 0.55 : 0.45 + 0.20 * m;      // ← delete (local)
    const focusBoost = c.ledger ? 0.7 : 1.4 - 0.7 * m;        // ← delete (local)
    // ... per node:
      let d = dim * dimScaleV;
      const geoCc = geoCcOf(u.pick);
      if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) d = Math.max(d, c.countryMix);
      const ei = 0.47 - 0.10 * m;
      const flRaw = u._flash || 0;
      const fl = flRaw * m;
      emi[u.index] = Math.max(0.02, ei * (1 - d * 0.92) + fl);
      if (focusId) {
        if (<u is focus>) emi[u.index] += focusBoost;
        else if (dimOthersOnFocus) emi[u.index] *= focusDim;
      }
```
Replace the per-node math with `validatorDim` + `nodeEmissive`, keeping the validator base endpoints (0.5→0.22 is the DOCUMENTED validator base in dimModel's header/tests; but the CURRENT render uses `ei = 0.47 - 0.10*m`, i.e. baseLo=0.47/baseHi=0.37 — pass THOSE, the live values, to stay pixel-neutral):
```ts
      const geoCc = geoCcOf(u.pick);
      const d = validatorDim(c, dim, geoCc);        // absorbs dim*dimScale + the countryMix raise
      const isFocus = !!(focusId && (u.nodeId === c.hoverNodeId || u.nodeId === c.selectedNodeId || (!!u.nodeId && c.hoverCohort?.has(u.nodeId))));
      emi[u.index] = nodeEmissive(c, d, u._flash || 0, isFocus, !!focusId && dimOthersOnFocus, 0.47, 0.37);
```
NB: `validatorDim` uses `dimScale(c)` internally, so `ctx.dimScaleV` is no longer read here (see Step 6). Confirm the `nodeEmissive` floor (0.02) and suppression (0.92) match what the inline had (they do — that's the point). Delete the now-unused local `focusDim`/`focusBoost` consts and `ei`.

- [ ] **Step 4: Rewrite `writeMetaFrame`'s glow to call the functions**

The metagraph glow currently inlines (around NodeFabric.ts:496-519):
```ts
    const focusDim = c.ledger ? 0.55 : 0.45 + 0.20 * m;      // ← delete (local)
    const focusBoost = c.ledger ? 0.7 : 1.4 - 0.7 * m;        // ← delete (local)
    // ... per record:
      let dEff = r.dim * (c.ledger ? 0.82 : dimScaleMetaV);
      const geoCc = geoCcOf(r.pick);
      if (cf && (!geoCc || geoCc !== cf)) dEff = Math.max(dEff, cmix);
      const glow = (0.33 + 0.04 * m) * (1 - dEff * 0.9);
      const hubMatch = c.filter === r.metaId ? Math.max(0, 0.72 - glow) * clamp(1 - m/0.3, 0, 1) : 0;
      emi[r.index] = Math.max(0.03, glow + fl + hubMatch);
      if (focusId) { if (<r is focus>) emi[r.index] += focusBoost; else if (dimOthersOnFocus) emi[r.index] *= focusDim; }
```
Replace with `metaNodeDim` + `hubMatchBoost` + `metaNodeEmissive` (the metagraph base is the live `0.33 + 0.04*m` — pass it as the `base` arg; `metaNodeEmissive` already composes `hubBoost` inside its 0.03 floor and applies `focusBoost`/`focusDim`):
```ts
      const geoCc = geoCcOf(r.pick);
      const dEff = metaNodeDim(c, r.dim, geoCc);              // absorbs the ledger-0.82 / metaDimScale + countryMix
      const base = 0.33 + 0.04 * m;
      const glow = base * (1 - dEff * 0.9);                    // needed for hubMatchBoost's gap-to-0.72
      const hubBoost = hubMatchBoost(c, glow, c.filter === r.metaId);
      const isFocus = !!(focusId && (r.nodeId === c.hoverNodeId || r.nodeId === c.selectedNodeId || c.hoverCohort?.has(r.nodeId)));
      emi[r.index] = metaNodeEmissive(c, dEff, r._flash || 0, isFocus, !!focusId && dimOthersOnFocus, base, hubBoost);
```
Keep the `col`/`dEff`-driven colour and the scale/position writes exactly as they are (they read `dEff`, which is now the domain value — same number). Delete the now-unused local `focusDim`/`focusBoost` consts. **Note the scale/visibility writes elsewhere in the loop use `dEff` too — they must use the SAME `dEff` you just computed; do not compute a second one.**

- [ ] **Step 5: Update the mirror comments to say the mirror is gone**

In `NodeFabric.ts`, the loops carry comments like `Mirrors domain/dimModel.focusBoost — change BOTH` and `Mirrors domain/dimModel.hubMatchBoost … change BOTH`. Replace each with a note that the loop now CALLS the dimModel function directly (no mirror). Remove any leftover comment claiming the formula is duplicated.

- [ ] **Step 6: Drop `_dimScale`/`_metaDimScale` from Globe**

In `src/engine/scene/Globe.ts`, `_dimScale()` (`0.32 + 0.68*morph`) and `_metaDimScale()` (`morph`) are written into `ctx.dimScaleV`/`ctx.dimScaleMetaV` each frame (in `_frameCtx`). Now that `validatorDim`/`metaNodeDim` call `dimScale(c)`/`metaDimScale(c)` internally, these are redundant for the GLOW path — BUT verify no OTHER consumer reads `ctx.dimScaleV`/`dimScaleMetaV` (the validator SCALE writes and the `show`/visibility factors do — grep both files). If the scale/visibility writes still need the ramp, KEEP the FrameCtx fields but source them from `dimScale(c)`/`metaDimScale(c)` (call the domain function in `_frameCtx` instead of the local `_dimScale()` method), then delete the two Globe methods. If nothing else reads them, delete the fields too. Grep `dimScaleV|dimScaleMetaV` across `scene/` and decide per the actual readers; record the decision in the report.

- [ ] **Step 7: Delete the "change BOTH" contract from dimModel's header**

In `src/engine/domain/dimModel.ts`, the file header (lines ~1-19) declares it a "reference + regression spec … The render path inlines these formulas verbatim rather than calling into this module … Any change here must be made in BOTH places." Rewrite it: the render path NOW CALLS these functions (NodeFabric's glow writers + Globe's dim strengths); this module is the single source, its colocated tests are the spec. Keep the historical DEVIATION note about `nodeEmissive` vs `metaNodeEmissive` coefficients (still accurate).

- [ ] **Step 8: Gate + pixel-neutral verification**

Run: `npx tsc --noEmit && npm test` — all green (the dimModel tests already pin every function; no test should need changing — if one breaks, the refactor changed a number, which means it is NOT pixel-neutral; fix the call to restore the exact value).

Full-reload http://localhost:3000. Compare against the Step-1 baseline:
- **hyper (all filter)**: node glow identical; commit a metagraph → the picked network pops to hub level, others rest dim, exactly as before.
- **geo**: node chips, density pools, filter isolate/hide identical.
- **ledger**: lane chips, filter dim, focus boost identical.
- FPS unchanged vs baseline (a function call per node is noise at ~350 instances; if `?stats` shows a regression, report it).

Take one JPEG@50 screenshot of focused-hyper and one of geo for the report.

- [ ] **Step 9: Commit**

```bash
git add src/engine/scene/objects/NodeFabric.ts src/engine/scene/Globe.ts src/engine/domain/dimModel.ts
git commit -m "refactor(dim): NodeFabric/Globe CALL dimModel — kill the inline mirror"
```

---

### Task 6: Docs — CLAUDE.md reflects the gates + the un-mirror

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: nothing.

**Context:** CLAUDE.md's rules list and the `dimModel.ts` bullet describe the inline-mirror as a live contract; the un-mirror retires it, and three new enforced tests join the executable-rules set.

- [ ] **Step 1: Update the executable-rules list**

In CLAUDE.md's "The rules — invariants" section (the "Enforced by tests" list), add the three new gates alongside `layerBoundaries`/`selectionBoundary`/`noHardcodedColors`: domain-export coverage (`domainExportCoverage.test.ts`), zero-allocation render loop (`noFrameAllocations.test.ts`), and the SceneView type contract — plus note `noHardcodedColors` now also covers `components/`. Keep the entries one line each in the existing voice.

- [ ] **Step 2: Rewrite the dimModel bullet**

Find the `dimModel.ts` bullet in the `domain/` module list. It says the scene "reimplements inline … rather than calling" and references the change-BOTH contract. Rewrite: the scene now CALLS dimModel's functions (`NodeFabric`'s glow writers, Globe's dim strengths); it is the single source, tested in isolation. Remove any other "change BOTH places"/"mirror" phrasing about dimModel elsewhere in the file (grep `change BOTH`, `mirror`, `reimplement`).

- [ ] **Step 3: Gate + commit**

Run: `npm test` (docs must not break the CLAUDE.md-referencing tests, if any). 

```bash
git add CLAUDE.md
git commit -m "docs: enforced-rules list gains the new gates; dimModel mirror retired"
```

---

## Final verification (after Task 6)

- `npx tsc --noEmit && npm test` — clean, all suites (369 + the new gate tests).
- `npx next build` with the dev server running — clean; `/api/metagraphs` stays `○` 10m.
- Full visual pass: hyper (all + a focused metagraph), geo (all + a country drill + a node), ledger (a layer + a node) — all pixel-identical to pre-refactor (the un-mirror changed no numbers).
- `superpowers:requesting-code-review` on the branch before the Plan 2 work builds on it.

## Deferred to Plan 2 (mechanism unification, ON these gates)

Spec Part A #2–7 and Part C: the `FadeSet` fade registry (+ HyperView/LedgerView conversion), the stage-light coordinator, the shared `ringNormal`/`makeRadialGradientTexture`/`rgbTriplet`/`applyHyperRig` helpers, the fade-curve consistency sweep, the visibility-ownership rule, the transition-window input gate, the render-loop phase-method restructure, the `?slowmo` dev flag, and the focus/zoom-ladder table. Each is pixel-neutral and lands with the relevant gate (now in place) extended.
