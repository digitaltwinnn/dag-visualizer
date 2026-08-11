# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing overview.

**How to use this file.** It carries what the code and tests can't: design intent, invariants nothing
executes, environment traps, and a map of where things live. **Where a rule is enforced by a test,
this file names the test and the intent — read the test for the details.** The test carries the exact
scope and every exemption, and it can't drift from the code; a summary here can. When the two
disagree, the test wins.

Present tense only. Git carries the history; `.superpowers/sdd/progress.md` carries the work ledger.

## What this is

An interactive 3D visualizer of the Constellation Network ($DAG). Next.js (App Router) + React +
TypeScript + Zustand for the page and panels, driving a **vanilla Three.js engine** (not
react-three-fiber) on one persistent canvas. The active view is `mode` in the store.

Three views drive the 3D scene:

- **Hypergraph** (`hyper`) — abstract architecture: a glowing Global L0 core, the DAG's own validator
  shells around it, and the real metagraphs as orbiting hubs with their own L0 / cL1 / dL1 shells.
  **One unified node model** — the DAG is itself a metagraph-shaped core, not a separate L0/L1 pair.
- **Node geography** (`geo`) — a globe with every node at its real geolocation, travelling-packet
  arcs, and the country→nodes explorer. Density reads from the honeycomb stacks themselves; there is
  no heatmap layer.
- **Snapshots** (`ledger`) — a 3D anchoring chamber: one global-ledger floor below, one narrow plane
  per metagraph above it. The gap between planes is the point — metagraphs are unrelated and only
  come together on the global plane.

`status`, `transactions` and `staking` are scaffolded placeholders: the canvas fades out and
`Blueprint.tsx` draws a wireframe labelled `preview · in development`, with no numbers, so it never
reads as live data.

**The three 3D views are complementary projections of the same network: hyper = who/what, geo =
where, ledger = when.** Activity metrics belong to ledger, structure to hyper.

Interface glyphs are one system — `lucide-react`, monochrome via `currentColor` so accent and
identity tinting inherit. **Never emoji**: they ignore CSS `color`. The view→icon map is
`components/icons.tsx`. Text/SVG on purpose: the identity dots, the ECG mark, the Tooltip's `‹›`.

## The rules

Eleven invariants. Six are executable — `npm test` fails when they break.

### Enforced — the test IS the specification

| # | Rule, in one line | The test that defines it |
|---|---|---|
| 1 | **Engine layering.** `domain/` = pure logic, `scene/` = Three adapters, `Engine.ts` = the only store bridge. | `src/engine/layerBoundaries.test.ts` |
| 2 | **One selection write path.** Every interactive surface expresses intent through the decision table and applies it through the one executor. | `components/selectionBoundary.test.ts` |
| 3 | **One colour source.** CSS tokens are canonical; no raw hex in `scene/` or `components/` outside the allowlist. | `src/engine/noHardcodedColors.test.ts` |
| 4 | **Domain-export coverage.** Every value export of a `domain/` module is referenced by its sibling test. | `src/engine/domainExportCoverage.test.ts` |
| 5 | **Zero-allocation render loop.** No `new THREE.*`/`.clone()` in per-frame bodies unless marked `event-time`. | `src/engine/noFrameAllocations.test.ts` |
| 6 | **Scene-view contract.** Bespoke views implement `SceneView`; scene modules never compare `Mode` strings; framing math reads layout data, not rendered transforms; views never write their root `visible`. | `src/engine/scene/views/sceneView.test.ts`, `src/engine/sceneViewContract.test.ts` |

