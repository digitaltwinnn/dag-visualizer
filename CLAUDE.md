# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing overview.

## What this is

An interactive 3D visualizer of the Constellation Network ($DAG). **Next.js (App
Router) + React + TypeScript + Zustand** for the page/panels, driving a **vanilla
Three.js engine** (NOT react-three-fiber) on one persistent canvas. The active view is
`mode` in the store (the `Mode` union is exported from `store.ts` and shared by the Engine);
the top-bar view switch sets it. **Two views drive the 3D scene; the rest are "flat" (the
engine hides the canvas — `mode !== "hyper" && mode !== "geo"`):**

- **Hypergraph** (`hyper`, 3D) — abstract architecture: a glowing Global L0 core, the DAG's
  own validator shells around it, and the real metagraphs as orbiting hubs, each with its own
  L0 / cL1 / dL1 nodes in concentric shells. **One unified node model** — the DAG is itself a
  metagraph-shaped "core" (see *Nodes…* + the `dag-unified-node-model` memory), not a separate
  L0/L1 pair.
- **Node geography** (`geo`, 3D) — a globe with every node at its real geolocation, a density
  heatmap, travelling-packet connection arcs, and the country→nodes explorer.
- **Snapshots** (`ledger`, flat — renamed from "Snapshot DAG") — the ledger-over-time view
  (timeline still a `LedgerPanel` placeholder). The **full snapshot ribbon renders only here**
  (the macro band of the future timeline); hyper/geo get a slim **`LiveStrip`** heartbeat
  instead — see *The snapshot stream*.
- **Network status** (`status`), **Transactions** (`transactions`), **Delegated staking**
  (`staking`) — **scaffolded placeholders** (a `PlaceholderPanel` "SOON" card in the left rail;
  content map in `LeftColumn.tsx`). The 3D scene, vitals, bottom stream and right rail are all
  empty for these. See the `dag-view-scaffold` memory for each one's intent. Top-bar view glyphs
  are all plain monochrome symbols — **never emoji** (emoji ignore CSS `color` / the accent).

Only `hyper`↔`geo` **morph** (`morph` 0→1, eased each frame); the blue L0 core literally **grows
out into the globe** (layers.js) as the nodes fly to their map positions. The flat views sit at
the hyper end (morph 0) with the canvas hidden.

## Run & test

Next.js app — needs Node ≥18.18 (installed via NodeSource; `node -v` ~20). Three.js
and friends come from npm (`three`, `three/addons/*`, `topojson-client`); no CDN deps.

```bash
npm install
npm run dev        # http://localhost:3000
```

`tsc --noEmit` for types (dev server tolerates type errors; run tsc to be sure).

> **Dev-server gotcha:** a long-running `next dev` accumulates HMR/compile state across
> many edits and can serve stale state (e.g. the wrong default view). If something
> looks wrong after a big refactor, restart clean: `pkill -f "next dev"` (NOT `-f next`
> — it matches your own shell), `rm -rf .next`, then `nohup npm run dev &`.

### Verifying visual changes (headless)

No test suite; verify by screenshotting in headless Chrome. WebGL needs the
SwiftShader flags or it fails with "Error creating WebGL context":

```bash
google-chrome-stable --headless=new --no-sandbox \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1400,900 --hide-scrollbars \
  --virtual-time-budget=12000 --screenshot=/tmp/shot.png \
  "http://localhost:3000"
```

Gotchas that will save you time:

- **No clicking / no deep links in headless** — CDP is blocked (only one-shot
  `--screenshot`), and the old `#geo=SYMBOL` hash deep-links are gone. To screenshot a
  specific state (a filter, the geo/ledger view, an open inspector), **temporarily seed
  the Zustand store default** in `src/store/store.ts` (e.g. `mode: "geo"` or
  `filter: "<id>"`, `following: true`), screenshot, then revert. That's the standard
  trick used throughout this codebase's history.
