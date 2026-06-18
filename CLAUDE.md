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
  Long descriptions go through `_descHTML` (clamps to 3 lines + a "Show more" toggle,
  only when long; CSS `.desc`/`.desc-more`) — used by the metagraph **context pane**;
  the node inspector shows no description. The toggle is one **delegated** click handler
  (wired in `_wire`) so it survives the cards re-rendering their `innerHTML`.
- `stream.js` — bottom live snapshot strip (anchored count + derived `~DAG` fee per
  tick; see *Anchoring* above). `api.js` — `NetworkData`: polls the block-explorer API,
  keeps per-metagraph snapshot buffers + the `anchorIndex` (`getAnchor`, `anchor` event),
  emits events, falls back to a simulation offline.
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
- **Two sources, kept consistent on purpose.** Hypergraph **hubs** are built from
  `config.METAGRAPHS` (all 10, unconditionally — `layers.js`), but **globe nodes +
  filter chips** come from `globe.metaList`, which `globe.setMetagraphs` filters to
  only metagraphs with at least one **locatable** node (`withNodes`). So a config
  metagraph with 0 baked/geolocatable nodes (e.g. El Paca/PACA, LEET, TBC at the last
  bake) has a hub but can't be plotted/filtered. `ui.setMetagraphList` bridges the gap:
  it renders those as **disabled `mf-chip--off` chips** showing `(0)`, greyed and
  non-clickable, so the filter mirrors the Hypergraph instead of silently dropping them.
  They light up as real chips once a re-bake finds nodes.
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

A global snapshot's real work is **settlement, not blocks** — most carry zero blocks
(mainnet: ~1 in 50), so block count is the wrong activity signal. The meaningful field
is **`metagraphSnapshotCount`** — how many metagraph snapshots this global snapshot
**anchored** (varies per snapshot, ~1–24). So ribbon cards lead with `#ordinal` +
**`N anchored`** (bar scaled by it) + the derived **`~DAG` fee** for the tick; the
uncommon block-carrying snapshots get a warm `+N blk` accent (a highlight, not the
baseline; `.quiet` is reserved for the rare zero-anchor case). Height/sub-height live
only in the inspector + header stat. See **Anchoring, fees & the metagraph data layer**.

**The selected chip (`.chip.active`) mirrors the inspector — one source of truth.** The
inspector drives it: `ui.showSnapshot` → `onSnapSelect` → `stream.select(data)` highlights
that chip (and `stream` re-applies it to chips that arrive/seed later, by remembered
ordinal). So clicking a chip, "follow latest" (`● Live`), and a metagraph filter (which
follows the latest snapshot it anchored) all keep the ribbon highlight, the live `● Live`
card, and the metagraph filter consistent. Showing a non-snapshot card or closing the
inspector clears the highlight and stops following; `ui.refreshFollow()` (fired on the
`anchor` event) re-resolves the followed chip once the anchor index fills in. The chip
click handler does **not** toggle `.active` itself — let `select()` own it.

## Anchoring, fees & the metagraph data layer

Verified live against mainnet (2026-06-16):

- **Each metagraph snapshots independently and faster than Global L0** (e.g. DED ~9.5/min
  vs L0 ~4.5/min) via `/currency/{id}/snapshots`. The explorer stamps each metagraph
  snapshot with the **timestamp of the global snapshot it anchored into**, so the anchor
  join is `metagraph.timestamp === global.timestamp` (exact — 0 orphans observed).
- **Fees are the core economic model.** Every metagraph snapshot pays a `fee` ∝
  `sizeInKB` (~100,000 datum/KB = 0.001 DAG/KB; 1 DAG = 1e8 datum), **paid in DAG** —
  confirmed because data metagraphs with no token of their own (e.g. DED, `cl1: null`)
  still pay at the same rate. Global snapshots have **no** fee field; a tick's DAG cost
  is derived by summing the fees of the metagraph snapshots sharing its timestamp.
- **Count is exact, fee is a floor.** `metagraphSnapshotCount` is the authoritative
  anchored count. Our derived fee covers only the **publicly listed** metagraphs (the
  dagexplorer directory of 10 = `config.METAGRAPHS`); ~7% of anchors come from metagraphs
  that are authorized on-chain but **not publicly listed**, so the summed fee is a **lower
  bound** (shown with `~` + a `FLOOR` tag in the inspector; flips to `COMPLETE` when the
  tracked count reaches `metagraphSnapshotCount`). "Listed" ≠ protocol registration —
  anchoring still requires being a recognised L0 state channel; these are just absent from
  the public explorer catalog.

**Shared data layer** (`api.js`): `metaSnaps` (id → rolling `[{ordinal,hash,parent,ts,fee,
sizeInKB}]`, seeded `VIS.metaSnapSeed`, tailed `VIS.metaSnapTail`) + `anchorIndex`
(global-tick ts → `{fee, count, metaIds:Set, metaCounts:Map(id→n)}`). `_recordMetaSnaps`
dedupes by ordinal, caps the buffers, and emits an **`anchor`** event; `getAnchor(ts)` is the
accessor the ribbon (and, later, the ledger view) reads. The hub-pulse `meta` event (keyed by
name) is unchanged. `metaCounts` exists because a single metagraph can anchor **several**
snapshots into one global tick (it snapshots faster than L0), so `metaIds` alone (presence)
isn't enough to show a per-metagraph count.

The snapshot inspector renders these as colour-coded **pills** (`_anchoredTags`): one per
listed metagraph anchored, each showing its count `TICKER (n)`, plus an `unlisted (N)` pill
where `N = metagraphSnapshotCount − a.count` (the floor gap). It deliberately shows **no block
count** — blocks aren't the activity signal here.

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
