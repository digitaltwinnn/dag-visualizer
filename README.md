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

## Node geography & IP geolocation

The globe plots validators using `data/geo.json`, a baked IP→location cache so the map works
instantly and offline. Validators not in the cache are resolved at runtime (best effort) and
remembered in `localStorage`.

To refresh the cache (e.g. after the validator set changes), re-run the bake — it fetches the
live clusters and geolocates every IP:

```bash
python3 scripts/bake-geo.py
```

## Metagraph nodes on the map

Metagraph node locations aren't exposed by the block-explorer API, so they're baked too. The
[dagexplorer API](https://production.dagexplorer-api.constellationnetwork.net/mainnet/metagraphs)
lists every mainnet metagraph and its own L0 / L1 load balancers; each metagraph runs its own
cluster, so `<lb>/cluster/info` returns its validator nodes (with IPs) just like the Global
clusters. The bake reads them, geolocates the IPs, and writes `data/metagraphs.json` (and merges
the IPs into `data/geo.json`):

```bash
python3 scripts/bake-metagraphs.py
```

Metagraphs whose cluster is temporarily unreachable are simply skipped (no nodes plotted for
them until the next bake). These endpoints are plain HTTP on custom ports with no CORS, so they
can't be fetched from the browser — baking is what makes the data usable and offline-ready.

## Run it locally

No build step and no Node required — it's a static site. From this folder:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000** in a browser.

> It must be served over HTTP (not opened as a `file://` URL) because it uses ES modules.

## Host it online

Upload this folder to any static host — GitHub Pages, Netlify, Vercel, Cloudflare
Pages, S3, etc. Three.js loads from a CDN via an import map, so there are no
dependencies to bundle.

## How the data flows

```
Constellation block explorer API
  /global-snapshots            -> Global L0 DAG spine
  /global-snapshots/latest     -> live polling for new snapshots
  /currency/{id}/snapshots     -> per-metagraph snapshots (e.g. El Paca)
        |
        v
   api.js (NetworkData)  --events-->  layers.js + globe.js (3D)  +  ui.js (panels/stats)
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell, import map, UI overlay |
| `styles.css` | Glassmorphism UI styling |
| `js/config.js` | API base, colors, metagraph registry, visual tuning |
| `js/api.js` | Live data client + simulation fallback |
| `js/scene.js` | Renderer, camera, controls, depth-of-field + bloom |
| `js/background.js` | Procedural skydome (grid in Hypergraph, stars on the globe) |
| `js/layers.js` | Hypergraph furniture: the L0 core + orbiting metagraph hubs |
| `js/globe.js` | Shared validator + metagraph nodes, globe surface, heatmap, arcs |
| `js/geo.js` | Baked geo cache + runtime IP geolocation |
| `js/stream.js` | The live snapshot ribbon |
| `js/ui.js` | Hover/click inspector, panels, filters, tour, stats |
| `js/main.js` | Wires data → scene → UI, render loop |

---

*Built as an educational visualization. Data is read-only from public endpoints.*
