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
config changes or stale state. **Any edit to an engine/scene CLASS needs a full page reload**, not
HMR — not just geometry built in constructors. The engine is one long-lived imperative instance
behind a dynamic import, so a swapped module leaves the running instance on its old methods and you
verify the previous build believing it's the new one. Reload after every engine edit.

⚠️ **Turbopack's persistent cache can serve a STALE `globals.css` compile, and it survives a plain
restart** — the chunk keeps one filename, so an old body ships under the same URL (found 2026-08-13:
the phone flight-dim rules were in the source for a day while the served chunk predated them, and
the "bug" was chased in the state machine first). When a rule is missing from the browser's CSSOM,
don't debug the cascade: kill the server, `rm -rf .next/dev`, restart.

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

⚠️ **THE DAG CORE'S OWN FURNITURE IS FURNITURE TOO** (user, 2026-08-11 — *"dim elements in hyper view
does not affect the rings of the core in the middle"*). ONE NODE MODEL: the core is a metagraph-shaped
hub, so its hoops, rim fills and glow read `elem` like every other hub's — they had kept three magic
coefficients of their own (0.5, 0.5, 0.6) and so sat at full brightness while every metagraph's dropped.
The one difference is the switch: a hub flips on a binary `focusOther`, the core eases on `_coreDim`
(the DAG tracks the highlight state gradually), so the knob is LERPED by it — `coreOffMul = 1 −
_coreDim × (1 − hubOffMul)`. The core BODY keeps full opacity, which is the hub's soft channel taken to
its limit: the one sphere at the origin is the structure's centre and always reads as a position.

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
top** (`dollyBack`, `railsLean`, and the subject-relative hub framings). Deliberately raw — per-pose
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

### Three camera principles

1. **Framing math consumes layout data** — records, anchors, orbit slots — never rendered transforms.
   `getWorldPosition`/`getMatrixAt` in an Engine framing path needs a justified `render-state OK`
   marker (rule 6 enforces this).
2. **View emphasis moves the structure, not the camera.** Shared, lockstep and policy-driven beats
   composed camera cleverness; camera poses stay dumb. Where a view *does* answer a commit with the
   camera, it gets **ONE pose with ONE state-keyed variation** — the ledger's `ledgerCommitTilt`
   (`domain/cameraRig.ts`) leans the settled chamber pose in when a network is committed and back out
   when it isn't, and that is the whole vocabulary. Three bespoke ledger framings (a lane nudge, a node
   framing, a per-lane fly) were built and **retired** because each added a pose the user had to learn;
   don't grow a fourth. **Hyper's per-node framing went the same way** (2026-08-13): a node there is one
   bead on a shell, and diving to it lost the hub and shells that say what it belongs to, so the rung
   delegates to its network's framing — *"it should behave the same as when (only) a metagraph filter
   is selected"*. **A rung without a pose of its own inherits its parent's**, it does not invent one.
3. **Every commit is acknowledged, and a same-pose commit takes the NUDGE.** Principle 2 leaves rungs
   whose destination is the pose the camera already holds, and a dead 1.4s no-op reads as a broken
   click. `isSamePose`/`nudgeMix` (`domain/cameraRig.ts`) answer with a 0.55s push toward the pose's own
   target and back out, contributing exactly 0 at `t=1` so the tween still lands on the committed pose.
   It does **not** raise `cameraFlying` — that dim exists so the scene can be seen changing, and here it
   isn't. A node commit is answered in **every** 3D view, gated on the canvas allow-list (convention 7),
   never a list of modes.

