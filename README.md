# DAG Visualizer — live 3D map of the Constellation Network

**Live at [dagvisualizer.io](https://dagvisualizer.io)**

An interactive, real-time 3D map of the **Constellation Network ($DAG)** built with
[Three.js](https://threejs.org). It visualizes the network's fundamentals so anyone
can understand how it works and why it's powerful.

## Features

- Live data from the public Constellation block-explorer API — no API key, and no backend for the 3D views.
- **Views** using ThreeJs to drive the 3D scene
- A per-view **About** row in the command bar explains what each view shows
- Hover any element for a tooltip; **click** for an inspector with real on-chain values and other details alongside **live
  activity** cards
- A bottom **vitals band** carries each view's own instruments — donut, micro-bars,
  sparklines and the snapshot bar-chart — and the top-bar heartbeat opens a **pulse strip**
  showing every data feed's last successful poll.
- The **History** view (`/trends`) shows the network's measured history as the scene itself —
  one chart plane per network, receding into depth, with a shared time cursor reading every
  chain at the same moment and a scrubbable timeline along the bottom. Brush a range and its
  card states the span; click an instant and its card reads every network at that moment.
  Daily, hourly and 5-minute buckets, all
  reaching the same mid-2025 floor (`TIER_SINCE` in `src/data/trendWindow.ts`), summed from
  the chain's own records into an Upstash Redis timeseries by a 15-minute cron (the other
  three views need no backend at all; only this history does).
- A **RAW** toggle drops from the scene into the records themselves: the node roster in the
  Hypergraph and Geography views, and the snapshot log — every network's chain back to genesis,
  merged by time under All, searchable by snapshot, global snapshot or date — in Snapshots. In
  History it opens the snapshot records for the span on screen.

## Design language

**Three depths, one subject — the observation ladder.** Everything the site shows is the same
network at one of three depths: the **3D scene** is the live instrument (what is happening right
now), the **measured history** is what the chain's own records say happened, and the **raw data
layer** is the record-level microscope (the snapshots themselves, back to genesis). The middle
depth is the History view's chart planes, and its RAW toggle steps down to the records for the
span on screen. Each step down is one deliberate gesture that carries its context with it — zoom a chart into a
range and you can hand that exact range to the snapshot search. The depths complement each other
on purpose: history grows coarser the further back you look, precisely where the record microscope
stays exact.

The HUD is four fixed zones over the canvas, each with **one role** that holds in every
view, so switching views never relearns the screen:

- **Top** — the command bar: the heartbeat (pulse strip) + the global network filter +
  the view switch + the view's About row + presentation/theme/network controls.
- **Left rail** — explore & interact: the view's explorer card
- **Right rail** — facts on demand: a stack of selected-subject cards.
- **Bottom** — the **vitals band**: per-view instrument cards (the ledger keeps the snapshot bar-chart as one of them); in History the same band holds the timeline you scrub

**Cards tell the story, not a static record.** A card is its subject *as seen from the current
scene*: the same facts, redistributed to lead with what the context makes relevant. Select a node
in the Snapshots view and its card head states the relation to the pinned snapshot ("signed", with
the layer chip) while the status steps down to a body row; committed ancestor cards absorb the
facts they state better (a node under a committed country drops its Country line — the country card's
title says it); and the in-scene callout label follows whichever card you expand, exactly as the
camera does. Nothing is duplicated, nothing is lost — the presentation follows the story's state.

The four live views are **complementary projections of the same network** — each answers an
orthogonal question and owns one "signature" detail card, so the views never overlap:

| View | Question | Explore tool (left rail) | Signature (detail) slot |
|------|----------|--------------------------|-------------------------|
| **Hypergraph** | *who / what* — architecture + economic weight | Network breakdown (networks → compositions → nodes, with a measure heading) | **Node card**; structure counts live in the bottom vitals band |
| **Node geography** | *where* — footprint & decentralization | Country breakdown (countries → city · provider cohorts → nodes) | **Node card** (state, roles, location) + country / provider cards |
| **Snapshots** | *when* — how the ledger advances + cost | Snapshot breakdown (global ticks → networks in a tick → their snapshots → signers) | **Snapshot card** (DAG position, anchors, fees) |
| **History** | *how it changed* — the measured past | Network breakdown (one chart plane per network plus the unlisted channels, the measure as its heading) | **Range card** (a brushed span) over the **Moment card** (every network read at one instant) |

Visual uniformity is enforced with shared design tokens in one stylesheet (`app/globals.css`):
one spacing scale, one panel radius, one "selected" treatment (`--sel-bg` / `--sel-border`),
and one `CardHead` header component on every card. The design tokens (colour lanes + type
scale) live in that one stylesheet, and the running app is their reference.

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

`/api/metagraphs` caches its live fetch for 5 min (`unstable_cache`) with a `maxDuration`
budget and a concurrent cluster fan-out, answering an honest 503 if the upstreams are down
(the client keeps its last good pull). The **trends backend** additionally needs the Upstash
Redis marketplace integration and a `CRON_SECRET` env var: a 15-minute **Vercel Cron** samples
the chain into tiered timeseries. Crons fire on the **production** deployment only — a PR
preview renders the /trends charts read-only from the shared store and cannot write to it
(the sampler fails closed without its secret). Real-user metrics come from **Vercel Speed
Insights + Analytics**, and
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
                                  /api/snapshot, /api/network (the raw records)
                                  /api/trends (tiered history out of Upstash Redis)

Vercel Cron ──15 min──> /api/trends/sample ──> Upstash Redis (5m/1h/1d buckets) ──> /trends
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
isolation. `scene/` owns meshes and GPU writes; it reads domain, never the store. The engine
layer — `Engine.ts` and a named allow-list of its siblings in `src/engine/` — is the single
bridge: it subscribes to the store and translates state into scene commands.
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
`hoverNodeId`, `hoverSnapOrd`, `hoverMetaSnap`, `hoverCountry`, `hoverCohort`) — previews never
commit anything.

