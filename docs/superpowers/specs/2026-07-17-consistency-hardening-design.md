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
6. **Transition-window input consistency:** picking is already suppressed mid-flight, but
   HUD commits (top-bar filter picker, LiveStrip bars) still fire camera reframes during the
   OUT phase, breaking the "camera holds still through teardown" contract. Gate camera moves
   (not the state changes) on `!transition.active()`, deferring the reframe to the boundary.
   Also: gatherLayout's dead `rows` computation, empty/singleton edge tests, the tie-break
   pin, and Engine's defensive `_pendingBoundary = null` on the reverse-to-origin path
   (final-review triage, 2026-07-17); plus the pre-existing stale README.md:90
   "jumps to the ledger" claim (docs sweep).
7. **Fade-curve consistency sweep:** the ledger centre-block's boolean visibility pop gets
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

## Part C — Learnings from the 2026-07-17 live-review batch (five staging bugs + the DoF/tilt rework)

The post-final-review session surfaced failure classes the earlier parts don't yet cover; they
are first-class hardening items:

1. **The render loop's phase order becomes an explicit contract.** Three of the five staging
   bugs were same-frame ordering bugs (consumer read state a later mutation changed: group
   matrix, camera pose, rotation tween). The loop is now implicitly ordered (inputs → camera →
   rotation → staging frame → writes → render) but nothing NAMES that contract. Restructure the
   Engine loop into named phase methods called in order (`_integrateCamera`, `_integrateMotion`,
   `_deriveFrames`, `_writeScene`) with a header comment stating the rule: *nothing may mutate a
   pose after the phase that derives from it*. Future additions then have an obvious slot.
2. **Framings read LAYOUT, never render state — as a written rule.** Two focus bugs came from
   camera math reading instance matrices / `getWorldPosition` of animated or collapsed groups
   (`hyperWorldPos`, the boundary's root scale). The rule "camera framing math consumes layout
   data (records, anchors, orbit slots), never rendered transforms" goes into CLAUDE.md's
   camera section; the pass audits remaining `getWorldPosition`/`getMatrixAt` uses in framing
   paths.
3. **Structure-space beats camera-space.** The rolled `hyperFocusFraming` + DoF caused three
   user-visible defects and fell to deletion + a structure-tilt ease that inherited every system
   (staging, transitions, picking) for free. Principle for the doc: express view emphasis by
   moving the STRUCTURE (shared, lockstep, policy-driven) rather than composing camera
   cleverness; camera poses stay dumb. Sweep `_hyperRoll`/`_hyperRollUp`/`hyperFocusFraming`
   dead weight while codifying it.
4. **A supported `?slowmo` dev flag.** Verifying sub-2s choreography required agents to
   hand-stretch `DUR_*` constants (and revert) three separate times — error-prone (one leftover
   would ship). Add a dev-only URL flag (`?slowmo=4`, like the existing `?stats`) that scales
   the transition clock, so mid-flight states are screenshotable without touching source.
5. **The focus/zoom ladder becomes data.** Three views now hand-roll laddered focus logic
   (geo: selection→country→node; ledger: layer→node; hyper: filter→node) as scattered
   branches with per-view fallback chains. Evaluate one per-view ladder table (viewPolicy-
   adjacent: level → framing fn + deselect step-up) so cross-view carry and deselect stepping
   are data — this is the same allow-list idiom the views already use for everything else.

## Non-goals

No visual redesign: every unification must be pixel-neutral (verified per-change in the
browser). No new dependencies. The deliberate per-view *values* (focus strengths, bloom
tables, spot intensities) stay per-view — it's the *mechanisms* that unify; tables express
the per-view tuning.

## Sequencing

Part B tests 1–3 land FIRST (they gate the refactors), then Part A in the order above
(each pixel-neutral, each with the relevant test extended), then B4/B5. One plan, one branch
(`consistency-hardening`), the standard subagent flow with per-task review gates.
