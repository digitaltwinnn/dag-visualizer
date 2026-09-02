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
| 4 | **Pure-module export coverage.** Every value export of a `domain/` or `src/data/` module is referenced by its sibling test. | `src/engine/domainExportCoverage.test.ts`, `src/data/dataExportCoverage.test.ts` |
| 5 | **Zero-allocation render loop.** No `new THREE.*`/`.clone()` in per-frame bodies unless marked `event-time`. | `src/engine/noFrameAllocations.test.ts` |
| 6 | **Scene-view contract.** Bespoke views implement `SceneView`; scene modules never compare `Mode` strings; framing math reads layout data, not rendered transforms; views never write their root `visible`. | `src/engine/scene/views/sceneView.test.ts`, `src/engine/sceneViewContract.test.ts` |

⚠️ Rule 4 reaches TWO directories and is not the same rule in both. `domain/` is pure by
construction — rule 1 denies it react, the store and the addons — so its coverage needs no
exemptions. `src/data/` holds the live singleton and the geo cache alongside the row builders, so
`dataExportCoverage.test.ts` carries an explicit exemption list plus guards that keep it from
growing: a mechanical purity classifier was tried and rejected (its regex matched the words
"window" and "fetch" inside this repo's own comments), and the header records why.

Seven narrower boundary tests work the same way: `components/unlistedBoundary.test.ts` (the `"unlisted"`
id literal has exactly two homes), `components/railLadderBoundary.test.ts` (every committable focus
rung maps to a hinted rail card slot), `components/railTierBoundary.test.ts` (`data-focus` has two
homes and the slab's geometry — the pager included — keys on `data-tier`),
`components/cssTrapBoundary.test.ts` (CSS traps 3 and 6 — a `bg-[var()]` never points at a gradient
token, and every custom `text-*`/`tracking-*`/`rounded-*` token is registered with twMerge),
`components/publishChannelBoundary.test.ts` (the React→Engine publish channels are one-way and
single-publisher: `focusRung` is a fresh object bridged by reference, `sceneCover` is measured by
`RailDock` off an element ref and sided by the two rails, `boxedCard` is Inspector's alone),
`src/data/signerMatchBoundary.test.ts` (a peer-id prefix comparison lives only in `src/data/network.ts`)
and `src/engine/scene/rowBoundary.test.ts` (a scene module that places a ledger row consults the
trail's boundaries).

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
config changes or stale state. **Any edit to a LONG-LIVED SINGLETON needs a full page reload**, not
HMR — not just geometry built in constructors. A swapped module leaves the running instance on its
OLD methods, so you verify the previous build believing it's the new one. Reload after every such
edit.

⚠️ That is the engine and every `scene/` class — and it is also **`NetworkData` (`src/data/api.ts`)**,
which is the same shape: one instance, created once, holding the buffers. Cost real time twice on
2026-09-01, the second time as a user-reported "bug": a new `Activity` field was added in
`_metaActivity`, and the running singleton kept returning objects WITHOUT it, so a card that should
have read `idle` was repainted with the old value on every poll. The symptom is the tell — a
surface that renders correctly ONCE and is then "overwritten" on the next tick is a stale instance
serving a fresh render, not a state bug. Reload before you debug it.

⚠️ **Turbopack's persistent cache can serve a STALE `globals.css` compile, and it survives a plain
restart** — the chunk keeps one filename, so an old body ships under the same URL (found 2026-08-13:
the phone flight-dim rules were in the source for a day while the served chunk predated them, and
the "bug" was chased in the state machine first). When a rule is missing from the browser's CSSOM,
don't debug the cascade: kill the server, `rm -rf .next/dev`, restart.

⚠️ **AND IT REACHES PRODUCTION THROUGH VERCEL'S BUILD CACHE** (2026-09-01, a live incident on
dagvisualizer.io). A deploy shipped a MIXED bundle: a fresh class scan of the current TSX glued to a
`globals.css` compile from *before the branch began*. Both halves looked healthy on their own — the
source was correct on master, `tsc`, the tests and a local `next build` were all clean — so nothing
in the repo could have caught it.

**LEARN THE TELL, because the symptom points somewhere else.** It was reported as "the top/bottom
bars are displaced", which sounds like a layout bug. What had actually happened: the *utilities*
`inset-x-[var(--bar-margin)]` and `h-[var(--vitals-h)]` shipped intact while the `:root` block
defining those tokens did not, so both collapsed to `0` and the fixed bars lost their inset. So:

> **utilities present + their `:root` tokens missing = a stale stylesheet, not a layout mistake.**

Confirm it in one line — `getComputedStyle(document.documentElement).getPropertyValue("--bar-margin")`
returning `""` is the whole diagnosis — then compare the served chunk against the source rather than
reading the cascade. The fix is a redeploy with the build cache cleared (Vercel → Redeploy, "Use
existing Build Cache" UNCHECKED); the commit itself needs no change.

⚠️ **AND THERE IS DELIBERATELY NO RUNTIME CHECK FOR IT.** One was built and dropped (2026-09-02): a
canary that parsed the served stylesheet and asserted that every token a shipped utility references
is also defined by it. It worked — measured, it flagged exactly the three tokens that went missing
and nothing on a healthy build — but it was the wrong answer to this problem. It PREVENTS nothing,
and it ALERTS nobody: `console.error` reaches no monitoring, so a bad deploy is still found the way
this one was, by someone looking at the page. Against a remedy that is one redeploy, that is
machinery for its own sake. **The tell above is the whole fix** — it is what turned "the bars are
displaced" into a five-minute diagnosis, and it costs nothing to keep.

`next build` and `next dev` don't conflict (dev outputs to `.next/dev`), so the production check can
run alongside the dev server. Do it at phase boundaries: the build should be clean;
`/api/metagraphs` is `ƒ` (Dynamic — it reads `?net=`) and must answer with
`Cache-Control: public, s-maxage=300` so the CDN still caches it per URL.

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
- ⚠️ **Every scene clock is FRAME-driven off a `dt` clamped to 0.05s, so a slow renderer stretches it
  in WALL-CLOCK time** — and the HUD, being React, does not ride that clock. Below 20 FPS the clamp
  bites and the ~3.9s view choreography takes `3.9 / 0.05 / fps` seconds: at SwiftShader's 2–6 FPS,
  13–40s. So a headless screenshot taken 15s after a view switch catches the transition still
  running, and the panels beside it are already populated — **a bare ledger floor next to an explorer
  full of measured ticks is the renderer, not the feed** (chased as a data bug for most of a session,
  2026-08-19; `?slowmo=0.25` ran the same entry out in a quarter the time, which is what settled it).
  Wait ~30s after a headless view switch, or drive it with `?slowmo`. The clamp itself is right — it
  is the standard guard against a post-stall jump — and at real frame rates it never engages.
- Benign console noise: `mojo ... rejected`, `PHONE_REGISTRATION_ERROR`, `BackForwardCache`.

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
| `app/` | Next App Router. `globals.css` is **the one stylesheet**; `design/page.tsx` is the token reference; `about/page.tsx` is the project's own page — Instrument-Glass like the HUD, and the home of the **experimental disclosure** that used to be an always-on banner (retired 2026-08-09: a permanent banner over a live instrument reads as an alarm; the footer links here — the wordmark is plain unlinked chrome and the ECG opens the pulse strip, both 2026-08-30. On phone the footer rides ABOVE the dock — user decision 2026-08-31, keeping /about reachable on every tier — with `--footer-h` still zeroed there, since the row is overlay chrome that reserves nothing). `--warn-soft` is its amber (shared with the raw layer's JSON booleans and the pulse strip's STALE dot). `api/*` are the server-side data routes. |
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

### Two lighting systems: the RIG blends, the STAGE LIGHT claims

**The rig is the scene's own key/fill/rim** (`domain/sceneRig.ts` + `scene/objects/SceneRig.ts`) —
an ambient plus three DIRECTIONALS, per-view rows blended by the same presences the stage light's
claims are scaled by. Directional is the design, not a detail: a point light inside the field lights
every node from a different direction, so the population never resolves into one lit scene and every
sphere reads as a flat disc. The fill is directional for the same reason — ambient lifts every face
equally, which is the flatness the rig exists to undo. **Aimed from the CAMERA** (the studio
convention: the rig follows the actor), so orbiting can never swing the lit side out of view;
elevation follows the camera's PITCH as a delta from the view's resting pitch
(`domain/cameraRig.restPitch`) — byte-identical at the resting poses the rows were tuned on, and a
dive or vertical orbit carries the whole rig, the geo sun included (was world-absolute, which died
at any pose off the resting pitch — user, 2026-08-30). **A light is a TEMPERATURE, not a palette hue** — rows carry a −1…+1
axis resolved by `tempTint`, which is why lighting owns no colour literal and no allowlist entry.
`RIG_PAPER` takes every channel down on the light ground (ambient hardest, key least): a ~0.8-L page
is its own bounce card, so on paper the rig narrows to FORM and presence keeps riding the ink system.
⚠️ When every view's weight is ~0 the blend HOLDS the last frame — normalising a zero would black the
scene out at the gather boundary.

**The geo row's key IS the globe's SUN** — one vector, two consumers (`GeoViewHost.sunUniform`), so a
chip's lit side and the surface's day side can never disagree. Camera-relative by construction, which
is deliberate: the globe spins to face a selection, and a geographically-honest sun that left the
viewed hemisphere dark would be the wrong kind of honest. Both grounds shade through one expression
with opposite numbers, because they are opposite substances — dark is emitted light (the day side
glows more), paper is ink (a lit face carries LESS of it) — and the channel follows the substance:
dark shades colour, paper shades presence.

**The chips mirror a stock studio environment** (2026-08-30): `SceneContext.nodeEnv` bakes three's
own `RoomEnvironment` once (PMREM, sigma 0.35 — the lamps SMEARED so no grazing view can spike the
bloom; found live as a vertical bloom gradient on the parked grids and a bottom-front flash),
`envMapRotation` aims the lit ceiling at the resting ~40° camera, and `NodeFabric.ENV_INT` states
the per-ground intensities. Per-view gain rides `viewPolicy.chipEnv` — the ledger runs HALF: its
coplanar trays mirror the env in unison and wash at full sheen, but zero went bland and cut the
chips' selective-bloom feed (both user-corrected the same day). Flipped at the transition BOUNDARY
for 3D↔3D (the setSimFlags rule — parked chips are in plain view), at switch time only on the
flat park path. The spheres skip the env — hyper's orb look is fresnel-carried.

### The stage light claims, it is never switched off

There is ONE `THREE.SpotLight` for the whole app (`scene/objects/StageLight.ts`). The Engine sets its
per-view presence each frame *before* the view updates; a view that wants it calls `claim(view,
subject, …)` and the strongest claim wins; `update(dt)` stages from `STAGE_LIGHTS[claimed]`, eases,
then **releases the claim**. So **not claiming IS off** — there is no `spotOff` to forget, which is the
bug class the previous per-view-light + registry arrangement kept guarding against. A view's presence
is already applied centrally, so a claim must not multiply by its own fade again.

`StagedView` (`domain/stageLight.ts`) is the type that says which views stage a light, and the `?tune`
panel builds a spotlight folder only for those — since the day-look work all three 3D views stage one;
the ledger's claim is **paper-only** (its dark chamber stays lit by its own glass and emissive
snapshots, and emphasis there is the four colour dim tiers — on paper those need the lobe's help, see
the lamp rule below). Claiming
for an unstaged view is a compile error, not a silent no-op.

**The claim follows the LADDER, and there is ONE claim per view.** Hyper's subject is the staged
NODE, else its hub, else the DAG core — the same coarse→fine order every other emphasis follows; the
node branch is an *else-of*, not a second claimer, because a node select commits its network too and
two claims would decide the light by call order instead of by the ladder. The subject is the HOVERED
node when there is one, else the committed one (hover previews at emphasis strength, like the dim and
the glow) — deliberately NOT the callout's rule, which mirrors the box and so only moves on a commit.
The anchor is layout data: `Globe`'s one `_hyperAnchorOf`, shared with the callout. Hyper stages three
subjects at three scales from one row, so a node carries its own `heightNode`/`angleNode` — the finer
the subject, the lower and tighter its stage.

⚠️ **A LAMP IS NOT THE SAME INSTRUMENT ON BOTH GROUNDS.** Dark blooms the wash a claim lays on an
emissive node; paper does not bloom it at all (the whole-frame pass is skipped there — see `src/theme/CLAUDE.md`),
so the identical claim reads as nothing there —
and pushed far enough it desaturates the ink toward white, which is the ink lane failing rather than
emphasis working. Rows state `intensityPaper` between those two measured ends, and the test pins the
DIRECTION (a paper level is always higher), never the numbers. The ledger is exempt by construction:
its claim is paper-only, so its one `intensity` already is its paper number.

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

## Where the rest of this lives

The detail below moved out of this file on 2026-08-31 so a session pays for it only when it is
working in that area. Each is a `CLAUDE.md` in the directory it describes — **read the one for the
area you are touching before you change anything there**; they carry the same authority as this
file, and the rules above govern them.

| Area | File | Covers |
|---|---|---|
| React HUD | `components/CLAUDE.md` | the four-zone shell, the slab/card grammar, Instrument-Glass, CSS traps, the subject callout |
| Three adapters | `src/engine/scene/CLAUDE.md` | nodes/layers/the filter, and the whole Snapshots chamber |
| Pure logic | `src/engine/domain/CLAUDE.md` | the 3D↔3D transition, selection semantics |
| Engine | `src/engine/CLAUDE.md` | live look-tuning under `?tune` |
| Data layer | `src/data/CLAUDE.md` | the snapshot stream, anchoring & fees, the tick lifecycle |
| Networks | `src/net/CLAUDE.md` | `?net=` and the three networks |
| Theme | `src/theme/CLAUDE.md` | light/dark and the ground questions it forces |
| Server routes | `app/api/CLAUDE.md` | every `/api/*` route and its caching |

⚠️ If a rule here and a rule there disagree, the area file is the more specific and wins for that
area — but a rule in **The rules** above is global and never overridden locally.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