**7. Honesty over decoration.** Every bar, tile, count and border comes from live data;
absent data reads as an instrument state (NO SIGNAL, acquiring), never as fabricated numbers.

## Layout

| Path | Purpose |
|------|---------|
| `app/` | Next App Router — `page.tsx` (mounts panels + canvas), `[view]/` (the routed views: `/hypergraph`, `/geography`, `/snapshots`, `/trends`, `/soon`), `about/` (the doc overlay), `globals.css`, `api/*` (server-side data routes) |
| `components/` | React panels (SceneCanvas, `TopBar` (heartbeat/pulse strip + filter + view switch + presentation), ExploreRail, Inspector, ContextCard, Tooltip, FollowController, …); `CardHead` (the shared card header), `BottomStream` + `VitalsBand` (the bottom per-view instrument band) + `useSnapshotFeed` (shared live feed), `GeoExplore` (geo country→nodes explorer), `Blueprint` (scaffolded-view schematics); `components/inspector/` holds the inspector cards |
| `src/store/store.ts` | Zustand store (the React↔engine command/state bridge) |
| `src/data/` | `api.ts` (the live `NetworkData` singleton), `network.ts` (its accessors), `follow.ts`, `types.ts`, and the pure row builders and rules — the explorer's levels, the raw log's merge and search, the History windows and series |
| `src/net/` | The three networks (`?net=`), the catalog's address lineage and network retirement |
| `src/util/` | Shared formatters — `hex` (colour), `fmtDag` (fee) — and `localTime.ts` (day-only labels are UTC days; clock times are local with a zone tag) |
| `src/engine/` | `Engine.ts` (imperative Three.js engine: render loop, morph, camera focus, DoF, picking — the one store bridge) over `domain/` (pure, unit-tested layout/sim/policy logic) and `scene/` (the Three.js adapters: globe, hyper furniture, ledger chamber, node meshes) |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
