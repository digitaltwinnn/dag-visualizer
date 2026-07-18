# Consistency Hardening — Plan 2: Mechanism Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One mechanism per concern for the scene layer's remaining hand-rolled patterns — shared helpers, a fade registry, a stage-light coordinator, the render-loop phase contract, the transition-window camera gate — each pixel-neutral (except the one deliberate fade-curve fix), landing on the enforcement gates Plan 1 built.

**Architecture:** Extract the duplicated math/texture/rig code into shared helpers (domain + scene); convert HyperView/LedgerView's furniture fades to a `FadeSet` registry; centralize the FocusSpot blackout lifecycle in a `StageLights` coordinator with a per-view domain constants table; restructure the Engine render loop into named phase methods with an explicit ordering contract (and extend the allocation gate to cover them); gate HUD-commit camera reframes during the transition's OUT phase; sweep the dead `hyperFocusFraming` weight and add a `?slowmo` dev flag.

**Tech Stack:** TypeScript, Three.js (vanilla), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-consistency-hardening-design.md` (approved). This plan implements Part A #2–7 and Part C #1–4. Already shipped (do NOT re-do): Part A #1 (dimModel un-mirror), all of Part B, Part C #2's *test* (`sceneViewContract.test.ts`'s marker-gated `getWorldPosition`/`getMatrixAt`). **Part C #5 (the focus/zoom-ladder table) is DEFERRED** — the spec says "evaluate", which is a design conversation, not a plan task; it gets its own brainstorm.

## Global Constraints

- **Pixel-neutral by default:** every refactor renders byte-identically (same formulas, same values, now shared). The ONE deliberate visual change is Task 6 (the fade-curve fix, a review-flagged defect) — it is verified live, not asserted neutral.
- Engine layering (`layerBoundaries.test.ts`): `domain/` imports THREE math + config + types only; `scene/` never touches store/react; `Engine.ts` is the only store bridge.
- Domain-export coverage (`domainExportCoverage.test.ts`): every NEW domain value export ships WITH a reference in its sibling test — the gate fails otherwise.
- Zero-allocation render loop (`noFrameAllocations.test.ts`): no per-frame `new THREE.*`/`.clone()` without an `// event-time` marker.
- Scene-view contract (`sceneViewContract.test.ts`): scene modules never compare `Mode` strings; new views ride `setViewAlpha`.
- Per-change gate: `npx tsc --noEmit && npm test` before every commit. Baseline: **437 tests, 37 files, all green.**
- The dev server runs on http://localhost:3000 (coordinator-owned) — workers must NOT start/kill servers. Engine/scene constructor changes need a full page reload.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Shared scene math/texture helpers (spec A#4)

**Files:**
- Modify: `src/engine/domain/nodeLayout.ts` (add `ringNormal`), `src/engine/domain/nodeLayout.test.ts`
- Modify: `src/engine/domain/hyperLayout.ts` (add `applyHyperRig`), `src/engine/domain/hyperLayout.test.ts`
- Create: `src/engine/scene/objects/gradientTexture.ts`
- Modify: `src/engine/scene/Globe.ts`, `src/engine/scene/views/HyperView.ts`, `src/engine/scene/views/LedgerView.ts`

**Interfaces:**
- Produces: `ringNormal(frame: RingFrame, out: THREE.Vector3): THREE.Vector3` (domain/nodeLayout); `applyHyperRig(o: { rotation: THREE.Euler }, spinY: number, tiltX?: number): void` (domain/hyperLayout); `makeRadialGradientTexture(stops: [number, string][]): THREE.Texture` (scene/objects/gradientTexture); `rgbTriplet(c: THREE.Color): string` (LedgerView-local, not exported).

**Context:** Four copy-paste families. (1) The ring-plane normal `frame.t.clone().cross(frame.b).normalize()` appears at `Globe.ts:284`, `Globe.ts:460`, `HyperView.ts:387` — all construction/rebuild paths (event-time). (2) `makeGlowTexture` (`Globe.ts:1097`) and `makeRingFillTexture` (`HyperView.ts:46`) are the same canvas-radial-gradient boilerplate differing only in stops. (3) `LedgerView.ts:470/472/478/480` repeat `` `${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}` `` four times. (4) The HYPER_TILT+spin Euler composition `rotation.set(tiltX, y, 0)` is hand-synced at `HyperView.ts:142` (`root.rotation.x = HYPER_TILT` — tilt only, spin 0), `HyperView.ts:218` (`coreGroup.rotation.x = HYPER_TILT`), `HyperView.ts:338-339` (`setHyperSpin` body: root + coreGroup), `Globe.ts:235` (`group.rotation.set(HYPER_TILT, 0, 0)`), `Globe.ts:246` (`setHyperSpin` body).

- [ ] **Step 1: `ringNormal` in domain/nodeLayout + test**

