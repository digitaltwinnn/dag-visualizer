# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing overview.
This file is the project's memory: everything needed to work here from a clean sheet —
design intent, decisions, structure, and the principles worth keeping.

## What this is

An interactive 3D visualizer of the Constellation Network ($DAG). **Next.js (App
Router) + React + TypeScript + Zustand** for the page/panels, driving a **vanilla
Three.js engine** (NOT react-three-fiber) on one persistent canvas. The active view is
`mode` in the store (the `Mode` union is exported from `src/store/store.ts` and shared by
the Engine); the top-bar view switch sets it. **Three views drive the 3D scene; the rest
are "flat"** (the engine hides the canvas — `mode !== "hyper" && mode !== "geo" &&
mode !== "ledger"`):

- **Hypergraph** (`hyper`, 3D) — abstract architecture: a glowing Global L0 core, the DAG's
  own validator shells around it, and the real metagraphs as orbiting hubs, each with its own
  L0 / cL1 / dL1 nodes in concentric shells. **One unified node model** — the DAG is itself a
  metagraph-shaped "core" (see *Nodes, layers & the filter*), not a separate L0/L1 pair.
- **Node geography** (`geo`, 3D) — a globe with every node at its real geolocation, a density
  travelling-packet connection arcs, and the country→nodes explorer (the old density heatmap +
  rings were removed entirely, 2026-07-09 — the honeycomb node stacks themselves show density).
- **Snapshots** (`ledger`, 3D) — a built 3D "settlement chamber" (`scene/views/LedgerView.ts`):
  a stack of transparent glass FLOORS (layers) on Y. It **REUSES the same node meshes** from
  hyper/geo (placed into per-metagraph Z-lanes by `scene/Globe.ts`), and draws its own centred live
  global-snapshot block + a left-trailing chain of completed snapshots, each metagraph's lane
  of snapshot blocks, the node-group rings, and per-block anchor links + pulses. See *The
  Snapshots (ledger) view* below.
- **Network status** (`status`), **Transactions** (`transactions`), **Delegated staking**
  (`staking`) — **scaffolded placeholders**: the canvas fades out and `Blueprint.tsx` renders
  a faint abstract wireframe schematic of what the view will become, labelled
  `preview · in development` so it never reads as live data (no numbers, no fabricated
  values). The left rail shows only the view's About card; the bottom lane (`LiveStrip`)
  is ALWAYS present regardless of view — carrying the
  `NodeCountReadout` here (the tick bars are ledger-only), under a command bar whose RAW switch
  opens a raw data layer that says
  `preview · in development` too. **Interface glyphs are ONE icon system: `lucide-react`,
  monochrome via `currentColor`** (so the accent/identity tinting inherits), **never emoji** (emoji
  ignore CSS `color` / the accent). The centralized view→icon map is `components/icons.tsx`
  (`VIEW_ICONS` + `iconForPick`), shared by the view switch, the card-head kind marks, and the
  tablet/phone dock icon trays. The bespoke marks that remain text/SVG on purpose are the identity
  dots, the ECG mark, and the Tooltip's `‹›` punctuation.

Every switch **among the three 3D views** (`hyper`↔`geo`↔`ledger`, any pair) runs the SAME
staged **gather choreography** (`domain/viewTransition.ts`'s `ViewTransition`; the
2026-07-17 view-transitions design spec is in git history — see *Historical docs*) instead of a cut or a live
morph flight: **OUT** (0.9s) — the from-view's furniture fades via `furnitureAlpha` while its
nodes fly, staggered (a 0.25s spread, rank-ordered within each network's own grid), up to
per-network near-square **staging grids** on a camera-anchored plane at the top of the
viewport (`domain/gatherLayout.ts`) — then **BOUNDARY**, one invisible frame where the nodes
are fully gathered and both furnitures are dark: the destination layout snaps in (`morph`
set, `applyLedgerLayout`, `layers.setLedger`, filters re-asserted) and the camera focus/tween
starts — then **IN** (3.0s node placement) — the to-view's furniture builds back in FAST (`FURN_IN`
1.0s — the room is fully lit early) while its nodes disperse, staggered, over the longer
placement window into the already-drawn view, and the camera flies. **~3.9s total** (user:
the slow placement reads as staging, not loading, because the destination is complete first). `morph` and
`ledgerT` are now **BOUNDARY-APPLIED LAYOUT PARAMETERS** the machine snaps, not eased flight
blends — the old hyper↔geo core-grow-into-the-globe flight and the Snapshots view's
"appears already-formed, no entry animation" rule are both **RETIRED** (deliberate reversals,
2026-07-17): the ledger chamber now has a real build-in/teardown too. Retargeting (flipping
the switch again mid-flight) keeps flight weights continuous, no teleports. Picking is
suppressed for the whole choreography (raycasting nodes mid-flight misleads). The flat
placeholder views are untouched by any of this — `SceneCanvas` just cross-fades the canvas.

## The rules — invariants that hold in every change

The application is governed by a small set of architectural rules. SIX ARE EXECUTABLE —
`npm test` fails when they're violated — the rest are standing conventions detailed in their
own sections below. Check any change against this list before committing; when a change wants
to break one, that's a design conversation, not a workaround.

**Enforced by tests:**

1. **Engine layering** (`src/engine/layerBoundaries.test.ts`) — `domain/` = pure logic/data
   (THREE math + config + data TYPES only; no scene/react/store values), `scene/` = Three
   adapters (read domain, write GPU; no store/react), `Engine.ts` = the ONLY store bridge.
   New behaviour lands in `domain/` WITH a colocated test; the scene stays a dumb adapter.
   → *Engine layer rules & render-loop discipline*.
2. **One selection write path** (`components/selectionBoundary.test.ts`) — every interactive
   surface (scene clicks, explorer rows, strip bars, picker rows, card closes) expresses
   intent through the tested decision table `domain/pickActions.ts` and applies it through
   the ONE executor `src/store/applyClickActions.ts`; components never call selection setters
   directly (sole exemption: `FollowController`, the follow SYSTEM). The rule is WRITE-based,
   so read-only facts cards cost nothing. New click/select semantics = a table builder + a
   test + (if a new action kind) its executor effect. → *the `pickActions.ts` bullet*.
3. **One colour source** (`src/engine/noHardcodedColors.test.ts`) — `app/globals.css` tokens
   are canonical; the scene reads them at boot via `readSceneColors()`; no raw hex in `scene/`
   **or `components/`** outside the documented allowlist. Two lanes never mix: structural cyan =
   the sole accent/affordance; identity hues (deterministic, `src/palette/`) appear only on
   subject marks, matched by metagraph id everywhere. → *The design system → Two colour lanes*.
4. **Domain-export coverage** (`src/engine/domainExportCoverage.test.ts`) — every VALUE export
   of a `domain/` module is referenced by its sibling `*.test.ts`; the executable form of "new
   domain behaviour lands WITH a colocated test" (type-only exports are skipped). → *Engine
   layer rules & render-loop discipline*.
5. **Zero-allocation render loop** (`src/engine/noFrameAllocations.test.ts`) — per-frame method
   bodies in `scene/` AND `Engine.ts`'s loop-phase methods (`update`/`write*`/`place*`/`_apply*`/
   `setMorph`/`updateRotation`/`_integrate*`/`_derive*`/`_write*`) carry
   no `new THREE.*`/`.clone()` unless the line marks it `event-time`. The fuller convention —
   every instanced slot written or zero-scaled each frame, sims emitting ring-buffer events
   their owning adapter drains (no cross-view mutation) — is the standing discipline the test
   backstops. → *Engine layer rules & render-loop discipline*.