- **`--virtual-time-budget` runs very few `requestAnimationFrame` frames**, so
  animations barely start — the morph and camera tweens won't complete in a one-shot.
  Booting in `geo` snaps `morph=1` (engine constructor), so the globe is settled; for
  hyper camera tweens, temporarily shorten the tween `dur` in `Engine._tweenTo`.
- **Benign console noise to ignore** when grepping logs: `mojo ... rejected`,
  `gcm/... PHONE_REGISTRATION_ERROR`, `BackForwardCache`.

## Architecture — three layers

The app is a thin React/Next shell around an imperative Three engine, joined by a
Zustand store. **Two data lanes:** (A) high-freq visuals subscribe straight to
`NetworkData` events (no React render); (B) only panel-facing state lives in the store.

- **`app/`** — Next App Router. `layout.tsx`, `page.tsx` (mounts every panel + the
  canvas), `globals.css`. **`app/api/metagraphs/route.ts`** + **`app/api/geo/route.ts`**
  are server-side data routes (see *Data* below).
- **`components/`** — React panels, each reads/writes the store: `SceneCanvas` (mounts
  the engine, dynamic-imported, `ssr:false`), `TopBar` (the full-width top command bar:
  status + filter + view switch + view vitals — see *Layout system*; `components/topbar/`
  holds `Vitals`, `FilterChips`, the shared `useMetaActivity` hook), `LeftColumn` (the
  explore rail: `ContextPanel` — the selected metagraph/cluster dossier pinned at the top —
  above one view tool card: `LearnPanel` / `GeoExplore` / `LedgerPanel`), `Inspector` (the
  right **facts** rail: the view's signature detail card, via `InspectorCard` — a thin frame
  dispatching to the per-kind cards in `components/inspector/`), `Tooltip`, `FollowController`
  (ledger snapshot follow),
  `DataBridge` (boots the data). **Bottom stream:** `BottomStream` picks the full
  `SnapshotRibbon` (ledger) vs the slim `LiveStrip` (hyper/geo) and publishes
  `--bottom-reserve`; both read the shared `useSnapshotFeed` hook. **`PanelHead`** is the
  one header used by every rail panel (see *Layout system*).
- **`src/store/store.ts`** — the Zustand store (mode, filter, country, inspect,
  following, metaList, leaderboard, live stats, …). **`src/data/network.ts`** wraps the
  vanilla `NetworkData` singleton + exposes `getAnchor`/`metagraphById`/`COLORS`/etc;
  `follow.ts` = follow logic; `types.ts` (`PickDescriptor` is a `kind`-discriminated
  union); `src/util/format.ts` = shared `hex`/`fmtDag` formatters.
- **`src/engine/Engine.ts`** — the imperative engine. Owns the scene, render loop,
  morph, camera-focus tweens, DoF, picking, and the **command bridge**: it
  `useStore.subscribe`s and reacts to mode/filter/country/learnFocus; it writes picks
  back to the store. Wraps the vanilla `js/*` modules below; their (untyped-JS) surface
  is described in `src/engine/boundary.ts` and asserted once at construction.
- **`js/*`** — the **reused vanilla Three modules** (no longer an app of their own;
  driven by `Engine`). Bare specifiers resolve via npm.

`js/` modules:

- `scene.js` — Three.js scene, camera (FOV 55), `OrbitControls` (damping on,
  autoRotate), and the postprocessing chain: **RenderPass → BokehPass (`dof`) → bloom**.
  Exposes `resize()`; the engine owns the window listener.
- `layers.js` — Hypergraph-only furniture: the Global L0 **core** and the orbiting
  metagraph **hubs** (from `config.METAGRAPHS`). The core is parented to the scene
  (not `layers.root`) so the morph can **grow it out to the globe's radius and
  dissolve it** as the Earth fades in. Hubs fade out early.
