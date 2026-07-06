# Constellation Hypergraph — 3D Network Visualizer

An interactive, real-time 3D map of the **Constellation Network ($DAG)** built with
[Three.js](https://threejs.org). It visualizes the network's fundamentals so anyone
can understand how it works and why it's powerful:

- **Global L0** — the glowing core. The Hypergraph's security & settlement layer.
- **L0 validators** — the consensus ring running PRO (Proof of Reputable Observation).
- **L1 nodes** — the outer shell, validating transactions & data and feeding them up to L0.
- **Global snapshots** — the cyan DAG spine. **Real, live** snapshots stream in from
  mainnet and chain to their parent, showing the Directed Acyclic Graph grow.
- **Metagraphs** — the orbiting clusters are the **real mainnet metagraphs**. Independent
  networks (their own L0+L1, token and rules) that anchor their state into the Global L0,
  each pulling **live** snapshots. Switch to the globe and a metagraph's hub bursts into its
  real validator nodes, which fly out to their true geographic locations.

## Features

- Live data from the public Constellation block-explorer API (no backend / API key needed).
- **Real validator sets** — fetches the actual Global L0 (~160) and DAG L1 (~160) clusters
  and renders every node, colored by live state (Ready vs. syncing).
- **Views** (three drive the 3D scene; the rest are flat):
  - **Hypergraph** — the abstract architecture: the core, the DAG's own validator shells, and
    each metagraph as an orbiting hub with its **own L0 / data-L1 / currency-L1 nodes** in
    concentric shells. The DAG is modelled as just another **metagraph-shaped core** (one unified
    node model — a node is *hybrid* or *dedicated*, never a separate "L0 cluster" vs "L1 cluster").
    Smoothly **morphs** into the globe (the core grows out into the Earth).
  - **Node geography** — a 3D globe with every node plotted at its **real geographic location**
    (solid raised continents from world-atlas land data, with glowing coastal cliffs), a density
    heatmap and travelling-packet connection arcs. The top-bar filter isolates the DAG core or any
    single metagraph; the country→nodes explorer then drills into a single country. Selecting one
    rotates + zooms the globe to wherever its nodes are densest.
  - **Snapshots** — the ledger-over-time view: a 3D "settlement chamber" stacking the network's
    validation layers as glass floors, with the live global snapshot centre-stage, a left-trailing
    chain of completed snapshots, each metagraph's lane of anchored snapshot tiles, and travelling
    anchor pulses. A slim **live heartbeat strip** (one bar per snapshot, height = anchors) runs
    along the bottom of every view.
  - **Network status**, **Transactions**, **Delegated staking** — scaffolded **placeholders** for
    upcoming views (health/uptime, money-flow + transaction lookup + economics, and
    staking/rewards), each shown as a faint blueprint schematic labelled
    `preview · in development`.
- Stays **factual** if the network is offline — shows a "NO DATA" state and recovers on
  the next successful poll (no simulated/placeholder data).
- Glowing, bloom-lit scene with depth-of-field focus and orbit controls (drag / zoom).
- Hover any element for a tooltip; **click** for an inspector with real on-chain values —
  a metagraph's token, layers, node make-up and website (dossier) alongside a **live
  activity** card (snapshot cadence, average fee, share of anchors), and each node's role
  (**hybrid** vs **dedicated** L0 / data-L1 / currency-L1). In the globe view a **node
  browser** lists the selection's nodes (grouped by country) so you can reach any node's
  data without hunting for a dot.
- A per-view "About" card explains what each view shows; the top bar carries view-specific
  vitals (structure / footprint / live activity with inline sparklines — snapshot ordinal &
  height live in the click inspector).
- **Honest anchoring.** Each global snapshot reports how many metagraph snapshots it *anchored*
  (its authoritative total) and the card breaks that down per metagraph. Because metagraphs
  anchor into a tick over a few seconds *after* it appears, the freshest tick's breakdown is
  shown as **"settling…"** until it stabilises — the live total is always real, never a guess
  (in keeping with the project's no-fabricated-data rule).

## Design language

The HUD is four fixed zones over the canvas, each with **one role** that holds in every
view, so switching views never relearns the screen:

- **Top** — the command bar: status + the global network filter (persists across views) +
  the view switch + view-specific vitals.
- **Right rail** — **facts on demand**, a stack of selected-subject cards: a **Context**
  dossier (the filtered metagraph) above the **Detail** cards (the view's signature — node
  card, snapshot card). Each opens with a role eyebrow (`Selected network / node / snapshot`).
- **Left rail** — explore & interact: a collapsed "About this view" card above the view's own
  tool (Geography → the country→nodes explorer; Snapshots → the layer explainer). One shared
  card header and collapse affordance everywhere.
- **Bottom** — the **live/time lane**: the slim heartbeat strip, in every view.

The three live views are **complementary projections of the same network** — each answers an
orthogonal question and owns one "signature" detail card, so the views never overlap:

| View | Question | Explore tool (left rail) | Signature (detail) slot |
|------|----------|--------------------------|-------------------------|
| **Hypergraph** | *who / what* — architecture + economic weight | *(none — the dossier + node card carry the structure)* | **Node card**; structure counts live in the top-bar vitals |
| **Node geography** | *where* — footprint & decentralization | country→nodes explorer (the selection's nodes, grouped by country) | **Node card** (state, roles, location) |
| **Snapshots** | *when* — how the ledger advances + cost | the layered-design explainer | **Snapshot card** (DAG position, anchors, fees) |

The global **snapshot card is scoped to the ledger view** (its home) — hyper/geo never inject
one; clicking a tick in the slim strip jumps to the ledger and opens it there.

Visual uniformity is enforced with shared design tokens in one stylesheet (`app/globals.css`):
one spacing scale, one panel radius, one "selected" treatment (`--sel-bg` / `--sel-border`),
and one `CardHead` header component on every card. The live styleguide is served at `/design`.

**`globals.css` is the single source of truth for colour — even in the 3D scene.** The Three.js
engine doesn't hardcode structural colours; at start-up it reads the CSS design tokens
(`--primary`, `--core-l0`, `--core-l1`, `--background`) and threads them into every scene module,
so the WebGL views and the HTML HUD always match. A `vitest` guard
(`src/engine/noHardcodedColors.test.ts`) fails the build on any stray colour literal in the scene
layer, keeping the palette honest.

## Node geography & metagraph nodes

The globe plots validators and metagraph nodes at their real geolocations.

- **Validators** — `/api/geo` serves a baked IP→location seed (`data/geo.json`) so the map
  plots instantly; IPs not in the seed are resolved at runtime (best effort, remembered in
  `localStorage`).
- **Metagraph nodes** — their cluster endpoints are plain HTTP on custom ports with **no CORS**,
  so the browser can't fetch them. **`/api/metagraphs` does it server-side** (the Node server
  can): it lists the [dagexplorer directory](https://production.dagexplorer-api.constellationnetwork.net/mainnet/metagraphs),
  reads each `<lb>/cluster/info` for nodes, geolocates the IPs, and returns them — cached with
  ISR and re-pulled by the client every ~10 min. (Falls back to the baked `data/*.json` if the
  live fetch fails.)

`scripts/bake-*.py` still produce the `data/*.json` seed/fallback but are no longer required for
normal operation — the routes fetch live.

## Run it locally

A **Next.js** app (React + TypeScript) driving a vanilla Three.js engine. Needs Node ≥ 18.18.

```bash
npm install
npm run dev      # http://localhost:3000
```

## Host it online

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdigitaltwinnn%2Fdag-visualizer)

**Vercel** is the intended host (any Node host works — `npm run build` / `npm start`).
Import the repo in Vercel ("Add New… → Project"); it auto-detects Next.js and **needs no
environment variables**. The `/api/metagraphs` and `/api/geo` routes run server-side (the
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
Browser ──poll──> Constellation block explorer API   (snapshots / clusters / prices)
   │                                                       │ events
   │                                                       v
   │   NetworkData ──┬─► Engine (vanilla Three.js, 60fps, never re-rendered by React)
   │                 └─► Zustand store ──► React panels (header, ribbon, filter, inspector…)
   │
   └── Next routes (server-side): /api/metagraphs (live cluster fetch + geo, ISR)
                                  /api/geo (validator geo seed)
```

## Layout

| Path | Purpose |
|------|---------|
| `app/` | Next App Router — `page.tsx` (mounts panels + canvas), `globals.css`, `api/{metagraphs,geo}/route.ts` (server-side data) |
| `components/` | React panels (SceneCanvas, `TopBar` (status + filter + view switch + vitals), ExploreRail, Inspector, ContextCard, Tooltip, FollowController, …); `CardHead` (the shared card header), `BottomStream` + `LiveStrip` (the bottom heartbeat strip) + `useSnapshotFeed` (shared live feed), `GeoExplore` (geo country→nodes explorer), `Blueprint` (scaffolded-view schematics); `components/inspector/` holds the inspector cards |
| `src/store/store.ts` | Zustand store (the React↔engine command/state bridge) |
| `src/data/` | `network.ts` (wraps `NetworkData`), `follow.ts`, `types.ts` |
| `src/util/format.ts` | Shared formatters — `hex` (colour), `fmtDag` (fee) |
| `src/engine/` | `Engine.ts` (imperative Three.js engine: render loop, morph, camera focus, DoF, picking) + `boundary.ts` (types for the vanilla `js/*` modules it drives) |
| `js/*.js` | Reused vanilla Three modules driven by the engine: `scene`, `layers`, `globe`, `background`, `api` (live data), `config`, `geo` |
| `scripts/bake-*.py` | Optional offline seed/fallback for `data/*.json` (the routes fetch live) |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