⚠️ **The two global camera levers share one exemption, and one of them RAMPS** (user, 2026-08-13).
`dollyBack` and `railsLean` both scale `(pos − target)` about the target, so a pose whose target is a
composed look-at rather than the subject — `nodeFraming`, `cohortFraming` — is exempt from BOTH; the
exemption belongs to the POSE, and `_tweenTo`'s one `dolly` flag gates both levers. And the
rails-hidden lean fades out as the pose closes in on its subject: hiding the rails frees **horizontal**
width while the FOV is **vertical**, so the radial dolly buys width by spending vertical fit — free at
a resting pose, whose subject runs wide, and a crop at a deep rung, whose subject (a co-located stack,
a hub's shells) is height-bound. `restOrbit(view)` reads the resting orbit out of `FOCI`, so re-tuning
a resting pose re-tunes the ramp with it, and `RAILS_HIDDEN_DOLLY` stays the one lever — it is what
"full lean" means, not a second knob.

⚠️ **Three's raycaster ignores `object.visible`.** Hiding a group does not stop it being picked — it
has to be left out of `pickSources`.

**Double-tap zooms, on TOUCH only** (`domain/tapZoom.ts`, 2026-08-13). Not a three.js feature —
OrbitControls' touch map is one finger rotate, two dolly/pan, with no constant for a tap pair — so the
recognizer is hand-rolled in the Engine over `pointerup`. Three decisions carry it: the step is a
**dolly toward the current `controls.target`, never a re-aim onto the tap point** (a map zooms at the
finger because you navigate a plane; here the pose system owns where the camera looks); a second
pointer down invalidates the pair *and* a running step, because a pinch dollies the same axis; and the
pair's **second click is eaten**, or it would toggle off the hub / country / tile the first tap just
committed. A pair landing mid-flight retargets the tween's destination rather than fighting it — and
not through `_tweenTo`, which would compose `dollyBack` and `railsLean` in a second time.

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

**The staging block is WIDTH-FIRST, and the chip size is the same in every presentation**
(`domain/gatherLayout.ts`, 2026-08-13). The pack's **depth** is solved against the band measured in
real chip pitches (`gatherRows`) and the columns fall out of it, so a wider band answers with a
longer, shallower block rather than a bigger one; the leftover goes to the **gutters between blocks**
(`gatherSpread`), never to the pitch inside them. ⚠️ The trap this replaced: `cols = ceil(√count)` is
width-agnostic, so the DAG's 162 nodes hung ten rows down while scene mode's band had hundreds of
unused pixels either side. **Tune the band, not the chip.**

**Slack can never become size, and the search stops at the band's own HEIGHT.** Two structural rules
hold the above in place, because it had been fixed once and come back (user, 2026-08-13 — *"find a
structural fix that does not reappear"*). The pitch is a fixed world constant and **the fit may only
ever shrink below it**: the growth cap that used to let it scale UP meant the two presentations agreed
only while the cap bound in both, so any viewport that moved one off the cap re-opened the bug, and
the cap itself had twice been tuned to whatever made *one* band fill — a free fit in disguise. And the
depth search is capped by `floor(availH / pitch)` rather than by `ceil(√deepest)`: the near-square is
width-agnostic, so it stopped the search at a shape the band had nothing to do with and handed the
rest to shrinking while vertical room went unused. Measured at 1600×897: the same 161 DAG chips stage
23×7 with the rails in and 54×3 with them away, at one pitch (~19.5px) in both.


re-commits the node's country and provider, hyper its composition group — exactly the rungs a click on
that node in the destination view would have committed. So every card up to the selection is on the
rail in every view, and a deselect steps back down the local ladder instead of jumping to the network.

## Nodes, layers & the filter

**Vocabulary rule — a validator is a LAYER, never a machine** (user, 2026-08-10, app-wide sweep): a
**node** is one host — one machine, one IP, one city, one status; a **layer** is an L0 / cL1 / dL1
process on it, with **its own keypair and its own peer id**; a node's **composition** is the set of
layers it runs; and a **validator** is a layer acting, so the word is *always* layer-qualified and never
a synonym for "node". The global snapshot card's bare `155 validators` is what surfaced this — under
the unified node model its seal is the DAG's own L0 cluster, so it reads `155 L0 validators` like every
other signer count. There is **ONE layer vocabulary** app-wide, the codes the composition chips already
use (`L0` / `cL1` / `dL1`); the signer copy's `data-L1` was a second dialect for the same three layers
and is gone, `ROLE_FR` with it. `src/data/network.test.ts` makes both halves executable — every
`SIGNER_GROUPS.who` must match `/^(L0|cL1|dL1) validators$/`, and no group's words may say `data-L1`.
Internal identifiers keep their existing names (`validatorDim`, `NodeFabric`, `machineRows`) — one
concept, two registers — and a phrase naming a SHELL rather than a machine ("the validator shells around
it") is correct as it stands.

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
- **A committed ancestry rung borrows its members' glow only while it is the FINEST committed rung**
  (user, 2026-08-11). Every other rung has a 3D counterpart you could have clicked — the hub, the
  border, the chip; the **group** rungs (geo's provider cohort, hyper's composition group) have none,
  so lighting their members is the only way they appear in the scene at all. Honest while the group IS
  the subject, a lie once the click lands on a node. `dimModel.ancestryGlow` is the rule and its test
  the spec; the ledger's signer set stays outside it (not ancestry — a relation from a different
  subject), and hover is untouched. One call site: `Globe._frameCtx`'s glow channel.
- **A tick drops the metagraph snapshot it can't contain** (user, 2026-08-10). Stronger than the story
  rule one rung up: that one is about set membership, this is a one-to-one join
  (`metagraph.timestamp === global.timestamp`), so committing a DIFFERENT tick provably means the held
  snapshot didn't anchor here. Left in place it sat directly under the global card in the pile — where
  ADJACENCY IS CONTAINMENT — stating that tick B contains a snapshot that landed in tick A. It lives in
  `snapshotSelectActions`, so all four consumers (explorer row, LiveStrip bar, the global card's pager,
  the 3D band click) inherit it.
- **New click/select semantics go in the table with a test**, their effects in the executor, never
  inline. `components/selectionBoundary.test.ts` enforces this — and note the rule is **write**-based,
  so read-only facts cards cost nothing and every future explorer card inherits the table.

## Layout — the four-zone HUD over a raw data layer

The page is one fixed shell in **two layers at different depths** (`SectionShell` + `store.section`).
The scene layer is the four-zone HUD over the 3D canvas; the raw layer is the view's raw-data table —
*the same data one level down*, not a second page. ⚠️ The store value for that layer is **`"data"`,
not `"raw"`** — every word the user reads says RAW, so the two registers don't match and grepping for
`"raw"` finds nothing. The RAW switch runs one GSAP timeline: the HUD
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
  Its **network group header DISCLOSES and PREVIEWS but commits nothing** (user, 2026-08-10): it opens
  the group and its hover still paints that lane in the chamber, but the commit lives one row down on
  the snapshot itself — a header click that moved the top-bar filter reached past what the row is
  about, and the pager keeps the same boundary by staying inside this metagraph × this tick.
  And **a committed filter is a LENS here**: with a network committed, every OTHER network's group
  under a tick is `previewOnly` (`outOfLens` in `components/LedgerPanel.tsx`). The tick still LISTS
  them — rule 10 doesn't let a lens edit the facts, and they really did anchor here — they just aren't
  drillable, the same boundary the chamber's coloured dim draws. Unfiltered, nothing is out.
  `previewOnly` is `DisclosureRow`'s shared out-of-lens treatment, and it says so AT REST: the chevron
  is invisible until hover, so an inactive row would otherwise look live right up until you click it.
  It keeps the hover wash and the scene preview, drops the chevron (keeping its slot, so sibling count
  columns don't shift), takes the cursor back to `default` and mutes its words one step — but its
  identity dot stays at full hue, because it did anchor here and identity is not a state.

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
drift. The plank stays chrome-less by the same grammar rule — no fill, no border, no frame of its own —
and the card reserves its strip with a padding utility (see CSS trap 1). It does carry **one inset
hairline** dividing it from the body (2026-08-10): once the foot became a small muted mono column, a
CONTROL sat directly under DATA at the same weight and read as one more foot row. That rule is the same
device `Foot` uses at the same inset, which is the point — **every resting division in a card shares one
left/right edge, and the inset is ARITHMETIC**: the pager's wrapper is the positioning containing block,
so an absolute inset measures from the card's BORDER box and the correct value is 1px border + 18px pad
= **19**, matching the head rule and the `Fact` separators. Both the hairline and the plank row use it;
at 18 the hairline overhung the separators by a pixel and the chevrons' hover wash overhung the content
edge. **The gate is BOXED and nothing else**
(an absolutely-positioned plank over a ~28px collapsed entry is a defect; single-open already makes the
box unique) — it is the tier's own `boxed` condition, and `railTierBoundary.test.ts` pins that the two
can't drift. Keying it to the FOCUS rung was the same mistake `data-tier` fixed above, and it also shut
out the two snapshot slots, which ride the lane with no focus rung at all.

**A pager's parent scope is whatever the step must NOT change, which for the metagraph snapshot makes it
a PAIR — this metagraph × this tick** (user, 2026-08-09). The set is the subject's own `metaId` rows of the
pinned tick's exact read, ordinal-desc, never every contributor: `metaSnapSelectActions` filter-firsts, so
a cross-network step would move a COARSER rung and a swipe would silently re-commit the network. The
explorer still LISTS every network under a tick, but it doesn't commit one either — its group header
discloses and previews only, so both surfaces keep the same boundary. And the pair is the honest total
— a fast metagraph batches dozens of snapshots
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
never overstating); the metagraph aside says **`anchored to N`** whenever the card above already shows
the very tick it anchored into — the anchor join is exact, so a counter there would be the same number
twice. It falls back to its own counter when that carries real information: a global ghost, or
following a lane through anchor-less global ticks, where this card holds an older tick. **The
anchoring ordinal rides all three states** (`anchored to N` / `live · Xs ago → N` / `◷ Xs ago → N`),
because the two counter states are precisely the ones where the card above shows a *different* tick, so
the number is then the only thing saying which global this snapshot landed in. It moved into the head
from a body row on 2026-08-10 — a join is not a fact ABOUT the snapshot, it is the relation the aside
already names — and the metagraph TICKER that shared that row went with it under the pile rule, since
the METAGRAPH card sits directly above and this card's own mark already carries the hue.

**An ordinal is written BARE — no `#`** (user, 2026-08-10). Every surface that renders one as a value
already did (the snapshot card titles, the explorer rows, the anchor-log cells, the LiveStrip's tooltip
head); the sigil only survived where a number got glued into a sentence — this aside, the raw layer's
channel pane head, the pager's step labels, the ledger explorer's tooltips and the scene tooltip. It is
noise in all of them: the label beside it already says what the number is. Internal `PickDescriptor.title`
strings still read `Global snapshot #N`, but nothing renders that field for a snapshot.

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
flashing a false invite. A populated card renders in any 3D view; the ghost only appears where the view
can actually produce the card.

**The placeholder views host NO facts cards at all** — `detailsCards` returns `[]` outside the three 3D
views (user, 2026-08-10). A live node card, status pill and real ids beside a `preview · in development`
wireframe is exactly the mixed signal rule 10 exists to prevent, and it arrived half-formed anyway: with
no ladder for those views every present card fell through to Inspector's trailing non-ladder pass, which
excludes the context card, so the node card rendered with **no network plank above it** — and correctly
re-grew Country and Hosting, since the pile-dedup rule found no ancestors. It is a view gate, not a
selection change: the store is untouched, so returning to a 3D view restores the whole pile. This
matches the left rail, which shows About and no tool card there.

**Bottom — the live/time lane, and it is SNAPSHOTS-ONLY** (user, 2026-08-12). The lane holds one
instrument, the `LiveStrip`'s tick bar-chart, and a bar-chart over ticks is a TIME instrument — so it
belongs to the *when* view and nothing else. hyper and geo carried a node-count readout in the same
footprint to keep the lane from reading as blank; that answered the wrong question, since a per-network
node tally is structure and structure is already the subject of the view above it. The lane is now
simply absent there and the space comes back to the rails and the raw layer.

`BottomStream` is the **one publisher**: it both mounts the strip and writes `--bottom-reserve`, from the
one policy flag `VIEW_POLICIES[mode].timeLane`, so presence and reserved space can't drift (the previous
arrangement published the reserve per view while the strip mounted unconditionally — two values for one
token). The token's static default in `globals.css` is therefore **`0px`**, matching the boot view. The
lane belongs to neither layer, so where it mounts it stays interactive in both poses.

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

### Inside a card — one grammar, three weights

The slab grammar above says how cards sit together; this says what a card BODY is made of. **One row
grammar everywhere: label left, value right, one line.** The stacked micro-uppercase-label-above-value
form is retired — it cost two lines per fact and read as a form, not an instrument. Its last survivor was
the `Composition` label over the dossier's composition table, which outlived the sweep only because that
table isn't a `Fact`; dropped 2026-08-10, since each row already names its own composition and without it
the description above reads as the card's lead.

Three weights, and a fact's weight is a claim about what the card is FOR:

| weight | holds | built from |
|---|---|---|
| **lead** | the 1–2 things the card exists to say | composed by the card itself — merges facts onto one line and drops labels the unit already carries (`1.8 KB of state · 4 data updates`, no "State"/"Updates") |
| **detail** | the measured facts | `Fact` inside `FactGroup` |
| **foot** | hashes, ids, bookkeeping numbers | `Foot` + `FootRow` — small muted mono on its own BASE PLATE, **always last** |

The four primitives live in `components/inspector/parts.tsx` and are the only way a card body draws a
fact row; nothing re-derives the layout locally. They carry no animation, so reduced motion is a no-op
here exactly as it is for the slab.

**The foot is a look-up column, not a demotion bin.** A value goes there when you'd only ever read it to
compare it against something else — the node card's NODE ID, the snapshot cards' hash and parent. That
is also why the node card's "NODE ID last" rule falls out of the grammar rather than being a special
case.

**The foot changes GROUND, not just type** (user, 2026-08-10 — the tier read as "only the font"). It
full-bleeds by the card's own padding to the panel's bottom edge, picks the inner radius back up and
sits on `--panel-plate`; that replaces the `Separator` outright, because a rule on top of a ground
change is redundant noise. **The fill is a neutral white LIFT, and the mechanism is the rule**: a dark
scrim composites multiplicatively, so it separates beautifully over the ledger's glow and dies to a
~4/255 step over the black scene the right rail actually rests on — it shipped that way for an
afternoon before being measured on both grounds. A white overlay is additive and therefore
ground-independent. Keep it neutral: `--wash-*` is accent-hued and IS the selection language, so a
tinted lift would read as selected. The bottom bleed is `--foot-bleed`, which `RailPager` overrides to
its own strip height so a paged box's plank rides ON the plate — one number, two consumers.

On the two snapshot cards the foot has one shape: **the artifact's chain identity — what it is, what it
links to, what it proves.** They are the same `Signed[]` artifact, so they carry the same set, and the
metagraph card's `State proof` is the one addition, because only a metagraph snapshot proves an
application state. **Counters are not chain identity**: `Height`, `Blocks` and `epochProgress` are all
carried by the types and none of them appear.

**The PILE is the unit of consistency: a card never re-states an ancestor's identity.** Adjacency is what
the slab uses to say containment, so a leaf repeating its parent at equal weight is noise, not
reassurance. The node card drops Country, Composition and Hosting exactly when the country, composition
or provider rung above it is committed — each of those cards states that fact as its own TITLE, and a
title survives the collapse into an entry, so the plank speaks whether it is open or not. **Gate on
presence, not view** (convention 7): the `!= null` rung checks, never `mode`, so the rule holds as
ladders change and the fact grows back wherever nothing above it says it. Read down the pile, the fact
set is identical in every view — only its distribution across planks moves. Whichever facts survive keep
one fixed reading order, **place → role → host → reference**, so the card always reads the same way; it
just has fewer lines.

**Density came from culling, not from tightening.** `Data blocks`, `Height` and `Blocks` (metagraph
snapshot) and `Epoch` (global snapshot) were removed outright — a fact nobody reads costs more than the
pixels it takes.
Measured at 1600×950: the ledger box 649px → 459px, and the ledger's committed ladder went from
overflowing its lane (831 in 663) to fitting (629 in 641). Don't re-add a culled fact without saying
what question it answers.

**A code appended to a value is a THIRD COLUMN in disguise** (user, 2026-08-10 — asked whether the node
card wanted three columns). It doesn't want one: three columns break the one row grammar, and the codes
themselves ran 2ch (`US`) to 8ch (`AS212317`), so a fixed column is either gappy or truncating. The codes
are **culled** instead — `US` restates "United States" and nobody looks a country code up. The role chips
STAY on the Composition line: they qualify the word, and a value column can't hold them. Measured live,
the raggedness was at the **left** edge of the value block anyway — a third column would not have
addressed it.

**The ASN is a BODY fact, beside the host it names** (user, 2026-08-13). It spent three days in the foot
on the look-up rule, and that reading is too literal here: the foot holds the card's own REFERENCES, and
the ASN is not this node's reference, it is the provider's — read down the foot it sat above `Node id` as
if the two identified the same thing. In the body it lands where the fixed reading order already puts it,
one line under the provider NAME it is the number for, and the foot is left saying exactly one thing:
which node this card is about. It keeps the **provider rung** condition the Hosting line above it uses, so
the two can't disagree about who owns the host. The look-up rule still governs what the foot is FOR; it
just doesn't reach a value that belongs to a different subject.

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
  Every rail card fills it; the country card was the last one leaving it empty, and now carries its ISO
  code (2026-08-10) — the subject's own short form, the role the dossier's ticker plays, so it takes the
  same weight but **muted rather than hued**, because a place carries no identity and the head's tinted
  mark is already the filter accent. It suppresses itself when the display name is unknown, since the
  title has then fallen back to the code and a head must not say the same thing twice.
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

**Acquiring has two forms, and the choice is about the SLOT, not the wait** (2026-08-10). `NodeStars`
fills a value slot a real number is arriving into — it reserves that slot's width so nothing reflows
when the number lands, and carries no text because the label already names what's coming (the global
card's `Fees paid`, `AnchoredTags`, the metagraph card's Data count). A **word** is for everything
else: no slot is being held, so it states the situation and is replaced wholesale — `reading…` for a
block acquiring, `unread` for a value nobody has looked up yet, `unavailable — read failed` where
nothing is coming. Stars where nothing is in flight would promise an arrival that isn't coming; a word
in a held slot reflows the row when the number replaces it.
⚠️ **Every acquiring state needs its give-up path wired.** A read that fails otherwise shows
`reading…` forever, which rule 10 counts as a fabricated state exactly
like a fabricated number. The exact read's signal is `store.exactMiss` (recorded by
`RawSnapshotBridge`, cleared when the read lands); the deep read's is the 12s `decodeGaveUp` timer.
⚠️ **The failure is a blip, not pruning.** The L0 LB serves the ENTIRE ordinal history (verified
2026-08-13: ordinal 1,000,000 answers 200 — the old "prunes after ~30 min" premise is false), so a
give-up copy must never name pruning as the cause; the bound on what the routes serve is the app's
own `ordinalWindow.ts`, sized so no legitimate client ask ever hits it.

