# Consistency hardening — one mechanism per concern, enforced (design)

**Date:** 2026-07-17 · **Status:** approved direction (user), detailed plan pending ·
**Prereq:** the view-transitions branch (`node-view-transitions`) is finished and merged first.

## Intent

The user's standing priority: consistency, reuse, and clean code over spot solutions; no
per-view variation that makes the UI/UX feel "off". Today's branch review and the transition
refactor exposed where the codebase still invites exactly that variation. This spec turns the
findings into one hardening pass: unify the mechanisms, then make the unifications
*executable* with new architectural boundary tests so they cannot regress.

Evidence base (2026-07-17 session): the dimModel inline-mirror drifted twice in one day; the
lingering-spotlight bug existed because each view hand-rolled its spot lifecycle; two GPU
geometry leaks came from hand-rolled per-view teardown loops; threading one furniture alpha
took 1 line in Globe (its `geoFades` registry) vs 11 and 16 hand-edits in HyperView/LedgerView.

## Part A — Unifications (one mechanism per concern)

1. **Kill the dimModel mirror.** NodeFabric imports and calls `dimScale`, `metaDimScale`,
   `focusDim`, `focusBoost`, `hubMatchBoost`, `validatorDim`, `metaNodeDim`, `nodeEmissive`,
   `metaNodeEmissive` directly; Globe drops `_dimScale`/`_metaDimScale` for the domain
   functions. The "change in BOTH places" contract and its comments are deleted. Parity is
   guaranteed by construction; the domain tests become the ONLY spec. Per-call cost is noise
   at ~350 instances/frame (verify with the stats.js FPS monitor before/after).
2. **Fade registry as the one furniture-fade mechanism.** Extract Globe's `geoFades` pattern
   into a small shared helper (`scene/objects/FadeSet.ts`: register material + base value;
   `apply(alpha)` walks the set). HyperView and LedgerView convert their per-site `* this._viewAlpha`
   multiplications to registered entries; per-frame *dynamic* writes (eased hub glow, tile
   brightness) keep their expressions but read the alpha from ONE place. Outcome: the next
   cross-cutting visual change is a registry walk, not a 16-site grep.
3. **One stage-light driver.** FocusSpot gains the shared lifecycle the views currently
   hand-roll: each view's spot registers with a tiny `StageLights` coordinator owned by the
   Engine; a view switch blacks out every non-active view's spot centrally. The per-view
   staging constants (angle/height/intensity) move to one table (domain, per-view rows —
   the viewPolicy idiom). Kills the "hyper forgot its spotOff" bug class permanently.
4. **Shared scene math/texture helpers.** `ringNormal(frame)` joins `domain/nodeLayout`
   (three inline cross-products today); one `makeRadialGradientTexture(stops)` serves
   `makeGlowTexture` + `makeRingFillTexture`; one `rgbTriplet(color)` util kills the 4×
   copy-paste in LedgerView's label canvas; the HYPER_TILT+spin composition gets one
   `applyHyperRig(obj, spinY)` helper both files call (five hand-synced sites today).
5. **Visibility ownership rule (CLAUDE.md + enforced):** the Engine/policy owns `visible`
   on view root groups; views own opacity/alpha. LedgerView's remaining `group.visible`
   history and any future view follow it.
6. **Fade-curve consistency sweep:** the ledger centre-block's boolean visibility pop gets
   the `mat.color`-scaling fade (review finding); the trail-block opacity+emissive double
   scale is either adopted everywhere deliberately (documented curve) or reduced to the
   single-channel linear fade used by every other material — one curve family, not three.

## Part B — New architectural boundary tests (the grep-test idiom)

1. **`domainExportCoverage.test.ts`** — every exported function/const of `src/engine/domain/*.ts`
   must be referenced by its sibling `.test.ts` (type-only exports allowlisted). Makes
   executable what rule #1's prose demands; the untested-`hyperFocusFraming` class of gap
   fails CI on arrival.
2. **`sceneModeBan.test.ts`** — no `Mode`-string comparisons (`"hyper"|"geo"|"ledger"` vs a
   `mode` variable) inside `src/engine/scene/` — views receive booleans/alphas/policies from
   the Engine, never interpret the mode themselves.
3. **`noFrameAllocations.test.ts`** — extract the bodies of `update`/`write*`/`place*`/`_apply*`
   methods in `scene/` and fail on `new THREE.`/`.clone()` unless the line carries an
   `// event-time` (or existing equivalent) comment. Heuristic by design; the allowlist is
   the documentation.
4. **`SceneView` interface (type-level)** — `setViewAlpha(a: number)`, `update(dt: number)`,
   plus the dispose/teardown hook from Part A; implemented by HyperView, LedgerView, and the
   Globe-hosted geo surface owner. The compiler becomes the enforcement for "the views are
   the same kind of thing"; view #4 starts from the interface.
5. **Extend `noHardcodedColors` to `components/`** — migrate the legacy `rgb()`/hex literals
   in JSX to the CSS-var tokens, then widen the guard's scope (CLAUDE.md already names this
   follow-up).

## Non-goals

No visual redesign: every unification must be pixel-neutral (verified per-change in the
browser). No new dependencies. The deliberate per-view *values* (focus strengths, bloom
tables, spot intensities) stay per-view — it's the *mechanisms* that unify; tables express
the per-view tuning.

## Sequencing

Part B tests 1–3 land FIRST (they gate the refactors), then Part A in the order above
(each pixel-neutral, each with the relevant test extended), then B4/B5. One plan, one branch
(`consistency-hardening`), the standard subagent flow with per-task review gates.
