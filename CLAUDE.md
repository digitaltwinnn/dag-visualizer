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
  heatmap, travelling-packet connection arcs, and the country→nodes explorer.
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
  values). The left rail shows only the view's About card; the bottom stream (`LiveStrip`)
  is ALWAYS present regardless of view. **Interface glyphs are ONE icon system: `lucide-react`,
  monochrome via `currentColor`** (so the accent/identity tinting inherits), **never emoji** (emoji
  ignore CSS `color` / the accent). The centralized view→icon map is `components/icons.tsx`
  (`VIEW_ICONS` + `iconForPick`), shared by the view switch, the card-head kind marks, and the
  tablet/phone dock icon trays. The bespoke marks that remain text/SVG on purpose are the identity
  dots, the ECG mark, and the Tooltip's `‹›` punctuation.

Only `hyper`↔`geo` **morph** (`morph` 0→1, eased each frame); the blue L0 core literally
**grows out into the globe** (`scene/views/HyperView.ts`) as the nodes fly to their map positions. `ledger`
is a separate 3D layout (not part of the morph — it pins `morph` at 0 and hard-places the
reused node meshes into its lanes; see *Per-view behaviour*). The flat placeholder views sit
at the hyper end with the canvas hidden.

## Run & test

Next.js app — needs Node ≥18.18 (`node -v` ~20). Three.js and friends come from npm
(`three`, `three/addons/*`, `topojson-client`); no CDN deps.

```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # types (dev server tolerates type errors; run tsc to be sure)
npm test           # vitest (pure-logic unit tests: store, palette, composition, …)
```

> **Dev-server discipline (run ONE, shared):** keep exactly one `next dev` alive and reuse
> it — DO NOT start a second. Concurrent servers race over port 3000 + `.next` and corrupt
> the build (symptom: `ENOENT … .next/server/pages/_document.js`, which persists until cleaned
> up). When coordinating parallel work (e.g. subagents), the coordinator owns the single
> server and workers reuse `http://localhost:3000`; workers must not start/kill servers.
> Prefer the harness background-run facility (`Bash run_in_background: true`) over
> `nohup`/`setsid` so the process is tracked and stoppable via the task interface — avoid
> `pkill -f "next dev"` (returns exit 144 in this sandbox and is unreliable; kill by PID if
> you must). HMR/Turbopack picks up edits, so a restart is only needed for config-level
> changes (tailwind/next config) or if state looks stale — then: kill the one server by PID,
> `rm -rf .next`, start one again.
>
> **`next build` and `next dev` share `.next` — don't run them together.** Running
> `npm run build` while the shared dev server is up corrupts the dev server's chunk manifests
> (500s / stale chunks). Do the production-build check (`next build` clean, route stays `○`
> Static) with the dev server **stopped**, or defer it to a phase boundary, then restart dev.
> For per-edit checks use `tsc --noEmit` + `npm test` (safe alongside `next dev`).

### Verifying visual changes

No visual test suite; verify visual changes by looking at the running app.

**Preferred: the chrome-devtools MCP** (`mcp__plugin_chrome-devtools-mcp__*`). It drives a
real browser, so it can **navigate, click, hover, wait for a selector, and snapshot** — use
it to reach interactive states directly (open the filter picker, click a view, hover a row)
instead of the store-seed hack below. WebGL renders fine in it. This is the default for
visual checks. It can also read compiled CSS via `evaluate_script` (CSSOM) — the way to
settle specificity/cascade questions for real instead of reasoning about them.

**Fallback: one-shot headless Chrome** (when the MCP is unavailable). WebGL needs the
SwiftShader flags or it fails with "Error creating WebGL context":

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
  Booting in `geo` snaps `morph=1` (engine constructor), so the globe is settled; for
  hyper camera tweens, temporarily shorten the tween `dur` in `Engine._tweenTo`.
- **Benign console noise to ignore** when grepping logs: `mojo ... rejected`,
  `gcm/... PHONE_REGISTRATION_ERROR`, `BackForwardCache`.

## Architecture — three layers

The app is a thin React/Next shell around an imperative Three engine, joined by a
Zustand store. **Two data lanes:** (A) high-freq visuals subscribe straight to
`NetworkData` events (no React render); (B) only panel-facing state lives in the store.

