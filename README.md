# DAG Visualizer — live 3D map of the Constellation Network

**Live at [dagvisualizer.io](https://dagvisualizer.io)**

An interactive, real-time 3D map of the **Constellation Network ($DAG)** built with
[Three.js](https://threejs.org). It visualizes the network's fundamentals so anyone
can understand how it works and why it's powerful.

## Features

- Live data from the public Constellation block-explorer API (no backend / API key needed).
- **Views** using ThreeJs to drive the 3D scene
- A per-view "About" card explains what each view shows
- Hover any element for a tooltip; **click** for an inspector with real on-chain values and other details alongside **live
  activity** cards
- The top bar carries view-specific
  vitals (structure / footprint / live activity).

## Design language

The HUD is four fixed zones over the canvas, each with **one role** that holds in every
view, so switching views never relearns the screen:

- **Top** — the command bar: status + the global network filter +
  the view switch + view-specific vitals.
- **Left rail** — explore & interact: a collapsed "About this view" card and view specific explorer cards
- **Right rail** — facts on demand: a stack of selected-subject cards.
- **Bottom** — the **live/time lane**: the snapshot barchart

The three live views are **complementary projections of the same network** — each answers an
orthogonal question and owns one "signature" detail card, so the views never overlap:

| View | Question | Explore tool (left rail) | Signature (detail) slot |
|------|----------|--------------------------|-------------------------|
| **Hypergraph** | *who / what* — architecture + economic weight | nodes-by-network explorer | **Node card**; structure counts live in the top-bar vitals |
| **Node geography** | *where* — footprint & decentralization | country→nodes explorer (countries → provider cohorts → nodes) | **Node card** (state, roles, location) + country / provider cards |
| **Snapshots** | *when* — how the ledger advances + cost | settlement-layers explorer (floors disclose each lane's nodes) | **Snapshot card** (DAG position, anchors, fees) |

Visual uniformity is enforced with shared design tokens in one stylesheet (`app/globals.css`):
one spacing scale, one panel radius, one "selected" treatment (`--sel-bg` / `--sel-border`),
and one `CardHead` header component on every card. The design tokens (colour lanes + type
scale) are indexed at `/design`.

**`globals.css` is the single source of truth for colour — even in the 3D scene.** The Three.js
engine doesn't hardcode structural colours; at start-up it reads the CSS design tokens
(`--primary`, `--core`, `--background`) and threads them into every scene module,
so the WebGL views and the HTML HUD always match.

## Run it locally

A **Next.js 16** app (React + TypeScript, Turbopack) driving a vanilla Three.js engine. Needs Node ≥ 20.9.

```bash
npm install
npm run dev      # http://localhost:3000
```

## Host it online

**Vercel** is the intended host (any Node host works — `npm run build` / `npm start`).

The `/api/metagraphs` and `/api/geo` routes run server-side (the
Node server reaches the no-CORS metagraph cluster endpoints a browser can't); the
block-explorer API is polled directly from the browser. No CDN dependencies.

`/api/metagraphs` caches its live fetch for 10 min (`unstable_cache`) with a `maxDuration`
budget and a concurrent cluster fan-out, falling back to the bundled `data/*.json` if the
upstreams are down. Real-user metrics come from **Vercel Speed Insights + Analytics**, and
a social card is generated at `app/opengraph-image.tsx`. See `CLAUDE.md` →
*Deploying (Vercel)* for the full checklist (incl. the Pro-only extras to enable as
traffic grows).

## How the data flows

```
Browser ──poll──> Constellation block explorer API   (snapshots / clusters)
   │                                                       │ events
   │                                                       v
   │   NetworkData ──┬─► Engine (vanilla Three.js, 60fps, never re-rendered by React)
   │                 └─► Zustand store ──► React panels (header, ribbon, filter, inspector…)
   │
   └── Next routes (server-side): /api/metagraphs (live cluster fetch + geo, ISR)
                                  /api/geo (validator geo seed)
```

## Architecture rules

The codebase is held together by a small set of rules — six of them are *executable*
(vitest fails if they're broken), the rest are conventions the code and docs follow
everywhere. If you contribute (human or AI), these are the contract:

**1. The engine is three layers with one-way dependencies** *(enforced:
`src/engine/layerBoundaries.test.ts`; `domainExportCoverage.test.ts` requires every domain
export to be covered by its colocated test; the scene-view contract tests keep scene modules
mode-agnostic and views on the shared `SceneView` shape)*. `domain/` is pure logic and data —
layout math, simulations, decision tables, camera framings; it may use THREE's math classes
but never the scene, React, or store values, so every behaviour is unit-testable in
isolation. `scene/` owns meshes and GPU writes; it reads domain, never the store. `Engine.ts`
is the single bridge: it subscribes to the store and translates state into scene commands.
New logic goes into `domain/` with a test; the scene stays a dumb adapter.

**2. Selections have one write path** *(enforced: `components/selectionBoundary.test.ts`)*.
Every interactive surface — a 3D raycast click, an explorer row, a strip bar, a picker row, a
card's Clear-selection × — expresses intent through the same pure decision table
(`src/engine/domain/pickActions.ts`, where the per-view semantics and ordering rules live,
tested) and applies it through one executor (`src/store/applyClickActions.ts`). Components
never call selection setters directly, so the scene and the panels can't drift apart. The
rule is write-based: read-only cards cost nothing.

**3. Colours have one source of truth** *(enforced: `src/engine/noHardcodedColors.test.ts`)*.
The CSS design tokens in `app/globals.css` are canonical; the 3D engine reads them at boot
(`sceneColors.ts`) and no scene file may contain a raw hex colour outside a tiny documented
allowlist. Two colour lanes never mix: structural cyan is the sole affordance/accent signal,
and per-metagraph identity hues (generated deterministically in `src/palette/`) appear only
on subject marks — a metagraph is the same colour in the 3D scene, the filter picker, the
rail threads, and the cards, by construction.

**4. Per-view behaviour is an allow-list, not scattered ifs.** `domain/viewPolicy.ts` has one
row per view declaring what it turns on (canvas, sims, pickable pools, camera floors); a new
view is inert until its row opts in. The same idea repeats at smaller scales: the camera has
one home (`domain/cameraRig.ts`, including the global zoom lever), and the click semantics
one table.

**5. The render loop allocates nothing** *(enforced: `src/engine/noFrameAllocations.test.ts`)*.
Per-frame code reuses construction-time scratch objects; simulations communicate through
ring-buffer events their owning adapter drains — never by mutating another view's objects.

**6. The scene↔HUD hover pairing is sacrosanct.** Hovering a row glows the 3D object and
hovering the 3D object washes the row, through shared store channels (`hoverFilter`,
`hoverNodeId`, `hoverSnapOrd`, `hoverCountry`) — previews never commit anything.

**7. Honesty over decoration.** Every bar, tile, count and border comes from live data;
absent data reads as an instrument state (NO SIGNAL, acquiring), never as fabricated numbers.

## Layout

| Path | Purpose |
|------|---------|
| `app/` | Next App Router — `page.tsx` (mounts panels + canvas), `globals.css`, `api/{metagraphs,geo}/route.ts` (server-side data) |
| `components/` | React panels (SceneCanvas, `TopBar` (status + filter + view switch + vitals), ExploreRail, Inspector, ContextCard, Tooltip, FollowController, …); `CardHead` (the shared card header), `BottomStream` + `LiveStrip` (the bottom heartbeat strip) + `useSnapshotFeed` (shared live feed), `GeoExplore` (geo country→nodes explorer), `Blueprint` (scaffolded-view schematics); `components/inspector/` holds the inspector cards |
| `src/store/store.ts` | Zustand store (the React↔engine command/state bridge) |
| `src/data/` | `network.ts` (wraps `NetworkData`), `follow.ts`, `types.ts` |
| `src/util/format.ts` | Shared formatters — `hex` (colour), `fmtDag` (fee) |
| `src/engine/` | `Engine.ts` (imperative Three.js engine: render loop, morph, camera focus, DoF, picking — the one store bridge) over `domain/` (pure, unit-tested layout/sim/policy logic) and `scene/` (the Three.js adapters: globe, hyper furniture, ledger chamber, node meshes) |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
