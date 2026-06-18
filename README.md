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
- Automatic, seamless fallback to a realistic **simulation** if the network is offline.
- Glowing, bloom-lit scene with depth-of-field focus and orbit controls (drag / zoom).
- Hover any element for a tooltip; **click** for an inspector with real on-chain values —
  including a metagraph's token, layers, node make-up and website, and each node's role
  (**hybrid** vs **dedicated** L0 / data-L1 / currency-L1).
- A "Learn" panel and a **guided tour** that flies the camera through L0 → L1 → metagraphs.
- Live stats: latest snapshot ordinal, height, validator counts, active metagraphs, snapshots/min.

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

Deploy to **Vercel** (or any Node host) — `npm run build` / `npm start`. The
`/api/metagraphs` and `/api/geo` routes run server-side (the Node server reaches the
no-CORS metagraph cluster endpoints a browser can't). The block-explorer API is polled
directly from the browser. No CDN dependencies.

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
| `components/` | React panels (SceneCanvas, StatsHeader, SnapshotRibbon, ViewToggle, LeftColumn, Inspector, Tooltip, FollowController, …) |
| `src/store/store.ts` | Zustand store (the React↔engine command/state bridge) |
| `src/data/` | `network.ts` (wraps `NetworkData`), `follow.ts`, `types.ts` |
| `src/engine/Engine.ts` | Imperative Three.js engine: render loop, morph, camera focus, DoF, picking |
| `js/*.js` | Reused vanilla Three modules driven by the engine: `scene`, `layers`, `globe`, `background`, `api` (live data), `config`, `geo` |
| `scripts/bake-*.py` | Optional offline seed/fallback for `data/*.json` (the routes fetch live) |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