- **`app/`** — Next App Router. `layout.tsx`, `page.tsx` (mounts every panel + the canvas),
  **`globals.css` (the ONE stylesheet — see *The design system*)**, `design/page.tsx` (the
  living styleguide at `/design`). **`app/api/metagraphs/route.ts`**, **`app/api/geo/route.ts`**
  and **`app/api/snapshot/[ordinal]/route.ts`** are server-side data routes (see *Data*).
- **`components/`** — React panels, each reads/writes the store: `SceneCanvas` (mounts the
  engine, dynamic-imported so Three never enters the server bundle), `Blueprint` (placeholder
  schematics), `BootOverlay`, `TopBar` (the full-width top command bar: status + filter +
  view switch + view vitals; `components/topbar/` holds `Vitals`, `FilterPicker`, `EcgMark`),
  `ExploreRail` (the left explore rail), `Inspector` (the right facts rail), `ContextCard`,
  `InspectorCard` (a thin frame dispatching to the per-kind cards in `components/inspector/`),
  `CardHead` (the ONE card header + the `RIGHT_CARD` frame), `RailThread`, `RailDock`
  (tablet/phone sheets), `RailScroll`, `EdgePulse`, `selection.tsx`, `Tooltip`,
  `FollowController` (ledger snapshot follow), `DataBridge` (boots the data),
  `RawSnapshotBridge` (fetches the exact raw-L0 read for the focused ticks), `BottomStream` +
  `LiveStrip` (the bottom live lane), `Odometer`, `Sparkline`, `state/StateAtoms`, and the
  hooks `useSnapshotFeed`, `useBreakpoint`, `useBootPhase`, `useMinHold`, `useSubjectPairing`.
- **`src/store/store.ts`** — the Zustand store (mode, filter, country, inspect, snap,
  selStack, following, metaList, leaderboard, selNodes, activity, snapshotExact, the hover
  channels `hoverFilter`/`hoverNodeId`/`hoverSnapOrd`, phone UI state, …). **`src/data/`** —
  `network.ts` wraps the typed `NetworkData` singleton (`api.ts`) + exposes `getAnchor`/
  `metagraphById`/`filterAccent`/`CORE_HEX`/etc; `follow.ts` = follow logic; `types.ts`
  (`PickDescriptor` is a `kind`-discriminated union, `SnapshotExact`, `NodeRow`);
  `composition.ts` (node-fabric grouping), `nodeStatus.ts` (the shared status vocabulary),
  `hoverSubject.ts` (`hoverKeyOf`), `bootPhase.ts`, `breakpoint.ts`. **`src/util/`** —
  `format.ts` (`hex`/`fmtDag`/`ccToFlag`), `relativeAge.ts`, `odometer.ts`.
  **`src/palette/`** — the identity-hue generator (see *Two colour lanes*).
- **`src/engine/Engine.ts`** — the imperative engine and **the one bridge** (store ⇄ domain ⇄
  scene). Owns the render loop, morph, camera-focus tweens (`FOCI`), DoF, picking, and the
  **command bridge**: it `useStore.subscribe`s and reacts to mode/filter/country/hover channels
  and writes picks + hovers back to the store — the ONLY layer that touches the store. Each
  frame it consults `VIEW_POLICIES[mode]` (the per-view allow-list) and translates the flags
  into scene state. Drives the typed `domain/` + `scene/` modules below (see *Engine layer
  rules*).
- **`src/engine/config.ts`** — API endpoints, colors, the `METAGRAPHS` list, `VIS` tuning,
  `LEDGER` layout, and the shared layout math `metaAnchor()` (hub orbit-slot), `ledgerSite`,
  `clusterRadius`, `ledgerSpread`.