- `globe.js` — the biggest, most complex file. Owns the shared DAG validator nodes
  AND the metagraph nodes (sphere→disc instanced cross-fade), the globe surface, the
  **solid raised continents**, the heatmap, the travelling-packet arcs, filtering/dimming,
  and the geo focus spin. The land is the `land-110m` polygons triangulated into a
  **plateau** at radius `R+LAND_H` (earcut via `THREE.ShapeUtils`, with a longitude
  **unwrap** for the 4 antimeridian-crossing polygons, an Antarctica **pole-cap**, and a
  uniform `n=4` subdivision so facets hug the sphere with no T-junction cracks), capped by
  additive coastal **"wall" cliffs** (BackSide-culled, dim quadratic-ish rim, always the
  default cyan — metagraph-tinting it read as too dominant). Nodes/heatmap/arcs sit on the
  plateau (`R+LAND_H+ε`); the body sphere (`renderOrder -2`) and fill (`-1`) keep the
  depth/transparency sort deterministic.
- `api.js` — `NetworkData`: **client-side** polls the block-explorer API (CORS `*`),
  keeps per-metagraph snapshot buffers + the `anchorIndex` (`getAnchor`, `anchor`/
  `global`/`cluster`/`price` events, `on`/`off`). No simulation — when the API is
  unreachable it stays factual (a "NO DATA" state) and recovers on the next good poll.
  This drives the live ribbon/stats/anchors and keeps polling regardless of the server.
- `config.js` — API endpoints, colors, the `METAGRAPHS` list, `VIS` tuning, and
  `metaAnchor()` (hub orbit-slot math shared by layers.js and globe.js).
- `geo.js` — `loadGeoCache()` (fetches `/api/geo` seed) + best-effort `resolveMissing`
  for new validator IPs (ip-api over http, ipwho.is over https).
- `background.js` — skydome. The **geo** end is the twinkling starfield + faint nebula; the
  **hyper** end is a **single flat colour** (the drifting aurora was removed as distracting —
  no animation, no gradient, no tint). Only `uTime`/`uMorph` drive it now.

> The old raycast/inspector/learn/leaderboard/camera logic (`ui.js`), the render-loop
> entry (`main.js`), and the ribbon (`stream.js`) were **ported to React + the engine
> and deleted**. `InspectorCard` is a thin frame (eyebrow/title) that dispatches to the
> per-kind cards in `components/inspector/`. **Only three kinds reach it now:** `meta`
> (the dossier, from `ContextPanel`), `snapshot` (ledger), and `geoLive` (the selected-node
> card — a proxy that reads `store.inspect` and renders `GeoLiveNode`). The old `core`/`l0`/
> `l1`/`metanode`/`cluster` body cards were unreachable and **removed**. Bodies live in
> `cards.tsx` over shared `parts.tsx` (rows, `RoleTags`, `nodeComposition`, the `Desc` clamp);
> `Engine` owns picking + camera focus (`FOCI`/tweens) +
> DoF + morph.

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
  - **Hypergraph**: `_focusFilter` flies the camera to the selected hub (using its
    **local/unscaled** position — `layers.root` is morph-scaled, so `getWorldPosition` would
    aim at the origin mid-morph), framed slightly off the radial line so the core sits to the
    upper-left. The hub's **orbit is paused while focused** (`layers.focusId`) so it stays
    framed; a subtle **depth-of-field** (BokehPass) keeps it crisp while the rest softens; AND
    the **non-selected nodes + hubs dim back** (`globe.setFilter(filter)` + the `focusId` hub
    dim in `layers.js`) so the selection stands out. DoF runs **only in hyper with a metagraph
    selected**. Picking is filter-gated in hyper too (`_isPickActive`): only the in-focus
    selection's nodes are hoverable/clickable — the faded ones don't participate. Clicking a
    node sets the filter to its network (consistent with geo) + opens its node card.
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

## Layout system — uniform HUD shell