Find the ring-frame type the three sites use (the object with `.t`/`.b` tangent/bitangent fields — read `Globe.ts:280-290` to get its exact name/import; it comes from `armillaryFrame`/`ringFramePos`'s frame). Add to `src/engine/domain/nodeLayout.ts`:

```ts
// The ring PLANE's normal — the axis nodes orbit / hoops face. One home for the t×b
// cross-product three scene sites used to inline (Globe's shell axes, HyperView's hoop normal).
// Writes into `out` (callers pass their own scratch or an event-time temp) and returns it.
export function ringNormal(frame: { t: THREE.Vector3; b: THREE.Vector3 }, out: THREE.Vector3): THREE.Vector3 {
  return out.crossVectors(frame.t, frame.b).normalize();
}
```

Add to `nodeLayout.test.ts` a real assertion (orthogonality + unit length + handedness):

```ts
describe("ringNormal", () => {
  it("returns the unit normal of the t×b plane, orthogonal to both", () => {
    const frame = { t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, -1) };
    const out = ringNormal(frame, new THREE.Vector3());
    expect(out.y).toBeCloseTo(1); // right-handed: x × (−z) = +y
    expect(out.length()).toBeCloseTo(1);
    expect(out.dot(frame.t)).toBeCloseTo(0);
    expect(out.dot(frame.b)).toBeCloseTo(0);
  });
});
```

Convert the three sites. They currently `.clone()` (event-time allocation); pass a temp instead: `const ringAxis = ringNormal(_rf, new THREE.Vector3()); // event-time` (keep the marker — these run in rebuild paths that the allocation gate may scan; check whether each enclosing method matches the gate's PER_FRAME list and keep/add markers accordingly).

- [ ] **Step 2: `applyHyperRig` in domain/hyperLayout + test**

```ts
// The ONE hyper-structure rig composition: Euler XYZ → the shared tilt applied AFTER the
// Y-spin, so the tilted ring structure spins about its own vertical axis. Five sites
// (HyperView root/coreGroup + Globe's node group, at construction and per-frame spin)
// hand-synced this line; they all call this now, so nodes/hubs/hoops can never desync.
export function applyHyperRig(o: { rotation: THREE.Euler }, spinY: number, tiltX: number = HYPER_TILT): void {
  o.rotation.set(tiltX, spinY, 0);
}
```

Test (in `hyperLayout.test.ts`): construct a `new THREE.Euler()` holder, call `applyHyperRig({ rotation: e }, 1.2, 0.5)`, assert `e.x === 0.5 && e.y === 1.2 && e.z === 0`; call without tiltX and assert `e.x === HYPER_TILT`.

Convert the five sites listed in Context (each becomes `applyHyperRig(this.root, 0)` / `applyHyperRig(this.coreGroup, 0)` / `applyHyperRig(this.root, y, tiltX)` etc. — the two construction sites pass spin 0 explicitly; `setHyperSpin` bodies in BOTH files become single `applyHyperRig(...)` calls, keeping their existing guards/comments). NB `HyperView.ts:142`/`218` set only `.rotation.x` today (leaving y/z at 0) — `applyHyperRig(o, 0)` writes the same final state (x=HYPER_TILT, y=0, z=0), pixel-neutral.

- [ ] **Step 3: `makeRadialGradientTexture` + convert the two texture factories**

```ts
// src/engine/scene/objects/gradientTexture.ts
import * as THREE from "three";

// The ONE canvas radial-gradient sprite factory (spec A#4): white stops so the material's
// `color` tints it; the stop table is the whole difference between the geo glow-pool sprite
// and the hyper ring-fill band. Event-time (called once per texture, cached by the callers).
export function makeRadialGradientTexture(stops: [number, string][]): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

`Globe.ts`: delete the `makeGlowTexture` function (lines ~1095-1111); at its call site (`Globe.ts:523`) use `makeRadialGradientTexture([[0, "rgba(255,255,255,1.0)"], [0.32, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]])`, keeping the original explanatory comment at the call site. `HyperView.ts`: delete `makeRingFillTexture` (lines ~43-61); its call site (`HyperView.ts:378`) uses `makeRadialGradientTexture([[0, "rgba(255,255,255,0)"], [0.84, "rgba(255,255,255,0)"], [0.96, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0.8)"]])`, comment moved likewise. Same stop values verbatim — pixel-neutral. (The `rgba(255,255,255,…)` strings are white/grayscale — exempt from the colour guard; verify the guard stays green.)

- [ ] **Step 4: `rgbTriplet` in LedgerView**

Add a module-level helper in `LedgerView.ts` (not exported — single consumer):

```ts
// "r,g,b" 0-255 triplet for canvas fillStyle composition — kills the 4× Math.round copy-paste.
const rgbTriplet = (c: THREE.Color): string =>
  `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
```

Rewrite lines 470/472/478/480: `` const tone = `rgba(${rgbTriplet(cc)},0.85)`; `` etc. — identical output strings.

- [ ] **Step 5: Gate + visual check + commit**

Run: `npx tsc --noEmit && npm test` — all green (the new domain exports are referenced by their sibling tests, so `domainExportCoverage` passes). Full-reload http://localhost:3000; spot-check hyper (hoops + ring fills + core), geo (density glow pools), ledger (labels) — identical.

```bash
git add src/engine/domain/ src/engine/scene/
git commit -m "refactor(scene): shared ringNormal/applyHyperRig/gradient-texture/rgbTriplet helpers"
```

---

### Task 2: `FadeSet` — the one furniture-fade registry (spec A#2)

**Files:**
- Create: `src/engine/scene/objects/FadeSet.ts`
- Modify: `src/engine/scene/views/HyperView.ts`, `src/engine/scene/views/LedgerView.ts`, `src/engine/scene/views/SceneView.ts`

**Interfaces:**
- Produces: `class FadeSet { alpha: number; register(mat: { opacity: number }, base: number): void; apply(a: number): void }`. `SceneView` gains a documented note (NOT a new required member — keep the interface minimal; the registry is an implementation pattern, enforced by convention + this plan's conversion).

**Context:** Globe's `geoFades` ({mat, base}[] walked by the morph loop) is the pattern source — threading the geo furniture alpha cost 1 line there vs 11/16 hand-edits in HyperView/LedgerView. Reality check (verified): most `_viewAlpha` sites in both views are DYNAMIC per-frame expressions (`opacity = f(state) * this._viewAlpha`) — per the spec those KEEP their expressions and read the alpha from ONE place. The registry's static-entry walk covers the truly static materials. So the conversion is: `FadeSet` becomes the single OWNER of the view's alpha; static materials register; dynamic writes read `this._fades.alpha`.

- [ ] **Step 1: Write FadeSet**

```ts
// src/engine/scene/objects/FadeSet.ts
// The ONE furniture-fade mechanism (spec A#2), extracted from Globe's geoFades pattern:
// a view registers its STATIC materials (base opacity × the view alpha, nothing else) and
// FadeSet.apply() walks them; per-frame DYNAMIC writes (eased hub glow, tile brightness,
// state-dependent floors) keep their expressions but read `.alpha` from here — the single
// owner of the view's furniture alpha. Outcome: the next cross-cutting fade change (an
// easing curve, a global dim) is ONE edit here, not a per-view grep.
export class FadeSet {
  alpha = 1; // the view's current furniture alpha (transition.furnitureAlpha), read by dynamic writes
  private entries: Array<{ mat: { opacity: number }; base: number }> = [];

  // Event-time (construction/rebuild): register a material whose opacity is exactly base × alpha.
  register(mat: { opacity: number }, base: number): void {
    this.entries.push({ mat, base });
  }

  // Per frame (or per alpha change): store the alpha and walk the static entries.
  apply(a: number): void {
    this.alpha = a;
    for (const e of this.entries) e.mat.opacity = e.base * a;
  }
}
```

- [ ] **Step 2: Convert LedgerView**

Add `private _fades = new FadeSet();`. In `setViewAlpha(a)` replace `this._viewAlpha = a;` with `this._fades.apply(a);` (keep the existing `if (a <= 0.001) this._spot.blackout();` — Task 3 removes it centrally). Register the STATIC entries at their construction sites and delete their per-frame writes: the label materials (`LedgerView.ts:780` — `opacity = this._viewAlpha`, i.e. base 1: `this._fades.register(lbl.material as THREE.MeshBasicMaterial, 1)` where each label is built) and the DAG-L1 ring (`LedgerView.ts:781` — base `DIAL_REST_OP`). Every remaining `this._viewAlpha` read becomes `this._fades.alpha` (mechanical rename — 15+ dynamic sites; keep every expression identical). Delete the `_viewAlpha` field.

⚠️ If a registered material is REBUILT on a data event (labels are rebuilt when the metagraph set changes — check `_makeLabel`'s callers), the stale entry would fade a dead material: either re-register on rebuild (FadeSet gains `clear(): void { this.entries.length = 0; }` and the rebuild re-registers) or keep rebuild-prone materials on the dynamic path. Read the rebuild path first and pick; record the decision in the report.

- [ ] **Step 3: Convert HyperView**

Same pattern: `_fades = new FadeSet()`, `setViewAlpha` → `this._fades.apply(a)` (keep its blackout line for now), every `this._viewAlpha` read → `this._fades.alpha`. HyperView's sites (478-578) are ALL dynamic (verified) — expect zero static registrations; that is fine and expected: the value here is the single alpha owner + the registry being ready for future static materials. Note it in the report rather than forcing registrations.

- [ ] **Step 4: Document on SceneView**

In `SceneView.ts`, extend the interface doc comment (not the interface shape): "Implementations own a `FadeSet` — the single owner of the view's furniture alpha; `setViewAlpha` forwards to `FadeSet.apply`." Keep `setViewAlpha` the only required member (Plan 2's original intent to grow the interface stops here — YAGNI; the fade registry is composition, not interface surface).

- [ ] **Step 5: Gate + visual check + commit**

`npx tsc --noEmit && npm test` — green. Full-reload; run a hyper→ledger→geo→hyper switch cycle and confirm the build/teardown fades are identical (the transition choreography exercises every fade path). Screenshot one mid-IN frame of hyper→ledger for the report if the chrome-devtools MCP is available.

```bash
git add src/engine/scene/
git commit -m "refactor(scene): FadeSet — one furniture-fade registry, views own a single alpha"
```

---

### Task 3: `StageLights` coordinator + the stage-light constants table (spec A#3)

**Files:**
- Create: `src/engine/domain/stageLight.ts`, `src/engine/domain/stageLight.test.ts`
- Create: `src/engine/scene/objects/StageLights.ts`
- Modify: `src/engine/scene/objects/FocusSpot.ts` (no API change expected — read first), `src/engine/scene/Globe.ts`, `src/engine/scene/views/HyperView.ts`, `src/engine/scene/views/LedgerView.ts`, `src/engine/Engine.ts`

**Interfaces:**
- Produces: `STAGE_LIGHTS: Record<View3D, { angle: number; distance: number; intensity: number; penumbra?: number; height: number; heightDag?: number }>` (domain); `class StageLights { register(view: View3D, spot: FocusSpot): void; gate(alphas: Record<View3D, number>): void }` (scene/objects). View ctors gain a `stage: StageLights` parameter.
- Consumes: `FocusSpot` as-is; `View3D` from `domain/viewTransition`.

**Context:** Three FocusSpot instances with hand-rolled lifecycles: Globe (geo — `{angle: 0.36, distance: 22, intensity: 1.5}`, aim height 6, `Globe.ts:192/1040-1048`), HyperView (`{angle: SPOT_ANGLE, distance: 40, intensity: SPOT_I, penumbra: 0.25}`, heights `SPOT_H`/`SPOT_H_DAG` 17 — read `HyperView.ts:36-41` for the exact constant values, `HyperView.ts:150/184/196/578`), LedgerView (`{angle: 0.75, distance: 44, intensity: 2.6}`, aim height 14, `LedgerView.ts:242/530/542/768-773`). Blackout is scattered: each view's `setViewAlpha` checks `a <= 0.001`, HyperView also blackouts on focus-change (`:196`), and the Engine loop has `else this.ledger.spotOff()` (the "hyper forgot its spotOff" bug class). Centralize: the Engine feeds ONE gate call per frame; a view whose alpha is 0 gets its spot blacked out centrally. Views keep DRIVING their lit spot (aim + update) — ownership of "where/how bright" stays per-view; only the OFF lifecycle centralizes.

- [ ] **Step 1: The domain constants table + test**

```ts
// src/engine/domain/stageLight.ts
// Per-view stage-light staging constants (spec A#3) — the viewPolicy idiom: one row per 3D
// view, consumed by the view's FocusSpot construction + aim calls. The per-view VALUES are
// deliberate tuning (non-goals: values stay per-view; the MECHANISM unifies).
import type { View3D } from "./viewTransition";

export interface StageLightRow {
  angle: number;     // SpotLight cone half-angle (rad)
  distance: number;  // light range — size past the farthest lit point (decay 0)
  intensity: number; // full-on target the FocusSpot eases toward
  penumbra?: number; // soft edge (FocusSpot defaults 0.5)
  height: number;    // aim(): light this far above the subject along the staging normal
  heightDag?: number; // hyper only: the DAG-core stage uses its own height
}

export const STAGE_LIGHTS: Record<View3D, StageLightRow> = {
  // hyper: cone covers the outer cL1 ring (5.4) with margin at height; the DAG core is the
  // same subject at a bigger scale (L1 shell 12.5) → its own higher stage (heightDag).
  hyper: { angle: 0.9, distance: 40, intensity: 2.4, penumbra: 0.25, height: 9, heightDag: 17 },
  geo: { angle: 0.36, distance: 22, intensity: 1.5, height: 6 },
  ledger: { angle: 0.75, distance: 44, intensity: 2.6, height: 14 },
};
```

These values are moved VERBATIM from the current code: hyper's from `HyperView.ts:35-40` (`SPOT_H` 9, `SPOT_ANGLE` 0.9, `SPOT_I` 2.4, `SPOT_H_DAG` 17 — delete those local consts once moved, keeping their explanatory comments with the table rows; the aim site `HyperView.ts:586` `spotMeta ? SPOT_H : SPOT_H_DAG` becomes `spotMeta ? ROW.height : ROW.heightDag!`), geo's from `Globe.ts:192` + aim height 6 at `:1048`, ledger's from `LedgerView.ts:242` + aim height 14 at `:773`. Test (`stageLight.test.ts`): pin every row's values (`expect(STAGE_LIGHTS.geo).toEqual({ angle: 0.36, distance: 22, intensity: 1.5, height: 6 })`, same for hyper/ledger) and assert all three `View3D` keys exist.

- [ ] **Step 2: The StageLights coordinator**

```ts
// src/engine/scene/objects/StageLights.ts
// The ONE stage-light lifecycle owner (spec A#3): every view's FocusSpot registers here; the
// Engine calls gate() once per frame with the per-view furniture alphas, and any view at
// alpha ≈ 0 has its spot blacked out CENTRALLY — a view can no longer "forget its spotOff"
// (the lingering-spotlight bug class). Views keep driving their LIT spot (aim + update);
// only the off-lifecycle is centralized.
import type { View3D } from "../../domain/viewTransition";
import type { FocusSpot } from "./FocusSpot";

export class StageLights {
  private spots = new Map<View3D, FocusSpot>();

  register(view: View3D, spot: FocusSpot): void {
    this.spots.set(view, spot);
  }

  // Per frame: black out every registered spot whose view is dark. Idempotent (blackout of
  // an already-dark spot is a no-op write), so no per-spot state tracking is needed.
  gate(alphas: Record<View3D, number>): void {
    for (const [view, spot] of this.spots) {
      if (alphas[view] <= 0.001) spot.blackout();
    }
  }
}
```

- [ ] **Step 3: Wire construction + registration**

Engine constructs `this._stageLights = new StageLights()` before the views and passes it into the Globe/HyperView/LedgerView constructors (add a ctor param each). Each view: construct its FocusSpot from its `STAGE_LIGHTS[view]` row (replacing the inline option object) and `stage.register("<view>", this._spot)`. Replace the aim-height literals with the row's `height` (and `heightDag` at HyperView's DAG-core aim site). Values identical → pixel-neutral.

- [ ] **Step 4: Centralize the blackout**

Delete the per-view blackout lines: `HyperView.ts:184` (`if (a <= 0.001) this._spot.blackout()`), `LedgerView.ts:530` (same), and the Engine loop's `else this.ledger.spotOff()` branch (and `LedgerView.spotOff` itself if nothing else calls it — grep first). KEEP `HyperView.ts:196`'s focus-change blackout (that is a *within-view* re-stage, not view lifecycle) and `LedgerView.ts:542`'s (read its context — if it is a data/filter re-stage, keep; if it is view-lifecycle, delete; record the call). In the Engine loop, after the furniture alphas are computed, add ONE call:

```ts
// Central stage-light gate: any view whose furniture is dark gets its spot blacked out
// here — a view cannot forget its own off-switch (spec A#3).
this._stageLights.gate({
  hyper: this.transition.furnitureAlpha("hyper"),
  geo: this.transition.furnitureAlpha("geo"),
  ledger: ledgerActive ? ledgerAlpha : 0,
});
```

(`ledgerActive`/`ledgerAlpha` already exist in the loop — reuse them; the geo/hyper alphas are already computed for `setViewAlpha` — hoist to consts rather than calling `furnitureAlpha` twice.) NB the object literal above allocates per frame — hoist it to a construction-time field (`private _lightAlphas = { hyper: 0, geo: 0, ledger: 0 }`) and mutate it, per the zero-allocation rule.

- [ ] **Step 5: Gate + visual check + commit**

`npx tsc --noEmit && npm test`. Full-reload. Verify each spotlight: hyper (commit a metagraph → spot over the atom; switch to geo mid-glow → no lingering light), geo (select a node → spot on the chip stack), ledger (commit a layer → spot on the lead area; switch out → dark). The lingering-spot regression test is the hyper→geo switch WITH a committed metagraph.

```bash
git add src/engine/domain/ src/engine/scene/ src/engine/Engine.ts
git commit -m "refactor(scene): StageLights coordinator + per-view stage-light table — central spot lifecycle"
```

---

### Task 4: Visibility-ownership rule — enforced (spec A#5)

**Files:**
- Modify: `src/engine/sceneViewContract.test.ts` (new assertion), `CLAUDE.md` (the rule, one bullet — full docs pass is Task 10)

**Interfaces:** none.

**Context:** The Engine/policy owns `visible` on view ROOT groups (the ledger already lives this — Engine is the sole owner of `ledger.group.visible` since the transitions branch); views own opacity/alpha. Make it executable: a scene/views module must not assign its root `group.visible`/`root.visible`. Child-mesh visibility (e.g. LedgerView's `this.center.visible`, per-tile visibility) stays view-owned — the rule is about the ROOT.

- [ ] **Step 1: Extend sceneViewContract.test.ts**

Add a fourth `it` block:

```ts
it("views never write their root group's `visible` — the Engine/policy owns it (spec A#5)", () => {
  // Root-group visibility is VIEW LIFECYCLE (which view is on) — Engine territory. Views own
  // opacity/alpha (FadeSet) + child-mesh visibility. `this.group.visible =` in a view is the
  // two-writers bug class (the Engine/LedgerView fight the transitions branch fixed).
  const ROOT_VIS = /this\.(group|root)\.visible\s*=/;
  for (const f of sourceFiles(join(HERE, "scene/views"))) {
    const src = readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      const code = line.split("//")[0];
      expect(ROOT_VIS.test(code), `${f.split("/src/")[1]}:${i + 1} writes the view root's visible — Engine/policy owns root visibility; views fade via alpha`).toBe(false);
    }
  }
});
```

- [ ] **Step 2: Run — triage any hit**

`npx vitest run src/engine/sceneViewContract.test.ts`. Expected: green (the ledger fight was already fixed). If a view still writes its root `visible`, that is a REAL finding: move the write to the Engine (mirror how `ledger.group.visible` is computed in the loop) — do not weaken the regex. Record the disposition.

- [ ] **Step 3: One CLAUDE.md line + gate + commit**

Add to CLAUDE.md's enforced-rules item 6 (the scene-view contract entry) a clause: "views never write their root group's `visible` — Engine/policy owns view-root visibility, views own opacity/alpha". Then `npx tsc --noEmit && npm test`.

```bash
git add src/engine/sceneViewContract.test.ts CLAUDE.md
git commit -m "test(scene): enforce Engine ownership of view-root visibility (spec A#5)"
```

---

### Task 5: Transition-window camera gate + transition minors (spec A#6)

**Files:**
- Modify: `src/engine/domain/viewTransition.ts` (+`holdCamera()`), `src/engine/domain/viewTransition.test.ts`
- Modify: `src/engine/Engine.ts` (`_tweenTo` guard; `_pendingBoundary` defensive null)
- Modify: `src/engine/domain/gatherLayout.ts` (dead `rows`), `src/engine/domain/gatherLayout.test.ts` (edge + tie-break tests)

**Interfaces:**
- Produces: `ViewTransition.holdCamera(): boolean`.

**Context:** Picking is already suppressed mid-flight, but HUD commits (filter picker, LiveStrip bars) still fire camera reframes during the OUT phase, breaking "the camera holds still through teardown". Every camera move funnels through `Engine._tweenTo` (verified: `focus()`, `_focusFilter`, `_focusNode`, `_focusLayer`, the country/geo framings — all call it), so ONE guard suffices. The boundary already re-derives the correct pose from committed state (`_applyBoundary` → `_applyDestLayout` → `applyFilter(false)` + `_focusSelection()` / the ledger ladder), so a suppressed OUT-phase reframe is not lost — the boundary frames it. During IN the transition's own camera flight is live and a retargeting commit may steer it (unchanged behaviour — the spec names only OUT). Plus the final-review triage minors: `gatherLayout.ts:23`'s `rows` field is computed and returned but never consumed (verify by grep before deleting); no empty-input/singleton `gatherSlots` tests; the size-sort tie-break direction is unpinned; and the reverse-to-origin retarget path leaves `_pendingBoundary` set (harmless today — the machine goes straight to IN and no boundary fires, and any next `setMode` overwrites it — but a defensive null documents the invariant).

- [ ] **Step 1: `holdCamera` + test**

In `viewTransition.ts`:

```ts
// While the OUT phase runs, the camera HOLDS STILL through the teardown (spec A#6): HUD
// commits (filter picker, strip bars) may change state, but their camera reframe is
// suppressed — the boundary re-derives the pose from the committed state anyway, so
// nothing is lost. IN-phase flights are live (the transition's own camera flight runs).
holdCamera(): boolean {
  return this.phase === "out";
}
```

Test: `settle("hyper")` → `holdCamera()` false; `start("hyper","geo")` → true; `tick(DUR_OUT)` (boundary) → false (phase is "in"); after full settle → false; `stage("hyper")` (soon-view gather) → true — the parked teardown holds the camera too; `stageInstant()` → false.

- [ ] **Step 2: The Engine guard**

At the top of `_tweenTo` (`Engine.ts:931`):

```ts
private _tweenTo(toPos: Vec, toTgt: Vec, dolly = true) {
  // OUT-phase camera hold (spec A#6): the state commit stands; the boundary's
  // _applyDestLayout re-derives this pose from it, so dropping the tween loses nothing.
  if (this.transition.holdCamera()) return;
```

⚠️ Confirm the boundary's own camera flight still runs: `tick()` flips phase to "in" BEFORE `_applyBoundary` is called in the loop (verified: the tick returns true after setting `phase = "in"`), so the boundary's `_tweenTo` passes the guard. State this in the report with the line numbers.

- [ ] **Step 3: `_pendingBoundary` defensive null**

In `setMode`'s 3D→3D branch (`Engine.ts:~496-500`), after `this.transition.start(prevMode, mode)`:

```ts
      this.transition.start(prevMode, mode);
      // Reverse-to-origin retarget: the machine flips straight to IN (no boundary will
      // fire) and the origin's layout is still applied — clear the stale pending so no
      // later tick can mis-apply it (defensive; provably unreachable today).
      this._pendingBoundary = this.transition.phase === "in" ? null : mode;
```

- [ ] **Step 4: gatherLayout — dead `rows` + edge tests + tie-break pin**

Grep `\.rows` across `src/` — if (as triaged) nothing reads `gatherSlots`' returned `rows`, delete the field from the return object and its type. Add tests to `gatherLayout.test.ts`: (a) empty input → `gatherSlots([])` returns `[]` (or its documented empty shape — read the signature first); (b) a single-network single-node input → one 1×1 grid at the packing origin; (c) tie-break pin: two networks with EQUAL machine counts keep their INPUT order after the size-desc sort (`Array.prototype.sort` is stable — pin that as the contract so a future sort rewrite can't silently reorder the grids).

- [ ] **Step 5: Gate + behavioural check + commit**

`npx tsc --noEmit && npm test`. Live check: start a hyper→geo switch and IMMEDIATELY commit a filter from the picker mid-OUT → the camera must keep its teardown pose until the boundary, then fly to the filtered geo pose (before this task it visibly yanked mid-teardown). Also verify a normal filter commit while settled still flies immediately.

```bash
git add src/engine/domain/ src/engine/Engine.ts
git commit -m "feat(transition): OUT-phase camera hold; gatherLayout dead-rows/edge-pins; defensive boundary null"
```

---

### Task 6: Fade-curve consistency sweep (spec A#7 — the ONE deliberate visual change)

**Files:**
- Modify: `src/engine/scene/views/LedgerView.ts`

**Interfaces:** none.

**Context:** Two review-flagged curve inconsistencies. (1) The centre block: its emissive rides `* alpha` (`:801`) but its body pops via the boolean `this.center.visible = alpha > 0.001` (`:806`) — during the build-in the block's non-emissive body appears at full ambient reflectance the frame alpha crosses the cutoff. Fix: scale the material's `color` by the alpha (the ambient/lit response fades with the furniture) and keep the visible-cutoff only as the alpha≈0 short-circuit. (2) The trail blocks double-scale (`:825-826`): BOTH `emissiveIntensity` and `opacity` multiply by alpha → a quadratic perceived fade while every other material fades linearly (single-channel). Reduce to single-channel: keep `opacity` × alpha (the geometry fade) and DROP the `* this._fades.alpha` from the emissive line, so the trail matches the one linear curve family. This task is NOT pixel-neutral — it is the deliberate fix; verify live.

- [ ] **Step 1: Centre block colour fade**

Read `LedgerView.ts:795-810` and the `centerMat` construction. Add a construction-time base-colour scratch (`private _centerBaseCol = new THREE.Color()` initialized from the material's colour after construction — event-time), then in the update path:

```ts
this.centerMat.color.copy(this._centerBaseCol).multiplyScalar(this._fades.alpha);
```

(placed with the existing `:801` emissive write; the `:806` visible-cutoff line stays as the ≈0 short-circuit). If `centerMat.color` is intentionally re-tinted elsewhere (grep its writes first), rebase the scratch there.

- [ ] **Step 2: Trail single-channel fade**

At `:825-826`: keep `const target = (sel ? 0.95 : 0.88 * slotFade(t.slot)) * this._fades.alpha;` (opacity channel); change the emissive line to `mat.emissiveIntensity = sel ? 0.9 : 0.34;` (drop the alpha factor + update the trailing comment to name the single-channel rule).

- [ ] **Step 3: Live verification + commit**

`npx tsc --noEmit && npm test`. Full-reload; run geo→ledger several times watching the build-in: the centre block must FADE in with the chamber (no pop of a dark body), the trail blocks fade linearly with the floors. Also teardown (ledger→hyper). Screenshot a mid-IN frame for the report if the chrome-devtools MCP is available.

```bash
git add src/engine/scene/views/LedgerView.ts
git commit -m "fix(ledger): centre-block colour fade + single-channel trail fade — one curve family"
```

---

### Task 7: Render-loop phase contract — named phase methods (spec C#1)

**Files:**
- Modify: `src/engine/Engine.ts` (restructure `start()`'s loop closure)
- Modify: `src/engine/noFrameAllocations.test.ts` (scan the new phase methods)

**Interfaces:**
- Produces: private Engine methods `_integrateCamera(dt)`, `_integrateMotion(dt)`, `_deriveFrames()`, `_writeScene(dt)` — internal only.

**Context:** Three of the five staging bugs were same-frame ordering bugs (a consumer read state a later mutation changed). The loop is now correctly ordered but nothing NAMES the contract. Restructure the `loop` closure (`Engine.ts:~1014-1180`) into named phase methods called in order, with a header comment stating the rule. The extraction is MECHANICAL — every line moves verbatim; locals crossing phases become explicit (params/returns/fields). Bonus with teeth: the loop body currently lives in a closure the `noFrameAllocations` gate cannot see (its PER_FRAME regex matches method declarations, and it only scans `scene/`); after extraction, add `Engine.ts` to the gate's scanned files and `_integrate\w+|_derive\w+|_write\w+` (note `_writeScene` starts with `_`, which the existing `write\w+` alternative does NOT match) to PER_FRAME — the Engine's per-frame path joins the zero-allocation enforcement.

- [ ] **Step 1: Extract the phases**

The loop becomes:

```ts
private start() {
  const loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(loop);
    this.stats?.begin();
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // ---- THE FRAME ORDER CONTRACT (spec C#1) -------------------------------------------
    // Phases run in this order and NOTHING may mutate a pose after the phase that derives
    // from it: inputs/boundary → camera → motion (spin/rotation) → derived frames (staging
    // plane) → scene writes → render. Three staging bugs were same-frame ordering bugs
    // (consumer read state a later mutation changed: group matrix, camera pose, rotation
    // tween). New per-frame work goes in the phase whose inputs it needs — never earlier.
    this._integrateInputs(dt);   // policy/bloom + transition tick + boundary application
    this._integrateCamera(dt);   // tween → controls → altitude clamp (the camera settles HERE)
    this._integrateMotion(dt);   // hyper spin/tilt ease + globe rotation (poses final after this)
    this._deriveFrames();        // staging plane from the SETTLED camera + rotation
    this._writeScene(dt);        // morph/alphas/visibility/view updates/DoF — reads only settled state
    this.ctx.composer.render();
    if (this._onReady) { const cb = this._onReady; this._onReady = undefined; cb(); }
    this.stats?.end();
  };
  loop();
}
```

Move the existing blocks VERBATIM (comments included): `_integrateInputs` = the policy/bloom writes + the `transition.tick`/`_pendingBoundary`/`_applyBoundary` block; `_integrateCamera` = `_updateTween(dt)` + `controls.update()` + the altitude clamp; `_integrateMotion` = the `zoomedIn` computation + the hyper spin/tilt block + `globe.updateRotation(dt)`; `_deriveFrames` = the `transition.active()` staging-plane block; `_writeScene` = everything from the morph target through the DoF block. Locals crossing phases: `policy` (used in camera clamp + writes) — resolve once per frame into a private field `this._policy` set in `_integrateInputs` (typed `ViewPolicy`, no allocation); `zoomedIn` (motion → writes) — return it from `_integrateMotion` and pass into `_writeScene(dt, zoomedIn)`, or recompute; pick ONE and note it. `ledgerAlpha`/`ledgerActive` stay local to `_writeScene`. NO behaviour change — the diff should read as pure moves.

- [ ] **Step 2: Extend the allocation gate**

In `noFrameAllocations.test.ts`: add `join(import.meta.dirname, "Engine.ts")` to the scanned file set (the walk currently roots at `scene/` — add the single file alongside), and extend `PER_FRAME` to also match `_integrate\w+|_derive\w+|_write\w+` method declarations. Run the gate — the moved code was already allocation-clean inside the closure, so expect green; any hit is a genuine pre-existing violation the closure was hiding: fix it (hoist to scratch) or mark `// event-time` honestly, and record it.

- [ ] **Step 3: Gate + visual check + commit**

`npx tsc --noEmit && npm test`. Full-reload; run all six 3D↔3D transition directions once (the staging plane + camera + rotation interplay is exactly what the phase order protects) — no snap, no one-frame lag, focused-metagraph hyper→geo stays clean (the historical regression).

```bash
git add src/engine/Engine.ts src/engine/noFrameAllocations.test.ts
git commit -m "refactor(engine): named render-loop phases + frame-order contract; allocation gate covers them"
```

---

### Task 8: Dead-weight sweep (spec C#3) + `?slowmo` dev flag (spec C#4)

**Files:**
- Modify: `src/engine/domain/cameraRig.ts` (delete `hyperFocusFraming` + its scratch + the `HF_*` consts), `src/engine/domain/cameraRig.test.ts` (drop its assertions)
- Modify: `src/engine/domain/hyperLayout.ts` (2 stale comment refs), `src/engine/Engine.ts` (stale comment + the slowmo flag)

**Interfaces:** none produced; `hyperFocusFraming` is REMOVED from the public domain surface.

**Context:** C#3's principle (express view emphasis by moving the STRUCTURE, not composing camera cleverness) won: the rolled `hyperFocusFraming` pose was dropped 2026-07-17 for plain `hubFraming` + the structure-tilt ease. The function remains in `cameraRig.ts:130` unused ("stays in cameraRig unused" was the interim note), with its `_d` scratch (`:95`) and `HF_BACK/HF_UP/HF_OR/HF_OU` consts. Sweep it: delete the function + scratch + consts + its test assertions (domainExportCoverage stops requiring them once the export is gone), fix the stale comment references at `hyperLayout.ts:53` and `:60` (they explain ring geometry "(hyperFocusFraming views along the same normal)" — reword to reference the structure-tilt/hubFraming reality), and update `Engine.ts:1007-1008`'s comment ("hyperFocusFraming stays in cameraRig unused" → "the rolled hyperFocusFraming pose was deleted — structure-tilt + plain hubFraming won"). C#4: verifying sub-2s choreography required hand-stretching `DUR_*` constants three separate times (one leftover would ship). Add a dev URL flag like the existing `?stats` (`Engine.ts:~211-217`).

- [ ] **Step 1: The sweep**

Delete `hyperFocusFraming`, `_d`, `HF_BACK`, `HF_UP`, `HF_OR`, `HF_OU` from `cameraRig.ts` (confirm `_d` has no other reader first — grep). Remove the `hyperFocusFraming` block from `cameraRig.test.ts`. Reword the three stale comments named in Context. Grep `hyperFocusFraming|_hyperRoll` across `src/` afterward → the only hits should be none (or historical notes in CLAUDE.md, which Task 10 owns).

- [ ] **Step 2: The `?slowmo` flag**

Next to the `?stats` parse in the Engine constructor:

```ts
// Transition slow-motion — dev only, or via `?slowmo=4` in prod (like ?stats): scales the
// choreography clock so mid-flight states are screenshotable WITHOUT hand-stretching the
// DUR_* constants in source (spec C#4 — three separate hand-stretch-and-revert rounds).
// Clamped ≥1; applies to the transition machine AND the camera tween while a transition is
// live, so the flight and the camera stay in sync.
const smMatch = /[?#&]slowmo=([\d.]+)/.exec(window.location.search + window.location.hash);
this._slowmo = Math.max(1, smMatch ? parseFloat(smMatch[1]) || 1 : 1);
```

(field: `private _slowmo = 1;`). In the loop's transition tick (now inside `_integrateInputs` after Task 7): `this.transition.tick(dt / this._slowmo)`. In `_updateTween`: scale ONLY while the choreography is live — `tw.t = Math.min(1, tw.t + dt / (tw.dur * (this.transition.active() ? this._slowmo : 1)))` — so ordinary focus flights (clicks while settled) stay full speed. Gate availability the same way `?stats` is (dev always; prod only with the param — read the existing stats condition at `Engine.ts:~211-213` and mirror it: in prod, no param → `_slowmo` stays 1, which is already the no-op).

- [ ] **Step 3: Gate + check + commit**

`npx tsc --noEmit && npm test` (the cameraRig test shrinks; `domainExportCoverage` stays green because the export is gone). Load `http://localhost:3000/?slowmo=4`, switch hyper→geo: the choreography runs ~4× slower, the camera flight matches it; without the param everything is normal speed.

```bash
git add src/engine/domain/ src/engine/Engine.ts
git commit -m "chore(engine): sweep hyperFocusFraming dead weight; ?slowmo transition dev flag"
```

---

### Task 9: Gate strengthening — the Plan 1 carried minors

**Files:**
- Modify: `src/engine/noHardcodedColors.test.ts` (per-directory allowlists)

**Interfaces:** none.

**Context:** Plan 1's final review carried two gate minors. (1) The colour guard's `ALLOWED` is one Set shared by the engine and components scans — an allowlisted components-only RGB (e.g. `0x141a2e`, the TopBar gradient) would silently green-light the same literal appearing in `scene/`. Split it per directory. (2) The allocation gate's regex holes (object/array literals, un-namespaced `new Vector3(`) — DECISION: leave as-is. The scene imports THREE as a namespace everywhere (un-namespaced constructors cannot occur without an import-style change the layer test would flag), and object-literal detection is too noisy for a grep gate (the `// event-time` marker system already documents intent). Document this decision in the test's header comment instead of half-implementing it.

- [ ] **Step 1: Split the allowlist**

Read `noHardcodedColors.test.ts`. Split `ALLOWED` into `ENGINE_ALLOWED` (the scene-layer entries: white tint bases, ambient light, node-dim tone — the pre-Task-4 set) and `COMPONENTS_ALLOWED` (the 5 Task-4 entries: RailThread's `0xb2c1df`/`0x0c1020`, TopBar's `0x141a2e`/`0x0a0e1c`, the sheet scrim `0x03050c`), each scan checking only its own set. Keep every entry's justification comment with it. Read the file's current structure first — if `chromaticOffenders()` takes the allowlist as a parameter this is a two-line change; if not, add the parameter.

- [ ] **Step 2: Prove the split has teeth**

Temporarily add `0x141a2e` (components-allowlisted) as a `new THREE.Color(0x141a2e)` line in a scene file, run the test → it must FAIL (before the split it passed). Revert the injection (`git diff` clean), re-run → green. Note the round-trip in the report. Also add one line to the header comment documenting the alloc-gate decision from Context (the noFrameAllocations regex holes stay; why).

- [ ] **Step 3: Gate + commit**

`npx tsc --noEmit && npm test`.

```bash
git add src/engine/noHardcodedColors.test.ts src/engine/noFrameAllocations.test.ts
git commit -m "test(colors): per-directory allowlists — a scene allowance no longer covers components (and vice versa)"
```

---

### Task 10: Docs — CLAUDE.md reflects the mechanisms + principles

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none.

**Context:** The mechanisms and principles need their durable home. Also the known drift: the hover-preview paragraph (~line 579) still describes the REMOVED 0.85 forced-strong hover-dim branch and names the deleted `_dimScale`.

- [ ] **Step 1: New mechanisms into their sections**

- The scene module list: `FadeSet.ts` (one furniture-fade registry; views own a single alpha), `StageLights.ts` + `domain/stageLight.ts` (central spot lifecycle + the per-view constants table), `gradientTexture.ts` — one line each in the existing voice, in the `scene/objects/` listing.
- The Engine bullet: name the render-loop phase contract (`_integrateInputs → _integrateCamera → _integrateMotion → _deriveFrames → _writeScene`; "nothing may mutate a pose after the phase that derives from it").
- The verify section (near `?stats`): the `?slowmo=N` flag.
- The enforced-rules list: note `noFrameAllocations` now also covers Engine's phase methods, and the scene-view contract now includes root-visibility ownership (if Task 4 didn't already word it fully).

- [ ] **Step 2: The principles (spec C#2/C#3 prose)**

In the camera section (`cameraRig.ts` bullet or nearby): "framing math consumes LAYOUT data (records, anchors, orbit slots), never rendered transforms — enforced by the marker-gated `getWorldPosition`/`getMatrixAt` test". Nearby (the hyper filter bullet already tells the structure-tilt story): one sentence naming the principle — view emphasis moves the STRUCTURE (shared, lockstep, policy-driven); camera poses stay dumb — and remove any remaining "hyperFocusFraming stays unused" phrasing (grep `hyperFocusFraming` — after Task 8 the function is gone; keep at most the historical decision note).

- [ ] **Step 3: Fix the hover-preview drift (~line 579)**

Rewrite the sentence claiming the hover dim "is forced **strong** (`_hoverFilterActive` → `_dimScale` 0.85)": the forced-strong branch was removed 2026-07-11 (dimModel's comments record it) — hover previews now dim at the same per-view strength as a committed filter. Grep `_dimScale|hoverFilterActive` in CLAUDE.md afterward for any sibling stale claim.

- [ ] **Step 4: Gate + commit**

`npm test` (green — docs only).

```bash
git add CLAUDE.md
git commit -m "docs: FadeSet/StageLights/phase-contract/slowmo; camera principles; hover-preview drift fixed"
```

---

## Final verification (after Task 10)

- `npx tsc --noEmit && npm test` — clean, all suites.
- `npx next build` — clean; `/api/metagraphs` stays `○` 10m.
- Full visual pass (the pixel-neutral proof): hyper (all + a focused metagraph + the spot), geo (a country drill + a node + its spot), ledger (a layer + a node + the spot), all six 3D↔3D transitions, plus `?slowmo=4` on one switch and the mid-OUT filter-commit camera hold. The ONLY intended visual delta is Task 6's ledger fade curves.
- `superpowers:requesting-code-review` whole-branch review before merge.

## Deferred

- Spec Part C #5 (the focus/zoom-ladder table) — "evaluate" is a design conversation; it gets its own brainstorm → spec → plan cycle.
- Object/array-literal detection in the allocation gate — documented as out of scope in Task 9.