6. **Scene-view contract** (`src/engine/scene/views/sceneView.test.ts` +
   `src/engine/sceneViewContract.test.ts`) — the bespoke views (`HyperView`/`LedgerView`)
   `implement SceneView` (the type-level furniture build/teardown shape; `GeoView` exempt, its
   alpha rides Globe's `geoFades`); scene modules never compare `Mode` strings; Engine
   framing math reads LAYOUT data, not rendered transforms (marker-gated `getWorldPosition`/
   `getMatrixAt`); and views never write their root group's `visible` — Engine/policy owns
   root visibility, views own opacity/alpha. → *Per-view behaviour*.

**Standing conventions (each detailed in its section):**

7. **Per-view behaviour is an allow-list** — `domain/viewPolicy.ts` has one row per `Mode`;
   a new view is inert until its row opts in; never `mode === "x"` guards, never deny-lists.
8. **One home per concern** — the camera lives in `domain/cameraRig.ts` (presets, framings,
   the global `CAM_ZOOM` dolly + its documented exemption rule), the focus/zoom LADDER in
   `domain/focusLadder.ts` (rung order, carry policy, deselect-step data — the Engine's
   `_resolveFocus` and `pickActions` both consume it), country-shape math in
   `domain/countryShape.ts`, click semantics in `domain/pickActions.ts`. Don't grow a second
   copy of any of these in the Engine or a component.
9. **The scene↔HUD hover pairing is sacrosanct** — the shared store channels (`hoverFilter`,
   `hoverNodeId`, `hoverSnapOrd`, `hoverCountry`, `ledgerHilite`) + `.subject-paired` +
   the marker classes survive every refactor; hovers PREVIEW, never commit.
10. **Honesty over decoration** — every visual quantity comes from live data; absent data is
   an instrument state (NO SIGNAL / acquiring / standby), never a fabricated number; floors
   are labelled floors (`~`, `FLOOR`); don't "fix" honest gaps.
11. **Design tokens first** — the HUD type scale + structural tokens for all styling; an
   arbitrary value only for a documented one-off; new `text-*`/`rounded-*`/`tracking-*`
   tokens must be registered in `lib/utils.ts` (twMerge). `/design` is the TOKEN REFERENCE
   (colour lanes + type scale, read live from the tokens/palette — accurate by construction);
   it is NOT a component mirror, so components are verified against the running app, not it.
   the shipped app.

## Run & test

Next.js **16** app (Turbopack is the bundler for BOTH `dev` and `build`) — needs Node ≥20.9.
Three.js and friends come from npm (`three`, `three/addons/*`, `topojson-client`); no CDN deps.
**`gsap`** drives the scene↔raw-layer depth transition only (`SectionShell` — the core timeline,
no plugins: the Draggable/Inertia/Observer gestures went with the retired slide navigation); the
3D scene's own animation stays hand-rolled in the engine, and HUD micro-animation stays CSS.
Don't reach for GSAP elsewhere without a reason.

```bash
npm install
npm run dev        # http://localhost:3000 (also exposes the Next.js MCP at /_next/mcp)
npx tsc --noEmit   # types (dev server tolerates type errors; run tsc to be sure)
npm test           # vitest (pure-logic unit tests: store, palette, composition, …)
```

> **Dev-server discipline (run ONE, shared):** keep exactly one `next dev` alive and reuse
> it — Next 16 enforces this with a lockfile (a second `next dev` on the same project refuses
> to start). When coordinating parallel work (e.g. subagents), the coordinator owns the single
> server and workers reuse `http://localhost:3000`; workers must not start/kill servers.
> Prefer the harness background-run facility (`Bash run_in_background: true`) over
> `nohup`/`setsid` so the process is tracked and stoppable via the task interface — avoid
> `pkill -f "next dev"` (returns exit 144 in this sandbox and is unreliable; kill by PID if
> you must). Turbopack HMR picks up edits, so a restart is only needed for config-level
> changes (tailwind/next config) or if state looks stale — then: kill the one server by PID,
> `rm -rf .next`, start one again. **Engine/scene geometry built in constructors needs a full
> page reload** (not just HMR) to take effect.
>
> **`next build` and `next dev` no longer conflict** (since Next 16 the dev server outputs to
> `.next/dev`, a separate directory), so the production-build check can run alongside the dev
> server. Still do it at phase boundaries: `next build` clean, `/api/metagraphs` stays `○`
> (Static) with the `10m` revalidate. NB: Next 16 removed the `size`/`First Load JS` columns
> from the build output — the route table (`○`/`ƒ` + revalidate) is what remains and is what
> the check reads. For per-edit checks use `tsc --noEmit` + `npm test`.

### Verifying changes (MCP-first)

No visual test suite; verify visual changes by looking at the running app. Three MCP servers
divide the work — use them in this order:

**1. Runtime diagnostics: the Next.js MCP** (`mcp__next-devtools__*` — the dev server exposes
it at `/_next/mcp` automatically on Next 16+). `nextjs_index` discovers the server (port 3000),
then `nextjs_call` with `get_errors` (config + build + browser runtime errors, source-mapped),
`get_routes`, `get_page_metadata` (the rendered segment tree incl. error boundaries), and
`get_logs` (the dev log lives at `.next/dev/logs/next-development.log`). **Check `get_errors`
FIRST** on any "is something broken" question — it beats grepping browser console output.

**2. Visual + interaction: the chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`).
It drives a real browser, so it can **navigate, click, hover, wait for a selector, and
snapshot** — use it to reach interactive states directly (open the filter picker, click a
view, hover a row). WebGL renders fine in it. This is the default for visual checks. It can
also read compiled CSS via `evaluate_script` (CSSOM) — the way to settle specificity/cascade
questions for real instead of reasoning about them.

**3. Deploy-side: the Vercel MCP** (`mcp__vercel__*`) once changes ship — `list_deployments`,
`get_deployment_build_logs`, `get_runtime_errors`/`get_runtime_logs` for the hosted app
(the local Next.js MCP only sees the dev server).

**Last-resort fallback: one-shot headless Chrome** (only when the chrome-devtools MCP is
unavailable — it is strictly worse: no clicks, no CDP). WebGL needs the SwiftShader flags or
it fails with "Error creating WebGL context":

```bash
google-chrome-stable --headless=new --no-sandbox \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=12000 --screenshot=/tmp/shot.png \
  "http://localhost:3000"
```

Gotchas that will save you time:

- **One-shot headless can't click / has no deep links** — CDP is blocked (only one-shot
  `--screenshot`), and there are no URL deep links into views. Prefer the chrome-devtools MCP
  for any interactive state. If you must use one-shot headless, the standard trick is to
  **temporarily seed the Zustand store default** in `src/store/store.ts` (e.g.
  `mode: "geo"` or `filter: "<id>"`, `following: true`), screenshot, then revert.
- **`--virtual-time-budget` runs very few `requestAnimationFrame` frames**, so
  animations barely start — the morph and camera tweens won't complete in a one-shot.
  Booting in `geo` snaps `morph=1` (engine constructor), so the globe SURFACE is settled from
  frame 1 — but a fresh 3D boot also plays the ~4s staging-dissolve intro (nodes disperse from
  the top grids), so a one-shot may catch the nodes mid-flight; the surface/layout is correct
  regardless. To inspect transition mid-flight states, use **`?slowmo=N`** (e.g.
  `http://localhost:3000/?slowmo=4` — dev flag like `?stats`): it scales the choreography clock
  AND the camera tween while a transition is live, so screenshots catch the flight without
  hand-stretching `DUR_*` in source; settled-state focus flights stay full speed. `N` is clamped
  to `[0.1, 20]` and **values <1 SPEED UP** the choreography instead — e.g. `?slowmo=0.3` shrinks
  the ~3.9s 3D↔3D switch to ~1.2s, handy for a quick UI/UX pass without waiting out the full flight.
- **Benign console noise to ignore** when grepping logs: `mojo ... rejected`,
  `gcm/... PHONE_REGISTRATION_ERROR`, `BackForwardCache`.

## Architecture — three layers

The app is a thin React/Next shell around an imperative Three engine, joined by a
Zustand store. **Two data lanes:** (A) high-freq visuals subscribe straight to
`NetworkData` events (no React render); (B) only panel-facing state lives in the store.

- **`app/`** — Next App Router. `layout.tsx`, `page.tsx` (mounts every panel + the canvas),
  **`globals.css` (the ONE stylesheet — see *The design system*)**, `design/page.tsx` (the
  static token reference at `/design`). **`app/api/metagraphs/route.ts`**, **`app/api/geo/route.ts`**
  and **`app/api/snapshot/[ordinal]/route.ts`** are server-side data routes (see *Data*).
- **`components/`** — React panels, each reads/writes the store: `SceneCanvas` (mounts the
  engine, dynamic-imported so Three never enters the server bundle), `Blueprint` (placeholder
  schematics), `BootOverlay`, `TopBar` (the full-width top command bar: status + filter +
  view switch + view vitals + the RAW switch; `components/topbar/` holds `Vitals`,
  `FilterPicker`, `EcgMark`, `RawToggle`),
  `ExploreRail` (the left explore rail), `Inspector` (the right facts rail), `ContextCard`,
  `InspectorCard` (a thin frame dispatching to the per-kind cards in `components/inspector/`),
  `CardHead` (the ONE card header + the `RIGHT_CARD` frame), `RailThread`, `RailDock`
  (tablet/phone sheets), `RailScroll`, `EdgePulse`, `selection.tsx`, `Tooltip`,
  `FollowController` (ledger snapshot follow), `DataBridge` (boots the data),
  `RawSnapshotBridge` (fetches the exact raw-L0 read for the focused ticks), `SectionShell`
  (the GSAP scene↔raw-layer depth transition), `BottomStream` +
  `LiveStrip` (the bottom lane — bars in ledger) + `NodeCountReadout` (the
  strip's non-ledger content), `DataSection` + `components/datasection/` (the raw layer's per-view
  tables), `Odometer`, `Sparkline`, `state/StateAtoms`, and the
  hooks `useSnapshotFeed`, `useBreakpoint`, `useBootPhase`, `useMinHold`, `useSubjectPairing`.
- **`src/store/store.ts`** — the Zustand store (mode, filter, country, inspect, snap,
  selStack, following, metaList, leaderboard, selNodes, activity, snapshotExact, the hover
  channels `hoverFilter`/`hoverNodeId`/`hoverSnapOrd`, `section` (which of the two shell LAYERS is
  presented — UI state, not selection, so it sits outside the one-selection-write-path rule),
  phone UI state, …). **`src/data/`** —
  `network.ts` wraps the typed `NetworkData` singleton (`api.ts`) + exposes `getAnchor`/
  `metagraphById`/`filterAccent`/`CORE_HEX`/etc; `follow.ts` = follow logic; `types.ts`
  (`PickDescriptor` is a `kind`-discriminated union, `SnapshotExact`, `NodeRow`);
  `composition.ts` (node-fabric grouping), `nodeStatus.ts` (the shared status vocabulary),
  `hoverSubject.ts` (`hoverKeyOf`), `ledgerLayers.ts` (the settlement layers' display COPY —
  name/desc by layer id; the geometry twin is `domain/ledgerLayout.ts`'s `LAYER_GEOM`; `desc`
  belongs to the LAYER CARD only — an explorer row shows name + count, never the same sentence
  a rail away, see *the explanatory-copy split*),
  `anchorLog.ts` + `roster.ts` (the PURE row builders behind the raw layer's tables — anchored
  metagraph-snapshot rows, and the flat node roster + its column sort),
  `bootPhase.ts`, `breakpoint.ts`. **`src/util/`** —
  `format.ts` (`hex`/`fmtDag`/`ccMark` — the country CODE mark; flag emoji were removed
  2026-08-01, Windows ships no flag font and emoji ignore CSS `color`), `relativeAge.ts`, `odometer.ts`.
  **`src/palette/`** — the identity-hue generator (see *Two colour lanes*).
- **`src/engine/Engine.ts`** — the imperative engine and **the one bridge** (store ⇄ domain ⇄
  scene). Owns the render loop, morph, camera-focus tweens (`FOCI`), DoF, picking, the
  **focus resolution** (`_resolveFocus` — the ONE camera walk over `focusLadder.LADDERS`;
  the per-rung resolvers are small Engine methods because they carry real scene side effects
  (globe lean/spin, autoRotate); every selection-driven camera move routes through it,
  including the transition boundary's re-derive and the reversal-gap re-resolve), and the
  **command bridge**: it `useStore.subscribe`s and reacts to mode/filter/country/hover channels
  and writes picks + hovers back to the store — the ONLY layer that touches the store. Each
  frame it consults `VIEW_POLICIES[mode]` (the per-view allow-list) and translates the flags
  into scene state. **The render loop is FIVE NAMED PHASES in a fixed order** —
  `_integrateInputs` (policy/bloom + transition tick/boundary) → `_integrateCamera` (tween →
  controls → altitude clamp) → `_integrateMotion` (hyper spin/tilt + globe rotation) →
  `_deriveFrames` (the camera-anchored staging plane) → `_writeScene` (morph/alphas/visibility/
  view updates/DoF) — under the frame-order CONTRACT: *nothing may mutate a pose after the
  phase that derives from it* (three staging bugs were same-frame ordering bugs; new per-frame
  work goes in the phase whose inputs it needs, never earlier). Drives the typed `domain/` +
  `scene/` modules below (see *Engine layer rules*).
- **`src/engine/config.ts`** — PURE STATIC DATA the app is parameterized by, nothing else: API
  endpoints, the `COLORS` palette mirror, the `METAGRAPHS` catalog, `POLL` (data cadence/
  retention tuning). **Config principles (hold in every change):** no math and no derived tables
  here — per-view layout geometry + layout math live in ONE `domain/` module per view
  (`hyperLayout.ts` / `ledgerLayout.ts` / `geoLayout.ts`); no UI copy here — display strings live
  UI-side (e.g. `src/data/ledgerLayers.ts`) and picks/scene objects carry ids only; groups are
  single-concern.
- **`lib/`** — `utils.ts` (`cn()`), `mgVars.tsx` (`MetagraphVars` sets `--mg-<id>` identity
  vars on `:root`; intentionally not yet mounted app-wide — don't delete as dead code).
- **`components/ui/`** — the shadcn primitives in use (see *shadcn primitives*).

**`src/engine/domain/`** — pure logic (THREE's math classes are allowed; **no scene/react/
store-value imports**, enforced by `layerBoundaries.test.ts`). Each ships colocated tests:

- `viewPolicy.ts` — the per-`Mode` allow-list table (`VIEW_POLICIES`): canvas / morph target /
  sim gates / shown geometry / pick sources / DoF eligibility / camera zoom floor
  (geo also sets `minCamAlt: 18` — a camera-ALTITUDE floor the Engine enforces after each controls
  update, because the orbit target is off-centre in geo so the stock target-distance clamp alone
  is inconsistent around the globe) / `nodeList` (which views publish `store.selNodes` for
  their explorer node browsers — hyper + geo + ledger), as
  DATA. The single source of truth for what each view turns on (see *Per-view behaviour*).
- `focusLadder.ts` — the FOCUS/ZOOM LADDER as data (spec 2026-07-18): one ordered rung table
  per 3D view (`LADDERS` — geo `node → cohort → country → network → all`, hyper `node →
  network → all`, ledger `node → layer → network → all`), each rung a pure `active(sel)`
  predicate + a resolver KEY the Engine implements (`_resolveFocus` walks finest→coarsest;
  first active rung whose resolver succeeds wins the camera, failure falls through — the
  per-view fallback chains, made uniform). Also `finerLevels()` (the deselect-stepping data
  `pickActions` derives its drop-the-finer rules from — one level list, two consumers) and
  `LEVEL_CARRY` (cross-view carry: node/network carry always; cohort/country/layer are
  VIEW-SCOPED — cleared when leaving their view, so no view-scoped card ever lingers).
  In ledger, `layer` sits deliberately FINER than `network`: a committed layer wins the
  camera and lane-slides on a filter change; the network rung fires only with nothing finer.
- `morph.ts` — the hyper↔geo morph easing + derived visibility ramps.
- `viewTransition.ts` — the ONE 3D↔3D view-switch choreographer (`ViewTransition`, `View3D`):
  every switch among `hyper`/`geo`/`ledger` runs **OUT** (`DUR_OUT` 0.9s — the from-view's
  furniture fades via `furnitureAlpha`, nodes fly staggered [`STAGGER_SPREAD` 0.25s spread,
  rank-ordered within each network's grid] to the gathering slots) → **BOUNDARY** (`tick()`
  returns `true` exactly once, mid-flight, invisible — the Engine applies the destination
  layout there) → **IN** (`DUR_IN` 3.0s node placement with the furniture building on its own faster
  `FURN_IN` 1.0s ramp — decoupled, user 2026-07-17; nodes disperse to
  their destination poses, the camera flies). `morph`/`ledgerT` are now BOUNDARY-APPLIED
  layout parameters the machine snaps, not eased flight blends. Retargeting (flipping the
  switch mid-flight) keeps flight weights continuous via the `FLIGHT_OUT`/`FLIGHT_IN`
  denominators (`DUR_OUT`/`DUR_IN` minus the stagger spread) — no teleports. Picking is
  suppressed while `transition.active()`, and **HUD-commit camera reframes are HELD during the
  OUT phase** (`holdCamera()` gates `Engine._tweenTo` — the state commit stands; the boundary's
  `_applyDestLayout` re-derives the pose from committed state, so the camera holds still
  through the teardown and nothing is lost). Pure and allocation-free; `gatherWeight`/
  `furnitureAlpha` are read per node/per frame by the scene.
- `gatherLayout.ts` — `gatherSlots()`: the staging-grid layout each network's nodes gather
  into mid-transition — one near-square grid per network, packed left→right sorted
  size-desc (`GATHER_GUTTER` 1.5 cells between squares), on the camera-anchored staging plane
  at the top of the viewport (the Engine rebuilds the frame every frame from the live camera;
  `Globe.setGatherCell` scales the cell by camera aspect so phone-width viewports still fit
  the row). Peer to `hyperLayout.ts`/`ledgerLayout.ts`/`geoLayout.ts`.
- `nodeLayout.ts` — the node placement math: the Hypergraph's ARMILLARY "atom" rings
  (`armillaryFrame`/`ringFramePos`/`armillaryRings`/`armillaryPos` — nodes on same-diameter
  rings at different tilts; replaced the old fibonacci scatter shells, hypergraph-redesign
  branch; `HyperView._makeHoop` draws its cyan hoops from the SAME `ringFramePos` curve so
  nodes and hoops can never drift), the sphere→disc geo positions, `spreadCoLocated()`
  honeycomb chip-stack fan-out.
- `dimModel.ts` — pure filter/hover/country dim + emissive resolution, and the SINGLE SOURCE of
  that math: the scene CALLS these functions directly (`NodeFabric`'s glow writers call
  `validatorDim`/`nodeEmissive` + `metaNodeDim`/`metaNodeEmissive`/`hubMatchBoost`; `Globe._frameCtx`
  sources its dim strengths from `dimScale`/`metaDimScale`) — the old inline mirror ("change BOTH
  places") is RETIRED (2026-07-18; it drifted twice), and the colocated tests are its executable
  spec. The DAG core dims as ONE value (the old per-layer `{l0,l1}`
  pair always moved in lockstep and was collapsed, 2026-07-09); node glow is STEADY (the
  decorative twinkle shimmer was removed, user) with PER-POOL resting bases — validators
  `lerp(0.47, 0.37, morph)`, metagraph nodes `lerp(0.33, 0.37, morph)` (they rest at the dim
  look in hyper, 2026-07-17: `metaDimScale` = morph zeroes their network dim there; the
  committed network pops via `hubMatchBoost` to the hub level 0.72). **Focus is TIERED, not a
  flag** (`focusWeightOf` + `GROUP_FOCUS`, 2026-08-01): the hovered/selected NODE takes the full
  `focusBoost`, a mere member of a focused GROUP (a hovered/committed provider cohort, a hovered
  composition/cluster group) only `GROUP_FOCUS` of it — otherwise picking a node inside an
  already-lit cohort changed nothing on screen (user).
- `arcSim.ts` — the travelling-packet arc simulation: a swarm of comet "agents" that hop
  node→node. **Emits flash EVENTS via a ring buffer** — no cross-view side-channel mutation.
- `ledgerModel.ts` — the Snapshots chamber's layout/slot/tile model over the live snapshot data.
- `hyperLayout.ts` — the Hypergraph view's layout home: `metaAnchor()` (hub orbit-slot),
  `META_ORBIT`, and `applyHyperRig()` (the ONE tilt+spin Euler composition every hyper-structure
  group runs through — HyperView root/core + Globe's node group can't desync).
  Per-view layout peers: `ledgerLayout.ts`, `geoLayout.ts`.
- `stageLight.ts` — the per-view stage-light constants table (`STAGE_LIGHTS`: angle/distance/
  intensity/penumbra/aim height per 3D view — the viewPolicy idiom; the values are deliberate
  per-view tuning, the mechanism is one). Consumed by each view's `FocusSpot` construction; the
  OFF-lifecycle is the Engine's central `StageLights` gate (see *scene objects*).
- `ledgerLayout.ts` — the Snapshots view's layout home: `LEDGER` (floor heights + the whole-view
  group transform), `HYP_SPLIT` (the hypergraph level's 2/3+1/3 cut), `LAYER_GEOM` (layer id →
  height/lane-centre; ids shared with the UI copy table `src/data/ledgerLayers.ts` and the scene's
  `layer` picks), `ledgerSite`, `clusterRadius`, `ledgerSpread`.
- `pickActions.ts` — the CLICK/SELECT DECISION TABLE: what picking a subject means per view ×
  pick kind, as pure data-in/actions-out logic with TWO kinds of executor: the Engine's
  `_handleClick` (scene raycast clicks, via `clickActions` → ordered `ClickAction[]`) AND the
  React components (GeoExplore's `drill`/`selectNode`, LiveStrip's bar `pick`) via the named
  builders `countryToggleActions` / `nodeSelectActions` / `snapshotSelectActions` — so the
  scene and the panels can never drift in semantics (a test literally asserts row-select ===
  scene-click). Also `pickNetId` + **`pickActive`** (which picks respond AT ALL per view:
  node-less hubs never, geo off-filter nodes never, hyper everything). Ordering contracts are
  tested invariants: filter-first (only when it CHANGES — no drill churn) → node's country →
  node's cohort → inspect-LAST (the node camera wins — FULL-ANCESTRY rule, spec 2026-07-18:
  a node select commits every coarser rung so deselects step down predictably; in ledger the
  ancestry is the browser row's parent floor, else `autoLayerForNode`); deselect-before-drill
  on the country toggle (which also drops a committed cohort); the cohort/provider toggle
  (`cohortToggleActions` + `sameCohort` — geo's city×provider rung); the LIVE
  strip tip (re-)follows while older bars pin; layer/filter toggles (`layerToggleActions`,
  `filterToggleActions` — the picker's committed-row step-back-to-all). Deselect stepping
  derives from `focusLadder.finerLevels` (one level list, two consumers — a colocated test
  pins that the two can't drift). The table self-gates
  by mode. Every caller applies actions through the ONE executor
  **`src/store/applyClickActions.ts`** (tested — action kind → exactly one store effect; a
  snapshot CLEAR leaves `following` to the FollowController). **ENFORCED by
  `components/selectionBoundary.test.ts`** (house grep-test): no component may write a
  selection setter directly — the rule is WRITE-based, so read-only facts cards cost nothing
  and every future explorer card inherits the table; sole allowlisted exception:
  `FollowController` (the follow SYSTEM, not a user pick). New click/select semantics go in
  the table with a test, their effects in the executor — never inline anywhere. NB a filter
  SWITCH is a network-level event Engine-side: its subscription drops the node card (EVERY
  view — a geo switch can hide the inspected node outright; was hyper-only), the cohort and
  the country, while the ledger LAYER deliberately survives (it composes with the filter —
  the lane-aware layer framing slides). New click semantics go HERE with a test, not inline
  in the Engine.
- `cameraRig.ts` — the ONE camera home: `FOCI` presets, every framing function (`hubFraming`,
  `nodeFraming` (geo node — ABSOLUTE/dolly-exempt, solved against `NODE_RAISE`, the residual
  Globe.focusNode leans every node to — a documented cross-layer CONTRACT), `hyperNodeFraming`,
  `geoFraming` (the no-topology FALLBACK — the real drill pose is countryShape.countryFraming),
  `cohortFraming` (the geo provider-cohort pose — one rung wider than the node zoom, same
  `NODE_RAISE` lean contract via `Globe.focusCohort`, ABSOLUTE/dolly-exempt like
  `nodeFraming`), `ledgerLayerFraming`), the global **`CAM_ZOOM` dolly** (`dollyBack()` — one lever widening
  every pose; a pose with a composed non-subject target must opt out explicitly or the dolly
  drags the camera off the subject, the bug that hit the node pose), and **`closeness()`**
  (camera altitude → the surface-sharpening factor GeoView's shaders consume). Easings too.
  **Two camera PRINCIPLES** (2026-07-17 live-review lessons, both enforced/settled): (1)
  *framing math consumes LAYOUT data* (records, anchors, orbit slots) — never rendered
  transforms (`getWorldPosition`/`getMatrixAt` in Engine framing paths need a justified
  `render-state OK` marker; two focus bugs came from framing animated/collapsed groups); (2)
  *view emphasis moves the STRUCTURE, not the camera* — shared, lockstep, policy-driven (the
  hyper focus tilt) beats composed camera cleverness; the rolled focus pose + DoF fell to
  deletion, and camera poses stay dumb.
- `records.ts` — the plain node/metagraph record types (`ValidatorRecord`/`MetaNodeRecord`) the
  scene consumes.
- `geoLayout.ts` — shared geo constants (`R`, `LAND_H`) + `latLonToVec3`.
- `countryShape.ts` — the country drill's shape math over the countries topology: `ccToNumeric`
  (alpha-2 → world-atlas numeric id via the baked `data/country-codes.json`), `geometryRings` /
  `mainPolygonRings` (framing composes on the main landmass; the border draws all polygons),
  `ringsCentroid` (3D-unit-dir mean, segment-length-weighted — antimeridian-safe, no unwrap),
  `ringsAngularRadius`, `countryFraming` (the constant-angle front-approach pose —
  `COUNTRY_VIEW_ELEV` above the tangent, `AIM_BELOW_CENTROID` composition drop, extent-fit
  distance), `ringsToSegments` (the border hairline's positions), `GLOBE_LEAN_MAX`.
- `geoStats.ts` — the geo "data" layer: per-country tallies + the flat node-browser list,
  **pure functions** over the node record arrays (no Three/mesh state).

**`src/engine/scene/`** — the Three adapters (own their meshes/scratch; **read domain, write
GPU; no store/react**):

- `SceneContext.ts` — the Three.js scene, camera (FOV 55), `OrbitControls` (damping on,
  autoRotate), and the postprocessing chain: **RenderPass → BokehPass (`dof`) → bloom**.
  Exposes `resize()`; the engine owns the window listener.
- `Globe.ts` — the node-engine coordinator: owns the shared DAG validator nodes AND the
  metagraph nodes, the filtering/dimming, the geo focus spin, and the `ledgerT` lane placement;
  delegates to the `objects/*` adapters.
- `objects/NodeFabric.ts` — the node **InstancedMesh**es (sphere→disc instanced cross-fade)
  with the patched smooth-shaded `MeshStandardMaterial` (per-instance `aBase`/`aEmissive`).
- `objects/Arcs.ts` — the ONE `LineSegments` draw call for the arcs; rewrites head/tail
  positions each frame from `arcSim`'s state and **applies its flash events** to the nodes.
  It shares the surface's camera-**facing** + closeness uniforms (`Arcs.setFacing`, handed over
  right after `buildGeoView`): the hologram has no opaque body sphere, so nothing depth-occludes
  a comet over the far hemisphere — it fades itself, the same recipe the walls and graticule use
  (user, 2026-08-01: arcs read as flying through the globe).
- `objects/Background.ts` — the skydome. The **geo** end is the twinkling starfield + faint
  nebula; the **hyper** end is a **single flat colour** (no animation, no gradient, no tint — an
  animated backdrop read as distracting). Only `uTime`/`uMorph` drive it.
- `objects/FadeSet.ts` — the ONE furniture-fade registry (extracted from Globe's `geoFades`
  pattern): a view registers its STATIC materials (`{mat, base}`; opacity = base × alpha) and
  owns exactly one alpha — `setViewAlpha` forwards to `FadeSet.apply`, dynamic per-frame writes
  read `.alpha`. HyperView + LedgerView compose one; a cross-cutting fade change is one edit here.
- `objects/FocusSpot.ts` + `objects/StageLights.ts` — the focus stage-light: each view DRIVES
  its own lit `FocusSpot` (aim + eased intensity, constants from `domain/stageLight.ts`), but
  the OFF-lifecycle is CENTRAL — every spot registers with the Engine-owned `StageLights`, whose
  per-frame `gate(alphas)` blacks out any view at furniture-alpha ≈ 0 (a view can't forget its
  own off-switch; the lingering-spotlight bug class is dead).
- `objects/gradientTexture.ts` — `makeRadialGradientTexture(stops)`, the one canvas
  radial-gradient sprite factory (geo glow pools + hyper ring fills differ only in stops).
- `views/HyperView.ts` — Hypergraph-only furniture: the Global L0 **core** and the orbiting
  metagraph **hubs** (from `config.METAGRAPHS`). The core is parented to the scene (not
  `root`) so the morph's root-collapse doesn't drag it; it **dissolves in place** as the Earth
  fades in (the old grow-into-the-globe swell was removed 2026-07-12 — stale comments/docs
  claiming it were fixed 2026-07-17 alongside the view-transition work). Hubs fade out early
  on the morph. `setViewAlpha()` rides `transition.furnitureAlpha("hyper")` on top of that
  morph fade — the whole furniture blacks out during a transition's OUT/BOUNDARY and builds
  back in during IN, same mechanism `LedgerView.setViewAlpha` uses for the chamber.
- `views/GeoView.ts` — the geo globe SURFACE: body sphere, graticule, atmosphere rim, the polar
  **compass roses** (hairline dial + micro N/S letter over each pole, in `globe.group` so they
  rotate truthfully — E/W are deliberately not floated), and the
  **solid raised continents**. The topology is **`public/countries-110m.json`** (world-atlas;
  replaced `land-110m.json` 2026-07-10 — it carries BOTH `objects.land` for the surface AND
  `objects.countries` for the drill border/framing, one fetch). Each coastline ring becomes an
  additive **"wall" cliff** ribbon from ocean level to `R+LAND_H` (BackSide-culled, dim rim,
  always the default cyan — metagraph-tinting it read as too dominant); the land SURFACE is a
  full sphere at the wall-top radius wearing a **baked equirect land-mask texture** (Canvas2D,
  additive — sea texels are black; the old earcut plateau triangulation was replaced by this
  masked sphere, killing the seam/pole bug class). The fill is a SIMPLE luminance wash
  (user-tuned) — the tile/micro-grid was removed entirely (user, after an A/B); the sea
  graticule (base 0.06) spanning the whole sphere carries the digital line work. GeoView also
  owns the **country drill border** (`setCountryBorder` — one `LineSegments` rebuilt per
  drill/hover change) + the per-country geometry index (`countryGeoms`, world-atlas numeric id →
  geometry; `onCountriesReady` re-asserts a drill made before the async load). A shared
  **closeness uniform** (`closeUniform`, written from the camera altitude each frame: 0 at the
  overview, 1 at country/node range) sharpens the surface up close — the walls damp their soft
  body glow and tighten/brighten the top rim (the ridge read as FUZZ at node range, user), and
  BOTH the walls' and the graticule's far-hemisphere facing floor drops to near-zero (looking
  THROUGH the globe distracted at close range, user). Nodes/arcs sit on the plateau
  (`R+LAND_H+ε`).
- `views/LedgerView.ts` — the Snapshots view's 3D settlement chamber over `ledgerModel` (see
  its own section below).

**`src/data/`** feeds the engine live network data (no simulation):

- `api.ts` — the typed `NetworkData`: **client-side** polls the block-explorer API (CORS `*`),
  keeps per-metagraph snapshot buffers + the `anchorIndex` (`getAnchor`; `global`/`status`/
  `cluster`/`anchor` events, `on`/`off`). When the API is unreachable it stays factual (a "NO
  SIGNAL" state) and recovers on the next good poll. It polls regardless of view.
- `geoResolve.ts` — `loadGeoCache()` (fetches the live `/api/geo` map) + best-effort `resolveMissing`
  for new validator IPs (ip-api over http, ipwho.is over https). The lookups also carry the
  **hosting provider** (`GeoInfo.isp`/`asn` — ip-api's `isp` + the ASN prefix of `as`; free on the
  same batch call): the node card's HOSTING line + the explorer's provider sections. ⚠️ Adding
  geo FIELDS does not invalidate `unstable_cache`/localStorage — bump the cache keys
  (`validator-geo-live-v2`, `metagraphs-live-v2`, `dag-geo-cache-v2`) when the field set changes.

**There is intentionally no `$DAG` price networking** — don't add a market-data fetch unless
something in the UI actually consumes it.

## Engine layer rules & render-loop discipline

The engine is three layers with a one-way dependency, enforced by
`src/engine/layerBoundaries.test.ts` (a cheap grep over import lines):

- **`domain/` = pure logic + data.** May import THREE's *math* classes (`Vector3`, `Color`, …),
  `config`, and data *types* (incl. the `Mode` string-union via `import type`). MUST NOT import
  `scene/`, `three/addons`, react, or store *values*. Side-effect-free and unit-tested in
  isolation.
- **`scene/` = Three adapters.** They own their meshes + scratch, **read domain, write GPU**.
  MUST NOT reach into the store or react.
- **`Engine.ts` is the ONLY layer that touches the store** — the single bridge to Lane B. Keep
  it that way in every refactor.

**ViewPolicy is the allow-list, made data.** Per-view behaviour lives in `domain/viewPolicy.ts`
(`VIEW_POLICIES[mode]`), NOT in scattered `mode === "x"` guards. A new view is **inert** (no
canvas, no sims, no picks, no DoF, no hints) until its row opts it in. Gate on the view a
behaviour is FOR — never on a morph value, never a deny-list (a deny-list grows a line per view).

**Zero-allocation render loop.** The per-frame path allocates nothing: scratch objects
(`Vector3`/`Matrix4`/`Color`/`Quaternion`) are **construction-time fields reused via
`.set()`/`.copy()`**, never `new`'d in `update()`. Every instanced-mesh slot is **written or
zero-scaled every frame** (a stale slot from a previous view must never linger). Event-driven
allocation (on a filter change, a new tick) is fine — mark it with a comment.

**Simulations emit events; adapters apply them.** A sim (e.g. `arcSim`) publishes discrete
events (arc-arrival flashes) through a ring buffer that the owning adapter drains and applies to
its own meshes. **No cross-view side-channels** — the old `node._flash` mutation reached across
views and caused the ledger red-dots bug; that pattern is forbidden.

## Nodes, layers & the filter (the parts that bite)

- **Node meshes**: validators and metagraph nodes are **InstancedMesh**es with a patched
  smooth-shaded `MeshStandardMaterial` (`_makeNodeMaterial`) — each instance gets its own
  color (`aBase`) and animated glow (`aEmissive`). In the Hypergraph they're small
  **spheres**; on the globe they cross-fade to standing **round CHIPS** (32-seg
  cylinder — was a hex prism, user re-shaped 2026-07-10; identifiers keep their hex-era names;
  radius = `geoSize`, height `geoLayout.HEX_H`, slightly glassy `HEX_ALPHA 0.8` — a wireframe
  overlay was tried and rejected; EDGE-LIT: dim sides, bright top cap + fresnel rim redistribute
  the emissive so stacks read as lit chips, not a flat mass; `discFall()` eases them out toward the
  limb — needs the camera); in the ledger they're the SAME standing chips on the floor planes
  (`LEDGER.dot` footprint × `HEX_H` — replaced the squashed-sphere COINS 2026-07-12, user: the
  edge-on coin slivers were nearly un-raycastable; the chip's top cap + sides are a real pick
  target, so the ledger needs no pick assist). Per-instance transforms via the shared `_dummy`.
- **DAG L0/L1** are two ARMILLARY shells around the core (each shell = several same-diameter
  rings at different tilts — an "atom", `nodeLayout.armillaryPos`; replaced the fibonacci
  shells on the hypergraph-redesign branch). **Each metagraph** is laid out the same way
  around its hub: one armillary ring set per layer at the `hyperLayout.META_RING` radii
  (**L0 inner → data-L1 (dl1) middle → currency-L1 (cl1) outer**), each ring drawn as a
  matching cyan hoop. Metagraph nodes live in the rotating globe group but stay glued
  to their orbiting hub in the Hypergraph — `Globe.ts` converts the hub's live position into
  the group's local frame each frame. Keep that.
- A metagraph's identity hue must be the SAME everywhere it appears — hub, globe nodes,
  filter dot, rail thread, card marks — matched by metagraph `id` (see *Two colour lanes*).
- **Two sources, kept consistent on purpose.** Hypergraph **hubs** are built from
  `config.METAGRAPHS` (all 10, unconditionally — `HyperView.ts`), but **globe nodes** come from
  `globe.metaList`, filtered to metagraphs with at least one **locatable** node. A config
  metagraph with 0 locatable nodes (e.g. TBC, LEET) has a hub but can't be plotted. The
  filter picker keeps those rows **clickable but dimmed, with a bare `0` count** (user; the
  earlier muted `not located` tag was replaced 2026-07-12 — the dim already says it's quiet;
  the hyper explorer dims its 0-node network rows the same way) — they're real metagraphs,
  selectable in Hypergraph/Snapshots, just not
  plottable; picking one lands geo in its quiet-empty state and the right rail shows the
  honest state-aware hint (see *State-aware pick hints*).
- Co-located nodes are laid out deterministically by `spreadCoLocated()` as **poker-chip
  STACKS in a HONEYCOMB** (2026-07-09, user design): the group is chunked into stack heights
  of 5–10 (`stackSizes` — one hex per REAL node, sizes always sum to the true count; honest,
  never randomized), stacks sit on adjacent hex cells (`hexCell` spiral, edges touching — no
  circular fan), and each node's stack LEVEL lifts it radially by `geoLayout.CHIP_PITCH`.
  The old density heatmap (rings AND glow) was REMOVED entirely (the rings read as extra
  colour/score; the gradient's hot orange collided with metagraph identity hues and read as a
  dim/hide bug) — the honeycomb itself shows density. Don't add random jitter.
- **Arcs are travelling packets**, not fixed lines: `_buildArcs` builds a swarm of comet
  "agents" that each hop node→node (pick a random node in the filter, fly a curved arc,
  flash it on arrival, pause, repeat). All share ONE `LineSegments` (one draw call); only
  their head/tail positions are rewritten on the CPU each frame, coloured per metagraph.
  Rebuilt on every filter change. Tuned CALM (user, 2026-07-09): slow hops (`speed 0.15–0.35`),
  long comet tails (`ARC_TAIL 14`, `ARC_TAIL_FRAC 0.42`), longer rests between hops.
- **The filter** lives in the top command bar (`TopBar` → `FilterPicker`); everything routes
  through `Engine.applyFilter()`, which behaves per-view:
  - **Geography — FOUR zoom LEVELS** (user design; the ladder is data —
    `focusLadder.LADDERS.geo`: network → country → provider cohort → node), each deselect
    stepping back up one:
    `globe.setFilter()` isolates/dims the selection, the leaderboard refreshes, and
    `globe.focusDensest()` rotates the globe so the **densest part of the selection faces the
    camera** (north stays up — Y rotation only). A **metagraph** selection frames WIDE
    (`FOCI.geoNetwork`, deliberately farther out than the country pose so drilling still reads
    as a zoom); a **country** drill frames the country's real SHAPE (see the drill-down bullet);
    a **provider COHORT** (city × provider, committed via the explorer's cohort rows —
    `store.cohort`, internal name `cohort`, user-facing word **provider**) leans the globe to
    the stack field's centroid (`Globe.focusCohort`, the same `NODE_RAISE` contract as the
    node pose) and frames it one rung wider than the node zoom (`cohortFraming` — ABSOLUTE/
    dolly-exempt like `nodeFraming`) while the member stacks hold a STEADY committed glow
    (same strength as the hover preview, but a GROUP tier — `dimModel.GROUP_FOCUS`, a fraction
    of the boost a single node takes, so selecting one node inside the lit cohort still pops;
    a live hover wins while active; membership matches
    by falsy-normalized cc+city+isp — the data layer normalizes unresolved fields to "");
    a **node** pick zooms close in a
    LATITUDE-INDEPENDENT pose (`Globe.focusNode` leans the globe UNCAPPED with a 0.42 raise, so
    every node rests at the same residual elevation — Helsinki read flatter than the rest with
    the old 0.70 tilt cap, user; `_focusNode`'s camera/target are solved for that one pose and
    are CAM_ZOOM dolly-EXEMPT — the composed far-up look-at made the global dolly drag the
    camera away from the node).
  - **Country drill-down** (geo only): the country rows in `GeoExplore` are clickable.
    **The drill is a LENS, not a filter** (user, 2026-07-11 — reversed the original
    dim-everything-outside design): it flies to the country, draws its border, firms the land
    glass and marks the row with the shared selection ✓ (`SELECTED_ROW` + `SelectedRowMark`),
    but the OTHER nodes stay fully visible, pickable and fanned (`_nodeActive` ignores
    `countryFilter`; the `countryMix` dim machinery is dormant — the FrameCtx always gets
    `countryFilter: null`). Click again to clear; switching network clears it. **The drill is shape-driven** (2026-07-10, `domain/countryShape.ts` over
    `public/countries-110m.json`): the globe spins to the country's polygon **centroid** (gentle
    `GLOBE_LEAN_MAX` lean — a FULL lean read as the camera going over the country) and
    `countryFraming()` builds a **constant-angle pose**: the camera approaches from IN FRONT
    (the equator side of the country's meridian) at `COUNTRY_VIEW_ELEV` (~49°) above its local
    tangent plane, aimed `AIM_BELOW_CENTROID` below it — every country is viewed at the SAME
    surface angle, north up, never over the zenith (`countryLean` stretches the lean at very
    high latitudes so the invariant survives the zenith cap); only the DISTANCE varies, fit to
    the country's angular extent (floor 4.3 / cap 20), with the composition drop fading to the
    mid-line for wide countries (the US/Canada/India read too high with the compact bias). Framing composes on the **main landmass**
    (`mainPolygonRings` — France's geometry includes French Guiana, the US's Alaska/Hawaii; the
    mainland leads, the node-mean framing is the fallback while the topology loads). A **cyan
    hairline border** (structural, not identity) outlines the drilled country at plateau height
    — invisible at rest (the surface stays clean), whisper-level (0.3) while a country ROW is
    hovered (`store.hoverCountry` → `globe.setHoverCountry`) — TWO border objects, so the
    hover preview coexists with a committed drill (user: hovering another country must still
    preview while one is selected), gone on deselect; it's a `geoFades` entry whose `base` IS the level, so the morph
    gates it for free. A committed drill also firms the drilled country's OWN land glass — a
    SCOPED equirect mask, not a global bump (`setCountryFillMask`: the country's rings
    rasterized to a 2048×1024 canvas per drill change, sampled THRESHOLDED (a tight
    smoothstep — linear filtering smeared the boundary at node-level zoom) by the land-fill
    shader via
    `onBeforeCompile`, `uMaskBoost` inside / 1 elsewhere; cleared = hard no-op). NB the fill's
    resting additive is tiny (~0.055 luminance × 0.45), so perceptible boosts start ~×6 —
    `MASK_BOOST` 8, tuned live (×12 read hot). **The country hover/click pairing is BIDIRECTIONAL**
    (`ViewPolicy.countryHover`, geo only): pointer-moving over a DRILLABLE country on the globe
    (no object hit → analytic ray→sphere + `countryCcAt` point-in-polygon over the drillable
    set) writes the same `hoverCountry` channel — the explorer row washes (`subjectPairing`,
    structural cyan) and the border previews; clicking the country toggles the drill exactly
    like the row. A canvas `pointerleave` clears every hover channel (cards overlay the canvas,
    so moves stop at their edge). ⚠️ **Data rebuilds must not wipe the drill**: `Globe.setMetagraphs` restores its
    own `countryFilter` around the internal `setFilter`, and `Engine.applyFilter`'s geo branch
    re-asserts `this.country` — the background cluster poll (`_applyMetagraphs →
    applyFilter(false)`) used to silently clear the drill's dim + border seconds after every
    drill (long-standing bug, found+fixed 2026-07-10; a real filter SWITCH still clears the
    drill by design — the store subscription nulls `country` first).
  - **Hypergraph**: committing a metagraph eases the WHOLE structure's shared tilt from
    `HYPER_TILT` down to `HYPER_TILT_FOCUS` (~flat — the discs read horizontal from the side
    pose; the structure moves, never the camera rolling), and `_focusFilter` flies the camera
    to the selected hub with the plain radial `hubFraming` (using the hub's **local/unscaled** position — `layers.root` is morph-scaled,
    so `getWorldPosition` would aim at the origin mid-morph), world-up, NO camera roll. The
    rolled focus pose (core pinned upper-left) AND depth-of-field were DROPPED
    2026-07-17 (user: the bokeh read as fuzz on the selected atom and the composed pose fought
    the transition choreography — simple and correct wins; the dead framing function was
    swept from cameraRig 2026-07-18, the BokehPass stays wired but no view is `dofEligible`). The hub's
    **orbit is paused while focused** (`layers.focusId`) so it stays framed, AND the
    non-selected nodes + hubs dim back so the selection stands out. Picking is filter-gated in hyper too
    (`_isPickActive`): only the in-focus selection's nodes are hoverable/clickable. Clicking
    a node sets the filter to its network (consistent with geo) + opens its node card —
    `GeoExplore.selectNode` mirrors the same two-step for explorer rows.
  - **Snapshots**: the ledger ladder is `node → layer → network → all`
    (`focusLadder.LADDERS.ledger`; `layer` deliberately FINER than `network` — a committed
    layer wins the camera and lane-slides on a filter change). Committing a filter with
    nothing finer committed frames the metagraph's LANE at its L0 floor (the `ledgerNetwork`
    resolver — `_focusLayer("ml0")`, `"dag"` → `"hypl0"`; camera-only, no layer commit, so
    the layer card stays a ghost); entering ledger with a filter committed arrives on that
    lane too. "all" rests at the shared overview.
  - **Cross-view carry is data** (`focusLadder.LEVEL_CARRY`): the network filter and a node
    selection carry across view switches; country + cohort are geo-only and layer is
    ledger-only — each cleared on leaving its view (so no view-scoped card lingers; the layer
    card used to follow into hyper/geo). A filter SWITCH additionally drops node + cohort +
    country in EVERY view (network-level event; the layer survives — it composes).
- **Hover preview**: hovering a filter-picker row OR a metagraph hub in hyper sets
  `store.hoverFilter`, which previews that selection's dim in any view via
  `globe.setHoverFilter` (+ `ledger.setFilter`), without committing `filter`. The hover
  previews at the SAME per-view strength as a committed filter (the old forced-strong 0.85
  branch was removed 2026-07-11 — it dimmed the rest far harder than the regular dim; what a
  hover must NOT do is the *click*'s camera flight). Hovering an explorer node row glows that node's shells on the
  globe (`hoverNodeId` → `globe.setHoverNode`), matching a 3D raycast hover; hovering a
  country row previews that country's border outline at a whisper level (`hoverCountry` →
  `globe.setHoverCountry` — the committed drill's full hairline wins). Hovering a cohort row
  glows the whole stack (`hoverCohort` ids → `globe.setHoverCohort`); a COMMITTED cohort
  holds the same glow steadily (`globe.setSelectedCohort` — same strength, the live hover
  wins while active; hover-pairing on cohort/provider subjects is outward-only by inherited
  convention — the scene never writes `hoverCohort` back).

## Per-view behaviour — allow-list, not deny-list

When something should only apply in one view, **gate on the view it's for**, don't exclude
the views it isn't (a deny-list grows a line every time you add a view). **The canonical
mechanism is the `VIEW_POLICIES` table in `domain/viewPolicy.ts`** — one row per `Mode`, and
`Engine` reads `VIEW_POLICIES[mode]` each frame instead of hand-written `mode === "x"` guards:

- **Picking** (`policy.pickSources` → `Engine._pickablesFor`): the row lists the exact mesh
  pools (`"globe"`/`"layers"`/`"ledger"`) a view raycasts; unlisted = pick nothing. ⚠️ **Three's
  raycaster ignores `object.visible`** — hidden meshes are still hit — so you cannot rely on
  hiding a group to stop picking it; it must be left out of `pickSources`.
- **Depth of field** (`policy.dofEligible`, still ANDed with a metagraph selected + the morph
  window): only `hyper`, so new views are DoF-free by default.
- **Pick hints** (`Inspector`'s `INVITE` map) mirror the pick registry: only views with
  pickable subjects get an invite; placeholder views get none.

Same idea throughout: a new view is inert (no picks, no DoF, no hints) until its `viewPolicy`
row opts it in. The `ledger` row shows the pattern: `pickSources: ["ledger", "globe"]`,
`morph: "frozen"` (kept at whatever value it entered with; nodes reach their lane poses via the transition's IN-phase gather dissolve, not a live morph ease), `show.ledger: true` + `show.hyperFurniture: false`
(hubs hidden), `dofEligible: false`. Its hidden hubs are kept **out of `pickSources`**, not
relied on being invisible — per the raycaster rule above.

## Layout system — the four-zone HUD, over a RAW DATA LAYER

The page is ONE fixed shell in **two LAYERS at different depths** (`SectionShell` +
`store.section`, spec 2026-08-01, revised the same day): the **scene layer** is the four-zone HUD
over the 3D canvas, and the **raw layer** is the view's raw-data table (`DataSection`) — *the same
data one level down*, not a second page. Flipping the command bar's **RAW switch** (a shadcn
`Switch`, the light/dark-mode idiom — `components/topbar/RawToggle.tsx`) runs one GSAP timeline:
the HUD fades out (0.26s), the whole
scene shell **recedes** (scale `SCENE_BACK` 0.92 + opacity `SCENE_DIM` 0.26, 0.55s
`power3.inOut` — still live behind, just pushed into the background), and the raw layer **surfaces
out of that depth** (opacity 0→1, scale 0.94→1, a small `yPercent` rise, 0.55s `power3.out`,
overlapping at +0.16s). Back is the mirror, plus **Escape**. Retargeting mid-flight kills the live
timeline. Reduced motion makes it an instant swap (all durations 0).

**The page never scrolls.** The scene wrapper is `position:fixed; inset:0` **WITH an identity
transform from first paint**, which makes it the containing block for every `position:fixed`
descendant (canvas, rails) — so the existing shell CSS works untouched, the WebGL buffer stays
viewport-sized, and GSAP later writing that same `transform` never re-anchors geometry. The raw
layer is a **SIBLING** of that wrapper (`#datasection`, `.ig-panel fixed z-9`), occupying exactly
the rails' band via the shared tokens (`--rail-top` + `--topbar-extra` → `--bottom-reserve`,
edge-aligned 26px desktop / 16px below 1100px), so the receded scene shows around and faintly
through its glass. The `LiveStrip` is a sibling too (`z-10`) — it belongs to NEITHER pose and stays
interactive in both. Whichever layer is away carries `inert` (no focus, no pointer events).
`TopBar` + the banner stay OUTSIDE the shell (fixed to the real viewport, visible in both poses),
as do the bridges and the pointer-anchored `Tooltip`.

⚠️ **The HUD wrapper is animated by OPACITY ONLY** — deliberately. `opacity` creates a stacking
context but NOT a containing block; giving that zero-size static div a transform would capture the
fixed rails inside it. The receding transform belongs to the `fixed inset-0` wrapper, which is
already their containing block. (The old translate-the-shell-off-screen mechanism — drag/wheel/
chevron navigation via GSAP Draggable + Inertia + Observer — is RETIRED: scroll fought the Three.js
camera controls, and the page-swap metaphor read as "the table hides the app". With it went the
`shellOffsetY()` measurement trap: nothing translates, so `getBoundingClientRect()` inside the
shell IS the viewport position again. Portalled UI still doesn't ride any of this, so it's gated —
`RailDock` gates its sheets on `section`; `LiveStrip` portals its tip.)

The HUD is **four fixed zones over the canvas, one SCOPE/role each, stable across views**.
**Gate new chrome by *which zone/scope it belongs to* — not by what a particular view puts
there.** Define a card by its scope (the role it plays); its *contents* are view-specific
and keep changing, so they're examples, not the contract.

- **Top** (`TopBar`) = the **command bar**: one full-width glass bar whose edges align with
  the rail columns (26px) on desktop. Three regions on one row: **status + filter** (left —
  the ECG heartbeat mark + "DAG Visualizer", then the filter button whose face is a small
  identity dot + network name — on the condensed breakpoints the "FILTER" text label simply
  hides (a stand-in funnel icon was tried and rejected as too busy); clicking toggles the
  **attached FILTER STRIP** — the bar GROWS DOWNWARD by one row of network chips on its own
  surface (identity dot + name + located count, sorted located-desc, 0-located dimmed with a
  bare 0; the committed chip wears the view switch's SELECTED_ROW on-state, no ✓). User
  reversal 2026-07-12 of the 2026-07-04 detached-popover decision: hovering chips previews
  the dim while the SCENE reacts in the open (the popover glass covered it); picking keeps
  the strip OPEN (browsing several networks is the point) — the button/Escape close it. It is
  EXPANDED BY DEFAULT (non-phone; phone closes it once the breakpoint resolves — no room for a
  persistent strip). The strip is a LAYOUT participant, not a popup: TopBar publishes its
  rendered height as `--topbar-extra` (ResizeObserver), and BOTH the rails AND the scene canvas
  add it to their `top` (globals.css) — the rails slide down and the 3D canvas slides down with
  them (a pure position shift: the buffer stays viewport-sized, so no distortion / no engine
  resize; capped + scrolled on phone), so the grown bar pushes the whole layout down instead of
  overlapping the cards or covering the scene's top), the
  **view switch** (center — a `ToggleGroup` of six monochrome lucide icons: `Orbit` hyper /
  `Globe` geo / `Layers` ledger / `Radar` status / `ArrowLeftRight` transactions / `HandCoins`
  staking, from `VIEW_ICONS`), and the
  **view vitals + the RAW switch** (right — `Vitals`, then `RawToggle`, the bar's trailing
  control: it opens the raw data layer under the view and sits LAST because it acts on
  everything to its left; the "RAW" word hides ≤940px exactly like the FILTER label). **The
  vitals region is constant-width**: all view
  clusters render stacked in one grid cell (inactive ones `invisible` + `aria-hidden`) so the
  centered view switch never jumps on a view change; sparklines condense away ≤1240px.
  Below 1100px a slim **selected-view caption** hangs under the bar, right-anchored. The
  command bar is **spineless** (absolute rule — the ECG mark is its identity cue). With a
  network COMMITTED, the active vitals cluster wears a 1px soft-tipped **filter-scope
  hairline** in the filter's identity hue at rest-dim (user, 2026-07-11: the numbers silently
  switched to filtered values with nothing marking the scope) — the thread language, not a
  spine; "all" renders nothing (defaults carry no mark), numbers/sparklines stay untinted.
- **Left rail** (`#leftcol`, `ExploreRail`) = the **explore / interact** scope: every view
  leads with a collapsed **`AboutView`** orientation card (per-view title + eyebrow + copy;
  scaffolded views carry a `SOON` caption), above the view's ONE tool card if it has one —
  geo → `GeoExplore` (the country→nodes accordion: a country row shows its share, clicking
  it drills the globe AND expands its **COHORT rows** — one row per city × provider
  (`Falkenstein · Hetzner 31`), sorted by count; the old per-node rows repeated the same
  city/"ready" dozens of times (user: "a patch, not a design"). NO status anywhere in the
  list (user: health belongs to the node card + the future network-health view); NO identity
  dot on cohort rows either (user, 2026-07-12 — network is NOT in the key: a provider cohort
  can host many metagraphs, no single hue can speak for the row, and splitting per network
  multiplied groups). A
  cohort is a DISCLOSURE (single-open chevron) expanding to picker rows that LEAD with the
  composition word + trail the muted mono id (`data 53de…` — real per-row info, cohorts can
  mix compositions and NETWORKS; the id rows' hover-pairing hue derives per row); a
  SINGLE-node cohort click selects its node in the same click (no pointless second click); a
  collapsed cohort holding the selected node surfaces the ✓. Hovering a cohort glows its WHOLE
  3D stack (`store.hoverCohort` ids[] → `globe.setHoverCohort` → the fabric's hot check) and
  lights the country border. Counts are bare numbers (no ×). User design 2026-07-11), hyper →
  `HyperExplore` ("Nodes by network", 2026-07-12 — the architectural sibling: network (sorted
  by fleet size) → COMPOSITION group → node id rows; network rows commit the filter via
  `filterToggleActions` (a row IS a hub click, re-click steps back to all) and pair on the
  `hoverFilter` channel; the composition groups use the metagraph card's exact table
  vocabulary (Hybrid / Data / … + the RoleChips code pills), dedupe cluster entries to
  MACHINES so counts match the dossier, are DISCLOSURES ONLY (never layer-card selectors —
  the layer card stays ledger-scoped), and hover-glow all member instances via `hoverCohort`;
  the id rows are bare mono ids (the group label carries the word) running
  `nodeSelectActions`. Feeds off `store.selNodes`, published per `ViewPolicy.nodeList`. The
  tool-card NAMING rule: About = the view's point of view ("How the network is built"); the
  tool says what you BROWSE — "Nodes by network" / "Nodes by country" / ledger's "Settlement
  layers" (not "Nodes by…": its subjects are strata, not nodes). Card EYEBROWS are the bare
  role words ("About" / "Explore") — the view name was dropped (user, 2026-07-12: the view
  switch already says where you are), and each explorer's usage hint LEADS the card (top,
  descriptive) instead of trailing it. **The explanatory-copy split**: an explorer ROW is a
  browse target — mark/name/count and nothing more; the prose that EXPLAINS a subject belongs
  to that subject's right-rail card, once (user, 2026-08-01: the ledger floor rows repeated
  `LEDGER_LAYERS.desc` under every name while the layer card opened with the same sentence one
  rail away, and the list read as prose instead of rows). A row commits its card in the same
  click, so nothing is lost by leaving the sentence in one place), ledger → `LedgerPanel` — since the focus-ladder work
  (2026-07-18) ALSO the ledger's node browser: the four node-kind floors (`ml1`/`ml0`/
  `hypl0`/`hypl1`; never the snapshot floors) are DISCLOSURES — commit+expand in one click
  (`layerToggleActions`), disclosure = the committed layer (single-open by construction) —
  opening onto the committed filter's cluster/node rows for that floor (per-metagraph groups
  on the ml floors, hover-glowing their 3D stacks via `hoverCohort`; node id rows run
  `nodeSelectActions` with the floor as `ledgerLayerId` ancestry) PLUS one **LANE row** per
  OTHER network serving the floor (identity dot + name + per-floor role-derived count;
  0-located dimmed with the bare 0) that COMMITS the filter via `filterToggleActions` — the
  HyperExplore idiom bent onto strata: the browser's network level IS the filter, so "all"
  enumerates every lane instead of an empty state (user, 2026-07-18); lane-row hover
  previews via `hoverFilter`.
  The placeholder views have just the About card.
- **Right rail** (`#rightcol`, `Inspector`) = the **facts** scope (read-only), a set of
  **FIXED card SLOTS** in one stable order — network dossier, **country**, **provider**,
  node, snapshot, layer (user
  design, 2026-07-10; replaced the recency stack + the floating pick-hint; the country +
  provider slots landed with the focus ladder, 2026-07-18): every card the
  current view CAN produce is always visible — POPULATED when its subject is selected
  (`ContextCard` mirrors the filter; the **country card** — `ccMark` code + name title, Nodes/Share/
  Cities/Providers from `store.selNodes`, geo-scoped like layer is ledger-scoped; the
  **provider card** — "City · Provider" title, Nodes/Networks/ASN/Country; both rendered
  straight from their store channels by Inspector's `CountryPane`/`ProviderPane` since
  neither subject is a PickDescriptor, collapsible like every RIGHT card; the **node card**
  `geoLive` — location-first title, id
  demoted to a mono subtitle, status pill in the head aside; the **snapshot** and **layer**
  cards), else as a quiet **GHOST hint card** (a dashed one-liner:
  kind mark · slot label · instruction — no halo/animation) saying what to interact with — so the rail shows the view's whole possibility space and a deselect
  returns its slot to the ghost in place. Slot availability + hint copy live in the rail
  manifest (`railCards.ts`), the same source the dock trays read, and
  **`components/railLadderBoundary.test.ts`** enforces the ladder↔rail contract: every
  committable `focusLadder` rung below "all" must map to a hinted card slot (exemptions
  need an explicit documented entry) — a future rung can't land without deciding its card. An **instrument-channel
  thread** (`RailThread`) runs each rail's outer edge.
- **Bottom** (`BottomStream`) = the live/time lane: the slim
  `LiveStrip` in EVERY view; it publishes `--bottom-reserve`. It belongs to neither layer (it sits
  outside the scene wrapper and stays interactive in both poses); its CONTENT
  is per-view — the tick bar-chart is **LEDGER-ONLY** (a time series belongs to the *when* view),
  and hyper/geo/flat carry the `NodeCountReadout` in the same slim footprint instead: the located
  total plus one identity dot + count per network, from the live `metaList` tallies.

**Per-view vitals** (contents, not the rule): **hyper** = the structure (filter-aware
MACHINE counts per composition — Data / Hybrid / Currency, the same vocabulary as the
dossier table + hyper explorer (2026-07-12, replaced the per-layer L0/cL1/dL1 role counts);
cluster entries dedupe to machines; an em-dash for a composition the selection doesn't have;
NB dedicated-L0 "Consensus" machines have no column — visible in the dossier breakdown). **geo** = the footprint (`Nodes` / `Countries` /
`Providers` — distinct known ISPs over `store.selNodes`; replaced Ready %, user 2026-07-11:
health belongs to the cards + the future network-health view).
**ledger** = live activity (`Snaps/hr` / `Anchors/hr` with cyan trend sparklines from
`store.activity`; a third slot is reserved "soon").

**Each view is a complementary projection of the same network**: **hyper = who/what**
(architecture), **geo = where** (footprint), **ledger = when** (the ledger over time +
cost). Activity metrics belong to ledger, structure to hyper — don't cross-pollinate.

**The snapshot card is ledger-scoped — the pin does NOT carry out of the view** (spec
2026-08-01, a deliberate reversal of the old carry-across-views rule). `FollowController` follows
the live snapshot and the ledger view follows live by default; a *selected* snapshot pins until
deselected **or until you leave ledger** — `Engine.setMode` clears `store.snap` on any switch away
(the same `LEVEL_CARRY` logic that already scoped country/cohort to geo and layer to ledger;
`following` is left to the FollowController, whose mode effect has already flipped it false, so
the clear sticks). The rail's snapshot ghost hint (`railCards.snapHint`) is gated to ledger to
match. Clicking a `LiveStrip` bar selects that snapshot IN PLACE — no view switch — but since the
bars now render only in ledger, that click is a ledger interaction by construction. Clicking the
LIVE tip (re-)follows the heartbeat; an older bar pins (`snapshotSelectActions` — the same tested
table the ledger's 3D tile click runs).

### Responsive shell

Only the rails restructure (`useBreakpoint()`); everything else holds the four-zone shape.
- **Desktop** (≥1100px): both rails inline (`#leftcol`/`#rightcol`), each with its
  `RailThread` sibling.
- **Tablet** (700–1099px): the rails collapse to slim edge tabs (`RailDock`, ≥44px tap) that
  each open the same rail content in a **non-modal Sheet** overlaying the scene (both can be
  open at once; orbit still works behind them). The sheet's screen edge carries the
  instrument spine + ruler (`.ig-sheet-edge`).
- **Phone** (<700px): a persistent split bottom bar (Explore/Details halves — a
  `ToggleGroup type="single"`, so re-tapping the active half natively collapses it) replaces
  the edge tabs; ONE bottom sheet at a time (`store.phoneDock`), with grabber drag-resize,
  snap heights, and flick-dismiss (`store.phoneSheetPx` carries the height across
  half-switches; reopen resets). The command bar condenses; the vitals row is a toggleable
  second bar row (`store.phoneVitals`, persists across views); `LiveStrip` runs full-width
  above the dock. Dismissing a sheet only collapses it — it does NOT clear the selection.
- **No auto-open, ever** (global constraint): a pick never opens a sheet/dock — the dock's icon
  tray announces it; the user always taps the trigger.
- SSR/first-paint assume desktop, so the desktop rails + threads carry a
  `max-[1099px]:!hidden` safety net against a flash on narrow viewports.

## The design system — Instrument-Glass

The HUD's character is **Instrument-Glass**: translucent glass panels over a live 3D scene,
instrument-channel rulers and threads, one cyan heartbeat, restrained identity hues, calm
transient signals. Bespoke design elements are the product — never genericize them into
stock-component defaults. **`/design` (`app/design/page.tsx`) is the TOKEN REFERENCE + the
signature-element gallery**: the structural colour lane, the identity-hue lane, and the HUD type
scale all read live from the tokens (CSS vars) + the palette generator, so they're accurate BY
CONSTRUCTION and need no hand-sync; below them, the app's SIGNATURE design elements — the card
states (ghost / active / collapsed), the signal language (`EdgePulse` hover-pairing + pulse), and
the ghost hint card — are shown via the REAL components (`CardHead`, `PulseEdge`,
`Inspector.GhostCard`; the `RailThread` is prose since it measures live rail positions), so they
can't drift either. It is fully static (no request-time fetch). It is deliberately NOT a full
component gallery (that mirror drifted and was always partial, 2026-07-12 — the hand-rebuilt
filter/button/command-bar demos were dropped) — the verification surface for component
BEHAVIOUR is the RUNNING APP (see *Verifying changes*), and `app/globals.css` is the
authoritative token source this page indexes.

### One stylesheet

**All styling lives in `app/globals.css`** (plus Tailwind utilities in the JSX). Its lanes,
in order:

1. **Unlayered recipe blocks at the top** — `.subject-paired` + the **card signal system**
   (`.edge-pulse`, `.sig-left`/`.sig-right`, the sheet-suppression rules). Unlayered ON
   PURPOSE: they must beat element utilities (see *CSS traps*). The signal block must stay
   contiguous with its sheet-suppression rules LAST (equal-specificity source-order beat).
2. **The structural token lane** (`:root`) — the shadcn variables in oklch (`--background`,
   `--foreground`, `--muted-foreground`, **`--foreground-dim`** (`#c7d0ea`, the 2nd muted
   text tone), `--primary` = the accent cyan `#2af5ff`, `--accent` → `--primary`,
   `--destructive` (warn red — **also the no-signal dot**), **`--warn-soft`** (`#ffd166`, the
   experimental-banner amber — advisory, NOT destructive), `--success`, `--core` (the DAG
   hypergraph-core blue — ONE hue; L0/L1 are NOT colour-distinguished anywhere),
   `--border`, …). **`--panel`** (the translucent glass fill) is a structural
   **literal**, with siblings **`--panel-light`** (dock glass) + **`--panel-solid`** (tooltip
   glass); the accent glass-wash family **`--wash-faint`/`-soft`/`-hover`** (the `--border`
   RGB at fill alphas) is the ONE mechanism for faint accent fills. Then the **layout
   literals**: `--panel-pad-*`, `--rail-gap`, `--rail-top`, `--rail-w`, `--detail-w`,
   `--sel-bg`/`--sel-border` (the one selection language), `--bottom-reserve`,
   **`--rail-fade`** (a clipped rail's bottom fade height AND its scroll runway — the ONE token
   `.rail-clip` and RailScroll's measure both read; the fade rides the rail's own bottom edge,
   which `max-height` already keeps clear of the strip band, so it must never re-subtract
   `--bottom-reserve` — that double-count started the gradient ~154px too high, user 2026-08-02),
   `--phone-dock-h`, and the **instrument-thread ruler spec** (`--thread-line`/`--thread-tick`/
   `--thread-tick-major`/**`--thread-faint`**/`--thread-tick-pitch` + `--axis-hairlines`,
   shared by the rails, sheet rulers, and the bar-chart axis). The **`@theme inline`** block
   then exposes the **HUD type scale** — `text-micro` (10.5px, uppercase eyebrows/tags/axis +
   glyphs), `text-label` (11.5px, secondary/meta), `text-body` (12.5px, rows/values),
   `text-title` (15px, card titles) — plus `--radius-xs` (4px) / `-sm` (6px) / `-btn` (8px,
   control rounding) / `-md` / `-lg`, `tracking-caps` (0.13em), and the color→utility maps
   (`text-foreground-dim`, `text-warn-soft`, `bg-wash-soft`, …). One name per token — no aliases.
3. **`@layer base`** resets, and **`@layer components`** recipes for selector-driven rules
   that can't be utilities: `#leftcol`/`#rightcol` (the rail shells + slim scrollbars),
   `.scene-canvas`/`.scene-in`, `.rail-clip`/`.rail-dragging`, `.odometer`/`.roll-in`,
   `.ecg`/`.ecg-scan`, `.ls-bar-anim`, `.cmd-list-scroll`, `.ig-panel`, `.ig-sheet-edge`/
   `.ig-sheet-topruler`.
4. **Keyframes + `@theme inline` `--animate-*` vars** — simple standalone animations become
   theme vars (`--animate-breathe`, `--animate-dot-beat`, `--animate-st-*`,
   `--animate-hold-fade-out`, `--animate-sheet-in-*`, `--animate-rail-hint`) consumed as
   `animate-<name>` utilities with `motion-reduce:animate-none` at each call site.

**Tokens first: use the HUD type scale and structural tokens; an arbitrary value is
acceptable only for a true one-off (document it inline).** The parity-era literals are
gone — do not reintroduce drift (no `text-[..px]`, no `rgba(90,140,255,…)`/`#c7d0ea`/
`#ffd166` literals, no `rounded-[6px]`; the only surviving `text-[..px]` are the ×/±/‹›
control glyphs, each commented). Don't re-derive paddings, radii, or cyan tints in component
code — reference the tokens. The SVG `RailThread` mirrors the `--thread-*` literals in code
(`TICK_*`) because an SVG stroke attribute can't resolve `var()` — keep the two in sync.

### Two colour lanes

- **Structural cyan (`--primary`) is the SOLE accent/affordance signal**: live dots, the
  ECG, selection washes, sparklines, blueprint chrome, the "all" identity. Warn/ready use
  `--destructive`/`--success`; the DAG hypergraph core uses `--core` (ONE blue for the whole
  core — its L0/L1 shells are the same hue, like any metagraph; nothing colour-distinguishes them).
- **Identity hues appear ONLY via inline vars on subject marks** — `--mg`/`--mg-<id>`,
  `--spine`, `--filter-accent`, `--row-hue`, `--pulse-hue`, `--edge-hue` — set inline where
  a specific metagraph/node/snapshot is the subject (its dot, its thread spine, its edge
  signal, its bar share). Structural tokens are never repointed at an identity hue.
- **`src/palette/`** generates the identity hues deterministically: `identity.ts` resolves
  each metagraph's hue per medium — a **HUD lane** (`HUD_L`/`HUD_C`, flat on glass,
  `identityHudHex`) and a **scene lane** (`SCENE_L`/`SCENE_C`, bloom-tuned so an
  emissive+bloomed node keeps its hue instead of blowing out). Pinning precedence: **brand
  hue (`data/brand-hues.json`, baked offline) wins over `config.METAGRAPHS` colour, which
  wins over the hash fallback** (`palette.ts` assigns non-colliding hues in allowed zones).
  `filterAccent(filter)` is the one helper that resolves "current selection → CSS colour"
  (cyan for "all").
- **The 3D scene sources its structural colours FROM the CSS tokens — one source of truth, no
  hardcoding.** `app/globals.css` is canonical; nothing in `src/engine/scene/` invents a
  structural colour. At construction the Engine calls `readSceneColors()`
  (`src/engine/sceneColors.ts`), which reads `--primary`/`--core`/`--background`
  via a hidden probe element + a 1×1 canvas (the canvas normalises whatever computed-colour
  format the browser returns for an oklch token — `rgb()`, `color(srgb …)` — to sRGB bytes), and
  threads the resulting `SceneColors` into every module (`createScene`, `Background`, `HyperView`,
  `Globe`, `GeoView`, `LedgerView`). Calm/dim variants are the SAME token rendered at low
  opacity/brightness — NOT a bespoke tone (so the geo hologram and the ledger tiles both = `--primary`
  and match by construction). `config.COLORS` shrank to the 4 base values as the STATIC mirror the
  non-DOM data/palette layer needs (SSR, bake scripts, `identity.ts`'s `CORE_HEX`); it holds the
  tokens' *resolved* sRGB (note: `--primary` resolves to `0x53f2f2`, greener than the aspirational
  `#2af5ff` comment — the token is canonical), and the Engine **dev-warns (±2/channel)** if the
  mirror drifts from the live tokens. **`src/engine/noHardcodedColors.test.ts`** enforces this: it
  fails on any raw `0xRRGGBB` in the scene layer outside a tiny documented allowlist (white tint
  bases, the ambient light, the node-dim tone) — runs in
  `npm test`, the same gate as `layerBoundaries.test.ts`. (The JSX/`components/` layer has legacy
  `rgb()`/hex literals that should migrate to the CSS-var tokens + extend the guard — a follow-up.)

### shadcn primitives in use

`components/ui/` holds the adopted shadcn/Radix primitives; compose classes with `cn()`
(`lib/utils.ts`). The baseline:

- **`Card`** — the app's card frame: the `.ig-panel` glass recipe is baked into its base
  class; rail cards render `<Card asChild><aside>` (Radix `Slot`) to keep the
  `complementary` a11y role. Right-rail cards pass `RIGHT_CARD` (exported from
  `CardHead.tsx`) — the ONE inspector-rail composition: `relative`, pointer-events re-enabled
  (`#rightcol` is `pointer-events:none` so gaps click through to the scene), spine suppressed
  (`--spine:transparent`), flat `18px` pad, `flex-none`.
- **`Button`** — adopted only for small text/icon controls that map cleanly onto a variant:
  the card close (`X`) and collapse (`Plus`/`Minus`) marks (`ghost`/`icon-xs`, lucide),
  "Show more" (`link`/`xs`), the dossier's `ExternalLink` site link. **Deliberately NOT
  Buttons** (bespoke instrument controls):
  LiveStrip bars, country/node accordion rows, rail edge-tabs, phone-dock halves, the view
  switch (ToggleGroup), the filter-bar button. That boundary is the convention.
- **`Command`** (cmdk) — the filter picker, inside the detached `Popover`; its cursor wash is
  overridden to a faint neutral (the bright accent fill washed text out). `ToggleGroup` —
  the view switch + phone dock halves; the view switch owns its sizing/rounding explicitly
  (`h-9`, `rounded-[8px]!`). **`Sheet`** — the tablet/phone rail docks (non-modal, no
  overlay, no exit animation). **`Switch`** — the command bar's RAW control (the one scene↔raw-layer
  affordance; `size="sm"`, wrapped in a `<label>` with its own caption).
  `Badge`/`Avatar`/`Separator` — inspector bodies.
- **`Table` + `ScrollArea`** — the raw data layer's tables only (2026-08-01). The stock shadcn
  `Table` is adopted MINUS its scroll-container div: `ScrollArea` owns scrolling, so the header
  can stay `sticky` + opaque while the body scrolls under it. Both come from the unified
  `radix-ui` package already in the tree — no new dependency.
- The engine-anchored `Tooltip` stays custom (component-local pointermove positioning; the
  engine writes the hover subject to the store) — a Radix tooltip can't track a raycast.

### The signal language

The model, in one line: **thread = resting identity cue; card edge = purely transient
signal channel.**

- **Cards are SPINELESS AT REST, everywhere** — the `.ig-panel::before` edge element rests
  at opacity 0; there is NO steady/selected edge state (an always-lit edge on a detail card
  would just read as a permanent spine). The command bar and popovers are spineless too.
- **Resting identity lives in the rail threads** (`RailThread`): both rails carry a mirrored
  fixed SVG in the 26px margin — neutral ruler line + ticks, an identity-hued spine (cyan
  for "all"), and a node-dot at each card's middle (measured live via
  ResizeObserver/MutationObserver/scroll; the thread must stay a SIBLING of the rail — the
  rail's clip/mask would blank a child). Only the coloured identity spine rests
  dimmed (`REST_DIM` 60%); the neutral ruler + ticks rest near-full (0.9 — their greys are
  already muted) and the node dots keep full brightness.
- **Every card edge signal renders on the SCENE-FACING (inner) edge**: left-rail cards →
  their right edge (`.sig-right::after`), right-rail cards → their left edge (`.sig-left`
  lighting the `.ig-panel::before`). Three levels, and the hierarchy must stay readable at a
  glance — **grey whisper < hued pairing < moving pulse**:
  1. **Pointer hover (whisper)** — a faint neutral 2px line (`--thread-line`) fades in while
     the pointer is over any card. No glow, no sweep.
  2. **Hover pairing** (`.subject-paired`, via `useSubjectPairing`) — the edge lights in the
     subject's identity hue (`--edge-hue` ← `--row-hue`) with a soft glow, plus a dialled-down
     inset wash on the card. Pairing wins over the whisper (source order).
  3. **Subject-change pulse** (`EdgePulse`) — the edge line fades in, a bright gradient-tipped
     3px/64px segment sweeps down it, the edge fades out (~1.2s, one clock, nothing remains).
     `useEdgePulse(subjectKey)` fires once per subject change, skips mount, and debounces
     (a change mid-sweep is dropped). The pulse is **synchronized with the title's `roll-in`**
     (same keyed-remount idiom) so title + edge move as one "new subject" moment.
  All edge lines share ONE soft-tipped gradient recipe (transparent→line→transparent) riding
  `--edge-hue`; **only opacity may animate on these pseudos — never colour** (swapping the
  hue var, not the background, keeps hover-out fades from flashing).
- **Rail-thread pulses**: both threads replay the same edge-pulse language once per
  view/filter change (one combined `${mode}|${filter}` key → one pulse).
- **Sheets stay calm**: inside `.sheet-cards` (RailDock content) the whisper + pairing edges
  are suppressed — the sheet's own `.ig-sheet-edge` spine is the single identity cue; the
  subject-change pulse still plays on the card. On tablet the view/filter pulse plays on the
  sheet edge (open) or the rail tab (closed).
- **Dock icon trays** (tablet edge tabs + phone dock halves; replaced the old hint dot + the
  dot↔glyph morph): each dock shows a quiet **legend of the cards its sheet hosts** — one lucide
  mark per card (right: `Orbit` dossier / `Globe` node / `Layers` snapshot; left: `ABOUT_ICON`
  (Info) explainer + the view tool card under the view's own mark), muted at rest, vertical on
  the tab / horizontal after the dock-half label. A card updating while the sheet is CLOSED goes
  **vivid in its identity hue + `dot-beat` heartbeat** until the sheet opens (opening clears all
  highlights; the icons stay), and the dock's outline edge replays the travelling `.edge-pulse`
  once per update event (debounced — live snapshot follow pulses at most once per sweep while
  the Layers icon stays lit; segments are `--pulse-len`-scaled ~45% on these short hosts, and
  the phone half runs it along its TOP edge via a rotated carrier). Purely visual — never opens
  the sheet; a pure deselect announces nothing. `RailDock` `signals`/`updateKey`
  (`TabSignal[]`); each caller owns its card→icon/hue mapping + seen-tracking. Reduced motion:
  static vivid icons, no beat, blink-not-sweep pulse.
- **Calm tempo**: the heartbeat family (ECG scan, filter dot `dot-beat`, card-title dots,
  live dots `breathe`) beats at 1.5s; transient signals (edge pulse, hold-fade) run ~1.2s/
  0.4s. Signals are debounced — a 4s-tick live feed must never read as a strobe. **Navigation
  moves on its own, slower clock**: the scene↔raw-layer depth change is 0.55s (GSAP) and the
  3D↔3D view choreography ~3.9s — a whole-shell or whole-scene move is allowed to take longer
  than a signal, because it's the user's own gesture resolving, not the instrument speaking.
- **Reduced motion is guarded on EVERY animation**: theme-var animations carry
  `motion-reduce:animate-none` at the call site; CSS recipes carry their own
  `@media (prefers-reduced-motion: reduce)` override (the edge pulse degrades to one static
  soft blink; `useMinHold` collapses its fade — the hold is timing, not motion; the signal
  chip still swaps glyphs — that's information).

### CardHead — the one card header

Every rail card leads with `CardHead` (`components/CardHead.tsx`), ONE head anatomy on all
cards: **eyebrow / title / INSET hairline / body**.

- **Eyebrow**: uppercase 8.5px — either a view tag ("HYPERGRAPH · ABOUT") or the bare slot
  noun ("METAGRAPH" / "COUNTRY" / "PROVIDER" / "NODE" / "SNAPSHOT" / "LAYER" — the
  provider card's user-facing word is **provider** while every internal identifier stays
  `cohort` (one concept, two registers — deliberate, spec 2026-07-18); the "Selected " prefix was dropped,
  user 2026-07-17: the populated card wears the same slot label as its ghost state; no
  breadcrumb grammar). `eyebrowMuted` dims it when the feed behind the card is down.
- **Title**: one standard — 15px / semibold / leading-[1.2]. Pass `titleKey` to key the
  `roll-in` remount on a subject change (synced with the edge pulse). Panel titles carry a
  leading identity dot on the shared `dot-beat`. Rich titles are nodes: the dossier renders
  `MetaTitle` (avatar + name + ticker + a muted type descriptor — "data metagraph" /
  "currency metagraph" / "data and currency metagraph" / DAG = "hypergraph"; 0-node
  metagraphs say just "metagraph"); the snapshot title's Odometer owns its own roll; the
  node card is **location-first** (place as title; the `subtitle` is the node's sentence-cased
  composition word + its layer codes as squared PILLS — `Hybrid [L0][cL1][dL1]`
  (`nodeCompositionLabel` + `compositionRows` codes via the shared `RoleChips`; the joined
  `L0·cL1` text read as one token, user 2026-07-12); the BODY is
  labelled rows in importance order: HOSTING, then **NODE ID last** — the unique reference
  sits where references sit, truncated with the full hash on hover (user, 2026-07-11; this
  replaced the one-node CompositionRows block whose count was always "1"); id-as-title
  fallback when unresolved). **Card-head kind MARKS tint with
  the active filter's identity** via `text-[var(--filter-accent,var(--primary))]` (the rail
  sets `--filter-accent`; cyan on "all") — never hardcode a mark to cyan (a recurring bug;
  the snapshot Layers mark + the layer plane mark both follow this; node marks use their
  node's own hue inline).
- **`aside`**: right-aligned title-row companion (snapshot live-dot/age, node status pill) —
  bodies render no title rows of their own.
- **The hairline is INSET** by the card's padding on both layouts — full-width rules don't
  exist inside cards; inset is the one rule weight (head boundary AND body grouping,
  `Separator` in bodies).
- **One close**: every dismissible card's × is CardHead's ghost-Button close labelled
  **"Clear selection"** — no per-card variants. Tool cards use the +/− collapse instead.
  RIGHT cards are collapsible TOO (user, 2026-07-12): the WHOLE head is the disclosure toggle
  (the panel layout's stretched-hit-area pattern — required for touch), the +/− rides the
  eyebrow line as the indicator, and the × + the title-row aside float ABOVE the stretched
  overlay (z) so closing and the site link keep working; collapsed = eyebrow + title only.

### Selection + pairing

- **`SELECTED_ROW`** (`components/selection.tsx`) is the ONE committed-selection language for
  list rows (filter picker's committed row, GeoExplore's selected node + drilled country):
  the `--sel-bg` wash + 1px inset `--sel-border` ring **as one box-shadow** (deliberate:
  the transient states it must compose with — cmdk's cursor wash, the pairing row wash — are
  background-based, and box-shadow is an independent property), plus the reserved trailing
  **`Check` mark** (`SelectedRowMark`, lucide, absolute in a `pr-7` slot so columns never shift). Mirrors the
  view switch's on-state.
- **`subjectPairing(active, key, set, hue)`** (`useSubjectPairing.ts`) is the ONE scene↔HUD
  hover coupling: a subject is paired when its key equals its store channel's value
  (`hoverFilter` for metagraphs/dossier, `hoverNodeId` for nodes, `hoverSnapOrd` for
  snapshots — the same channels the engine reads/writes), wearing `.subject-paired` +
  `--row-hue` inline. Hovering a card/row glows its 3D object; hovering the 3D object glows
  the card/row. **This three.js↔UI coupling is sacrosanct** — any refactor must keep the
  class hooks + store wiring intact (`useSubjectPairing.test.ts` asserts the selectors).
- **`IdentityDot`** (`components/inspector/parts.tsx`) is the shared flat identity-hue dot
  (no glow) used by picker rows, explorer rows, and marks.

### State atoms & timing

- **`components/state/StateAtoms.tsx`** — empty/loading states built from the app's own
  marks so an absent feed reads as part of the instrument: `NodeStars` (ACQUIRING twinkle),
  `NoSignalDot` + `SonarRing` (NO SIGNAL — the ring is remounted per retry, so the animation
  IS the retry), `StandbyHalo` (standby).
- **`useMinHold(active, holdMs=900, fadeMs=400)`** — every *transient* signal
  (the `BootOverlay`'s "Connecting…", the snapshot card's fee node-stars, AnchoredTags'
  "resolving") holds for a minimum calm cycle even if data resolves instantly, then eases
  out via `animate-hold-fade-out` — no blink. **Steady** states (NO SIGNAL, STANDBY) never
  hold/fade — they persist by nature.
- **Boot**: `useBootPhase` latches once live — a later feed drop is the per-panel NO SIGNAL,
  not the boot overlay returning. `SceneCanvas` fades the canvas in on the handoff
  (`.scene-in`) and out for the flat views.

### Ghost hint cards (the pick hints)

Each right-rail slot's empty state is a **GHOST card** (`Inspector.GhostCard`; shown on
`/design`) — availability + copy derive from the rail manifest (`railCards.ts` `hint`
fields), an allow-list mirroring the pick registry: hyper/geo invite node picks, geo also
invites the country drill + the provider (cohort) row, ledger
invites snapshot + layer picks, the network slot invites the top-bar filter, the flat
placeholder views get no ghosts. The allow-list is EXECUTABLE since 2026-07-18:
`railLadderBoundary.test.ts` asserts every committable ladder rung has a hinted slot. Honesty rules carried over from the old single pick-hint:
when the filtered network has nothing pickable in geo the node ghost turns into the honest
variant ("<TICKER> has no locatable nodes — explore it in the Hypergraph view"); "all" with
0 nodes = boot → that ghost stays silent rather than flashing a false invite. A populated
card renders in ANY view (e.g. a node selected in hyper and carried into geo); the ghost only
appears where the view can actually produce the card. NB the snapshot slot is the one subject
that no longer carries — it's cleared on leaving ledger (spec 2026-08-01), so its card and its
ghost are both ledger-only.

### CSS traps (learned the hard way)

1. **Recipes that must beat element utilities stay UNLAYERED.** Inside `@layer components`
   a recipe silently loses to Tailwind's utilities layer (a row's `bg-transparent` beat the
   pairing wash) and to later-in-layer recipes (`.ig-panel`'s box-shadow silenced the paired
   glow). Unlayered CSS beats every layer at equal specificity. `.subject-paired` and the
   card signal system live unlayered on purpose — new must-win recipes go there too.
2. **A transform on an ancestor re-anchors every `position:fixed` descendant to it** —
   `opacity` does NOT (it only makes a stacking context). Both halves are load-bearing:
   `SectionShell`'s scene wrapper is `fixed inset-0` with an inline identity `translateY(0px)`
   from FIRST PAINT precisely so the canvas + rails resolve their fixed boxes against the wrapper
   (= the viewport at rest) before anything renders — geometry never jumps when GSAP later writes
   that same property to make the scene recede. Its HUD child, conversely, is animated by OPACITY
   ONLY: a transform there would make that zero-size static div the rails' containing block. A
   plain `<div>` with no transform/filter/will-change (the `inert` carrier) does NOT create a
   containing block, so it's safe to nest. Anything that must stay pinned to the REAL viewport
   goes outside the wrapper (TopBar, the strip, the raw layer) or through a portal.
2. **`bg-[var(--x)]` compiles to background-COLOR.** A token holding a gradient/shorthand
   (e.g. `--axis-hairlines`) silently renders nothing through `bg-[…]` — use the arbitrary
   property form `[background:var(--x)]`.
3. **Variant selectors compile to class+attribute specificity.** `data-[state=open]:…` is
   (0,2,0) and beats a single-class override like `motion-reduce:animate-none` (0,1,0) —
   verified in compiled CSS. When a variant must win, use the important modifier
   (`motion-reduce:!animate-none`, `rounded-[8px]!`).
4. **JS-toggled classes must remain real CSS classes** — `.scene-in`, `.rail-clip`,
   `.rail-dragging` are added/removed at runtime (SceneCanvas, RailScroll); they can't be
   inlined into utility strings.
5. **Marker classes/ids queried by JS are contracts**: `#leftcol`/`#rightcol` (RailScroll +
   RailThread + the globals rules), `:scope > .ig-panel` (RailThread's card-dot measurement —
   every rail card must carry `.ig-panel`, which the `Card` baseline supplies), `.nb-row`
   (the pairing row-wash selector), `#topbar`, `#metapane`, `#tooltip`. Rename only with all
   consumers.
6. **Custom `@theme` utilities whose prefix collides with a tailwind-merge group MUST be
   registered in `lib/utils.ts`** (`extendTailwindMerge` — `text-micro/label/body/title` as
   font-size, `tracking-caps`, the custom radii are already there). Unregistered, twMerge
   classifies e.g. `text-body` as a COLOR, so `cn("text-body", "text-muted-foreground")`
   silently drops the size class and the text falls back to 16px. Register any new
   `text-*`/`rounded-*`/`tracking-*`-prefixed token utility in the same breath.

Settle any cascade/specificity question by reading the **compiled** CSS in the browser
(CSSOM via the devtools MCP), not by reasoning about it.

## The snapshot stream — the `LiveStrip` bar-chart

Global L0 produces a snapshot every few seconds. Three different counters, which the UI
deliberately keeps separate (cards show plain language; the snapshot card shows the raw
fields):

- **`ordinal`** — snapshot sequence number, +1 every snapshot **even when empty**.
- **`height`** — depth of the *block DAG*; only rises when blocks actually deepen it. It's a
  DAG (parallel/sibling blocks), so a snapshot can carry blocks **without** raising height —
  and idle snapshots keep it flat for long stretches (real mainnet behaviour, not a bug).
- **`subHeight`** — orders snapshots that share a height.

A global snapshot's real work is **settlement, not blocks** — most carry zero blocks
(mainnet: ~1 in 50), so block count is the wrong activity signal. The meaningful field is
**`metagraphSnapshotCount`** — how many metagraph snapshots this global snapshot **anchored**
(~1–24, sometimes 100+). So the **`LiveStrip` bars are scaled by anchors** (and the ledger's
centre + trail blocks are sized by it too); the snapshot card shows the derived **`~DAG`**
fee, height/sub-height, and a `+N blk` note for the uncommon block-carrying ticks.

**`LiveStrip`** (`components/LiveStrip.tsx`) occupies the bottom lane in every view, but the
**bar-chart is ledger-only**. The bars: one per tick, height =
anchors, crisp cap + faded body, no panel chrome (they blend into the scene).
Unfiltered, bars plot each tick's TOTAL anchors in cyan. **Filtered, each bar plots THAT
metagraph's own anchors on its OWN scale in its identity hue — its own cadence, with empty
ticks as honest gaps** (deliberate: a ~1-anchor-per-tick metagraph reads sparse/degenerate,
and 0-in-window reads blank; that honesty is the design, don't "fix" it). Clicking a bar
selects that snapshot IN PLACE (no view switch), via `snapshotSelectActions` +
`applyClickActions` (the same table/executor as the ledger's 3D tile): the LIVE tip
(re-)follows, an older bar pins. Hovering a bar
cross-highlights the matching ledger block (`hoverSnapOrd`); the hover is cleared on each
new tick (bars shift under a stationary cursor, which never fires mouseleave, so a hover
would otherwise stick and trail). Selection is store-driven (`inspect`/`following`/`snap`
via the shared `useSnapshotFeed` hook). Phone renders fewer bars (`PHONE_BARS`) from the same
buffer. Hand-rolled CSS bars,
not Recharts — dense, interactive, slim (Recharts is used for the vitals `Sparkline`s).
**Outside ledger the same footprint carries `NodeCountReadout`** — the located node total + one
identity dot and count per network (2026-08-01: a time series is a *when* instrument and the
other views aren't about time; the readout keeps the lane honest rather than blank).

**The raw data layer's table** (`components/DataSection.tsx` + `components/datasection/`)
is the same per-view projection idea in table form, dispatching on `mode`: **ledger** →
`AnchorLogTable` (one row per anchored metagraph snapshot — network, snapshot ordinal, fee, size,
the global it anchored into, age; row click pins that global snapshot through the same
`snapshotSelectActions`, hover writes `hoverSnapOrd`), **hyper/geo** → `NodeRosterTable` (one row
per node, with per-view COLUMN ORDER — geo leads location-first `Country · City · Provider`,
hyper leads `Network · Node · Layer` — click-to-sort headers, row click running
`nodeSelectActions`), **flat views** → the honest `preview · in development` line, never a
fabricated table. The rows come from the pure builders `src/data/anchorLog.ts` +
`src/data/roster.ts`; every selection still routes through the tested `pickActions` builders +
`applyClickActions`, so a table row and a scene click can't drift.

> **Live tick — total is instant, breakdown/fee come from the exact read.** The *total*
> (`metagraphSnapshotCount`) is final immediately; the per-metagraph breakdown + fee are
> pulled exactly from the raw L0 snapshot (`/api/snapshot/[ordinal]`, see *The tick
> lifecycle*) for the focused tick. Anything new on the live tick should prefer that exact
> read and only use the polled floor for ticks too old for the L0 node.

## The Snapshots (ledger) 3D view — `scene/views/LedgerView.ts` (over `domain/ledgerModel.ts`)

A 3D "settlement chamber" on the shared canvas. The `LedgerView` class is driven by the Engine
(`_refreshLedger()` → `ledger.setData(globalSnapshots, getAnchor)` on each tick/anchor
event, `ledger.update(dt)` per frame).

- **Layer model (`config.LEDGER`) — a LITERAL top-down validation stack.** Floors stack on
  **Y**, evenly spaced, top→bottom: `rowProducers` · `rowML1` · `rowML0` · `rowMSnap` ·
  `rowHypL0` · `rowGL0` · `rowDAGL1`. Two KINDS of floor: **node/validator** layers and
  **snapshot/ledger** layers (the *output* an L0 produces — the artifacts this view is
  about, not a node role). **Nodes sit directly ABOVE the snapshot they produce**,
  consistently: metagraph L0 → metagraph snapshots, and **hypergraph L0 → global snapshots**.
  The anchor line threads DOWN through every node cluster — producers → metagraph L1/L0
  rings → metagraph snapshot → **the global-L0 cluster** (the line swings to lane-centre z=0
  to pass through it) → the global block. **Full node symmetry**: each L0 shows its node
  cluster AND its snapshot output; the global-L0 nodes are the DAG core's `l0` instances
  (`Globe.ts`: `l0`→`rowHypL0`, `cl1`→`rowDAGL1`). The **DAG L1** (bottom) feeds $DAG blocks
  UP into the global. **Data producers** (top) is **symbolic** — external sources POSTing
  DataUpdates to the metagraph **dl1** (cL1 = wallet txns, dL1 = producer data; the DAG L1
  is cL1-only); their count is in no API, so it's a labelled floor + the flow line, **no
  nodes** (don't fabricate). Each metagraph gets its own **Z-lane** (`ledgerSite`); **X** is
  time (chains trail LEFT, `SLOT_SP` apart, `SLOT_N` visible; X owned by `LedgerView`, Y/Z by
  config).
- **Reuse, not clones:** the producer NODES are the SAME `InstancedMesh` instances from
  hyper/geo (`globe.nodes` / `globe.metaNodes`); the `if (this.ledger)` branches in
  `globe.setMorph`/`update` rewrite *those* instances' matrices to the lane positions. The
  Engine **freezes `morph`** while settled in `mode === "ledger"` (it carries whatever value
  the view was entered with); `globe.ledgerT` is now a **BOUNDARY-SNAPPED layout parameter**
  (0/1, set by `applyLedgerLayout` at the transition's invisible mid-flight boundary), not an
  eased blend — the flight that used to BE that ease is now the gather choreography's IN-phase
  dissolve (see *the staged gather choreography* in the overview). The metagraph **hubs are
  hidden** (`layers.setLedger` → `hub.visible = false`, applied at the same boundary). The
  **globe surface AND the starfield are gated OFF in ledger** (not eased by morph) —
  `globe.setMorph` zeroes `surf`/`extras` when `this.ledger`, and the Engine passes
  `background.update(.., 0)` — so neither lingers when arriving from geo.
- **`LedgerView` owns:** the glass floor **panes** (`_paneMat`, one colour; floors named by
  subtle flat edge-aligned text labels — `FLOOR_LABELS`/`_makeLabel`, not billboards); the
  centred live **global snapshot block** + its left-trailing **`_trail`** (individual
  pickable `Mesh`es, the `snapshot` pick); each metagraph's lane of snapshot **TILES** —
  **one tile per anchored snapshot** (`metaCounts.get(id)=n` → `n` tiles, **no cap**;
  `_anchorTiles` lays them in a rectangular GRID filling that tick's cell with a **uniform
  pitch** (`SLOT_SP/cols` × `LANE_GAP_Z/rows`, grid inset) so gaps are equal within a tick,
  between ticks, and between lanes), empty placeholder where a metagraph didn't anchor; the
  node-group **station DIALS** (`_makeDial`/`buildDialGeometry` — a hairline circle + radial
  ruler ticks, the instrument-thread language bent into a circle; **ONE fixed radius for every
  metagraph**, `ledgerLayout.DIAL_R`, regardless of node count — the resting identity mark that
  gives a 3-node metagraph the same footprint as a big one; **visible at rest** at
  `DIAL_REST_OP`, brightened + slightly scaled while an anchor pulse passes; the global L0 +
  DAG L1 clusters wear the same dial in the DAG's identity hue (`sceneColors["dag"]` — matching
  the node instances inside them) at the SAME `DIAL_R` (one dial size in design and code,
  user 2026-07-12 — their bigger fleets just stack higher); `_gL0Ring` additionally glows via
  `_gL0Glow` when a pulse reaches that floor. **Every ledger colour resolves through the ONE
  identity system** — the identity SCENE map is a required LedgerView ctor arg (like HyperView)
  and `setSceneColors()` re-tints on live refresh; nothing falls back to a raw
  `config.METAGRAPHS` colour. Node size is uniform too: `LEDGER.dot` applies to every cluster
  equally — small groups get presence from the dial, not from bigger dots — and ledger nodes
  render as the SAME standing **CHIPS** as geo (hex/cylinder instances, `LEDGER.dot` × `HEX_H` —
  replaced the squashed-sphere coins 2026-07-12: edge-lit, visible, and raycastable)); and the anchor **links** +
  travelling **pulses** along the
  shared **`curvePoint`** — the literal production→anchor column down from the producers
  floor through the L1/L0 ring centres → the snapshot tile → swinging to centre through the
  global-L0 cluster → cubic into the global block (`LINK_SEG` segments; one link per
  cluster, from its centre tile).
- **Recency is `slotFade` brightness only (2026-07-09).** The old neutral-tone + ledger-specific
  linear depth fog recency treatment was REMOVED at the user's direction (a replacement may be
  designed later): tiles/links/trail blocks keep their identity/accent colour all the way down
  the trail, fading gently by `slotFade`. There is NO scene fog at all any more (the shared
  `FogExp2` was removed 2026-07-11, user: zooming out darkened the scene — it must stay clear
  and coloured at every zoom; depth reads through DoF/facing/closeness instead. The
  `ViewPolicy.fog` field + Engine fog swap were already gone).
- **Emphasis is brightness, not a colour switch.** `model.isRowHot` still enforces exactly ONE
  hot row (a selected/hovered older snapshot beats the live lead): the hot row's tiles/links
  render near-full-brightness (bloom), everything else stays dim-but-coloured; the centre block
  dims (`leadDimmed`) while an older snapshot is selected. Selection comes from the LiveStrip:
  the Engine forwards `hoverSnapOrd ?? snap.data.ordinal` to `ledger.setSelected(ordinal)`; the
  ledger maps ordinal → slot each tick (`_recomputeSelectedSlot`). The DAG node-cluster spread
  follows the same `clusterRadius`-capped honeycomb footprint as every lane (the old
  `LEDGER.dagCell` disc is gone).
- **Metagraph filter dims the OTHER lanes** (`ledger.setFilter`, wired alongside
  `globe.setFilter`): the selected lane keeps full colour; other metagraphs' tiles/links/dials
  are strongly dimmed (×0.22) and their nodes too (the morph-ramped `dimScale` is too weak in
  ledger, so it's forced), and only the selected metagraph emits pulses (so only ITS dials
  light).
- **Slot model + history seed:** every new tick all chains advance one slot left; tiles
  appear at the lead as a metagraph anchors (`_anchorMetaBlock` rebuilds the slot-0 cluster
  as the count settles). On first data, `_seedHistory` pre-populates the trail + lanes from
  the retained `globalSnapshots` window (via `getAnchor(ts).metaCounts`). All
  sizes/tiles/links/pulses/rings come from live data — nothing fabricated. **TODO:** draw
  DAG L1 **blocks** (`global.blocks`) on the hypergraph-L1 floor flowing up into the global
  (+ a DAG-L1 participation ring tied to it).
- **Camera + build-in reveal:** `FOCI.ledger` frames the latest block bottom-right looking
  ~along −X (trails recede as background); orbit stays enabled. The old **"appears
  already-formed — no entry animation"** rule is **RETIRED** (2026-07-17, the view-transition
  choreography — a deliberate reversal): arriving in `ledger` from another 3D view now runs
  the same staged OUT→BOUNDARY→IN choreography as any 3D↔3D switch, so the chamber has a real
  **build-in/teardown** — `LedgerView.setViewAlpha` (fed `transition.furnitureAlpha("ledger")`)
  ramps its floors/tiles/links/dials up from black while the gathered nodes disperse into
  their lane positions and the camera flies to `FOCI.ledger` (or a resumed layer framing) via
  the ordinary tween (`focus()` → `_tweenTo` — there is no more camera-snapping `_snapTo`).
  The Engine is the **sole owner of `ledger.group.visible`** (`= ledgerActive && ledgerAlpha >
  0.001`, where `ledgerActive` is true while settled in ledger OR a transition touches it) —
  `LedgerView.setViewAlpha` only fades opacity now, so the two can't fight over the flag. A
  boot straight into `ledger` (no prior 3D view) still settles instantly (`transition.settle`)
  with no choreography, same as any direct boot. To screenshot a ledger state headless, seed
  `mode: "ledger"` in `store.ts`.

## Anchoring, fees & the metagraph data layer

**Vocabulary rule (user, 2026-08-01):** in USER-FACING copy the Snapshots stack **anchors
state** — "settlement" is reserved for the DAG a snapshot actually pays (the snapshot card's
fee/size rows). One word for both read as if Snapshots were where *money* settles, which is
what the separate Transactions view is for. So: "Anchoring layers", "When the network anchors",
"the base ledger", "N KB anchored"; and hyper's core copy says "security + consensus". Internal
identifiers/comments keep their existing names (`LedgerView`, the settlement chamber) — the rule
is about words the user reads, not code.

Verified live against mainnet:

- **Each metagraph snapshots independently and faster than Global L0** (e.g. DED ~9.5/min vs
  L0 ~4.5/min) via `/currency/{id}/snapshots`. The explorer stamps each metagraph snapshot
  with the **timestamp of the global snapshot it anchored into**, so the anchor join is
  `metagraph.timestamp === global.timestamp` (exact — 0 orphans observed).
- **Fees are the core economic model.** Every metagraph snapshot pays a `fee` (datum; 1 DAG
  = 1e8 datum), **paid in DAG** — confirmed because data metagraphs with no token of their
  own (e.g. DED, `cl1: null`) still pay. ⚠️ **Treat the `fee` as an opaque reported value —
  do NOT derive size (or anything) from it.** It correlates with size but Constellation
  computes it with a non-trivial fee calculator (size is measured separately from
  `content.length`). Global snapshots have **no** fee field; a tick's DAG cost is the sum of
  its metagraph snapshots' fees (exact from the raw-L0 read, or the polled floor).
- **Count is exact, fee is a floor.** `metagraphSnapshotCount` is the authoritative anchored
  count. The derived fee covers only the **publicly listed** metagraphs (the dagexplorer
  directory of 10 = `config.METAGRAPHS`); a few anchors come from metagraphs authorized
  on-chain but **not publicly listed**, so the summed fee is a **lower bound** (shown with
  `~` + a `FLOOR` tag; flips to `COMPLETE` when the tracked count reaches
  `metagraphSnapshotCount`). "Listed" ≠ protocol registration — anchoring still requires
  being a recognised L0 state channel; these are just absent from the public catalog.
- **The genuinely-unlisted count is TINY (~0–4 per tick).** A high "unlisted" reading is a
  bug, not reality. `metagraphSnapshotCount` counts *snapshots*, not metagraphs, and **one
  fast metagraph can batch dozens into a single tick** (verified: DOR 83 in one, DED 41 —
  both *listed*). The ground truth for *who* anchored is the **raw L0 snapshot's
  `stateChannelSnapshots`** (`l0-lb-mainnet…/global-snapshots/{ord}` →
  `value.stateChannelSnapshots` = `{addr:[snaps]}`), NOT the explorer (which only gives the
  count). We don't fetch that per tick client-side (2.4 MB for a big tick), but it's the
  cross-check tool when a count looks wrong.

### The tick lifecycle — why a snapshot's breakdown *settles* (read before touching the ledger view)

A metagraph snapshot is stamped with its anchoring global timestamp **only as it anchors**,
over the **few seconds after the global tick first appears**. So a tick has a lifecycle, and
the polled breakdown lags it:

1. Global tick `T` appears (from `be-mainnet`). Its **`metagraphSnapshotCount` (total) is
   correct and final immediately** — it's a field of the finalized snapshot.
2. Over the next seconds, metagraphs keep getting stamped `T` as they anchor into it; the
   per-metagraph poll then needs a cycle to fold them into `anchorIndex[T]`. During this
   window `a.count < total`, so a naive `unlisted = total − a.count` reads **transiently
   high** — the *settling* period, not real unlisted metagraphs.
3. Once no new snapshot has landed in `T` for `SETTLE_MS` (`AnchoredTags`, ~7 s) the count
   has stabilised and the remaining gap, if any, is the *real* unlisted floor.

**The snapshot card sidesteps all this with an EXACT read** (the primary source): the raw L0
snapshot's `stateChannelSnapshots` carry every anchored metagraph snapshot with its own
`value.fee` + `value.content`, so the **exact** fee, data size, per-metagraph breakdown
(incl. unlisted) and state-record count are final the instant the snapshot exists. It's
fetched server-side (heavy, ~2.5 MB) via **`/api/snapshot/[ordinal]`** (cached per ordinal);
**`RawSnapshotBridge`** keeps the **live + selected** tick's `SnapshotExact` in the store
(`store.snapshotExact`), and the card prefers it — no settling, no floor. The **live card
never falls back to the polled floor**: while exact is in flight it shows a brief "reading…"
(held by `useMinHold`); only **old/pruned** ticks (the L0 node retains ~30 min) fall back to
the polled anchor index.

Two mechanisms back the **polled fallback** (used for old ticks, the strip, and the activity
rates — exact is too heavy across many ticks):
- **Self-healing catch-up** (`api.ts _refreshOneMeta`): the poll **grows `?limit=` ×3 up to
  600 until the batch reaches back to the newest ordinal already held** — provably no gap,
  regardless of burst size (a fixed tail silently dropped DOR-sized bursts and mislabelled
  them "unlisted"). Polls every tick (`pollMs`), base `VIS.metaSnapTail`.
- **Polled floor**: `anchorIndex[ts].count` is what was identified; `unlisted = total −
  count` is a lower bound shown only on old ticks. ⚠️ **The ledger/Snapshots view should
  prefer the exact read for any focused tick** and only use the polled floor for ticks too
  old for the L0 node.

**Shared data layer** (`api.ts`): `metaSnaps` (id → rolling `[{ordinal,hash,parent,ts,fee,
sizeInKB}]`, seeded `VIS.metaSnapSeed`, tailed `VIS.metaSnapTail` with the catch-up above) +
`anchorIndex` (global-tick ts → `{fee, count, metaIds:Set, metaCounts:Map(id→n), touched}`;
`touched` = ms the count last grew, for the settling gate). `_recordMetaSnaps` dedupes by
ordinal, caps the buffers, and emits an **`anchor`** event; `getAnchor(ts)` is the accessor
the `LiveStrip` + the ledger view read. `metaCounts` exists because a single metagraph can
anchor **several** snapshots into one global tick — `metaIds` (presence) alone isn't enough.

The snapshot card renders the breakdown as colour-coded pills (`AnchoredTags`): the
authoritative **total in parens after the label**, one pill per listed metagraph
`TICKER (n)`, plus an `unlisted (N)` pill — from the **exact read when available** (final,
incl. unlisted), else the polled floor for old ticks (or "reading…" mid-fetch). It also
shows the **settlement fee** (exact → the figure + `· N KB settled`; old/floor → `at
least`/`complete`). It deliberately shows **no block count** — blocks aren't the activity
signal here. (A snapshot's `value.content` is the serialized snapshot as a *byte array*, not
a list of records — don't surface its length as an update/record count.)

## Data — server-side routes

Metagraph cluster endpoints are plain HTTP on custom ports with **no CORS**, so the browser
can't fetch them — but the **Next Node server can**:

- **`app/api/metagraphs/route.ts`** lists the dagexplorer directory, fetches each
  `{l0,cl1,dl1}` `/cluster/info` server-side (the three run **concurrently** per metagraph;
  `present` keeps `l0 > dl1 > cl1` priority), geolocates IPs (ip-api batch), computes each
  metagraph's identity hue, and returns `{ metagraphs, geo }`. **On failure it answers an
  honest 503** (user decision — NO pre-baked fallback; the client keeps its last good data
  and re-pulls on the next cycle).
  - **Caching:** the inner fetches use `cache: "no-store"`, which by itself makes the route
    *dynamic* — so the live fetch is wrapped in **`unstable_cache(…, { revalidate: 600 })`**
    (runs at most ~once per 10 min, shared across requests/instances; throwing on an empty
    result keeps a blip from being cached). `export const maxDuration = 60` + a **5s
    per-fetch timeout** keep a slow cluster LB from blowing Vercel's function budget. Verify
    it stays cached: `next build` should mark `/api/metagraphs` as `○` (Static) with a `10m`
    revalidate, **not** `ƒ (Dynamic)`.
  - **`ip-api.com` ToS — matters before going commercial:** the geo batch uses the free
    tier: **HTTP-only**, **~45 req/min per source IP**, **non-commercial use only**. Fine at
    one batched call per 10-min regeneration; for a commercial product switch to an HTTPS
    geo provider with an SLA + license (ipinfo, MaxMind, ip-api Pro). The validator-side
    resolver (`src/data/geoResolve.ts`) likewise uses ip-api (http) + ipwho.is (https).
- **`app/api/geo/route.ts`** serves the validator IP→geo map LIVE (fetches both validator
  clusters server-side + the shared ip-api batch, `unstable_cache` 1h, 503 on failure) so the
  globe plots instantly from one request; `geoResolve.ts resolveMissing` fills any misses.
- **`app/api/snapshot/[ordinal]/route.ts`** reads the **raw L0 global snapshot** (~2.5 MB)
  and returns a tiny `SnapshotExact` (exact fee, size KB, state-record count, per-metagraph
  breakdown incl. unlisted). **Cached per ordinal** (`unstable_cache`, immutable; throws on
  a miss so a not-yet/pruned tick retries). Only recent ticks resolve (the L0 node prunes
  after ~30 min) → 404 → client keeps the polled floor. `RawSnapshotBridge` calls it for the
  live + selected tick only — **never** the whole chain or a poll loop (that's what would
  make it expensive on Vercel).
- The client (`Engine`) fetches `/api/metagraphs` on mount **and re-pulls every 10 min**
  (Vercel never restarts; ISR only freshens the *server* cache, so an idle tab must re-pull —
  `Engine.refreshMeta`, rebuilds only on change). Snapshot/cluster feeds are live via
  `NetworkData` client polling.
- **`data/` holds only baked BUILD artifacts now** — `brand-hues.json`,
  `brand-hue-overrides.json`, `country-codes.json` (see their bullets below). The old
  `data/metagraphs.json`/geo seed-fallbacks were REMOVED along with the route fallback
  (the routes 503 honestly instead); the Python bake scripts went earlier (2026-07-10,
  unmaintained). (Stale references to a bundled metagraphs seed were cleaned from this file
  2026-07-18.)
- **`data/brand-hues.json`** is baked OFFLINE by `npx tsx scripts/bake-brand-hues.ts` (run
  manually whenever the metagraph set changes; `jimp` is a devDependency used only by this
  script). It extracts each metagraph's identity hue from its real brand (logo fills,
  falling back to the site's `theme-color`) via the pure helpers in `src/palette/brand.ts`,
  snapped into the palette's allowed hue zones. `data/brand-hue-overrides.json` (id → hueDeg)
  is the manual escape hatch for a bad extraction; the bake applies it before extraction.
- **`data/country-codes.json`** (alpha-2 → ISO numeric, the geo-cc ↔ countries-topology join)
  is baked OFFLINE by `npx tsx scripts/bake-country-codes.ts` from the `world-countries`
  devDependency — effectively never needs re-running (the ISO standard is stable).

Metagraph reality worth knowing (it drives the dossier/inspector text):

- Nodes are **hybrid** (run several layers on one machine) or **dedicated** (a single
  layer). On mainnet most metagraphs are 3 hybrid nodes; DOR is the outlier with 3 hybrid +
  19 dedicated data-L1 nodes.
- **Currency-L1 is never a standalone node** — every `cl1` node is also an L0 node, so the
  outer cl1 shell is effectively always empty.
- A metagraph has a real **token only if it runs a currency-L1 cluster** (some node has
  `cl1` in `roles`). The `symbol` field is *always* set, so it is NOT a token signal (DED
  has a "DED" symbol but no token — it's a data metagraph). The dossier's type descriptor
  (data / currency / data-and-currency metagraph) derives from node roles
  (`src/data/composition.ts`), and a 0-node metagraph says just "metagraph" — type is
  unknowable without nodes.
- The dagexplorer API lists `l0`/`cl1`/`dl1` URLs for *every* metagraph whether or not that
  layer actually runs, so URL presence means nothing — only node presence does.
- Keep `config.METAGRAPHS` (hub order/colour fallback, the Hypergraph) in sync with what the
  route returns (matched by `id`).

## Deploying (Vercel)

Target host is **Vercel** (any Node host works). No env vars / secrets are required.

**Enabled now (works on the free Hobby plan):**
- `engines.node >= 18.18`; `next build` is clean.
- **Security headers** (`next.config.mjs`): a moderate CSP (inline script/style for the Next
  runtime, `img https:` for metagraph logos, `connect https:` — the Constellation host set is
  open — `va.vercel-scripts.com` for telemetry; dev adds `unsafe-eval`/`ws:`/`http:`), nosniff,
  frame-ancestors none, Referrer-/Permissions-Policy. Added for reputation-scanner posture
  after Zscaler NRD-isolated the fresh domain (registered 2026-06-26; re-categorization via
  sitereview.zscaler.com; the NRD window ages out ~30-90 days).
- Route caching as above (`/api/metagraphs` `○` with `10m` in `next build` output).
- **`@vercel/speed-insights`** + **`@vercel/analytics`** mounted in `app/layout.tsx`
  (real-user Web Vitals + cookieless page views; both no-op off Vercel). Web Vitals do NOT
  capture the WebGL frame rate — use the engine's stats.js for that.
- **`app/opengraph-image.tsx`** — social card via `next/og`. Keep it ASCII + styled `<div>`s
  only: a non-Latin glyph (e.g. `●`, `—`) makes Satori fetch a font at render time, which
  fails (`Status: 400`) and breaks the image.
- `.gitignore` covers `.env*` and `.vercel`.

**FPS monitor:** stats.js is wired into the engine **dev-only**, or in prod via `?stats` /
`#stats` in the URL — so it never shows for real users.

**When adoption grows → upgrade to Pro (none needed on Hobby):**
- **Skew Protection** — pins a client to its deployment version; worth it because the app is
  a long-lived open tab (a deploy can break chunk loading in open tabs).
- **Cron pre-warm** — a `vercel.json` cron hitting `/api/metagraphs` every ~10 min keeps the
  cache warm (Hobby crons run at most once/day).
- **WAF / rate-limiting** on `/api/*`.
- **`ip-api.com` is free-tier / non-commercial** — swap to a licensed HTTPS geo provider
  before any commercial launch.

**Not applicable:** Image Optimization (no `<img>`), KV/Postgres/Blob (no persistence —
`unstable_cache` covers it), Edge Config / env vars (no secrets).

## Dev workflow

- **Feature work runs on the superpowers plugin flow**: brainstorm → written plan →
  subagent-driven implementation with per-task review gates, then a final whole-branch
  review before merging (`superpowers:brainstorming`, `superpowers:writing-plans`,
  `superpowers:subagent-driven-development`, `superpowers:requesting-code-review`,
  `superpowers:finishing-a-development-branch`).
- **Design work runs component-by-component against the LIVE app** (the user's preferred
  mode): brainstorm improvements on the real rendered component in the running app → agree
  the outcome → implement immediately (`/design` is a token reference, not the component
  surface — verify components in the app). NO separate spec/plan documents for design sessions
  (they drift out of sync); light per-change gates (`tsc` + `vitest` + a targeted visual
  check) and ONE full verification pass at the end (prod build with dev stopped + a
  screenshot suite + reduced-motion/tablet/phone re-verifies).
- **The work ledger is `.superpowers/sdd/progress.md`** — append per-task status, decisions,
  adjudications, and carried-forward minors there as work lands, so any session can resume
  with full context. Durable decisions/lessons graduate into THIS file.
- **Preserve the three.js↔UI interaction coupling in every refactor** (hoverFilter /
  hoverNodeId / hoverSnapOrd, `.subject-paired`, the marker classes) — it's a standing
  review lens.
- **Commit trailer**: end commit messages with
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (PR bodies:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

## Historical docs

The full migration/design-session history (plans, specs, screenshots, the design-concerns
log) lived in `docs/superpowers/` and was harvested into this file, then removed
(2026-07-05). The folder later re-accumulated the 2026-07 feature specs/plans (engine-domain
refactor, view transitions, consistency hardening, focus ladder) and was removed again
entirely (2026-07-19) — git history preserves all of it, and `.superpowers/sdd/progress.md`
remains the running work ledger. Durable decisions from those specs live in this file. The
same happened once more with the 2026-08-01 LiveStrip-sections spec/plan: its mechanism was
reversed during implementation (the drag/wheel divider became the command bar's RAW switch),
so the documents described a design that never shipped and were removed with it.