**A value slot states a READING; an invitation is a CONTROL** (user, 2026-08-10 — "I don't like the
word 'pin', it's not very clear to me"). The metagraph snapshot card's Data slot said `pin to read`:
internal vocabulary in user copy, naming a gesture whose only control was the head aside — top of the
card, labelled with a *time*. The words moved out of the slot and became the block's own button,
because the deep read fills **both** payload sections' shape rows, so an instruction sitting in one
section's value slot was governing the whole block. What stays is the honest reading, and **`unread`
and `none` are different facts** — haven't looked vs looked and found nothing. Rejected on the way:
"encrypted"/"decrypt" (it is brotli-compressed public JSON — no key, no cipher, and it says the
opposite of the one thing that matters, since this read is gated *because* one channel publishes
personal records in the clear) and "uncompress" (true, but it puts the cost on local bytes when the
cost is the ~2.5 MB fetch).

**One control position, two tiers**, because there are two costs and the card charges the second only
once the first is paid: `Read this snapshot` runs the deep read and states the SHAPE in place;
`Show the application state` opens the raw layer for the payload. Tier 1 is the card's ONLY route to
the read — the card never fetches on its own, because being pinned is not the same as asking (the
surface gate, under *The Snapshots view*); the button writes `deepWanted` and that is the whole
request. Tier 2 gates on the deep read having
LANDED, not on decodability — while following it used to land on a pane whose own copy said to pin,
with the pin control back in the HUD the raw layer had just marked `inert`. The cost rides the
**button's** title, never a value row: `PAYLOAD_LANES` is one home shared with the raw pane's tabs, and
"only when you ask" is stale the moment the read lands. ⚠️ The read pins through
**`metaSnapSelectActions`**, not the aside's `followToggleActions` — the aside's builder commits the
GLOBAL tick as the subject, which moved the box to the Global snapshot card and collapsed the card you
were reading. Same builder as the anchor-log row, so a read and the equivalent row click can't drift.

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

Global L0 produces a snapshot roughly every **28 seconds** — measured live, mean 28.1s over a full
window, range 4.6–114.8, so the cadence is irregular and a "few seconds" intuition will mislead any
timing you build on it (the LiveStrip's window, a hold, a settle gate). Three counters, which the UI
keeps separate on purpose:

- **`ordinal`** — sequence number, +1 every snapshot even when empty.
- **`height`** — depth of the *block DAG*. It only rises when blocks actually deepen it, and because
  it's a DAG with parallel siblings, a snapshot can carry blocks **without** raising height. Idle
  snapshots keep it flat for long stretches. Real mainnet behaviour, not a bug.
- **`subHeight`** — orders snapshots sharing a height.

**A global snapshot's real work is settlement, not blocks.** Most carry zero (mainnet: ~1 in 50), so
block count is the wrong activity signal. The meaningful field is **`metagraphSnapshotCount`** — how
many metagraph snapshots this global anchored, typically 1–24 and sometimes 100+. So the strip bars
scale by anchors, and the snapshot card leads with the anchors, breaks them down by metagraph and
states the derived fee and the bytes anchored. **The card carries no height, sub-height or block
count at all** — a counter that answers no question the card raises, culled 2026-08-10 with the rest.

**`LiveStrip`** is the bottom lane's one instrument and mounts in **Snapshots alone** (above). One bar per
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
one anchoring channel publishes personal records.** Arriving here IS that gesture, so the pane reads its
own subject's payload on arrival (the surface gate, under *The Snapshots view*). Its shape is
**ONE LANE AXIS** (2026-08-09): the
snapshot's facts stay pinned at the top, and the payload sits behind `STATE · DATA · SIGNERS` tabs whose
labels carry their own counts. **An empty lane gets no tab** — a tab that opens onto "nothing here" is
chrome pretending to be data — and the first available lane opens by default, so the pane is never
parked on a chooser.

⚠️ **An empty state must name a gesture available on ITS OWN surface.** The pane's read invitation said
"pin this snapshot", a gesture whose control lives in the HUD — which the raw layer has marked `inert`,
so the instruction was unfollowable from where it was read. It names the anchor-log row instead, which
is right there and commits the same selection.

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

⚠️ **The ~2.5 MB deep read is gated by the SURFACE, not by the mode** (user, 2026-08-10). Being PINNED
is not the same as ASKING: selection used to be the whole trigger, which put the read behind a BROWSE
gesture — every pager step and every explorer leaf fetched. So:

- the **card never reads on its own** — it states the SHAPE, and its `Read this snapshot` button writes
  the store's `deepWanted` key, which IS the request. One press, one read; a pager skim costs nothing.
- the **raw layer always reads on arrival** — that surface exists for nothing but the payload, so being
  there is the request, and getting there took a deliberate depth change.
- `following` stays a hard guard on top: an auto-advancing card must never turn an explicit-gesture
  route into a poll.

The measurements are the justification: the client only ever receives the decoded row (**599 B** for
DED, **4.4 KB** for DOR) — what's rationed is the SERVER's fetch of the whole global and the latency
the user waits through, **~1.8 s cold**, ~1 ms warm from the immutable per-ordinal cache. And it
MULTIPLIES: tick 6,741,486 anchored **20 DOR snapshots**, so one swipe through that pager was 20 ×
2.5 MB against Constellation's public L0 LB, ~36 s. Privacy is the other half — one anchoring channel
publishes personal records, which is why the payload is two deliberate gestures deep at all.

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

*Brightness is the node vocabulary*, resolved for every band, tile and ribbon by `snapBright()`: the
SELECTED row takes the `ledger` row's full focus `boost`; a HOVERED row takes the same boost at
the group tier, **without demoting the selected row**, because the hover previews what a click would pin;
while any focus exists every other row steps back by `back`; and an off-filter network drops by `dim`,
the same knob its node chips in the trays answer to. `dimTiers.test.ts`
pins primary > preview > resting > stepped back, and that off-filter dims without vanishing. Exactly one
hot row — a committed older snapshot beats the live lead, a hover doesn't steal it.

⚠️ **THE BOOST ANSWERS THE SELECTION, AND THE BARE LEAD IS NOT ONE** (user, 2026-08-11). With nothing
selected the chamber is simply running: its front row is already named by its place at the front edge
and by keeping identity hue, so lifting it made `boost` a second `rest` — the whole trail permanently
stepped back against a row the chamber walked onto by itself, with nothing left for a hover or a click
to add. That is also what made the RIBBONS read as undimmed: a ribbon takes no boost, so an
automatically-boosted band separated from its off-filter neighbours ~30× while the ribbons only halved
by `1 − dim`, and the mismatch read as the dim missing from the ribbon rather than as a boost that
shouldn't be there. But **live/not-live is HOW a row was reached, not WHAT it is** (user, 2026-08-11):
a live follow's row IS selected, so it reads exactly like a pin. Suppressing the boost while following
left live metagraph mode — which the committed filter turns on by itself — with no focus at all, and
the user read the whole chamber as dull. So there is one question and `model.selectedSlot` answers it;
the scene no longer reads `following`, and `LedgerView._focusSlot()` / `ByteBar.setFocusSlot()` are gone.

⚠️ **A ROW'S FOCUS IS THE COMMITTED NETWORK'S, NOT THE WHOLE ROW'S** (user, 2026-08-11). A row is a
TICK, and a tick holds every network's snapshot side by side — so under a filter the boost reaches the
committed network's band and tile alone (`snapFocusOf()`, the one home). The boost is added UNDIMMED,
which is exactly what made a row-wide focus swamp the dim: on the shown row every band came up together
by the same `+boost`, so at the moment the filter matters most the committed network had no lead. The
one exception is a directly hovered TILE — that IS the subject, so it takes the primary weight whatever
the filter says, the same answer the node model gives a hovered off-filter node. Kept OUT of
`snapBright` on purpose: subject identity is a call-site question, like colour, and `snapBright` stays
term-for-term faithful to `nodeEmissive`.

⚠️ **`back` IS THE ROW'S ANSWER, SO THE FOCUSED ROW NEVER STEPS ITSELF BACK** (user, 2026-08-11 — *"the
snapshots look dimmed too much, almost gray/black, next to a ribbon I like the colour of"*). Its
OFF-FILTER members included: they take the `dim` alone, which is exactly the tier the RIBBON landing on
them takes (`Ribbons` passes no focus and no back at all), so a ribbon and its two endpoints read at one
level. Compounding the two knobs made `dim × back` ≈ 0.28 against the ribbon's 0.5 and left the band and
the tile above it near-black under a sheet that was only gently dimmed. `dimTiers.test.ts` pins it per
instrument.

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

⚠️ **A DISSOLVED ROW MUST ZERO-SCALE, NOT JUST GO DARK** (user, 2026-08-11). The lane tiles are one
instanced mesh on an **opaque, depth-writing** material whose brightness rides the instance COLOUR, so a
row multiplied to brightness 0 is a BLACK BLOCK — it occluded the ribbons and glass behind it in front
of the active row, and the raycaster ignores `visible`, so it still ate clicks. Both POSITION dissolves
(the rewind's front edge and the horizon below) resolve to one `edge` factor per row, and `edge <= 0`
takes the same zero-scale branch an unfilled tick already gets. The byte bar never showed this — its
bands are `transparent` with `depthWrite: false`, which is why a brightness dissolve is enough there.

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

**Three signer groups, and the layer is the point** (`SIGNER_GROUPS` in `src/data/network.ts` is the ONE
home for their words). A metagraph seals every snapshot with its **own L0 cluster**, so the proof signer
set IS that cluster — DOR's is the same 3 machines every time, out of 20. Its **data blocks** are produced
by the **dL1 cluster**, each block by a rotating subset, so that count varies per snapshot and is 0 when a
snapshot carries none. The third group is the **global** snapshot's own proof, which is the same thing one
storey down: the DAG's own L0 cluster. A bare "signed by 3" against a 20-machine fleet reads as a bug, so
every signer surface (the two snapshot cards, the raw layer's SIGNERS lane, the ledger panel's list) names
the producing layer beside the count from that one constant. The ledger panel can only ever show the PROOF
group — data-block signers exist solely in the ~2.5 MB deep read, which browsing must never trigger.

**The two snapshot cards are ONE shape** (user, 2026-08-10 — "global has no signed table, just a count"):
lead → the payload block with its bars → `Fees paid` (DAG over `N KB anchored`) → the signer
COUNTS → foot. The global card composes its lead as a body row; the metagraph card's lead moved INTO its
head (above), so its body opens straight on the payload. So the metagraph card's own signer TABLE is
gone: a list whose first column was a CITY
said cities sign, it sat at equal weight below the facts with nothing dividing it, and it put the
secondary fact first. The good version already lives one tier down in the raw layer's SIGNERS lane, which
is what the card's "Show the application state" link opens — the card states the SHAPE, the pane renders
the payload. The named cost is the card's signer↔tray hover pairing; the Engine's signer glow on
selection is separate and unaffected. The card gains `Blocks by N dL1 validators` beside
`Signed by N L0 validators`, because the user's question — "general signing is L0 validator, and data
updates are separate and have separate signers as dL1's?" — is exactly right, and two counts of two
different things need two labelled lines.

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
"reading…"; a FAILED read records `store.exactMiss` and the card terminates on an honest word (never
a hang — the acquiring give-up rule above).

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
  (immutable; a transient upstream failure throws so it retries). It's called for the live and
  selected tick only — never the whole chain, never a poll loop — plus a one-time paced backfill on a
  cold load, because the trail otherwise opens with its unmeasured rows drawing no bars. Each ordinal
  is immutable and cached, so the backfill costs at most once per ordinal ever.
- **`/api/snapshot/[ordinal]/channel/[address]`** is the deep read behind the metagraph-snapshot card's
  third tier: it re-downloads the same ~2.5 MB global to reach ONE channel entry. The cost is accepted
  deliberately — cached immutably and run only from the two surfaces that ask for it (the card's
  `Read this snapshot` button, and arrival in the raw layer), never on a
  poll, never across the chain. The key includes **the snapshot's own ordinal**, because a fast
  metagraph batches dozens into one tick and a (tick, address) key would make every row share one
  decode. **A deterministic miss (the channel provably isn't in this immutable global) is cached
  like a success** — throwing it made every repeat of the same bad `(ordinal, address)` re-download
  the whole global, an anonymous amplification loop; only transient failures throw and retry.

⚠️ **Both snapshot routes are bounded by `app/api/snapshot/ordinalWindow.ts`.** The L0 LB serves the
**entire ordinal history** (verified 2026-08-13 — the old "prunes after ~30 min" belief is false), so
without a bound the ~6.7M-ordinal space is an anonymous walk of cold ~2.5 MB pulls, decodes and
day-long data-cache writes, with no rate limiting on Hobby. The window is deliberately ~100× the
client's deepest legitimate ask and **fails open** when its tiny latest-ordinal reference read fails —
the route's own upstream fetch is about to fail honestly on the same host anyway.
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
  3 hybrid nodes; DOR is the outlier with 3 hybrid + 19 dedicated dL1 nodes.
- ⚠️ **A peer id belongs to a LAYER, not to a machine** — each layer process runs its own keypair, so a
  hybrid answers with a different id on its l0 port than on its dl1 port (verified live 2026-08-09).
  `/api/metagraphs` therefore emits **`NodeInfo.ids`**, every layer's id for that IP in LAYERS order
  (`ids[0] === id`, the primary), and **signer matching reads `ids`, never `id` alone** — one matcher in
  `src/data/network.ts`, kept the only one by `src/data/signerMatchBoundary.test.ts`, because a local
  prefix compare looks like an ordinary string test and reintroduces the blind spot for that surface
  alone. Matching the primary only left every hybrid data-block signer rendering as `not in live set`
  while the machine sat right there in the list — the id set is per layer and so are the signatures.
- **cL1 is never a standalone node** — every cL1 node is also an L0 node, so the outer cL1
  shell is effectively always empty.
- **A metagraph has a real token only if it runs a cL1 cluster.** The `symbol` field is
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