- **`lib/`** — `utils.ts` (`cn()`), `mgVars.tsx` (`MetagraphVars` sets `--mg-<id>` identity
  vars on `:root`; intentionally not yet mounted app-wide — don't delete as dead code).
- **`components/ui/`** — the shadcn primitives in use (see *shadcn primitives*).

**`src/engine/domain/`** — pure logic (THREE's math classes are allowed; **no scene/react/
store-value imports**, enforced by `layerBoundaries.test.ts`). Each ships colocated tests:

- `viewPolicy.ts` — the per-`Mode` allow-list table (`VIEW_POLICIES`): canvas / morph target /
  sim gates / shown geometry / pick sources / DoF eligibility / fog, as DATA. The single source
  of truth for what each view turns on (see *Per-view behaviour*).
- `morph.ts` — the hyper↔geo morph easing + derived visibility ramps.
- `nodeLayout.ts` — the node placement math: fibonacci shells around the core/hubs, the
  sphere→disc geo positions, `spreadCoLocated()` phyllotaxis fan-out.
- `dimModel.ts` — the filter/hover/country dimming model (`_dimScale`, `_nodeActive` gating).
- `arcSim.ts` — the travelling-packet arc simulation: a swarm of comet "agents" that hop
  node→node. **Emits flash EVENTS via a ring buffer** — no cross-view side-channel mutation.
- `ledgerModel.ts` — the Snapshots chamber's layout/slot/tile model over the live snapshot data.
- `cameraRig.ts` — `FOCI` + the camera framing math (`hubFraming`, `geoFraming`, easings).
- `records.ts` — the plain node/metagraph record types (`ValidatorRecord`/`MetaNodeRecord`) the
  scene consumes.
- `geoMath.ts` — shared geo constants (`R`, `LAND_H`) + `latLonToVec3`.
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
- `objects/Heatmap.ts` — the geo density heatmap.
- `objects/Background.ts` — the skydome. The **geo** end is the twinkling starfield + faint
  nebula; the **hyper** end is a **single flat colour** (no animation, no gradient, no tint — an
  animated backdrop read as distracting). Only `uTime`/`uMorph` drive it.
- `views/HyperView.ts` — Hypergraph-only furniture: the Global L0 **core** and the orbiting
  metagraph **hubs** (from `config.METAGRAPHS`). The core is parented to the scene (not
  `root`) so the morph can **grow it out to the globe's radius and dissolve it** as the Earth
  fades in. Hubs fade out early.
- `views/GeoView.ts` — the geo globe SURFACE: body sphere, graticule, atmosphere rim, and the
  **solid raised continents**. The land is the `land-110m` polygons triangulated into a
  **plateau** at radius `R+LAND_H` (earcut via `THREE.ShapeUtils`, with a longitude **unwrap**
  for the 4 antimeridian-crossing polygons, an Antarctica **pole-cap**, and a uniform `n=4`
  subdivision so facets hug the sphere with no T-junction cracks), capped by additive coastal
  **"wall" cliffs** (BackSide-culled, dim rim, always the default cyan — metagraph-tinting it
  read as too dominant). Nodes/heatmap/arcs sit on the plateau (`R+LAND_H+ε`); the body sphere
  (`renderOrder -2`) and fill (`-1`) keep the depth/transparency sort deterministic.
- `views/LedgerView.ts` — the Snapshots view's 3D settlement chamber over `ledgerModel` (see
  its own section below).

**`src/data/`** feeds the engine live network data (no simulation):