Four narrower boundary tests work the same way: `components/unlistedBoundary.test.ts` (the `"unlisted"`
id literal has exactly two homes), `components/railLadderBoundary.test.ts` (every committable focus
rung maps to a hinted rail card slot), `components/railTierBoundary.test.ts` (`data-focus` has two
homes and the slab's geometry — the pager included — keys on `data-tier`) and
`src/data/signerMatchBoundary.test.ts` (a peer-id prefix comparison lives only in `src/data/network.ts`).

Each of these files opens with a header comment giving the rationale, the scope and every exemption
with its reason. **That header is the rule's authoritative statement** — read it rather than inferring
scope from the table.

### Conventions nothing executes

7. **Per-view behaviour is an allow-list.** `domain/viewPolicy.ts` has one row per `Mode`; a new view
   is inert until its row opts in. Gate on the view a behaviour is FOR — not `mode === "x"` guards,
   not deny-lists (a deny-list grows a line per view).
8. **One home per concern.** Camera → `domain/cameraRig.ts`, focus ladder → `domain/focusLadder.ts`,
   click semantics → `domain/pickActions.ts`, the unlisted network → `src/data/unlisted.ts`, the stage
   light → `scene/objects/StageLight.ts`. Don't grow a second copy in the Engine or a component.
9. **The scene↔HUD hover pairing is sacrosanct.** The shared store channels (`hoverFilter`,
   `hoverNodeId`, `hoverSnapOrd`, `hoverMetaSnap`, `hoverCountry`, `hoverCohort`), `.subject-paired`
   and the marker classes survive every refactor. Hovers preview, never commit. **A surface hovers the
   subject it would COMMIT** — `hoverSnapOrd` is a global tick, `hoverMetaSnap` one metagraph
   snapshot (keyed by `metaSnapHoverKey(metaId, ordinal)`), so the anchor-log row, the explorer's leaf
   row and the scene's tile all ride `hoverMetaSnap`: a row is a snapshot, not its tick, and the tick
   channel would light every band of the anchoring global.
10. **Honesty over decoration.** Every visual quantity comes from live data; absent data is an
    instrument state (NO SIGNAL / acquiring / standby), never a fabricated number; floors are labelled
    floors. Don't "fix" an honest gap.
11. **Design tokens first.** The HUD type scale and structural tokens over arbitrary values. New
    `text-*`/`rounded-*`/`tracking-*` token utilities must be registered in `lib/utils.ts` — see CSS
    trap 6, which is a silent failure.

## Run & test

Next.js 16 (Turbopack for both `dev` and `build`), Node ≥20.9. Three.js from npm, no CDN deps. `gsap`
drives the scene↔raw-layer depth transition only — 3D animation is hand-rolled in the engine, HUD
micro-animation is CSS.

```bash
npm install
npm run dev        # http://localhost:3000, also serves the Next.js MCP at /_next/mcp
npx tsc --noEmit   # the dev server tolerates type errors; run tsc to be sure
npm test           # vitest
```

**Dev-server discipline: run ONE, shared** — Next 16 enforces it with a lockfile. Prefer the harness
background-run facility over `nohup`/`setsid` so the process stays tracked, and kill by PID
(`pkill -f "next dev"` exits 144 in this sandbox). Turbopack HMR picks up edits; restart only for
config changes or stale state. **Engine/scene geometry built in constructors needs a full page
reload**, not HMR.

`next build` and `next dev` don't conflict (dev outputs to `.next/dev`), so the production check can
run alongside the dev server. Do it at phase boundaries: the build should be clean and
`/api/metagraphs` should stay `○` (Static) with `10m` revalidate.

### Verifying changes

There is no visual test suite — verify visual changes against the running app, in this order:

1. **The Next.js MCP** (`mcp__next-devtools__*`). Run `get_errors` first on any "is something broken"
   question: config, build and source-mapped runtime errors beat grepping console output.
2. **The chrome-devtools MCP.** A real browser, so it reaches interactive states directly (navigate,
   click, hover, wait, snapshot) and WebGL renders fine. It also reads compiled CSS via CSSOM, which
   is how specificity questions get settled for real instead of by reasoning.
3. **The Vercel MCP** once changes ship — the local Next.js MCP only sees the dev server.

Last-resort fallback, strictly worse (no clicks, no CDP): one-shot headless Chrome. WebGL needs the
SwiftShader flags or it fails with "Error creating WebGL context":

```bash
google-chrome-stable --headless=new --no-sandbox \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=12000 --screenshot=/tmp/shot.png \
  "http://localhost:3000"
```

Gotchas worth knowing before you burn time on them:

- **There are no URL deep links into views**, and a one-shot can't click. Temporarily seed the store
  default in `src/store/store.ts`, screenshot, revert.
- **`--virtual-time-budget` runs very few frames**, so a fresh boot gets caught mid-intro. Use
  **`?slowmo=N`** (a dev flag like `?stats`, clamped to `[0.1, 20]`, values <1 speeding things UP) to
  inspect mid-flight states.
- Benign console noise: `mojo ... rejected`, `PHONE_REGISTRATION_ERROR`, `BackForwardCache`.

### Tuning the look live

The dev **`?tune`** flag (present at page load, the `?stats` idiom) dynamic-imports a tweakpane panel
from `src/engine/devTune.ts` — never in the normal bundle. The contract is `src/engine/tune.ts`; three
rules make it non-intrusive, and the header comment there is their authoritative statement:

1. **`*_TUNE_DEFAULTS` is the shipped look and stays what tests pin** — they assert the DEFAULTS, never
   the live struct, so turning a knob can never make a test pass or fail.
2. **The hoist rule.** A tunable read inside a per-node loop is loaded into a local in that loop's
   preamble, so the inner body reads a local exactly as it did when the value was a module const — one
   property load per FRAME, not per node. Sibling discipline to `noFrameAllocations.test.ts`.
3. **A knob's range is colocated with the constant it bounds** — a `*_TUNE_SCHEMA` next to its
   `*_TUNE_DEFAULTS`, typed against its own values so a renamed field is a compile error rather than a
   silently missing slider. `devTune.ts` is ONLY the manifest plus a generic walker, so adding a knob is
   one line in the owning module and no edit there.

**The tree is STATIC** — shared groups, then one collapsed folder per view, then the
camera. A folder for a view you aren't in simply sits collapsed; that costs a click and saves the panel
tracking `mode`, subscribing to anything, or rebuilding itself. Values that are BAKED rather than read
per frame (the ribbons' vertex colours) carry an `onChange` that re-pushes them, so an edit shows
without a reload — **prefer reading the row per frame and needing no callback at all**, which is what
the stage light does. Persistence is **opt-in and default OFF** — a silently-restored session is a
trap, because you would be looking at last week's knobs believing they were the shipped look.

**A knob belongs to the view whose look it changes, even when central code applies it** (user,
2026-08-11). Emphasis and lighting are both `Record<View3D, Row>` + ONE row schema — `FOCUS_TUNE`
(`domain/dimModel.ts`) and `STAGE_LIGHTS` (`domain/stageLight.ts`) — so each view folder holds its own
`focus & dim` and, where it stages one, its `spotlight`. Only what is genuinely cross-view stays above
them; today that is the focus TIER ranking alone. `dimModel`'s four resolvers all go through one
`viewMix(c, field)`, so a new emphasis number is a field on the row and nothing else.

⚠️ **HIDE IS NOT DIM** (user, 2026-08-11). A dim number used to drive three effects, and one of them —
scaling the node to nothing — is geo's ISOLATE, not a mute. It only rode along because hyper's
metagraph dim was then pinned to 0, so the shrink was never seen there; the moment the knob existed it
was the first thing it did. The shrink is now its own row field, `hide`, resolved by `hideFrac()` — geo
keeps `1` (off-filter nodes vanish on the globe), hyper and the ledger `0`, so a dim there mutes in
place. Any new effect a dim number reaches must ask the same question before joining it.

**The two are INDEPENDENT readings of the same raw ramp, not a knob and its fraction** (user,
2026-08-11 — *"dim · off-filter actually also resizes"*). `hideFrac` first took the RESOLVED dim, which
made shrink `raw × dim × hide` against mute's `raw × dim`: `dim` was a master gain over both effects,
so turning it down shrank nodes less as well as muting them less. It now reads the raw ramp, so each
knob moves exactly one effect. A corollary that matters: the country drill's `countryMix` raise is a
MUTE, and reading the raw ramp is what guarantees a lens can never shrink what it looks past.

**A view's own FURNITURE dims on its own field, `elem`** (user, 2026-08-11). `dim` mutes off-filter
NODES; the per-network furniture a view draws around them — hyper's hubs, tethers and hoops — used to
fade by two unrelated magic numbers (`HyperView`'s local `fdim = 0.62`, `Ribbons`' exported
`RIBBON_DIM = 0.2`). One row field replaces both, resolved by `offNetMul(view)`, which returns the
SURVIVING brightness so the knob keeps `dim`/`hide`'s strength polarity (0 = off). It is read **per
view, not `viewMix`ed**: furniture belongs to one view and fades out with it, so blending a neighbour's
value would describe elements that are no longer drawn. One knob may still drive two CHANNELS of the
same element where the look needs it: hyper's hub BODY takes a fraction of the drop (`HUB_BODY_SOFT`)
so an unfocused hub stays legible as a position while its light goes; `elem: 0` removes both, which is
what keeps it one knob.

⚠️ **A SNAPSHOT IS DATA, NOT FURNITURE** (user, 2026-08-11). `elem` is hyper's alone, because both
other views honestly answer `0`: geo's globe draws no per-network furniture (its off-filter answer is
the nodes' `hide` isolate), and everything the chamber emphasises — the byte bands, the lane tiles, the
ribbons — is a real snapshot, so it reads the NODE vocabulary instead. `snapBright()` in
`domain/dimModel.ts` is that one call: the ledger row's own `dim`, `boost` and `back`, exactly what the
chips in its trays answer to, applied to whichever resting level the instrument owns (the bar's is an
opacity, the tiles' a colour multiplier — two numbers, one per instrument, and nothing else left in
those `*_TUNE_DEFAULTS`). So the chamber gained the focus boost and the dim-back it never had, and one
knob moves one effect across nodes and snapshots alike. **COLOUR stays fully independent** — identity
hue vs the neutral trail is the chamber's own second reading, decided at the call sites and untouched
by any of these knobs.

⚠️ **ONE NODE MODEL** (user, 2026-08-11). *"Across all views I want no difference between DAG nodes and
other metagraphs — they are the same network topology, only positioned differently in some views."* The
dim code had FOUR split points, all of them hyper-only (geo and the ledger already carried identical
numbers for both pools): separate `core`/`meta` row fields, twin `validatorDim`/`metaNodeDim` with
identical bodies, twin emissive resolvers differing by a sub-1% coefficient, and — the root — hyper's
`0.32` dim BAKED into `NodeFabric`'s resting constants (`1 − 0.32 = 0.68` scale, `0.47 × (1 − 0.32×0.92)
≈ 0.33` glow). With the dim pre-applied as the resting look, the live dim *had* to be zeroed or it would
apply twice; that zero is the whole origin of the split, never a design decision. `domain/dimModel.ts`
now exposes ONE `dim` row field and one `nodeDim`/`nodeGlow`/`nodeEmissive` triple that both pools call.
The one surviving asymmetry is deliberate: `hubMatchBoost` targets the metagraph **hub's** resting glow,
which is view furniture — about what a node orbits, not what a node is. The core's own SPHERE follows
the same rule and is now the shared `HUB_ORB` geometry at hub size (was r 1.5 vs the hubs' 0.9): *"its
central position already tells it's a bit different from the others, not size"* (user, 2026-08-11).

**The camera folder is a READOUT, not sliders**: poses are ~8 constants and each needs its own selection
state to even see, so orbiting to a pose you like and reading it off beats dragging numbers.
`capture ← live` dumps the raw `pos`/`target` **with a caution naming the levers the Engine composes on
top** (`dollyBack`, `railsDolly`, and the subject-relative hub framings). Deliberately raw — per-pose
inverses would be a second home for pose knowledge that drifts silently.

## Architecture

A thin React/Next shell around an imperative Three engine, joined by a Zustand store. **Two data
lanes:** high-frequency visuals subscribe straight to `NetworkData` events with no React render; only
panel-facing state lives in the store.

The layering rule and its exact import boundaries are `src/engine/layerBoundaries.test.ts`. In brief:
**`domain/` is pure logic and data** — may import THREE's math classes, `config` and data types; not
`scene/`, addons, react, or store values. **`scene/` holds the Three adapters** — they own their
meshes and scratch objects, read domain and write GPU, and never touch the store or react.
**`Engine.ts` is the only layer that touches the store.**

Two disciplines the tests only partly backstop: **every instanced slot is written or zero-scaled every
frame**, so a stale slot from a previous view can never linger; and **simulations emit through a ring
buffer that the owning adapter drains**, so a sim never reaches across views to mutate another's
nodes.

### Where things live

| Path | Responsibility |
|---|---|
| `app/` | Next App Router. `globals.css` is **the one stylesheet**; `design/page.tsx` is the token reference; `about/page.tsx` is the project's own page — Instrument-Glass like the HUD, and the home of the **experimental disclosure** that used to be an always-on banner (retired 2026-08-09: a permanent banner over a live instrument reads as an alarm; the TopBar links here instead). `--warn-soft` is its amber (shared only with the raw layer's JSON booleans). `api/*` are the server-side data routes. |
| `components/` | React panels, each reading/writing the store. `SceneCanvas` mounts the engine (dynamic-imported so Three never enters the server bundle). |
| `components/ui/` | The adopted shadcn/Radix primitives. |
| `src/store/store.ts` | The Zustand store — mode, filter, selection, hover channels, `section`, phone UI state. |
| `src/data/` | The live network data layer (`api.ts`'s typed `NetworkData` singleton, `network.ts`'s accessors), the pure row builders, the display vocabularies. No simulation. |
| `src/engine/Engine.ts` | The imperative engine and the one store bridge: render loop, morph, camera, picking, focus resolution, command bridge. |
| `src/engine/config.ts` | **Pure static data only** — endpoints, the `COLORS` mirror, the `METAGRAPHS` catalog, poll tuning. No math, no derived tables, no UI copy. |
| `src/engine/domain/` | Pure logic + data (below). |
| `src/engine/scene/` | The Three adapters — `SceneContext`, `Globe`, `objects/*`, `views/*`. |
| `src/palette/` | The deterministic identity-hue generator. |
| `lib/` | `utils.ts` (`cn()`), `mgVars.tsx` (**intentionally not yet mounted app-wide — don't delete as dead code**). |

### The domain modules

New behaviour lands in `src/engine/domain/`, each module with a colocated test that is its real
specification. Most are named for exactly what they own; these are the ones worth knowing about before
you start:

- **`viewPolicy.ts`** — the per-`Mode` allow-list behind convention 7: canvas, morph target, sim gates,
  shown geometry, pick sources, DoF eligibility, camera floors, which views publish `selNodes`.
- **`focusLadder.ts`** — the focus/zoom ladder as data: one rung table per 3D view plus the cross-view
  carry policy. `finerLevels()` is the single source `pickActions` derives deselect stepping from.
- **`pickActions.ts`** — the click/select decision table (see *Selection semantics*).
- **`dimModel.ts`** — filter/hover/country dim and emissive resolution, called directly by the scene.
- **`ledgerBands.ts`** — the byte bar's spec as pure data, **with the honesty rules encoded here rather
  than in the adapter**.
- **`countryShape.ts`** — the country drill's shape math over the topology.

### The render loop

Five named phases in a fixed order: inputs → camera → motion → derived frames → scene writes. **The
contract is that nothing may mutate a pose after the phase that derives from it.** New per-frame work
goes in the phase whose inputs it needs, never earlier.

### The stage light claims, it is never switched off

There is ONE `THREE.SpotLight` for the whole app (`scene/objects/StageLight.ts`). The Engine sets its
per-view presence each frame *before* the view updates; a view that wants it calls `claim(view,
subject, …)` and the strongest claim wins; `update(dt)` stages from `STAGE_LIGHTS[claimed]`, eases,
then **releases the claim**. So **not claiming IS off** — there is no `spotOff` to forget, which is the
bug class the previous per-view-light + registry arrangement kept guarding against. A view's presence
is already applied centrally, so a claim must not multiply by its own fade again.

`StagedView` (`domain/stageLight.ts`) is the type that says which views stage a light, and the `?tune`
panel builds a spotlight folder only for those — the ledger deliberately stages none (its chamber is
lit by its own glass and emissive snapshots; emphasis there is the four colour dim tiers). Claiming
for an unstaged view is a compile error, not a silent no-op.

### Two camera principles

1. **Framing math consumes layout data** — records, anchors, orbit slots — never rendered transforms.
   `getWorldPosition`/`getMatrixAt` in an Engine framing path needs a justified `render-state OK`
   marker (rule 6 enforces this).
2. **View emphasis moves the structure, not the camera.** Shared, lockstep and policy-driven beats
   composed camera cleverness; camera poses stay dumb. Where a view *does* answer a commit with the
   camera, it gets **ONE pose with ONE state-keyed variation** — the ledger's `ledgerCommitTilt`
   (`domain/cameraRig.ts`) leans the settled chamber pose in when a network is committed and back out
   when it isn't, and that is the whole vocabulary. Three bespoke ledger framings (a lane nudge, a node
   framing, a per-lane fly) were built and **retired** because each added a pose the user had to learn;
   don't grow a fourth.

⚠️ **Three's raycaster ignores `object.visible`.** Hiding a group does not stop it being picked — it
has to be left out of `pickSources`.

## The 3D↔3D view transition

Every switch among the three 3D views runs the same staged **gather choreography**
(`domain/viewTransition.ts`) rather than a cut or a live morph flight: the from-view's nodes fly up,
staggered, to per-network staging grids on a camera-anchored plane while its furniture fades; one
invisible boundary frame where the nodes are gathered, the destination layout snaps in and the camera
tween starts; then the to-view's furniture builds back in fast while its nodes disperse over a longer
window into the already-drawn view. ~3.9s in total.

**The slow placement reads as staging rather than loading *because* the destination is complete
first.** `morph` and `ledgerT` are boundary-applied layout parameters, not eased flight blends.
Retargeting mid-flight keeps flight weights continuous. Picking is suppressed throughout (raycasting
mid-flight misleads), and HUD-commit camera reframes are held during the out phase — the state commit
stands and the boundary re-derives the pose from committed state, so nothing is lost. Flat views just
cross-fade the canvas.

**Arriving with a node selected re-derives that view's own ancestry** before the focus walk — geo
re-commits the node's country and provider, hyper its composition group — exactly the rungs a click on
that node in the destination view would have committed. So every card up to the selection is on the
rail in every view, and a deselect steps back down the local ladder instead of jumping to the network.

## Nodes, layers & the filter

Validators and metagraph nodes are `InstancedMesh`es with a patched smooth-shaded material. In hyper
they're small spheres; on the globe they cross-fade to standing round chips, edge-lit so stacks read
as lit chips rather than a flat mass; in the ledger they're the same chips in the trays.

- **DAG L0/L1 are two armillary shells around the core**, and each metagraph is laid out the same way
  around its hub — L0 inner, dL1 middle, cL1 outer. Each ring is drawn from the *same* curve function
  the nodes use, so nodes and hoops can't drift. Metagraph nodes live in the rotating globe group but
  stay glued to their orbiting hub in hyper.
- **A metagraph's identity hue is the same everywhere it appears** — hub, globe nodes, filter dot,
  rail thread, card marks — matched by metagraph `id`.
- **Two sources, kept different on purpose.** Hyper hubs come from `config.METAGRAPHS` (all of them,
  unconditionally); globe nodes come from `globe.metaList`, filtered to metagraphs with at least one
  *locatable* node. A metagraph with 0 locatable nodes has a hub but can't be plotted — the picker
  keeps those rows clickable but dimmed with a bare `0`. They're real, selectable in hyper/ledger,
  just not plottable.
- **Co-located nodes are deterministic poker-chip stacks** in a honeycomb, one hex per real node,
  sizes always summing to the true count. Never randomized — don't add jitter.
- **Arcs are travelling packets**, not fixed lines: comet agents hopping node→node, all sharing one
  `LineSegments`, rebuilt on every filter change. Tuned calm.

Everything routes through `Engine.applyFilter()`. The ladder per view is data in
`domain/focusLadder.ts`; what a click commits is `domain/pickActions.ts`.

**Geography** — network → country → provider cohort → node, each deselect stepping back one. Selecting
isolates and dims, refreshes the leaderboard, and rotates the globe so the densest part of the
selection faces the camera (Y rotation only — north stays up). A metagraph frames deliberately wider
than the country pose so drilling still reads as a zoom.

**The country drill is a lens, not a filter**: it flies to the country, draws its border, firms the
land glass and marks the row, but the other nodes stay fully visible, pickable and fanned. The drill is
shape-driven — the globe spins to the polygon centroid and every country is viewed at the same surface
angle, north up, never over the zenith, with only distance varying to fit the angular extent. Framing
composes on the **main landmass** (France's geometry includes French Guiana; the US's includes Alaska
and Hawaii).

**The country hover/click pairing is bidirectional** (geo only): pointer-moving over a drillable
country writes the same `hoverCountry` channel the explorer rows do, and clicking toggles the drill
exactly like the row. A canvas `pointerleave` clears every hover channel, because cards overlay the
canvas and pointer moves stop at their edge.

⚠️ **Data rebuilds must not wipe the drill.** `Globe.setMetagraphs` restores its own `countryFilter`
around the internal `setFilter`, and `Engine.applyFilter`'s geo branch re-asserts `this.country` —
otherwise the background cluster poll silently clears the border seconds after every drill. A real
filter *switch* still clears it by design.

**Hypergraph** — committing a metagraph eases the whole structure's shared tilt to near-flat (the
structure moves, the camera never rolls) and flies to the hub using its **local/unscaled** position:
the root is morph-scaled, so a world position would aim at the origin mid-morph. The hub's orbit pauses
while focused, and picking is filter-gated to the in-focus selection's nodes. Depth of field is wired
but no view opts in — the bokeh read as fuzz on the selected atom.

**Snapshots** — the ladder is node → network → all. Committing a filter leans the chamber pose in (the
one commit tilt) but never moves the lanes; floors and trays are visual aid, and the real subjects are
the snapshots themselves.

**Hover previews at the same strength as a committed filter**, but never runs the click's camera
flight. Hovering an explorer node row glows that node and nothing else; a country row previews its
border at a whisper level; a cohort row glows the whole stack and lights its country border. A hover
always cleans up after itself.

## Selection semantics

`domain/pickActions.ts` is the click/select decision table: what picking a subject means per view ×
pick kind, as pure data-in/actions-out logic. Two kinds of executor consume it — the Engine's scene
raycast clicks and the React components via named builders — so the scene and the panels can't drift
in semantics. Every caller applies actions through the one executor `src/store/applyClickActions.ts`.

**`src/engine/domain/pickActions.test.ts` is the specification.** It pins every ordering contract, the
full-ancestry rule, the deselect stepping, the release rules, and the scene-click-equals-row-select
equivalence; its test names read as the spec. Companions: `src/store/applyClickActions.test.ts` (action
kind → exactly one store effect) and `src/store/followFlow.test.ts` (the follow decision table through
the real builders, executor and store).

The design rules behind the table, which the tests pin but don't explain:

- **Full ancestry.** A node select commits every coarser rung, so deselects step back down predictably.
  The ledger contributes no ancestry.
- **A filter is a story.** Pinning a global tick whose anchors don't include the committed network
  releases the filter back to "all", so a network's dim never shapes a snapshot that has nothing to do
  with it. The membership rule lives in `src/data/ledgerStory.ts`.
- **New click/select semantics go in the table with a test**, their effects in the executor, never
  inline. `components/selectionBoundary.test.ts` enforces this — and note the rule is **write**-based,
  so read-only facts cards cost nothing and every future explorer card inherits the table.

## Layout — the four-zone HUD over a raw data layer

The page is one fixed shell in **two layers at different depths** (`SectionShell` + `store.section`).
The scene layer is the four-zone HUD over the 3D canvas; the raw layer is the view's raw-data table —
*the same data one level down*, not a second page. The RAW switch runs one GSAP timeline: the HUD
fades, the scene recedes (still live behind), the raw layer surfaces out of that depth. Back is the
mirror, with three ways to ask for it — the switch, Escape, the layer's own × — all calling
`setSection("scene")`. Reduced motion makes it an instant swap.

**The page never scrolls.** The scene wrapper is `position:fixed; inset:0` with an identity transform
from first paint, which makes it the containing block for every fixed descendant — see CSS trap 2,
where both halves of that arrangement are load-bearing. The raw layer and the `LiveStrip` are siblings
of that wrapper, not children. Whichever layer is away carries `inert`.

The HUD is **four fixed zones, one scope each, stable across views. Gate new chrome by which
zone/scope it belongs to, not by what a particular view puts there** — a card is defined by its scope,
and its contents are view-specific examples that keep changing.

**Top — the command bar.** One full-width glass bar, edges aligned with the rail columns: status +
filter on the left, the view switch centered, view vitals and the RAW switch on the right (RAW last,
because it acts on everything to its left). The filter button toggles an **attached filter strip** that
grows the bar downward by a row of network chips; hovering previews the dim, picking closes it. The
strip is a **layout participant, not a popup** — TopBar publishes its height and both the rails and the
canvas add it to their `top`, a pure position shift that keeps the buffer viewport-sized so nothing
distorts and the engine never resizes. The vitals region is constant-width (all view clusters render
stacked in one grid cell) so the centered view switch never jumps.

The command bar is spineless — the ECG mark is its identity cue. With a network committed, the active
vitals cluster wears a soft-tipped hairline in the filter's identity hue; "all" renders nothing, and
numbers stay untinted.

**The bar's narrow-width thresholds are MEASURED, not guessed** (2026-08-09): the view-switch labels drop
at `max-[1299px]`, the wordmark at `max-[1439px]`, and the dividers plus the "soon" placeholder views at
`max-[820px]` — each measured from where the real cluster starts to crowd, with slack, because the bar's
content width changes with the committed filter's own name. One threshold per decision, shared by
everything that must change on the same line. When the labels go, the ACTIVE view's name reappears as a
caption strip under the bar — a decorative echo of the radiogroup's own state (`aria-hidden`,
non-interactive), living outside the bar surface so its `overflow-hidden` can't clip it.

⚠️ The hyper vitals columns are **every label `compositionRows` can emit, so they sum to the
selection** — a new composition label needs a column, not an exclusion.

**Left rail — the explore/interact scope.** Every view leads with the **About** orientation card, then
the view's one tool card if it has one. What each explorer contains is view-specific, but three
decisions inside them are design, not detail:

- geo's cohort rows carry **no status and no identity dot** — health belongs to the node card, and
  network isn't in the cohort key, so no single hue can speak for the row.
- hyper's **composition group is committable** — a real focus rung with its own card, so one click
  commits and expands it and the disclosure state IS `store.composition`, single-open by construction
  with no local state. The grouping math lives once in `src/data/composition.ts`, shared by the row,
  the card and the Engine's group glow, so a count can't drift.
- ledger's explorer is **ONE AXIS: TIME** (user, 2026-08-09) — a single uniform tree, tick → network →
  that network's snapshots in the tick → that snapshot's signers, coarse→fine like every other ladder in
  the app. The transposed second group (network → its ordinals across the window) was **retired**: two
  dropdowns over the same rows made the user choose an axis before browsing, and time is the view's own
  axis. Everything is closed by default and **named alone, with no header count** — a count there would
  only be the downloaded window, a buffer size, not a network fact. **Affordance follows the data**: a
  row is only a disclosure if it actually has children (a tick with no identified anchors, a snapshot
  whose signers aren't resolvable) — a chevron that opens onto nothing is a lie about the feed.

**Naming and copy rules:** About states the view's point of view ("How the network is built"); the tool
card says what you BROWSE ("Nodes by network"). Eyebrows are bare role words, and each explorer's usage
hint leads its card rather than trailing it. An explorer ROW is a browse target — mark, name, count,
nothing more; **the prose that EXPLAINS a subject belongs to that subject's right-rail card, once**,
and since a row commits its card in the same click, nothing is lost by keeping the sentence in one
place.

**Right rail — the facts scope, read-only.** A set of fixed card slots in one stable order — network
dossier, country, provider, composition, then the snapshot chain (global snapshot ABOVE the metagraph
snapshot it anchors), then node. `components/railCards.ts` is the manifest and
`components/railCards.test.ts` pins the order, the availability and every hint.

The chain runs coarse→fine like every other rung: a lane whose committed cards abut as one body reads
adjacency as containment. (The chamber's storeys are the other way round — ribbons fall INTO the global
floor; geometry shows the fall, the rail states the containment.) The snapshot cards are slots that
ride the lane **without being focus rungs** — `railLadderBoundary.test.ts` asserts rung → slot, not the
reverse, so a slot without a rung is fine and a rung without a slot is not.

**The card grammar: ONE materialized box, unboxed entries, tucked into a SLAB.** Only the expanded rung
renders as a glass panel; every other committed rung sheds its frame into an unboxed `.rail-entry` —
solid glass, no border, chrome-less, the whole entry one stretched toggle, distance-dimmed toward the box
and released on hover as a materialize preview. Expanding an entry materializes it and dissolves the open
box — single-open accordion, so the box can be ANY committed rung, not just the focus one. Full
expand-on-hover is deliberately not done: layout shift under the pointer.

The committed rungs **abut into ONE contiguous pile** (the `.rail-ladder` lane at `gap: 0`, seams as 1px
`--border` hairlines on each member's wrapper `::before` — inset at rest, full width under hover —
interior corners squared) and the box is
**the ONE ROUNDED PLANK in that pile**, wherever the expanded rung sits: zero gap to its neighbours, but
it keeps its full radius on all four corners and its own hairline all the way round, so the pile visibly
opens around it. Its border is NOT handed to a seam the way an entry↔entry joint is — a rounded border
curves in at each corner, so it never draws the full-width division the inset-seam rule exists to
prevent; it reads as the box cut into the pile. **The stack carries DEPTH, the thread carries STATE**;
adjacency is what reads as containment, which is why the snapshot chain runs coarse→fine above. Ghosts
stay outside the slab. Nothing in the block animates, so reduced motion is a no-op.

⚠️ **The lift shadow is not the box's distinguisher and can't be** — squaring the box mid-pile was tried
(2026-08-09) and left it with no geometry at all: square corners, both borders handed to seams, and a
y-positive-only lift its own following neighbour painted over at `z-index: auto`. The box wrapper is
raised unconditionally (`position: relative; z-index: 2` — a box FIRST in the lane isn't matched by the
member+member rule and would stay `static`, making z-index inert) and the shadow casts both ways, but the
radius is what actually reads.

⚠️ **The slab keys on ONE marker, `data-tier` (`ghost` | `entry` | `box`), written by `Inspector.tsx`
from the same `effCollapsed` that decides the render** — so marker and render cannot disagree, and the
box is whichever rung is EXPANDED, never the finest COMMITTED one. `[data-focus]` here was the bug the
user reported as "a gap at the bottom to the node card, happens in many places": expand a coarser entry
and both joints around it matched no member arm and fell back to the plain gap. **The tier is what the
geometry depends on, so the tier is what the wrapper states** — `components/railTierBoundary.test.ts`
holds the two markers apart, `data-focus` to the thread's dot state and everything geometric to the
tier. The lane's DOM shape is load-bearing too: members are selected by
`:has()` on the per-rung WRAPPER divs, so **the selectors must be descendant, not child** — `RailPager`
nests the box one level deeper inside its gesture wrapper.

**The box can carry a SIBLING PAGER** (`RailPager`): where the expanded rung has 1-N siblings under the
same committed parent, a slim `‹ n / N ›` plank rides the card's OWN bottom edge, inside the glass, plus
a horizontal swipe on the body. The set comes from the pure resolver `railSiblings.ts` and every step
applies `pickActions` through the one executor, so a pager step and the equivalent explorer click can't
drift. The plank is chrome-less by the same grammar rule (no fill, border or rule of its own) and the
card reserves its strip with a padding utility — see CSS trap 1. **The gate is BOXED and nothing else**
(an absolutely-positioned plank over a ~28px collapsed entry is a defect; single-open already makes the
box unique) — it is the tier's own `boxed` condition, and `railTierBoundary.test.ts` pins that the two
can't drift. Keying it to the FOCUS rung was the same mistake `data-tier` fixed above, and it also shut
out the two snapshot slots, which ride the lane with no focus rung at all.

**A pager's parent scope is whatever the step must NOT change, which for the metagraph snapshot makes it
a PAIR — this metagraph × this tick** (user, 2026-08-09). The set is the subject's own `metaId` rows of the
pinned tick's exact read, ordinal-desc, never every contributor: `metaSnapSelectActions` filter-firsts, so
a cross-network step would move a COARSER rung and a swipe would silently re-commit the network. The
explorer still browses every network under a tick, because there the network IS a deliberate click with
its own chamber preview. And the pair is the honest total — a fast metagraph batches dozens of snapshots
into one tick (DOR routinely 9-plus), so a tick-wide `N` would contradict the breakdown pills.

**The global snapshot's set is OPEN** (user, 2026-08-09): time is ongoing, so the same plank steps one
tick at a time but shows **no `n / N`** — a window into an unbounded chain has no total to state, and
`SiblingSet.open` is what says so. That is also what keeps it from rivalling the `LiveStrip`: **the strip
is the time INSTRUMENT** (scale, window, cadence), the plank is a nudge to the adjacent tick. It steps the
strip's own buffer in the strip's own order (oldest→newest) through the same descriptor a bar click
builds, so stepping back from the front pins and stepping onto the live tip resumes following; a pin aged
out of the retained window gets no pager rather than a guessed neighbour.

**Expanding a rung's card FLIES THE CAMERA to it** (user, 2026-08-09 — "we do the same when we click a
row in the explorer"): the box is the subject, so it gets the subject's pose. `ladderLevelOfSlot()` in
`railCards.ts` is the inverse of the lane's slot table, so a card can only ask for a pose a real rung —
and therefore a real resolver — already defines, and the two snapshot slots (no rung) ask for nothing.
The request rides one store channel, `focusRung: { level } | null` (an OBJECT, so re-expanding the same
rung is a fresh reference the Engine's `!==` bridge sees), and `Engine._resolveFocus(from?)` starts its
existing ladder walk at that named rung instead of the finest. No second camera path.

**View entry is scene-first**: arriving in a view starts the ladder collapsed, held through the
transition's ancestry re-derive by a grace window, with both live-advancing ordinals guarded in the
selection key so heartbeats never materialize a card. Conversely **the heartbeat is felt on closed
cards**: both snapshot asides carry the beating dot and are the same tap-to-follow toggle, but **only
one of them owns the clock.** The global aside ticks a `live · Xs` counter (the shown snapshot's age,
never overstating); the metagraph aside says **`anchored`** whenever the card above already shows the
very tick it anchored into — the anchor join is exact, so a counter there would be the same number
twice. It falls back to its own counter when that carries real information: a global ghost, or
following a lane through anchor-less global ticks, where this card holds an older tick.

Every card the current view CAN produce is always visible — populated when its subject is selected,
else a quiet **ghost hint line** — so the rail shows the view's whole possibility space and a deselect
returns its slot to the ghost in place.

**A hint is the gesture and nothing else.** The slot label already names the subject and the dashed
frame already says "nothing here yet", so a hint must not end "… to inspect it" — four ghosts stacked
in a rail would read as one sentence repeated with the verb swapped. Each names its own route, and
where a subject is reached from a parent row the hint says which ("under a country"), stating in words
the containment the slab shows.

Two honesty rules: when the filtered network has nothing pickable in geo the node ghost turns into the
honest variant naming that fact; but "all" with 0 nodes is boot, so that ghost stays silent rather than
flashing a false invite. A populated card renders in any view; the ghost only appears where the view
can actually produce the card.

**Bottom — the live/time lane.** The slim `LiveStrip` in every view; it publishes `--bottom-reserve`
and belongs to neither layer, so it stays interactive in both poses. Its content is per-view: the tick
bar-chart is **ledger-only** — a time series belongs to the *when* view — and the other views carry a
node-count readout in the same footprint, keeping the lane honest rather than blank.

### Responsive shell

Only the rails restructure; everything else holds the four-zone shape. Desktop (≥1100px) has both rails
inline with their `RailThread` siblings; tablet (700–1099px) collapses them to edge tabs opening
**non-modal** sheets (both can be open, orbit still works behind them); phone (<700px) has a persistent
split bottom bar and ONE sheet at a time, with grabber drag-resize and flick-dismiss. Dismissing a
sheet only collapses it — it does not clear the selection.

**No auto-open, ever** (global): a pick never opens a sheet or dock. The dock's icon tray announces it;
the user always taps the trigger.

SSR and first paint assume desktop, so the desktop rails carry a `max-[1099px]:!hidden` safety net.

## The design system — Instrument-Glass

The HUD's character is **Instrument-Glass**: translucent glass panels over a live 3D scene,
instrument-channel rulers and threads, one cyan heartbeat, restrained identity hues, calm transient
signals. **Bespoke design elements are the product — don't genericize them into stock-component
defaults.**

**Open `/design` before any design work.** It is the live reference: the colour lanes, the type scale
and the sans/mono split read from `globals.css` and the palette generator, and the signature elements
— the icon map, the ECG and Odometer, the four card states, the status pills, the state atoms,
`SELECTED_ROW`, the three edge signal levels, the instrument ruler — render through the *real*
components. It answers **what exists and what it looks like** by construction, so this file doesn't
restate that. What a rendered page can't carry is the prohibitions and the traps; those are below. It
is deliberately not a full component gallery — component *behaviour* is verified against the running
app.

**All styling lives in `app/globals.css`** plus Tailwind utilities in the JSX — **one name per token,
no aliases**, and component code doesn't re-derive paddings, radii or cyan tints. The SVG `RailThread`
mirrors the thread literals in code because an SVG stroke attribute can't resolve `var()` — keep the
two in sync.

### Two colour lanes

`/design` renders both lanes live, including the hue precedence (baked brand > `config.METAGRAPHS`
colour > hash fallback) and the zone snapping. Rule 3 enforces the mechanics. What neither shows:

- **Structural tokens are never repointed at an identity hue.** Structural cyan (`--primary`) is the
  sole accent/affordance signal — live dots, the ECG, selection washes, sparklines, blueprint chrome,
  the "all" identity; warn/ready use `--destructive`/`--success`. Identity appears only via inline vars
  on subject marks (`--mg`, `--spine`, `--filter-accent`, `--row-hue`, `--pulse-hue`, `--edge-hue`).
  `--core` is one blue for the whole DAG core, its L0/L1 shells included, like any metagraph.
- **The palette generates per medium**: a HUD lane (flat on glass) and a scene lane (bloom-tuned, so an
  emissive bloomed node keeps its hue instead of blowing out). The page shows the HUD lane only.
- **The 3D scene sources its structural colours from the CSS tokens.** At construction the Engine reads
  them through a hidden probe plus a 1×1 canvas (which normalises whatever computed-colour format the
  browser returns for an oklch token) and threads the result into every scene module. Calm and dim
  variants are the same token at low opacity, never a bespoke tone. `config.COLORS` is the static
  mirror the non-DOM layers need (SSR, bake scripts); the Engine dev-warns if it drifts.

### The signal language

In one line: **thread = resting identity cue; card edge = purely transient signal channel.**

- **Cards are spineless at rest, everywhere** — no steady or selected edge state, including the command
  bar and popovers.
- **Resting identity lives in the rail threads.** Both rails carry a mirrored fixed SVG in the margin —
  neutral ruler and ticks, an identity-hued spine, a node-dot at each card's middle measured live. The
  thread must stay a **sibling** of the rail: the rail's clip/mask would blank a child.
- **The facts rail's thread is its ONE instrument, and it carries STATE — the SLAB carries depth.** That
  division of labour is the rule: the pile's abutting geometry says what contains what, and the thread
  says what each slot IS — **dot state = slot state** (hollow ghost, solid populated, solid + halo for
  the focus rung), on uniform short measured tie-lines (0.9 opacity at the focus rung, 0.55 for an
  entry, 0.7 for the box) anchored at each card's `[data-eyebrow]`. A depth-REACH FUNNEL on those ties
  was tried and **retired** — like the `.rung` descent spine before it, it was a second hierarchy
  instrument competing with the first. **Never grow a second vertical instrument in a rail**; two
  attempts are recorded here precisely so a third isn't made.
  ⚠️ The SVG box is drawn wider than the visible lane because **the thread's fade mask clips ink
  overflow** — lines drawn outside the box render invisibly. Attribute checks pass, pixels don't;
  screenshot it. The same clip makes the box's **ORIGIN** load-bearing: when the funnel's `REACH_PAD`
  left the ink math it stayed in the width *and* the left offset, silently shifting the whole right-hand
  thread off the rail. **Width and origin must be changed together.**
  ⚠️ **The thread measures in SHELL-LOCAL coordinates, never viewport ones**: every rect is divided by
  `k = shellRect.width / shell.offsetWidth`, the live scale of whatever transform an ancestor is running
  (`components/RailThread.tsx`). Raw viewport rects are correct only while that scale is 1, which is why
  the dots landed off their eyebrows after `raw → switch view → scene` — GSAP leaves the scene wrapper
  mid-scale, and **an ancestor transform change fires no ResizeObserver, scroll or resize event**, so
  there is no signal to re-measure on either. Dividing by the measured scale makes the numbers
  transform-agnostic and the missing event moot.
- **Every card edge signal renders on the scene-facing (inner) edge**, in three levels whose hierarchy
  must stay readable at a glance — **grey whisper < hued pairing < moving pulse** (all three run live
  on `/design`). Pairing wins over the whisper by source order. The pulse fires once per subject
  change, skips mount, debounces, leaves nothing behind, and is **synchronized with the title's
  roll-in** so title and edge move as one moment.

  All edge lines share one soft-tipped gradient recipe riding `--edge-hue`, and **only opacity may
  animate on these pseudos, never colour** — swapping the hue var rather than the background keeps
  hover-out fades from flashing.
- **Sheets stay calm**: inside sheet content the whisper and pairing edges are suppressed, because the
  sheet's own edge spine is its single identity cue. The subject-change pulse still plays.
- **Dock icon trays** show a quiet legend of the cards the sheet hosts. A card updating while the sheet
  is closed goes vivid in its identity hue with a heartbeat until the sheet opens — purely visual, it
  **never opens the sheet**, and a pure deselect announces nothing.
- **Calm tempo.** The heartbeat family beats at 1.5s and transient signals run around 1.2s, debounced
  so a 4s-tick live feed never reads as a strobe. **Navigation moves on its own, slower clock** — the
  depth change is 0.55s and the view choreography ~3.9s — because that's the user's own gesture
  resolving, not the instrument speaking.
- **Reduced motion is guarded on every animation**: theme-var animations carry
  `motion-reduce:animate-none` at the call site, CSS recipes carry their own media override. The edge
  pulse degrades to one static blink; a hold collapses its fade (the hold is timing, not motion); a
  signal chip still swaps glyphs, because that's information.

### CardHead — the one card header

Every rail card leads with `CardHead`: eyebrow / title / inset hairline / body.

- The **eyebrow** is a view tag or the bare slot noun; the populated card wears the same slot label as
  its ghost state, with no breadcrumb grammar. The provider card's user-facing word is **provider**
  while every internal identifier stays `cohort` — one concept, two registers.
- The **title** is one standard, with `titleKey` keying the roll-in remount on a subject change. Panel
  titles carry a leading identity dot on the shared beat. The node card is city-first with a
  subtitle-less head, and its body puts **NODE ID last** — the unique reference sits where references
  sit.
- **Card-head kind marks tint with the ACTIVE FILTER's identity** via
  `text-[var(--filter-accent,var(--primary))]`. Hardcoding a mark to cyan is a recurring bug; node
  marks use their node's own hue inline.
- The **`aside`** is the right-aligned title-row companion — bodies render no title rows of their own.
- **Every RESTING division is inset by its card's own horizontal padding** — the head hairline included
  (user, 2026-08-09). One weight for anything that is simply *there*: the slab's resting seam, the head
  rule, the Fact-row separators all line up at the same left/right spacing, so a card reads as one body
  quietly divided rather than a stack of slices. The panel layout insets with `--panel-pad-x`; the
  inspector layout just sits inside `--card-pad` and needs no bleed at all. Full width is **reserved
  for the hovered seam**, where it is a transient signal, not a resting edge.
  **The inset is ARITHMETIC, not an eyeball**: a division nested inside a body that already has padding
  carries the difference, so the explorer's instrument/list rule is `mx-[2px]` — 14px of body padding
  plus 2px to reach the 16px `--panel-pad-x` the head rule uses. Deriving it from the tokens is what
  makes the lines actually share an edge.
- **One close**: every dismissible card's × is CardHead's ghost close labelled "Clear selection", with
  no per-card variants. Right cards are collapsible too — the whole head is the disclosure toggle (the
  stretched-hit-area pattern, required for touch), with the × and the aside floating above the overlay
  so closing and links keep working. ⚠️ **Floating above it means `pointer-events-none` on the wrapper
  and `pointer-events-auto` on its own links/buttons** (`[&_a]:pointer-events-auto`,
  `[&_button]:pointer-events-auto`) — a `z-index` alone leaves the whole aside eating the toggle click,
  which is exactly how a collapsed head stopped expanding.
- **The cards ARE the rail's controls — there is no rail toolbar.** The collapse-all/restore + clear-all
  pair above the pile was removed (2026-08-09): every head is already a disclosure toggle, so a
  collapse-all button restates what a click says, and its × was the coarsest card's own × — clearing
  from the top rung cascades down. `clearAllActions` went with it. Don't grow the toolbar back.
- **A head hairline only exists where there's a body to divide.** Collapsed, the rule would fall on the
  card's own bottom edge, with nothing above it to separate — both `CardHead` layouts gate it on
  `!collapsed`.
- **FULL WIDTH is a hover signal, not a structural weight** — and the slab's seam is the one line that
  carries both states (user, 2026-08-09): inset at rest, reaching out to full width on hover, because
  hover is the entry's materialize preview and a materialized card owns its own edges. **Both joints
  around the hovered entry switch together** (its own `::before` plus the NEXT member's, which draws its
  bottom edge) or it half-materializes.

### Selection & pairing

- **`SELECTED_ROW`** is the one committed-selection language for list rows: the wash plus a 1px inset
  ring **as a single box-shadow** — deliberate, because the transient states it composes with are
  background-based and box-shadow is an independent property — plus a reserved trailing check mark in a
  fixed slot so columns never shift.
- **`subjectPairing`** is the one scene↔HUD hover coupling: a subject is paired when its key equals its
  store channel's value, using the same channels the engine reads and writes. Hovering a card glows its
  3D object and vice versa. This coupling is rule 9; `components/useSubjectPairing.test.ts` asserts the
  selectors.
- **`IdentityDot`** is the shared flat identity-hue dot, no glow.

### State atoms & timing

`components/state/StateAtoms.tsx` builds empty and loading states from the app's own marks (all four
render on `/design`), so an absent feed reads as part of the instrument rather than a spinner. The
sonar ring is remounted per retry, so the animation IS the retry.

**`useMinHold`** gives every *transient* signal a minimum calm cycle even when data resolves instantly,
then eases out — no blink. **Steady** states like NO SIGNAL and STANDBY never hold or fade; they
persist by nature. Boot latches once live, so a later feed drop is the per-panel NO SIGNAL rather than
the boot overlay returning.

### shadcn primitives

`components/ui/` holds the adopted primitives; compose classes with `cn()`. **`Button` is adopted only
for small text/icon controls that map cleanly onto a variant** — the LiveStrip bars, accordion rows,
rail edge-tabs, phone-dock halves, the view switch and the filter button are deliberately NOT Buttons,
and that boundary is the convention. `Command` backs the filter picker (its cursor wash is overridden
to a faint neutral — the bright accent fill washed text out). `Table` + `ScrollArea` are the raw layer
only, with `Table` adopted MINUS its scroll container so the header stays sticky while the body scrolls
under it. The engine-anchored `Tooltip` stays custom, because a Radix tooltip can't track a raycast.

### CSS traps

Nothing tests these. Each has cost real debugging time.

1. **Recipes that must beat element utilities stay UNLAYERED.** Tailwind v4 orders `theme, base,
   components, utilities`, so a rule in `@layer components` loses to a utility **at ANY specificity** —
   raising the selector weight does nothing. Unlayered CSS beats every layer at equal specificity.
   `.subject-paired` and the card signal system live unlayered on purpose — new must-win recipes go
   there too. The other escape is to stay in the SAME layer: an arbitrary variant like
   `[&>.ig-panel]:pb-[30px]` is (0,2,0) in the utilities layer and beats `RIGHT_CARD`'s `p-[18px]`
   (0,1,0) — how `RailPager` reserves its footer strip without touching globals.css.
2. **A transform on an ancestor re-anchors every `position:fixed` descendant to it**; `opacity` does
   NOT (it only makes a stacking context). Both halves are load-bearing: the scene wrapper is `fixed
   inset-0` with an inline identity transform **from first paint**, precisely so the canvas and rails
   resolve their fixed boxes against the wrapper before anything renders — geometry never jumps when
   GSAP later writes that same property. Its HUD child is animated by **opacity only**: a transform
   there would make that zero-size static div the rails' containing block. A plain `<div>` with no
   transform/filter/will-change is safe to nest. Anything that must stay pinned to the real viewport
   goes outside the wrapper or through a portal.
3. **`bg-[var(--x)]` compiles to background-COLOR.** A token holding a gradient or shorthand silently
   renders nothing — use the arbitrary property form `[background:var(--x)]`.
4. **Variant selectors compile to class+attribute specificity.** `data-[state=open]:…` is (0,2,0) and
   beats a single-class override like `motion-reduce:animate-none` (0,1,0). When a variant must win,
   use the important modifier.
5. **JS-toggled classes must remain real CSS classes** — `.scene-in`, `.rail-clip`, `.rail-dragging`
   are added and removed at runtime, so they can't be inlined into utility strings.
6. **Custom `@theme` utilities whose prefix collides with a tailwind-merge group MUST be registered in
   `lib/utils.ts`.** Unregistered, twMerge classifies e.g. `text-body` as a COLOR, so
   `cn("text-body", "text-muted-foreground")` silently drops the size class and text falls back to
   16px. Register any new `text-*`/`rounded-*`/`tracking-*` token utility in the same breath.
7. **`:has()` cannot nest inside `:has()`** — CSS forbids it and the whole rule is dropped SILENTLY
   (the slab's corner-squaring vanished this way). Reach through a sibling with ONE `:has()`
   (`+ div > .rail-entry`), and comma-join when several subjects need the same rule rather than nesting
   a second one. `:is()` inside `:has()` is fine.
8. **`max-[N]` is EXCLUSIVE** — Tailwind v4 compiles it to `@media not (min-width: N)`, so it stops
   applying **at** N, not after it. A tier boundary is therefore written with the SAME number on both
   arms (`max-[1100px]` / `min-[1100px]`), which is how the rail widths pair. The `max-[1099px]:!hidden`
   safety nets are the older form and leave exactly 1099px on the desktop arm — harmless (nothing
   double-renders, the desktop rails simply arrive one pixel early), but don't copy the pattern into a
   new boundary, and never pair `max-[N]` with `min-[N+1]` thinking it closes the gap: it opens one.
9. **One slim scrollbar recipe, `.slim-scroll`.** Any scroll region **on glass** wears it — the platform
   default paints a chunky bright bar that reads as a browser part laid over the panel. It's a class
   rather than a token because its consumers are reusable primitives (the filter strip's phone overflow,
   the raw layer's lane pane), and it styles **both axes**, because a JSON tree scrolls sideways too.

**Settle any cascade or specificity question by reading the compiled CSS in the browser**, not by
reasoning about it.

### Marker classes and ids queried by JS — these are contracts

Rename only with all consumers. These are **CSS contracts as much as JS ones** — the slab's member,
seam and corner rules select on the same markers the thread measures:

| Marker | Consumer |
|---|---|
| `#leftcol` / `#rightcol` | RailScroll, RailThread, the globals rules |
| `.ig-panel` | RailThread's card-dot measurement — every rail card must carry it (the `Card` baseline supplies it) |
| `.rail-ladder` | The facts rail's lane — the slab CSS is scoped to it (`gap: 0` + the seams) |
| `.rail-entry` | The unboxed entry tier; the thread queries both tiers |
| `[data-eyebrow]` | Where a card's tie-line anchors vertically — **both `CardHead` layouts must emit it**; without it the thread silently falls back to the card MIDDLE, which on a tall explorer card drops the mark hundreds of px below its own header |
| `data-tier` (`ghost`\|`entry`\|`box`) | **The slab's ONE discriminator** — members, seams, squared corners and the box's raise/lift all key off it |
| `data-depth` / `data-focus` / `data-ghost` | The thread's read — depth dimming and dot state |
| `.nb-row` | The pairing row-wash selector |
| `#topbar`, `#metapane`, `#tooltip` | Layout and positioning |

⚠️ The card query is deliberately **depth-agnostic** (filtered to outermost panels): a `:scope >
.ig-panel` form silently matches nothing once the ladder lane nests the cards.

## The snapshot stream

Global L0 produces a snapshot every few seconds. Three counters, which the UI keeps separate on
purpose:

- **`ordinal`** — sequence number, +1 every snapshot even when empty.
- **`height`** — depth of the *block DAG*. It only rises when blocks actually deepen it, and because
  it's a DAG with parallel siblings, a snapshot can carry blocks **without** raising height. Idle
  snapshots keep it flat for long stretches. Real mainnet behaviour, not a bug.
- **`subHeight`** — orders snapshots sharing a height.

**A global snapshot's real work is settlement, not blocks.** Most carry zero (mainnet: ~1 in 50), so
block count is the wrong activity signal. The meaningful field is **`metagraphSnapshotCount`** — how
many metagraph snapshots this global anchored, typically 1–24 and sometimes 100+. So the strip bars
scale by anchors, and the snapshot card shows the derived fee, height/sub-height and a `+N blk` note
for the uncommon block-carrying ticks.

**`LiveStrip`** occupies the bottom lane in every view, but the bar-chart is ledger-only. One bar per
tick, height = anchors. Unfiltered, bars plot each tick's total in cyan. **Filtered, each bar plots
that metagraph's own anchors on its OWN scale in its identity hue** — its own cadence, with empty ticks
as honest gaps. A ~1-anchor-per-tick metagraph reads sparse and 0-in-window reads blank; that honesty
is the design. Clicking a bar selects that snapshot in place, through the same table and executor as
the 3D tile. Hovering cross-highlights the matching ledger block, and the hover is cleared on each new
tick, because bars shift under a stationary cursor that never fires mouseleave.

**The raw data layer's table** is the same per-view projection in table form, dispatching on `mode`.
The ledger one is a master–detail split: the anchor log on the left, the channel-state panel as the
always-present right pane. hyper and geo get the node roster with per-view column order; flat views get
the honest `preview · in development` line, never a fabricated table. **The layer opens on a subject**:
with nothing selected the ledger's log commits its own first row on mount, so the pane opens populated
instead of on an empty-state the user has to dismiss by guessing where to click; an existing selection is
never overridden.

That pane is the metagraph-snapshot card's **two-step disclosure** — the CARD states the SHAPE of the
application state, the pane renders the PAYLOAD one level down **on a second deliberate gesture, because
one anchoring channel publishes personal records.** Its shape is **ONE LANE AXIS** (2026-08-09): the
snapshot's facts stay pinned at the top, and the payload sits behind `STATE · DATA · SIGNERS` tabs whose
labels carry their own counts. **An empty lane gets no tab** — a tab that opens onto "nothing here" is
chrome pretending to be data — and the first available lane opens by default, so the pane is never
parked on a chooser.

Every lane renders the **same body grammar: note → shape table → collapsed `RAW JSON`.** The note is the
lane's one-line summary (bytes and proof for state, record and block counts for data), the table is the
shape (`src/data/payloadKinds.ts` is the data lane's shape read — kinds and counts, never a guess at
meaning), and the raw tree is the last tier, collapsed, its open state living on the PANE so switching
lanes doesn't smuggle a disclosure across. **SIGNERS gets no disclosure**: a signer list is already the
raw thing.

⚠️ **`table-fixed` on that shape table is load-bearing, not tidiness** (found live 2026-08-09): an
auto-layout table sizes to its content, so one long field list widened the table past the pane, pushed the
count column out of view and defeated the cell's own `truncate`.

## The Snapshots view

A 3D anchoring chamber on the shared canvas, composing four adapters over the pure modules
`ledgerBands`, `ledgerRails`, `ledgerLayout` and `ledgerModel` — **their tests carry the geometry and
the slot model; this section carries the intent.**

**The frame.** The group is rotated so that **+X faces the camera** (the lead slot nearest the
camera-side floor edge, time trailing away), **+Y** is floor height and **+Z** the lane/width field. X
is owned by the view, Y and Z by `ledgerLayout`.

**Two storeys, and the upper one is per-metagraph planes.** The global floor is one whole plane
spanning the same symmetric field as the planes above it — **the only place the metagraphs come
together.** The upper storey is not a shared floor: one narrow plane per lane (the unknown lane
included), gapped, each with a small ticker label, machines hanging in one tray under its front edge.
The storey heights give the ribbons a deliberate long run.

**The byte bar IS the global snapshot.** One bar per tick on the global floor, fixed height and depth,
**its width alone encoding the bytes that tick carried** against a FIXED baked reference — the p99 of
anchored KB/tick, so the rare monster clips at the floor edge with an honest `×N` overflow label
instead of rescaling the whole past. The bar is centered on the lane field and split into bands, one
per contributing metagraph plus unlisted, each its own pickable mesh from a pool allocated once.
**Bands follow lane order, so band order and lane order agree and the ribbons never cross.**

**The honesty is in the domain, not the adapter** (`ledgerBands.ts`): **no exact read → no bands.** A
composition is never inferred from the anchor count and never from the fee, and an unmeasured or empty
tick **draws no bar at all**, because the per-row ordinal label already marks that the tick happened —
so nothing is drawn that could read as a small bar.

**Ribbons carry the anchor.** One tapering sheet per anchoring lane, from that metagraph's lane tiles
down to **its own band** — the literal statement of which bytes came from where. Both edges are eased
identically so adjacent ribbons can't cross, and a **hidden lane draws no ribbon** (its old-position
sheet would overlap the committed lane's field). Only the lead row and the hot row get a sheet; older
ticks keep a hairline strut.

**Composition.** Every storey surface is the same composed unit — glass plane, optional edge label, its
own tray — instantiated per position. What it deliberately does not own is the snapshots: tiles, bars
and ribbons stay pooled instanced meshes spanning every plane, and the lead-identity/neutral-trail rule
stays one shared code path.

**The chamber's look is live-tunable.** Under `?tune` (see *Tuning the look live*) the `ledger` folder
carries the ribbons, the byte bar, the lane tiles and the two plane channels.

**Node trays** hold each metagraph's machines under its own plane and the whole validator fleet under
the global floor, with no role split. **Machines are deduped — a hybrid appears once**, since roles
belong to other views. Trays are pure visual aid — no picks, no rungs, no labels of their own, because
the plane above each one is already named — but the machines inside stay pickable as nodes.

**Reuse, not clones.** The node chips are the SAME instances from hyper/geo; the ledger branches
rewrite *those* matrices to the tray positions. The Engine freezes `morph` while settled here, and
`ledgerT` is a boundary-snapped layout parameter, not an eased blend. The hubs, the globe surface and
the starfield are gated off so none lingers when arriving from geo.

**Lanes and the committed filter. The field is fixed**: every lane always owns its own slice, and a
committed filter never moves or hides geometry — only the shared commit tilt answers it with the camera.
The emphasis is a **coloured dim** on every identity-coloured element — the others drop to their *own
hue* at the row's `dim`, a tier between full colour and the neutral trail, so the committed network
leads while the rest stay identifiable. `src/engine/scene/objects/dimTiers.test.ts` keeps the tier
hierarchy ordered through tuning: **the order is the design**, the numbers may move.

A committed metagraph puts the view in **live metagraph mode**: entering with one committed, or
committing one while there, flips following on and the whole card chain rides the heartbeat. **"Live"
under a filter means the NETWORK's anchors**, so the network's newest anchored row holds the front
through anchor-less global ticks. Browsing or pinning drops live mode; leaving clears the cards, so
coming back starts live again.

⚠️ The ~2.5 MB deep read stays gated to explicit pins — an auto-advancing card must not turn an
explicit-gesture route into a poll.

**Labels.** The global floor is named by subtle flat edge-aligned text rather than billboards, and each
metagraph plane carries a smaller ticker label the same way. Every visible tick row is named by a
global ordinal label screen-left of the bars, tied to its row's bar by a dotted anchor line whose end
tracks the bar's live width, keyed by ordinal so label and line ride their row down the trail.

**Glass, emphasis and the rewind.** The glass fill shader is shared but the looks are split: the PLANES
are square with a soft-rim drop-off, the node TRAYS are flat rounded-corner panels. Rounded corners are
the trays' signature, the drop-off is the floors'. **The floors are pick blockers** — a normal surface
swallows the ray, so content under a floor can never be hovered or clicked through it. Related: **a
tile is only pickable once a resolver can name it from the polled feed** — a tile the buffer can't name
is anonymous, drawn but not pickable. The chamber shows that the anchor happened without inventing an
identity for it.

**Emphasis is TWO independent readings — brightness, and colour** (user, 2026-08-11), and in both the
order is the design.

*Brightness is the node vocabulary*, resolved for every band, tile and ribbon by `snapBright()`: an
EXPLICITLY PINNED row takes the `ledger` row's full focus `boost`; a HOVERED row takes the same boost at
the group tier, **without demoting the pinned row**, because the hover previews what a click would pin;
while any focus exists every other row steps back by `back`; and an off-filter network drops by `dim`,
the same knob its node chips in the trays answer to. `dimTiers.test.ts`
pins primary > preview > resting > stepped back, and that off-filter dims without vanishing. Exactly one
hot row — a committed older snapshot beats the live lead, a hover doesn't steal it.

⚠️ **THE BOOST ANSWERS A DELIBERATE GESTURE — A HOVER OR AN EXPLICIT PIN, NEVER A LIVE FOLLOW** (user,
2026-08-11). The live lead is simply the shown row, already named by its place at the front edge and by
keeping identity hue; and committing a metagraph flips **live metagraph mode** on, so the followed row
carried a `selectedSlot` and arrived pre-boosted. Both made `boost` a second `rest` — the whole trail
permanently stepped back against a row the chamber walked onto by itself, with nothing left for a hover
or a click to add. That is also what made the RIBBONS read as undimmed: a ribbon takes no boost, so an
automatically-boosted band separated from its off-filter neighbours ~30× while the ribbons only halved
by `1 − dim`, and the mismatch read as the dim missing from the ribbon rather than as a boost that
shouldn't be there. `LedgerView._focusSlot()` is the one home for the question (following → no focus),
and the Engine feeds it `st.following` beside the pin it already pushes.

⚠️ **A ROW'S FOCUS IS THE COMMITTED NETWORK'S, NOT THE WHOLE ROW'S** (user, 2026-08-11). A row is a
TICK, and a tick holds every network's snapshot side by side — so under a filter the boost reaches the
committed network's band and tile alone (`snapFocusOf()`, the one home). The boost is added UNDIMMED,
which is exactly what made a row-wide focus swamp the dim: on the shown row every band came up together
by the same `+boost`, so at the moment the filter matters most the committed network had no lead. The
one exception is a directly hovered TILE — that IS the subject, so it takes the primary weight whatever
the filter says, the same answer the node model gives a hovered off-filter node. Kept OUT of
`snapBright` on purpose: subject identity is a call-site question, like colour, and `snapBright` stays
term-for-term faithful to `nodeEmissive`.

*Colour is decided separately at the call sites and no dim knob may touch it.* The active and hovered
rows take identity hue; with a network committed, **that network's OWN bands and lane tiles keep their
identity hue down the WHOLE trail**, so the committed story reads as one coloured thread through the
chamber, while every other resting snapshot stays neutral cyan. Under a filter the trail therefore
separates by HUE where it used to separate by brightness as well — `dim · off-filter` is the knob that
buys contrast back if the thread ever reads too quiet.

**Selecting a non-live snapshot rewinds the trail**: the whole time trail eases forward until the
selected row sits at the lead position, so the active selection owns the front instead of fighting the
live lead's arrivals, and rows newer than the selection slide past the front edge and dissolve. The
rewind follows only the committed pin — a hover previews the hot row in place. There is no scene fog and
no depth fade on the trail: every row keeps one brightness, and recency reads from position plus the
ordinal labels.

**The far end is a HORIZON, not an edge** (user, 2026-08-09). The one exception to "no depth fade": the
trail's last slots dissolve at the far boundary, the mirror of the rewind's own front-edge dissolve, so
the chamber reads as continuing into history rather than stopping at a hard rim. It is **one function
with one home** — `horizonAt(x)` in `domain/ledgerModel.ts` (`HORIZON_X`, `HORIZON_SPAN`) — and the
furniture half is the shared glass shader's `uFadeDir`/`uFadeAt`/`uFadeSpan` plus
`SnapshotPlane.setHorizon`, so planes, trays and their labels fade on the same ramp. **No trail
instrument may float on glass that has faded out**: the ordinal labels, their anchor lines, the lane
tiles and the byte bars all multiply their own brightness by `horizonAt`, because a label hanging over
dissolved floor is worse than a hard edge. The **node trays are deliberately exempt** — they sit at the
front of the chamber, where an end is simply the truth. Deliberately **not** a `?tune` knob: it is the
frame's own shape, not a look.

**Signer glow.** When the selected metagraph snapshot changes, the Engine resolves its signers to IPs
and lights those machines in the trays — the scene keys metagraph nodes by IP, not id, so the machines
that actually signed are the ones that glow.

**Two signer groups, and the layer is the point** (`SIGNER_GROUPS` in `src/data/network.ts` is the ONE
home for their words). A metagraph seals every snapshot with its **own L0 cluster**, so the proof signer
set IS that cluster — DOR's is the same 3 machines every time, out of 20. Its **data blocks** are produced
by the **dL1 cluster**, each block by a rotating subset, so that count varies per snapshot and is 0 when a
snapshot carries none. A bare "signed by 3" against a 20-machine fleet reads as a bug, so all three signer
surfaces (the rail card, the raw layer's SIGNERS lane, the ledger panel's list) name the producing layer
beside the count from that one constant. The ledger panel can only ever show the PROOF group — data-block
signers exist solely in the ~2.5 MB deep read, which browsing must never trigger.

**A signer that can't be named is named as such, once.** `resolveSigner` in `src/data/network.ts` is the
ONE home for that: given the view's node rows, a metagraph id and a signer prefix it returns either the
real node or the honest unknown, with `SIGNER_UNKNOWN` carrying the two copies (a network-level and a
node-level phrasing). It keys on **the DATA, not the network id** — an unlisted channel is just the
common case of a signer whose machine isn't knowable, and a listed metagraph with an unmatched signer
gets exactly the same answer. So no surface fabricates a node card, and no surface grows its own
special-case for unlisted.

### The unlisted network

**`unlisted` is a first-class network with one home** (`src/data/unlisted.ts`): the module owns its
identity — **neutral gray in both lanes**, because no single identity can speak for a mixed set, so
none does — and its data, derived from the exact reads, **the only honest source**, since the polled
buffers only track the catalog. It is committable in every view: geo and hyper land in the honest
quiet-empty state (no machines are knowable), the ledger lights its lane and dims the rest.

`components/unlistedBoundary.test.ts` enforces the single home.

## Anchoring, fees & the metagraph data layer

**Vocabulary rule:** in user-facing copy the Snapshots stack **anchors state** — "settlement" is
reserved for the DAG a snapshot actually pays. One word for both reads as if Snapshots were where
*money* settles, which is what the separate Transactions view is for. So: "Anchoring layers", "the base
ledger", "N KB anchored". Internal identifiers keep their existing names; the rule is about words the
user reads.

Verified live against mainnet:

- **Each metagraph snapshots independently and faster than Global L0.** The explorer stamps each
  metagraph snapshot with the timestamp of the global it anchored into, so the anchor join is
  `metagraph.timestamp === global.timestamp` — exact, 0 orphans observed.
- **Fees are the core economic model.** Every metagraph snapshot pays a fee in DAG, confirmed because
  data metagraphs with no token of their own still pay. ⚠️ **Treat the fee as an opaque reported value
  — do NOT derive size, or anything else, from it.** It correlates with size, but Constellation
  computes it with a non-trivial calculator and size is measured separately.
- **Count is exact, fee is a floor.** `metagraphSnapshotCount` is authoritative. The derived fee covers
  only the publicly listed metagraphs, so the summed fee is a lower bound, shown with `~` and a `FLOOR`
  tag that flips to `COMPLETE` when the tracked count reaches the total. "Listed" ≠ protocol
  registration — anchoring still requires being a recognised L0 state channel; these are just absent
  from the public catalog.
- **The genuinely-unlisted count is tiny (~0–4 per tick), so a high "unlisted" reading is a bug, not
  reality.** `metagraphSnapshotCount` counts *snapshots*, not metagraphs, and **one fast metagraph can
  batch dozens into a single tick** (verified: DOR 83 in one, DED 41 — both listed). The ground truth
  for *who* anchored is the raw L0 snapshot's `stateChannelSnapshots`, not the explorer, which only
  gives the count.

### The tick lifecycle — why a breakdown *settles*

Read this before touching the ledger view. A metagraph snapshot is stamped with its anchoring global
timestamp **only as it anchors**, over the few seconds after the global tick appears. So a tick has a
lifecycle, and the polled breakdown lags it:

1. Global tick `T` appears. Its **total is correct and final immediately** — a field of the finalized
   snapshot.
2. Over the next seconds metagraphs keep getting stamped `T`, and the per-metagraph poll needs a cycle
   to fold them in. During this window a naive `unlisted = total − count` reads **transiently high**.
   That's the settling period, not real unlisted metagraphs.
3. Once no new snapshot has landed in `T` for the settle window, the remaining gap is the real floor.

**The snapshot card sidesteps all this with an exact read**, which is the primary source: the raw L0
snapshot's `stateChannelSnapshots` carry every anchored snapshot with its own fee and content, so the
exact fee, size, breakdown and record count are final the instant the snapshot exists. **The live card
never falls back to the polled floor** — while the exact read is in flight it shows a brief held
"reading…", and only old or pruned ticks (the L0 node retains ~30 min) fall back.

Two mechanisms back the polled fallback, which is used for old ticks, the strip and activity rates
because exact reads are too heavy across many ticks:

- **Self-healing catch-up**: the poll grows its limit until the batch reaches back to the newest
  ordinal already held — provably no gap regardless of burst size. A fixed tail silently drops
  DOR-sized bursts and mislabels them "unlisted".
- **Polled floor**: what was identified; the gap is a lower bound, shown only on old ticks.

`api.ts` keeps rolling per-metagraph snapshot buffers plus an anchor index keyed by global timestamp,
carrying fee, count, the id set, **per-id counts** and a `touched` stamp for the settling gate. Per-id
counts exist because a single metagraph can anchor several snapshots into one tick — presence alone
isn't enough.

The snapshot card renders the breakdown as colour-coded pills with the authoritative total in parens,
from the exact read when available. It deliberately shows **no block count**, since blocks aren't the
activity signal here. (A snapshot's `content` is the serialized snapshot as a *byte array*, not a list
of records — don't surface its length as an update count.)

**A data metagraph's real payload rides in its blocks' `dataTransactions`, not necessarily in
`onChainState`** — verified live. DED anchors fingerprint batch commitments (a batch id and a Merkle
root) per snapshot while its on-chain state stays empty; the individual fingerprints live in DED's
backend and the chain holds the tamper-proof roots. So the decoder surfaces decoded transaction values
and the card shows "Data updates: N". This is structural, not per-network: probed across all anchoring
channels over 12 live ticks, zero undecodable entries and three distinct payload shapes all rendering
honestly through the same generic extraction.

## Data — server-side routes

Metagraph cluster endpoints are plain HTTP on custom ports with **no CORS**, so the browser can't fetch
them — but the Next Node server can.

- **`/api/metagraphs`** lists the directory, fetches each cluster's info server-side, geolocates IPs,
  computes identity hues, and returns `{ metagraphs, geo }`. **On failure it answers an honest 503** —
  no pre-baked fallback; the client keeps its last good data and re-pulls next cycle. The inner fetches
  are `no-store`, which alone would make the route dynamic, so the live fetch is wrapped in
  `unstable_cache` at a 10-minute revalidate (throwing on an empty result keeps a blip from being
  cached). A `maxDuration` and a per-fetch timeout keep a slow cluster LB from blowing the function
  budget.
- **`/api/geo`** serves the validator IP→geo map live (cached 1h, 503 on failure) so the globe plots
  from one request; the client-side resolver fills any misses.
- **`/api/snapshot/[ordinal]`** reads the raw L0 global snapshot (~2.5 MB) and returns a tiny exact
  summary plus one row per anchored channel entry. **An `ordinal: 0` marks a payload the decoder
  couldn't read, which the UI must show as undecoded rather than as zero.** Cached per ordinal
  (immutable; throws on a miss so a not-yet or pruned tick retries). It's called for the live and
  selected tick only — never the whole chain, never a poll loop — plus a one-time paced backfill on a
  cold load, because the trail otherwise opens with its unmeasured rows drawing no bars. Each ordinal
  is immutable and cached, so the backfill costs at most once per ordinal ever.
- **`/api/snapshot/[ordinal]/channel/[address]`** is the deep read behind the metagraph-snapshot card's
  third tier: it re-downloads the same ~2.5 MB global to reach ONE channel entry. The cost is accepted
  deliberately — cached immutably and only ever run on an explicit gesture on one card, never on a
  poll, never across the chain. The key includes **the snapshot's own ordinal**, because a fast
  metagraph batches dozens into one tick and a (tick, address) key would make every row share one
  decode.
- The client fetches `/api/metagraphs` on mount **and re-pulls every 10 min** — Vercel never restarts
  and ISR only freshens the *server* cache, so an idle tab must re-pull. Snapshot and cluster feeds are
  live client polling.

⚠️ **Adding geo FIELDS does not invalidate `unstable_cache`/localStorage** — bump the cache keys when
the field set changes.

⚠️ **`ip-api.com` is free-tier: HTTP-only, rate-limited per source IP, non-commercial use only.** Fine
at one batched call per 10-minute regeneration; **for a commercial product switch to a licensed HTTPS
provider.**

**There is intentionally no `$DAG` price networking** — don't add a market-data fetch unless something
in the UI actually consumes it.

**`data/` holds only baked BUILD artifacts.** `brand-hues.json` is baked offline by
`scripts/bake-brand-hues.ts` (run manually whenever the metagraph set changes) — it extracts each
metagraph's hue from its real brand, snapped into the palette's allowed zones, with
`brand-hue-overrides.json` as the manual escape hatch. `country-codes.json` is baked by
`scripts/bake-country-codes.ts` and effectively never needs re-running.

### Metagraph reality worth knowing

It drives the dossier and inspector text:

- Nodes are **hybrid** (several layers on one machine) or **dedicated**. On mainnet most metagraphs are
  3 hybrid nodes; DOR is the outlier with 3 hybrid + 19 dedicated data-L1 nodes.
- ⚠️ **A peer id belongs to a LAYER, not to a machine** — each layer process runs its own keypair, so a
  hybrid answers with a different id on its l0 port than on its dl1 port (verified live 2026-08-09).
  `/api/metagraphs` therefore emits **`NodeInfo.ids`**, every layer's id for that IP in LAYERS order
  (`ids[0] === id`, the primary), and **signer matching reads `ids`, never `id` alone** — one matcher in
  `src/data/network.ts`, kept the only one by `src/data/signerMatchBoundary.test.ts`, because a local
  prefix compare looks like an ordinary string test and reintroduces the blind spot for that surface
  alone. Matching the primary only left every hybrid data-block signer rendering as `not in live set`
  while the machine sat right there in the list — the id set is per layer and so are the signatures.
- **Currency-L1 is never a standalone node** — every cL1 node is also an L0 node, so the outer cL1
  shell is effectively always empty.
- **A metagraph has a real token only if it runs a currency-L1 cluster.** The `symbol` field is
  *always* set, so it is not a token signal (DED has a "DED" symbol but no token). The dossier's type
  descriptor derives from node roles, and a 0-node metagraph says just "metagraph" — type is unknowable
  without nodes.
- **The directory API lists l0/cl1/dl1 URLs for every metagraph whether or not that layer runs**, so
  URL presence means nothing. Only node presence does.
- Keep `config.METAGRAPHS` in sync with what the route returns, matched by `id`.

## Deploying (Vercel)

Target host is Vercel; any Node host works. No env vars or secrets required.

Enabled now, all on the free Hobby plan: a clean `next build` with the route caching above; **security
headers** in `next.config.mjs` (a moderate CSP — inline script/style for the Next runtime, `img https:`
for logos, `connect https:` since the Constellation host set is open, plus telemetry; dev adds
`unsafe-eval`/`ws:`/`http:`), added for reputation-scanner posture after a scanner NRD-isolated the
fresh domain; and Speed Insights + Analytics in the layout, both no-op off Vercel.

⚠️ Web Vitals do NOT capture the WebGL frame rate — use the engine's stats.js for that (dev-only, or in
prod via `?stats`, so it never shows for real users).

⚠️ **`app/opengraph-image.tsx` must stay ASCII + styled `<div>`s only**: a non-Latin glyph makes Satori
fetch a font at render time, which fails and breaks the image.

**When adoption grows → upgrade to Pro** for Skew Protection (the app is a long-lived open tab and a
deploy can break chunk loading in open tabs), a cron pre-warm for `/api/metagraphs`, WAF/rate-limiting
on `/api/*`, and a licensed geo provider. Not applicable: Image Optimization (no `<img>`),
KV/Postgres/Blob (no persistence), Edge Config / env vars (no secrets).

## Dev workflow

- **Feature work runs on the superpowers plugin flow**: brainstorm → written plan → subagent-driven
  implementation with per-task review gates, then a final whole-branch review before merging.
- **Design work runs component-by-component against the LIVE app** — brainstorm on the real rendered
  component in the running app, agree the outcome, implement immediately. `/design` is a token
  reference, not the component surface. **No separate spec or plan documents for design sessions**;
  they drift out of sync. Light per-change gates (`tsc` + `vitest` + a targeted visual check) and one
  full verification pass at the end (prod build with dev stopped, a screenshot suite, reduced-motion,
  tablet and phone re-verifies).
- **The work ledger is `.superpowers/sdd/progress.md`** — append per-task status, decisions and
  adjudications there as work lands, so any session can resume with context. Durable decisions
  graduate into THIS file.
- **New behaviour lands in `domain/` with a colocated test.** That's rule 4, and it's also the
  mechanism by which this file stays short: a rule with a test needs one line here, not a section.
- **Preserve the three.js↔UI interaction coupling in every refactor** — it's a standing review lens.
- **Commit trailer**: end commit messages with `Co-Authored-By: Claude <noreply@anthropic.com>` — no
  model name, so the line can't go stale (PR bodies: `🤖 Generated with
  [Claude Code](https://claude.com/claude-code)`).