The HUD is **four fixed zones over the canvas, one SCOPE/role each, stable across views**.
**Gate new chrome by *which zone/scope it belongs to* — not by what a particular view puts
there.** Define a card by its scope (the role it plays); its *contents* are view-specific and
keep changing, so they're examples, not the contract. The per-view widgets below are *current*.

- **Top** (`TopBar`, `14-top-bar.css`) = the **command bar**: one full-width inset bar
  (mirrors the bottom ribbon — same panel/border/radius). Three regions on one row:
  **status + filter** (left; the filter is a button + pill that expands the bar *downward*
  into the `FilterChips` grid — same connected surface, so the filter no longer needs a rail
  slot), the **view switch** (center, a boxed segmented control), and the **view-specific
  vitals** (right, `Vitals`). The vitals are **filter-aware** in hyper (see below).
- **Left rail** (`#leftcol`) = the **explore / interact** scope (verbs): the **selected-subject
  dossier** (`ContextPanel` / `#metapane` — the focused metagraph/cluster, pinned at the top
  where the filter used to be; `Selected metagraph` eyebrow + a clear ×) above **exactly one
  view tool card** whose scope is *"explore this view's subject"* (currently `LearnPanel` in
  hyper, `GeoExplore` in geo, `LedgerPanel` in ledger). The global filter moved to the top
  command bar. Tool eyebrow is one verb: `<View> · explore`.
- **Right rail** (`#rightcol`, `Inspector`) = the **facts** scope (read-only): the view's
  **Detail** card — the signature fact, or whatever you explicitly clicked (ledger → snapshot,
  geo → selected node; hyper has none — its live activity is the top-bar vitals). Each
  `InspectorCard` opens with a role **eyebrow** (`Live snapshot`, `Selected node`…). A quiet
  `#rc-empty` placeholder keeps the zone present.
- **Bottom** (`BottomStream`) = the live/time lane (slim `LiveStrip` or full `SnapshotRibbon`).

Uniformity is enforced with **shared tokens in `app/styles/00-base.css`** (`--radius`,
`--panel-pad-*`, `--rail-*`, `--detail-w`, the `--sel-bg`/`--sel-border` selection language,
and `--bottom-reserve` — set per view by `BottomStream`) and **one `PanelHead` component**
(`app/styles/12-panel-system.css`) used by every rail panel, so the rail reads as one
surface. Don't re-derive paddings or cyan tints in component CSS — reference the tokens.