- `api.ts` — the typed `NetworkData`: **client-side** polls the block-explorer API (CORS `*`),
  keeps per-metagraph snapshot buffers + the `anchorIndex` (`getAnchor`; `global`/`status`/
  `cluster`/`anchor` events, `on`/`off`). When the API is unreachable it stays factual (a "NO
  SIGNAL" state) and recovers on the next good poll. It polls regardless of view.
- `geoResolve.ts` — `loadGeoCache()` (fetches `/api/geo` seed) + best-effort `resolveMissing`
  for new validator IPs (ip-api over http, ipwho.is over https).

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
  **spheres**; on the globe they cross-fade to flat **discs** (`discFall()` fades them out
  toward the limb — needs the camera). Per-instance transforms via the shared `_dummy`.
  (Don't introduce "box"/"cube" naming — they are spheres/discs.)
- **DAG L0/L1** are two fibonacci shells around the core. **Each metagraph** is laid out the
  same way around its hub: concentric shells **L0 inner → data-L1 (dl1) middle →
  currency-L1 (cl1) outer**. Metagraph nodes live in the rotating globe group but stay glued
  to their orbiting hub in the Hypergraph — `Globe.ts` converts the hub's live position into
  the group's local frame each frame. Keep that.
- A metagraph's identity hue must be the SAME everywhere it appears — hub, globe nodes,
  filter dot, rail thread, card marks — matched by metagraph `id` (see *Two colour lanes*).
- **Two sources, kept consistent on purpose.** Hypergraph **hubs** are built from
  `config.METAGRAPHS` (all 10, unconditionally — `HyperView.ts`), but **globe nodes** come from
  `globe.metaList`, filtered to metagraphs with at least one **locatable** node. A config
  metagraph with 0 locatable nodes (e.g. TBC, LEET) has a hub but can't be plotted. The
  filter picker keeps those rows **clickable but dimmed with a muted `not located` tag**
  (user decision) — they're real metagraphs, selectable in Hypergraph/Snapshots, just not
  plottable; picking one lands geo in its quiet-empty state and the right rail shows the
  honest state-aware hint (see *State-aware pick hints*).
- Co-located nodes are fanned out deterministically by `spreadCoLocated()` (phyllotaxis);
  the density ring encircles the cluster. Don't add random jitter.
- **Arcs are travelling packets**, not fixed lines: `_buildArcs` builds a swarm of comet
  "agents" that each hop node→node (pick a random node in the filter, fly a curved arc,
  flash it on arrival, pause, repeat). All share ONE `LineSegments` (one draw call); only
  their head/tail positions are rewritten on the CPU each frame, coloured per metagraph.
  Rebuilt on every filter change.
- **The filter** lives in the top command bar (`TopBar` → `FilterPicker`); everything routes
  through `Engine.applyFilter()`, which behaves per-view:
  - **Geography**: `globe.setFilter()` isolates/dims the selection, the leaderboard
    refreshes, and `globe.focusDensest()` rotates the globe so the **densest part of the
    selection faces the camera** (north stays up — Y rotation only) while the camera zooms
    **proportional to concentration** R = |mean of node dirs| (`_focusGeo`, via `FOCI.geo`):
    near-co-located selections zoom in subtly, spread ones stay wide.
  - **Country drill-down** (geo only): the country rows in `GeoExplore` are clickable and
    combine with the network filter (`globe.countryFilter` + eased `countryMix`;
    `_nodeActive(layer, geo)` gates on BOTH). Clicking a country dims everything outside it
    and flies to it; click again to clear; switching network clears it.
  - **Hypergraph**: `_focusFilter` flies the camera to the selected hub (using its
    **local/unscaled** position — `layers.root` is morph-scaled, so `getWorldPosition` would
    aim at the origin mid-morph), framed slightly off the radial line so the core sits to the
    upper-left. The hub's **orbit is paused while focused** (`layers.focusId`) so it stays
    framed; a subtle **depth-of-field** (BokehPass) keeps it crisp while the rest softens;
    AND the non-selected nodes + hubs dim back so the selection stands out. DoF runs **only
    in hyper with a metagraph selected**. Picking is filter-gated in hyper too
    (`_isPickActive`): only the in-focus selection's nodes are hoverable/clickable. Clicking
    a node sets the filter to its network (consistent with geo) + opens its node card —
    `GeoExplore.selectNode` mirrors the same two-step for explorer rows.
  - The selected network filter **persists across view switches**; the country drill-down is
    geo-only and cleared on view switch.
- **Hover preview**: hovering a filter-picker row OR a metagraph hub in hyper sets
  `store.hoverFilter`, which previews that selection's dim in any view via
  `globe.setHoverFilter` (+ `ledger.setFilter`), without committing `filter`. The hover dim
  is forced **strong** (`_hoverFilterActive` → `_dimScale` 0.85) so it's visible even in
  hyper where the committed-filter dim is weak (the *click* also flies the camera + adds DoF,
  which a hover must not). Hovering an explorer node row glows that node's shells on the
  globe (`hoverNodeId` → `globe.setHoverNode`), matching a 3D raycast hover.

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
`morph: "frozen"` (nodes fly into lanes), `show.ledger: true` + `show.hyperFurniture: false`
(hubs hidden), `dofEligible: false`. Its hidden hubs are kept **out of `pickSources`**, not
relied on being invisible — per the raycaster rule above.

## Layout system — the four-zone HUD

The HUD is **four fixed zones over the canvas, one SCOPE/role each, stable across views**.
**Gate new chrome by *which zone/scope it belongs to* — not by what a particular view puts
there.** Define a card by its scope (the role it plays); its *contents* are view-specific
and keep changing, so they're examples, not the contract.

- **Top** (`TopBar`) = the **command bar**: one full-width glass bar whose edges align with
  the rail columns (26px) on desktop. Three regions on one row: **status + filter** (left —
  the ECG heartbeat mark + "DAG Visualizer", then the filter button whose face is a small
  identity dot + network name — on the condensed breakpoints the "FILTER" text label simply
  hides (a stand-in funnel icon was tried and rejected as too busy); clicking opens the
  **detached filter popover** — a stock Radix
  `Popover` 6px below the button hosting the shadcn `Command` picker; the detached popover is
  the *intentional* design, an anchored bar-expansion variant was tried and rejected), the
  **view switch** (center — a `ToggleGroup` of six monochrome lucide icons: `Orbit` hyper /
  `Globe` geo / `Layers` ledger / `Radar` status / `ArrowLeftRight` transactions / `HandCoins`
  staking, from `VIEW_ICONS`), and the
  **view vitals** (right, `Vitals`). **The vitals region is constant-width**: all view
  clusters render stacked in one grid cell (inactive ones `invisible` + `aria-hidden`) so the
  centered view switch never jumps on a view change; sparklines condense away ≤1240px.
  Below 1100px a slim **selected-view caption** hangs under the bar, right-anchored. The
  command bar is **spineless** (absolute rule — the ECG mark is its identity cue).
- **Left rail** (`#leftcol`, `ExploreRail`) = the **explore / interact** scope: every view
  leads with a collapsed **`AboutView`** orientation card (per-view title + eyebrow + copy;
  scaffolded views carry a `SOON` caption), above the view's ONE tool card if it has one —
  geo → `GeoExplore` (the country→nodes accordion: a country row shows its share, clicking
  it drills the globe AND expands its nodes inline; node rows are city-first, alphabetical
  per country, with the shared identity dot + status), ledger → `LedgerPanel` (WIP copy).
  Hyper and the placeholders have just the About card.
- **Right rail** (`#rightcol`, `Inspector`) = the **facts** scope (read-only), a **subject
  stack**: `ContextCard` at the top (the selected metagraph/core dossier — it mirrors the
  filter; on "all" it simply doesn't render, the rail rests quiet; its × clears the filter),
  then the Detail cards from the registry (`store.selStack`, most-recent on top): the
  **node card** (`geoLive` — location-first title, id demoted to a mono subtitle, status
  pill in the head aside) and the **snapshot card**. When no detail is up, a slim
  **state-aware pick hint** shows instead (see the design system). An **instrument-channel
  thread** (`RailThread`) runs each rail's outer edge.
- **Bottom** (`BottomStream`) = the live/time lane: the slim `LiveStrip` bar-chart in EVERY
  view; it publishes `--bottom-reserve`.

**Per-view vitals** (contents, not the rule): **hyper** = the structure (filter-aware
L0 / cL1 / dL1 node counts; one node taxonomy — a hybrid node counts in every layer it
runs, the DAG's own L0/L1 fold into L0/cL1 like any metagraph; a filtered metagraph shows an
em-dash for a layer it doesn't run). **geo** = the footprint (`Nodes` / `Countries` /
`Ready`, integer odometers; Ready is exactly a % of Nodes, both over `store.selNodes`).
**ledger** = live activity (`Snaps/hr` / `Anchors/hr` with cyan trend sparklines from
`store.activity`; a third slot is reserved "soon").

**Each view is a complementary projection of the same network**: **hyper = who/what**
(architecture), **geo = where** (footprint), **ledger = when** (the ledger over time +
cost). Activity metrics belong to ledger, structure to hyper — don't cross-pollinate.

**The snapshot card is ledger-scoped.** `FollowController` follows the live snapshot and the
ledger view follows live by default; once a snapshot is *selected* it's pinned and carries
across views until deselected. Clicking a `LiveStrip` bar from hyper/geo jumps to `ledger`
and opens the card there.

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
stock-component defaults. **`/design` (`app/design/page.tsx`) is the living reference**:
live tokens + the primitives the app actually renders. Update it with any design change —
it must always agree with the shipped app.

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
   experimental-banner amber — advisory, NOT destructive), `--success`, `--core-l0`,
   `--core-l1`, `--border`, …). **`--panel`** (the translucent glass fill) is a structural
   **literal**, with siblings **`--panel-light`** (dock glass) + **`--panel-solid`** (tooltip
   glass); the accent glass-wash family **`--wash-faint`/`-soft`/`-hover`** (the `--border`
   RGB at fill alphas) is the ONE mechanism for faint accent fills. Then the **layout
   literals**: `--panel-pad-*`, `--rail-gap`, `--rail-top`, `--rail-w`, `--detail-w`,
   `--sel-bg`/`--sel-border` (the one selection language), `--bottom-reserve`,
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
  `--destructive`/`--success`; the DAG core's own layers use `--core-l0`/`--core-l1`.
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
  overlay, no exit animation). `Badge`/`Avatar`/`Separator` — inspector bodies.
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
  rail's clip/mask would blank a child). Resting lines are dimmed to 60% (`REST_DIM`); the
  node dots keep full brightness.
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
  0.4s. Signals are debounced — a 4s-tick live feed must never read as a strobe.
