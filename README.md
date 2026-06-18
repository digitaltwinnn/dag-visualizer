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
- **Three views:**
  - **Hypergraph** — the abstract architecture: the core, the L0/L1 validator shells, and
    each metagraph as an orbiting hub with its **own L0 / data-L1 / currency-L1 nodes** in
    concentric shells. Smoothly **morphs** into the globe (the core grows out into the Earth).
  - **Node geography** — a 3D globe with every validator and metagraph node plotted at its
    **real geographic location** (continents from world-atlas data), a density heatmap and
    travelling-packet connection arcs. A **Filter network** panel isolates the Global L0, DAG
    L1, or any single metagraph; the **Nodes by country** list then drills further into a
    single country. Selecting one rotates + zooms the globe to wherever its nodes are densest.
  - **Snapshot DAG** — a placeholder for an upcoming ledger-over-time view (work in progress).
- Stays **factual** if the network is offline — shows a "NO DATA" state and recovers on
  the next successful poll (no simulated/placeholder data).
- Glowing, bloom-lit scene with depth-of-field focus and orbit controls (drag / zoom).
- Hover any element for a tooltip; **click** for an inspector with real on-chain values —
  including a metagraph's token, layers, node make-up and website, and each node's role
  (**hybrid** vs **dedicated** L0 / data-L1 / currency-L1).
- A "Learn" panel and a **guided tour** that flies the camera through L0 → L1 → metagraphs.
- Live stats header: validator counts, public metagraphs, and per-hour snapshots / anchors /
  fees with inline sparklines (snapshot ordinal & height live in the click inspector).

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
| `components/` | React panels (SceneCanvas, StatsHeader, SnapshotRibbon, ViewToggle, LeftColumn, Inspector, Tooltip, FollowController, …); `components/inspector/` holds the per-kind inspector cards |
| `src/store/store.ts` | Zustand store (the React↔engine command/state bridge) |
| `src/data/` | `network.ts` (wraps `NetworkData`), `follow.ts`, `types.ts` |
| `src/util/format.ts` | Shared formatters — `hex` (colour), `fmtDag` (fee) |
| `src/engine/` | `Engine.ts` (imperative Three.js engine: render loop, morph, camera focus, DoF, picking) + `boundary.ts` (types for the vanilla `js/*` modules it drives) |
| `js/*.js` | Reused vanilla Three modules driven by the engine: `scene`, `layers`, `globe`, `background`, `api` (live data), `config`, `geo` |
| `scripts/bake-*.py` | Optional offline seed/fallback for `data/*.json` (the routes fetch live) |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