**Each view is a complementary projection of the same network** (the answer to *"what is each
view for"*) — **hyper = who/what** (architecture + economic weight), **geo = where** (footprint),
**ledger = when** (ledger over time + cost). How each fills the zones *today* (contents, not the
rule):
- **hyper** — top vitals: the **structure** (`Vitals`/`HyperVitals`), **filter-aware** — how many
  nodes serve each layer (`L0` / `cL1` / `dL1`) for the current selection. **One node taxonomy
  for the whole network**: a hybrid node counts in every layer it runs (so columns can sum past
  the node count); the DAG's own L0/L1 fold into L0/cL1 (its L1 is a *currency*-L1) like any
  metagraph. All → the whole network; L0/L1 → that shell (0 elsewhere); a metagraph → its own
  nodes (from `store.nodes` + `metaList`, via `rolesOf`). Activity belongs to Ledger, not here.
  Left: the selected-metagraph `MetaCard` **dossier** (identity + the node-fabric *config* block —
  same layer vocabulary, the "how nodes are wired" cut) above `LearnPanel`. **Hyper has no
  right-rail card** so `#rightcol` stays empty there.
- **geo** — top vitals: the **footprint** (`GeoVitals`) — `Distribution` score (moved up from
  GeoExplore) / `Countries` / `Densest`, from `store.leaderboard`. Left: **`GeoExplore`**, now
  purely a **country→nodes accordion** (the leaderboard + node browser merged: a country row
  shows its share; clicking it drills the globe **and** expands its nodes inline from
  `store.selNodes`/`globe.listNodes`), with the selected metagraph/cluster dossier pinned above
  it (`ContextPanel`). Right Detail: **`GeoLiveCard`** — the **selected node** (reads
  `store.inspect`; pick hint when empty).
- **ledger** — top vitals: the network's **live activity** (`LedgerVitals`) — `snaps/anchors/fees
  per hour` with trend sparklines (from `store.activity`), moved here from hyper since this is the
  view about the ledger over time. Left: the selected metagraph dossier (`ContextPanel`) above
  `LedgerPanel`; Right Detail: the **`SnapshotCard`**.

**The global snapshot card is ledger-only.** `FollowController` follows the live snapshot
*only* in `ledger` (`following = mode === "ledger"`); hyper/geo never inject one, and the
`Inspector` only renders a `snapshot` pick in ledger. Clicking a tick in the slim `LiveStrip`
jumps to ledger + opens it there. So a snapshot card never appears outside its home view.

## The snapshot stream (full ribbon in ledger; slim strip elsewhere)

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

**Slim `LiveStrip` (hyper/geo)** is the demoted form: a live dot + a full-width **anchor
bar-chart** (one bar per tick, height = anchors), filter-coloured (`--ls-accent`), stacked
(total + the selected metagraph's share), with a smooth bottom-transparent→top-colour gradient.
It has **no panel chrome** — bars blend straight into the scene (only the label keeps a
text-shadow). Clicking a bar opens that snapshot's card (carried across views). It shares the
same `useSnapshotFeed` hook + `inspect`/`following`/`snap` store state as the ribbon, so the
selected-snapshot highlight stays consistent across view switches. `BottomStream` renders one or
the other by `mode` and sets `--bottom-reserve` (slim → the side rails grow back).

> **Live tick — total is instant, breakdown/fee come from the exact read.** The *total*
> (`metagraphSnapshotCount`) is final immediately; the per-metagraph breakdown + fee are pulled
> exactly from the raw L0 snapshot (`/api/snapshot/[ordinal]`, see *The tick lifecycle*) for the
> focused tick. Anything new on the live tick should prefer that exact read and only use the polled
> floor for ticks too old for the L0 node.

## Anchoring, fees & the metagraph data layer

Verified live against mainnet (2026-06-16):

- **Each metagraph snapshots independently and faster than Global L0** (e.g. DED ~9.5/min
  vs L0 ~4.5/min) via `/currency/{id}/snapshots`. The explorer stamps each metagraph
  snapshot with the **timestamp of the global snapshot it anchored into**, so the anchor
  join is `metagraph.timestamp === global.timestamp` (exact — 0 orphans observed).
- **Fees are the core economic model.** Every metagraph snapshot pays a `fee` (datum; 1 DAG =
  1e8 datum), **paid in DAG** — confirmed because data metagraphs with no token of their own
  (e.g. DED, `cl1: null`) still pay. ⚠️ **Treat the `fee` as an opaque reported value — do NOT
  derive size (or anything) from it.** It correlates with size but Constellation computes it with a
  non-trivial fee calculator; an earlier `fee/100000 = KB` assumption was wrong and removed (size
  is measured separately from `content.length`). Global snapshots have **no** fee field; a tick's
  DAG cost is the sum of its metagraph snapshots' fees (exact from the raw-L0 read, or the polled
  floor).
- **Count is exact, fee is a floor.** `metagraphSnapshotCount` is the authoritative
  anchored count. Our derived fee covers only the **publicly listed** metagraphs (the
  dagexplorer directory of 10 = `config.METAGRAPHS`); a few anchors come from metagraphs
  that are authorized on-chain but **not publicly listed**, so the summed fee is a **lower
  bound** (shown with `~` + a `FLOOR` tag in the inspector; flips to `COMPLETE` when the
  tracked count reaches `metagraphSnapshotCount`). "Listed" ≠ protocol registration —
  anchoring still requires being a recognised L0 state channel; these are just absent from
  the public explorer catalog.
- **The genuinely-unlisted count is TINY (~0–4 per tick).** A high "unlisted" reading is a
  bug, not reality. `metagraphSnapshotCount` counts *snapshots*, not metagraphs, and **one
  fast metagraph can batch dozens into a single tick** (verified: DOR put **83** into one,
  DED **41** — both *listed*; tick 6517348 = 138 anchors, only **4** truly unlisted). So the
  ground truth for *who* anchored is the **raw L0 snapshot's `stateChannelSnapshots`**
  (`l0-lb-mainnet…/global-snapshots/{ord}` → `value.stateChannelSnapshots` = `{addr:[snaps]}`),
  NOT the explorer (which only gives the count). We don't fetch that per tick (2.4 MB for a big
  tick), but it's the cross-check tool when a count looks wrong.

### The tick lifecycle — why a snapshot's breakdown *settles* (read before touching the ledger view)

A metagraph snapshot is stamped with its anchoring global timestamp **only as it anchors**,
which happens over the **few seconds after the global tick first appears**. So a tick has a
lifecycle, and our inferred breakdown lags it:

1. Global tick `T` appears (from `be-mainnet`). Its **`metagraphSnapshotCount` (total) is
   correct and final immediately** — it's a field of the finalized snapshot.
2. Over the next seconds, metagraphs keep getting stamped `T` as they anchor into it; our
   per-metagraph poll then needs a cycle to fetch them and fold them into `anchorIndex[T]`.
   During this window `a.count < total`, so a naive `unlisted = total − a.count` reads
   **transiently high** — this is the *settling* period, not real unlisted metagraphs.
3. Once no new snapshot has landed in `T` for `SETTLE_MS` (`AnchoredTags`, ~7 s) the count has
   **stabilised** and the remaining gap, if any, is the *real* unlisted floor.

**The snapshot card now sidesteps all this with an EXACT read** (the primary source): the raw L0
snapshot's `stateChannelSnapshots` carry every anchored metagraph snapshot with its own
`value.fee` + `value.content`, so the **exact** fee, data size, per-metagraph breakdown (incl.
unlisted) and state-record count are final the instant the snapshot exists. We fetch it server-side
(heavy, ~2.5 MB) via **`/api/snapshot/[ordinal]`** (cached per ordinal), `SnapshotExactBridge` keeps
the **live + selected** tick's `SnapshotExact` in the store, and the card prefers it — no settling,
no floor. The **live card never falls back to the polled floor**: while exact is in flight it shows
a brief "reading…" (`awaiting`); only **old/pruned** ticks (the L0 node retains ~30 min) fall back
to the polled anchor index below. See the `dag-raw-snapshot-metrics` memory for everything else
that one read exposes (rewards, delegated staking, …).

Two mechanisms back the **polled fallback** (used for old ticks, the 60-bar strip, and the activity
rates — exact is too heavy across many ticks):
- **Self-healing catch-up** (`api.js _refreshOneMeta`): instead of a fixed tail (which silently
  dropped DOR's burst and mislabelled it "unlisted"), the poll **grows `?limit=` ×3 up to 600
  until the batch reaches back to the newest ordinal we already hold** — provably no gap,
  regardless of burst size. Polls **every** tick (`pollMs`), base `VIS.metaSnapTail`.
- **Polled floor**: `anchorIndex[ts].count` is what we identified; `unlisted = total − count` is a
  lower bound shown only on old ticks (`AnchoredTags` falls back to it when there's no exact read).
  ⚠️ **The ledger/Snapshots view should prefer the exact read for any focused tick** and only use
  the polled floor for ticks too old for the L0 node.

**Shared data layer** (`api.js`): `metaSnaps` (id → rolling `[{ordinal,hash,parent,ts,fee,
sizeInKB}]`, seeded `VIS.metaSnapSeed`, tailed `VIS.metaSnapTail` with the catch-up above) +
`anchorIndex` (global-tick ts → `{fee, count, metaIds:Set, metaCounts:Map(id→n), touched}`;
`touched` = ms the count last grew, for the settling gate). `_recordMetaSnaps`
dedupes by ordinal, caps the buffers, and emits an **`anchor`** event; `getAnchor(ts)` is the
accessor the ribbon (and, later, the ledger view) reads. The hub-pulse `meta` event (keyed by
name) is unchanged. `metaCounts` exists because a single metagraph can anchor **several**
snapshots into one global tick (it snapshots faster than L0), so `metaIds` alone (presence)
isn't enough to show a per-metagraph count.

The snapshot card renders the breakdown as colour-coded **pills** (`AnchoredTags`): the
authoritative **total in parens after the label** ("Metagraph snapshots anchored here (138)"),
one pill per listed metagraph with its count `TICKER (n)`, plus an `unlisted (N)` pill — sourced
from the **exact read when available** (final, incl. unlisted), else the polled floor for old
ticks (or "reading…" for the live tick mid-fetch). It also shows the **settlement fee** (exact →
the figure + `· N KB settled`; old/floor → `at least`/`complete`). It deliberately shows **no
block count** — blocks aren't the activity signal here. (Note: a snapshot's `value.content` is the
serialized snapshot as a *byte array*, not a list of records — don't surface its length as an
update/record count; it's just bytes.)

## Data — server-side routes (was: bake scripts)

Metagraph cluster endpoints are plain HTTP on custom ports with **no CORS**, so the
browser can't fetch them — but the **Next Node server can**. So instead of baking:

- **`app/api/metagraphs/route.ts`** is a live TS port of `bake-metagraphs.py`: lists the
  dagexplorer directory, fetches each `{l0,cl1,dl1}` `/cluster/info` server-side (the
  three run **concurrently** per metagraph; `present` keeps `l0 > dl1 > cl1` priority),
  geolocates IPs (ip-api batch), returns `{ metagraphs, geo }`. **Falls back to the
  bundled `data/*.json`** (imported, so it ships in serverless deploys) if the live fetch
  fails/empties.
  - **Caching:** the inner fetches use `cache: "no-store"`, which by itself makes the
    route *dynamic* (re-runs the whole fan-out on every request). So the live fetch is
    wrapped in **`unstable_cache(…, { revalidate: 600 })`** — it runs at most ~once per
    10 min, shared across requests/instances; throwing on an empty result keeps a blip
    from being cached (GET serves the bake, next request retries). `export const
    maxDuration = 60` + a **5s per-fetch timeout** keep a slow cluster LB from blowing
    Vercel's function budget (Hobby's default is 10s). Verify it stays cached: `next
    build` should mark `/api/metagraphs` as `○` (Static) with a `10m` revalidate, **not**
    `ƒ (Dynamic)`.
  - **`ip-api.com` ToS — matters before going commercial:** the geo batch uses the free
    tier, which is **HTTP-only** (no TLS), **~45 req/min per source IP**, and
    **non-commercial use only**. At our volume (one batched call per 10-min
    regeneration) the rate limit is a non-issue, but for a commercial/production product
    switch to an HTTPS geo provider with an SLA + commercial license (e.g. ipinfo,
    MaxMind, ip-api Pro). The validator-side resolver (`js/geo.js`) likewise uses ip-api
    (http) + ipwho.is (https).
- **`app/api/geo/route.ts`** serves the validator geo seed (`data/geo.json`, imported)
  so the globe plots instantly; `js/geo.js resolveMissing` fills new validator IPs.
- **`app/api/snapshot/[ordinal]/route.ts`** reads the **raw L0 global snapshot** (heavy,
  ~2.5 MB) and returns a tiny `SnapshotExact` (exact fee, size KB, state-record count, and the
  per-metagraph breakdown incl. unlisted). **Cached per ordinal** (`unstable_cache`, immutable —
  one fetch shared across clients; throws on a miss so a not-yet/pruned tick retries). Only recent
  ticks resolve (the L0 node prunes after ~30 min) → 404 → client keeps the polled floor.
  `SnapshotExactBridge` calls it for the live + selected tick; cost stays trivial because it's
  per-ordinal cached and only the focused tick is fetched — **never** the whole ribbon or a poll
  loop (that's what would make it expensive on Vercel).
- The client (`Engine`) fetches `/api/metagraphs` on mount **and re-pulls every 10 min**
  (Vercel never restarts; ISR only freshens the *server* cache, so an idle tab must
  re-pull — `Engine.refreshMeta`, rebuilds only on change). The snapshot/cluster/price
  feeds are already live via `NetworkData` client polling.
- `scripts/bake-*.py` still exist but are now **only the offline seed/fallback** for
  `data/*.json`, not required for normal operation. `data/metagraphs.json` shape: each
  metagraph has `name/symbol/description/siteUrl/nodes`; each node `ip/state/layer/roles`.

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

`/api/metagraphs` now picks up validator/metagraph-set changes live; the bake is just
the fallback. Still keep `config.METAGRAPHS` (hub colors/order, the Hypergraph) in sync
with what the route returns (matched by `id`).

> Sandbox networking note: `bake-metagraphs.py` falls back to `curl` (subprocess) when
> `urllib` fails, because here Python can't resolve some metagraph cluster hosts (e.g.
> `*.getdor.com`) while the system `curl` reaches them over IPv6.

## Deploying (Vercel)

Target host is **Vercel** (any Node host works). No env vars / secrets are required.

**Enabled now (works on the free Hobby plan):**
- `engines.node >= 18.18`; `next build` is clean.
- **Route caching:** `/api/metagraphs` wraps its live fan-out in `unstable_cache`
  (`revalidate: 600`) with `maxDuration = 60` + a 5s per-fetch timeout, and fetches the
  per-metagraph clusters concurrently — so the expensive work runs ~once / 10 min, not
  per request. (Verify in `next build`: it should be `○` with `10m`, not `ƒ`.)
- **`@vercel/speed-insights`** + **`@vercel/analytics`** mounted in `app/layout.tsx`
  (real-user Web Vitals + cookieless page views; both no-op off Vercel). Web Vitals do
  NOT capture the WebGL frame rate — use the engine's stats.js for that.
- **`app/opengraph-image.tsx`** — social card via `next/og`. Keep it ASCII + styled
  `<div>`s only: a non-Latin glyph (e.g. `●`, `—`) makes Satori fetch a font at
  render time, which fails (`Status: 400`) and breaks the image.
- `.gitignore` covers `.env*` and `.vercel`.

**FPS monitor:** stats.js is wired into the engine **dev-only**, or in prod via
`?stats` / `#stats` in the URL — so it never shows for real users.

**When adoption grows → upgrade to Pro (none of these are needed on Hobby):**
- **Skew Protection** (dashboard toggle) — pins a client to its deployment version.
  Worth it here because the app is a long-lived open tab; a deploy can otherwise break
  chunk loading in tabs that stay open streaming.
- **Cron pre-warm** — a `vercel.json` cron hitting `/api/metagraphs` every ~10 min keeps
  the cache warm so no user ever pays the cold regeneration. Needs Pro (Hobby crons run
  at most once/day).
- **WAF / rate-limiting** on `/api/*` — basic abuse protection for the public route.
- **`ip-api.com` is free-tier / non-commercial** (see the geolocation note above) — swap
  to a licensed HTTPS geo provider before any commercial launch.

**Not applicable:** Image Optimization (no `<img>`), KV/Postgres/Blob (no persistence —
`unstable_cache` covers the geo cache), Edge Config / env vars (no secrets).

**No price feed:** there is intentionally **no `$DAG` price networking**. The old
CoinGecko poll (`_fetchPrice`) was removed because the value was never rendered — don't
re-add a market-data fetch unless something in the UI actually consumes it.