- **Reduced motion is guarded on EVERY animation**: theme-var animations carry
  `motion-reduce:animate-none` at the call site; CSS recipes carry their own
  `@media (prefers-reduced-motion: reduce)` override (the edge pulse degrades to one static
  soft blink; `useMinHold` collapses its fade — the hold is timing, not motion; the signal
  chip still swaps glyphs — that's information).

### CardHead — the one card header

Every rail card leads with `CardHead` (`components/CardHead.tsx`), ONE head anatomy on all
cards: **eyebrow / title / INSET hairline / body**.

- **Eyebrow**: uppercase 8.5px — either a view tag ("HYPERGRAPH · ABOUT") or one simple
  "Selected <subject>" label ("SELECTED NETWORK" / "SELECTED NODE" / "SELECTED SNAPSHOT" —
  no breadcrumb grammar). `eyebrowMuted` dims it when the feed behind the card is down.
- **Title**: one standard — 15px / semibold / leading-[1.2]. Pass `titleKey` to key the
  `roll-in` remount on a subject change (synced with the edge pulse). Panel titles carry a
  leading identity dot on the shared `dot-beat`. Rich titles are nodes: the dossier renders
  `MetaTitle` (avatar + name + ticker + a muted type descriptor — "data metagraph" /
  "currency metagraph" / "data and currency metagraph" / DAG = "hypergraph"; 0-node
  metagraphs say just "metagraph"); the snapshot title's Odometer owns its own roll; the
  node card is **location-first** (place as title, the id hash demoted to the mono
  `subtitle` slot, id-as-title fallback when unresolved).
- **`aside`**: right-aligned title-row companion (snapshot live-dot/age, node status pill) —
  bodies render no title rows of their own.
- **The hairline is INSET** by the card's padding on both layouts — full-width rules don't
  exist inside cards; inset is the one rule weight (head boundary AND body grouping,
  `Separator` in bodies).
- **One close**: every dismissible card's × is CardHead's ghost-Button close labelled
  **"Clear selection"** — no per-card variants. Tool cards use the +/− collapse instead.

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
  IS the retry), `StandbyHalo` (standby / the pick hint's halo).
- **`useMinHold(active, holdMs=900, fadeMs=400)`** — every *transient* signal
  (the `BootOverlay`'s "Connecting…", the snapshot card's fee node-stars, AnchoredTags'
  "resolving") holds for a minimum calm cycle even if data resolves instantly, then eases
  out via `animate-hold-fade-out` — no blink. **Steady** states (NO SIGNAL, STANDBY) never
  hold/fade — they persist by nature.
- **Boot**: `useBootPhase` latches once live — a later feed drop is the per-panel NO SIGNAL,
  not the boot overlay returning. `SceneCanvas` fades the canvas in on the handoff
  (`.scene-in`) and out for the flat views.

### State-aware pick hints

The empty Detail slot shows ONE computed hint (`Inspector.pickHintText`) — view +
pickability → message, so the slot always shows some guidance and never a false one: the
view's pick invite normally; when the selected network has nothing pickable in this view
(geo with 0 locatable nodes) it becomes the honest variant — "<TICKER> has no locatable
nodes — explore it in the Hypergraph view"; "all" with 0 nodes = boot, no hint at all. The
invite map is an allow-list mirroring the pick registry.

### CSS traps (learned the hard way)

1. **Recipes that must beat element utilities stay UNLAYERED.** Inside `@layer components`
   a recipe silently loses to Tailwind's utilities layer (a row's `bg-transparent` beat the
   pairing wash) and to later-in-layer recipes (`.ig-panel`'s box-shadow silenced the paired
   glow). Unlayered CSS beats every layer at equal specificity. `.subject-paired` and the
   card signal system live unlayered on purpose — new must-win recipes go there too.
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

