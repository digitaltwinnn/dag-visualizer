# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing overview.

## What this is

An interactive 3D visualizer of the Constellation Network ($DAG) built with Three.js.
Three views, switched from the top toggle (`mode` in main.js: `hyper` | `geo` | `ledger`):

- **Hypergraph** — abstract architecture: a glowing Global L0 core, the DAG L0/L1
  validator shells around it, and the real metagraphs as orbiting hubs, each with
  its own L0/L1 nodes clustered around it in concentric shells.
- **Node geography** — a globe with every validator and metagraph node at its real
  geolocation, a density heatmap, travelling-packet connection arcs, and a shared
  "Filter network" panel.
- **Snapshot DAG** (`ledger`) — a **placeholder** for a future ledger-over-time view.
  Currently shows a stand-in tumbling wireframe cube; the hypergraph, globe and the
  skydome background are all hidden in this mode (main.js render loop), leaving just
  the live snapshot ribbon at the bottom as the seed of the real view.

Hyper↔geo **morph** smoothly (`morph` 0→1, eased each frame); the blue L0 core
literally **grows out into the globe** (layers.js) as the nodes fly to their map
positions. The `ledger` view doesn't morph (it sits at the hypergraph end, scene hidden).

## Run & test

No build step, no Node, no deps — Three.js (and stats.js) load from a CDN via the
import map in `index.html`. Static site, **must be served over HTTP** (ES modules
don't work from `file://`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

### Verifying visual changes (headless)

No test suite; verify by screenshotting in headless Chrome. WebGL needs the
SwiftShader flags or it fails with "Error creating WebGL context":

```bash
google-chrome-stable --headless=new --no-sandbox \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1600,1000 --force-device-scale-factor=2 --hide-scrollbars \
  --virtual-time-budget=11000 --screenshot=/tmp/shot.png \
  "http://localhost:8000/index.html#geo=DOR"
```

Gotchas that will save you time:

- **Deep links**: `#geo` opens straight in the globe view; `#geo=SYMBOL` (e.g.
  `#geo=DOR`) also pre-selects that metagraph filter (which rotates/zooms the globe
  to its nodes). Handy for one-shot screenshots of a known state.
- **`--virtual-time-budget` runs very few `requestAnimationFrame` frames**, so any
  *animation* barely starts. The idle spin, the morph, and especially the **camera
  focus tween (ui.js `_tweenTo`, 1.4s) and the globe focus spin (globe.js `spin`,
  1.3s) never complete in a one-shot screenshot** — you'll see the camera/globe at
  ~10% of the move. To verify a *settled* state, temporarily make them instant and
  revert:
  - camera: set the tween `dur` to `0.04`;
  - globe spin: append `this.group.rotation.y = from + d;` inside `focusDensest`;
  - or to inspect a specific globe face, set `this.group.rotation.y` directly.
- **Benign console noise to ignore** when grepping logs: `mojo ... rejected`,
  `gcm/... PHONE_REGISTRATION_ERROR`, `BackForwardCache`, and `Import Map: "...js"
  matches with no entries` (just local modules not being import-mapped).
- CDP / remote-debugging-port is blocked here — only one-shot `--screenshot` works;
  you can't click. Reach states via deep links + the snapping tricks above.

## Architecture (js/)

- `main.js` — entry point; wires data → scene/globe/UI, owns `mode` + `morph`, runs
  the render loop, drives the **depth-of-field focus** + the **ledger placeholder**
  (wireframe cube, hiding the scene), and hosts the stats.js FPS panel.
- `scene.js` — Three.js scene, camera (FOV 55), `OrbitControls` (damping on,
  autoRotate), and the postprocessing chain: **RenderPass → BokehPass (`dof`) → bloom**.
- `layers.js` — Hypergraph-only furniture: the Global L0 **core** and the orbiting
  metagraph **hubs** (from `config.METAGRAPHS`). The core is parented to the scene
  (not `layers.root`) so the morph can **grow it out to the globe's radius and
  dissolve it** as the Earth fades in. Hubs fade out early.
- `globe.js` — the biggest, most complex file. Owns the shared DAG validator nodes
  AND the metagraph nodes (sphere→disc instanced cross-fade), the globe
  surface/heatmap, the travelling-packet arcs, filtering/dimming, and the geo focus
  spin.
- `ui.js` — raycast hover/click inspector, the "Understand the network" learn panel,
  camera focus (`FOCI` presets + tweens), guided tour, the shared "Filter network"
  chips, the clickable **country leaderboard** + distribution score, and live stats.
- `stream.js` — bottom live snapshot strip. `api.js` — `NetworkData`: polls the
  block-explorer API, emits events, falls back to a simulation offline.
- `config.js` — API endpoints, colors, the `METAGRAPHS` list, `VIS` tuning, and
  `metaAnchor()` (hub orbit-slot math shared by layers.js and globe.js).
- `geo.js` — loads the baked geo cache and best-effort resolves missing IPs.
- `background.js` — starfield.

## Nodes, layers & the filter (the parts that bite)

- **Node meshes**: validators and metagraph nodes are **InstancedMesh**es with a
  patched smooth-shaded `MeshStandardMaterial` (`_makeNodeMaterial`) — each instance
  gets its own color (`aBase`) and animated glow (`aEmissive`). In the Hypergraph
  they're small **spheres**; on the globe they cross-fade to flat **discs**
  (`discFall()` fades them out toward the limb — needs the camera). Per-instance
  transforms via the shared `_dummy`. (They used to be cubes — don't reintroduce
  "box" naming.)
- **DAG L0/L1** are two fibonacci shells around the core. **Each metagraph** is laid
  out the same way around its hub: concentric shells **L0 inner → data-L1 (dl1)
  middle → currency-L1 (cl1) outer**. Metagraph nodes live in the rotating globe
  group but stay glued to their orbiting hub in the Hypergraph — `globe.js` converts
  the hub's live position into the group's local frame each frame. Keep that.
- A metagraph's hub color (config), its globe nodes, and its filter chip must stay
  the same color — matched by metagraph `id`.
- Co-located nodes are fanned out deterministically by `spreadCoLocated()`
  (phyllotaxis); the density ring encircles the cluster. Don't add random jitter.
- **Arcs are travelling packets**, not fixed lines: `_buildArcs` builds a swarm of
  comet "agents" that each hop node→node (pick a random node in the filter, fly a
  curved arc, flash it on arrival, pause, repeat). All share ONE `LineSegments` (one
  draw call); only their head/tail positions are rewritten on the CPU each frame,
  coloured per metagraph. Rebuilt on every filter change.
- **Filter network** (`#netfilter`, shared by hyper+geo via the `#leftcol` flex
  column). Everything routes through `ui.js _applyFilter`, which behaves per-view:
  - **Geography**: `globe.setFilter()` isolates/dims the selection, the leaderboard
    refreshes, and `globe.focusDensest()` rotates the globe so the **densest part of
    the selection faces the camera** (north stays up — Y rotation only) while the
    camera zooms **proportional to concentration** R = |mean of node dirs| (`_focusGeo`,
    via `FOCI.geo`): near-co-located selections zoom in subtly, spread ones stay wide.
  - **Country drill-down** (geo only): the "Nodes by country" rows are clickable and
    combine with the network filter (`globe.countryFilter` + eased `countryMix`;
    `_nodeActive(layer, geo)` gates on BOTH). Clicking a country dims everything
    outside it and flies to it; click again to clear; switching network clears it.
    The long tail folds under an expandable "Other" row (flag chips, no scrollbar).
  - **Hypergraph**: no dimming; `_focusFilter` flies the camera to the selected hub
    (using its **local/unscaled** position — `layers.root` is morph-scaled, so
    `getWorldPosition` would aim at the origin mid-morph), framed slightly off the
    radial line so the core sits to the upper-left. The hub's **orbit is paused while
    focused** (`layers.focusId`) so it stays framed, and a subtle **depth-of-field**
    (BokehPass, focus tracking the hub's live position) keeps it crisp while the rest
    softens. DoF runs **only in hyper with a metagraph selected** (main.js).
  - The selected network filter **persists across view switches** (held in `ui.filter`);
    the country drill-down is geo-only and cleared on view switch.

## Per-view behaviour — allow-list, not deny-list

When something should only apply in one view, **gate on the view it's for**, don't
exclude the views it isn't (a deny-list grows a line every time you add a view):

- **Picking** (`ui.js _pickablesFor(mode)`): a per-view registry returns the exact
  meshes that view raycasts; unlisted views (`default`) pick nothing. ⚠️ **Three's
  raycaster ignores `object.visible`** — hidden meshes are still hit — so you cannot
  rely on hiding a group to stop picking it; it must be left out of the registry.
- **Depth of field**: `dof.enabled = mode === "hyper" && <metagraph selected> && …`
  — an allow-list, so new views are DoF-free by default.

Same idea throughout: a new view is inert (no picks, no DoF, non-pickable) until you
opt it in. The `ledger` placeholder relies on exactly this.

## The snapshot stream (bottom ribbon)

Global L0 produces a snapshot every few seconds. Three different counters, which the
UI deliberately keeps separate (cards show plain language; the click inspector shows
the raw fields):

- **`ordinal`** — snapshot sequence number, +1 every snapshot **even when empty**.
- **`height`** — depth of the *block DAG*; only rises when blocks actually deepen it.
  It's a DAG (parallel/sibling blocks), so a snapshot can carry blocks **without**
  raising height — and idle snapshots keep it flat for long stretches (this is real
  mainnet behaviour, not a bug).
- **`subHeight`** — orders snapshots that share a height.

So stream cards show `#ordinal` + `empty` / `N blocks` (muted when empty), **not**
the static height — height lives only in the labelled places (header stat + inspector).

## Data & the bake scripts

The app ships baked caches so the globe works instantly and offline; live data layers
on top. Validators poll live (`api.js`); **metagraph nodes are baked only** — their
cluster endpoints are plain HTTP on custom ports with no CORS, so the browser can't
fetch them.

- `data/geo.json` — IP → {lat, lon, city, country, cc}. Rebuild:
  `python3 scripts/bake-geo.py`.
- `data/metagraphs.json` — real mainnet metagraphs + nodes. Rebuild:
  `python3 scripts/bake-metagraphs.py` (also merges new IPs into geo.json). Each
  metagraph carries `name`, `symbol`, `description`, `siteUrl`, `nodes`; each node has
  `ip`, `state`, a primary `layer` (assigned by priority **l0 > dl1 > cl1**) and a
  `roles` list of every layer it serves.

Metagraph reality worth knowing (it drives the inspector text):

- Nodes are **hybrid** (run several layers on one machine) or **dedicated** (a single
  layer). On mainnet most metagraphs are just 3 hybrid nodes; DOR is the outlier with
  3 hybrid + 19 dedicated data-L1 nodes.
- **Currency-L1 is never a standalone node** — every `cl1` node is also an L0 node, so
  the outer cl1 shell is effectively always empty.
- A metagraph has a real **token only if it runs a currency-L1 cluster** (some node has
  `cl1` in `roles`). The `symbol` field is *always* set, so it is NOT a token signal
  (e.g. DED has a "DED" symbol but no token — it's a data metagraph).
- The dagexplorer API lists `l0`/`cl1`/`dl1` URLs for *every* metagraph whether or not
  that layer actually runs, so URL presence means nothing — only node presence does.

Re-bake when the validator set or metagraph list changes, and keep `config.METAGRAPHS`
in sync with `data/metagraphs.json` (matched by `id`).

> Sandbox networking note: `bake-metagraphs.py` falls back to `curl` (subprocess) when
> `urllib` fails, because here Python can't resolve some metagraph cluster hosts (e.g.
> `*.getdor.com`) while the system `curl` reaches them over IPv6.