**`LiveStrip`** (`components/LiveStrip.tsx`) is the bottom lane in EVERY view: one bar per
tick, height = anchors, crisp cap + faded body, no panel chrome (bars blend into the scene).
Unfiltered, bars plot each tick's TOTAL anchors in cyan. **Filtered, each bar plots THAT
metagraph's own anchors on its OWN scale in its identity hue — its own cadence, with empty
ticks as honest gaps** (deliberate: a ~1-anchor-per-tick metagraph reads sparse/degenerate,
and 0-in-window reads blank; that honesty is the design, don't "fix" it). Clicking a bar
opens that snapshot's card and, from hyper/geo, jumps to `ledger`. Hovering a bar
cross-highlights the matching ledger block (`hoverSnapOrd`); the hover is cleared on each
new tick (bars shift under a stationary cursor, which never fires mouseleave, so a hover
would otherwise stick and trail). Selection is store-driven (`inspect`/`following`/`snap`
via the shared `useSnapshotFeed` hook), so the highlighted snapshot stays consistent across
views. Phone renders fewer bars (`PHONE_BARS`) from the same buffer. Hand-rolled CSS bars,
not Recharts — dense, interactive, slim (Recharts is used for the vitals `Sparkline`s).

> **Live tick — total is instant, breakdown/fee come from the exact read.** The *total*
> (`metagraphSnapshotCount`) is final immediately; the per-metagraph breakdown + fee are
> pulled exactly from the raw L0 snapshot (`/api/snapshot/[ordinal]`, see *The tick
> lifecycle*) for the focused tick. Anything new on the live tick should prefer that exact
> read and only use the polled floor for ticks too old for the L0 node.

## The Snapshots (ledger) 3D view — `scene/views/LedgerView.ts` (over `domain/ledgerModel.ts`)

A 3D "settlement chamber" on the shared canvas. The `LedgerView` class is driven by the Engine
(`_refreshLedger()` → `ledger.setData(globalSnapshots, getAnchor)` on each tick/anchor
event, `ledger.update(dt)` per frame, `ledger.setGroupSizes(globe.ledgerGroups)` on
metagraph changes).

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
  Engine **freezes `morph`** while `mode === "ledger"`; `globe.ledgerT` is the hyper/geo→lane
  placement blend. The metagraph **hubs are hidden** (`layers.setLedger` →
  `hub.visible = false`). The **globe surface AND the starfield are gated OFF in ledger**
  (not eased by morph) — `globe.setMorph` zeroes `surf`/`extras` when `this.ledger`, and the
  Engine passes `background.update(.., 0)` — so neither lingers when arriving from geo.
- **`LedgerView` owns:** the glass floor **panes** (`_paneMat`, one colour; floors named by
  subtle flat edge-aligned text labels — `FLOOR_LABELS`/`_makeLabel`, not billboards); the
  centred live **global snapshot block** + its left-trailing **`_trail`** (individual
  pickable `Mesh`es, the `snapshot` pick); each metagraph's lane of snapshot **TILES** —
  **one tile per anchored snapshot** (`metaCounts.get(id)=n` → `n` tiles, **no cap**;
  `_anchorTiles` lays them in a rectangular GRID filling that tick's cell with a **uniform
  pitch** (`SLOT_SP/cols` × `LANE_GAP_Z/rows`, grid inset) so gaps are equal within a tick,
  between ticks, and between lanes), empty placeholder where a metagraph didn't anchor; the
  node-group **rings** (`setGroupSizes`/`clusterRadius`, **fully invisible at rest**
  `baseOpacity = 0`, showing ONLY while a pulse passes — metagraph rings on anchoring + a
  global-L0 participation ring `_gL0Ring` lit via `_gL0Glow` only when an anchor pulse
  actually reaches that floor); and the anchor **links** + travelling **pulses** along the
  shared **`curvePoint`** — the literal production→anchor column down from the producers
  floor through the L1/L0 ring centres → the snapshot tile → swinging to centre through the
  global-L0 cluster → cubic into the global block (`LINK_SEG` segments; one link per
  cluster, from its centre tile).
- **Recency fade is DEPTH FOG, not per-block.** The trail recedes from the camera (oldest =
  farthest), so the Engine swaps in a stronger linear `THREE.Fog` in ledger (near/far ≈46/70,
  colour = bg) and restores the scene's base `FogExp2` elsewhere; `slotFade` is just a
  gentle linear brightness cue.
- **Colour only at the lead / selected; the trail is neutral.** The colour switch is
  **binary** and **exactly one row** is ever coloured: a selected/hovered **older** snapshot
  (`_selectedSlot > 0`) wins outright — the live lead + everything newer go neutral
  (`leadNeutral`); otherwise the live lead (slot 0) is the coloured row. A row out of the
  coloured slot goes to a deeply toned-down `NEUTRAL_TILE` (faint cyan; the global block the
  same cyan dimmed + low-emissive). Selection comes from the LiveStrip: the Engine forwards
  `hoverSnapOrd ?? snap.data.ordinal` to `ledger.setSelected(ordinal)`; the ledger tags each
  trail block with its ordinal, maps it → slot each tick (`_recomputeSelectedSlot`), and
  re-colours that whole row. The DAG node-cluster spread is `LEDGER.dagCell`.
- **Metagraph filter neutralises the OTHER lanes** (`ledger.setFilter`, wired alongside
  `globe.setFilter`): only the selected lane stays coloured (`laneOff`), other metagraphs'
  nodes are strongly dimmed (the morph-ramped `_dimScale` is too weak in ledger, so it's
  forced), and only the selected metagraph emits pulses (so only ITS rings light).
- **Slot model + history seed:** every new tick all chains advance one slot left; tiles
  appear at the lead as a metagraph anchors (`_anchorMetaBlock` rebuilds the slot-0 cluster
  as the count settles). On first data, `_seedHistory` pre-populates the trail + lanes from
  the retained `globalSnapshots` window (via `getAnchor(ts).metaCounts`). All
  sizes/tiles/links/pulses/rings come from live data — nothing fabricated. **TODO:** draw
  DAG L1 **blocks** (`global.blocks`) on the hypergraph-L1 floor flowing up into the global
  (+ a DAG-L1 participation ring tied to it).
- **Camera + static entry:** `FOCI.ledger` frames the latest block bottom-right looking
  ~along −X (trails recede as background); orbit stays enabled. The view appears
  **already-formed — no entry animation**: the Engine `_snapTo`s the camera (a tween read as
  the planes swinging in), `setLedger` snaps the globe spin to 0, and pins `ledgerT = 1`.
  To screenshot a ledger state headless, seed `mode: "ledger"` in `store.ts`.

## Anchoring, fees & the metagraph data layer

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
  metagraph's identity hue, and returns `{ metagraphs, geo }`. **Falls back to the bundled
  `data/*.json`** (imported, so it ships in serverless deploys) if the live fetch
  fails/empties.
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
- **`app/api/geo/route.ts`** serves the validator geo seed (`data/geo.json`, imported) so
  the globe plots instantly; `geoResolve.ts resolveMissing` fills new validator IPs.
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
- `scripts/bake-*.py` are **only the offline seed/fallback** for `data/*.json`, not required
  for normal operation. `data/metagraphs.json` shape: each metagraph has
  `name/symbol/description/siteUrl/nodes`; each node `ip/state/layer/roles`.
- **`data/brand-hues.json`** is baked OFFLINE by `npx tsx scripts/bake-brand-hues.ts` (run
  manually whenever the metagraph set changes; `jimp` is a devDependency used only by this
  script). It extracts each metagraph's identity hue from its real brand (logo fills,
  falling back to the site's `theme-color`) via the pure helpers in `src/palette/brand.ts`,
  snapped into the palette's allowed hue zones. `data/brand-hue-overrides.json` (id → hueDeg)
  is the manual escape hatch for a bad extraction; the bake applies it before extraction.

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

> Sandbox networking note: `bake-metagraphs.py` falls back to `curl` (subprocess) when
> `urllib` fails, because here Python can't resolve some metagraph cluster hosts (e.g.
> `*.getdor.com`) while the system `curl` reaches them over IPv6.

## Deploying (Vercel)

Target host is **Vercel** (any Node host works). No env vars / secrets are required.

**Enabled now (works on the free Hobby plan):**
- `engines.node >= 18.18`; `next build` is clean.
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
  mode): brainstorm improvements on the real rendered component (app + `/design`) → agree
  the outcome → implement immediately. NO separate spec/plan documents for design sessions
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
(2026-07-05) — git history preserves all of it, and `.superpowers/sdd/progress.md` remains
the running work ledger.
