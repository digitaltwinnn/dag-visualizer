import * as THREE from "three";
import Stats from "stats.js";
import { useStore, type Mode } from "@/src/store/store";
import { metagraphById, initNetwork, getNetwork, getAnchor, DEFAULT_META_COLOR } from "@/src/data/network";
import { hoverKeyOf, tooltipSubject } from "@/src/data/hoverSubject";
import { identityMap, identitySceneHex } from "@/src/palette/identity";
import { createScene, type SceneCtx } from "./scene/SceneContext";
import { HyperView, type MetaHubRec } from "./scene/views/HyperView";
import { Globe } from "./scene/Globe";
import { LedgerView } from "./scene/views/LedgerView";
import { loadGeoCache, resolveMissing } from "@/src/data/geoResolve";
import { METAGRAPHS, COLORS } from "@/src/engine/config";
import { LEDGER, LAYER_GEOM, ledgerSite } from "./domain/ledgerLayout";
import { readSceneColors } from "./sceneColors";
import { VIEW_POLICIES } from "./domain/viewPolicy";
import { FOCI, hubFraming, geoFraming, ledgerLayerFraming, easeInOutQuad, type CameraFraming } from "./domain/cameraRig";
import type { GlobalSnapshot, PickDescriptor } from "@/src/data/types";
import type { ClusterNode, DagCore, GeoMap, RouteMetagraph } from "@/src/data/types";

type Vec = THREE.Vector3;

// id[] -> { id: sceneColorNumber }, resolved through the identity map (Task 1). The scene
// layer never imports the TS generator — the Engine owns the map and hands scene colors
// over as plain data.
const sceneColorsFor = (ids: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, e] of identityMap(ids)) out[id] = parseInt(e.sceneHex.slice(1), 16);
  return out;
};

// loadGeoCache/resolveMissing are real typed TS (src/data/geoResolve.ts) — aliased here only
// for the shorter call-site names used below, no cast needed.
const loadGeo = loadGeoCache;
const resolveGeo = resolveMissing;

// Camera presets: FOCI/hubFraming/geoFraming/easeInOutQuad now live in ./domain/cameraRig
// (Task 15) — pure, allocation-free (writes into caller-provided out structs).
// Global camera dolly-back applied to EVERY framing (all views) in _tweenTo/_snapTo — one lever to
// sit the camera a touch wider without re-tuning each preset.
const CAM_ZOOM = 1.15;

// Imperative engine: owns the scene, the Hypergraph + globe, the render loop, the
// camera-focus tweens, and the command surface React drives via the store. Ports
// main.js's render loop + ui.js's camera focus, decoupled from any DOM/panels.
export class Engine {
  private ctx: SceneCtx;
  private layers: HyperView;
  private globe: Globe;
  private ledger: LedgerView;
  private _ledgerDirty = false; // rebuild the ledger geometry next frame (set on data events)
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private _dofTmp = new THREE.Vector3();

  private mode: Mode = "hyper";
  private filter = "all";
  private country: string | null = null;
  private morph = 0; // 0 = hypergraph, 1 = globe (eased each frame)
  // A persistent tween record (never re-allocated per focus) — `active` replaces the old
  // null-the-object pattern; `_tweenTo` copies into these four vectors instead of `.clone()`ing.
  private _tween = {
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3(),
    t: 0, dur: 1.4, active: false,
  };
  // Scratch framing struct handed to hubFraming/geoFraming — its values are copied into
  // `_tween` immediately by `_tweenTo`, so reusing it across every focus call is safe.
  private _framingOut: CameraFraming = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  private geoMap: GeoMap = {};
  private dagCore: DagCore | null = null;
  private metaData: RouteMetagraph[] | null = null;
  // Metagraph ids with locatable nodes (selectable hubs); null until counts load (all allowed).
  private _activeMetaIds: Set<string> | null = null;
  private _lastFlashOrdinal = -1; // de-dupes the core flash to genuinely new global snapshots
  // While a layer is committed the 3D floor planes stop being pick targets (panel-only switching).
  private _layerCommitted = false;
  // The focused metagraph's hub record, cached on filter/mode change — kills the per-frame
  // `metas.find` the DoF read used to do every frame (Task 15 allocation fix).
  private _dofMeta: MetaHubRec | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private onClick = (e: MouseEvent) => this._handleClick(e);
  private onMove = (e: MouseEvent) => this._handleMove(e);
  // DRAG SUPPRESSION: a "click" that ends a camera-orbit drag must pick NOTHING (with the floor
  // planes pickable, almost every orbit would otherwise end by committing a layer + a camera
  // flight). Record where the pointer went down; _handleClick ignores clicks that travelled
  // further than a small threshold, and _handleMove skips hover-picking while the button is held
  // (no highlight flicker mid-orbit). A stationary click keeps full pick behaviour.
  private onDown = (e: MouseEvent) => {
    this._downX = e.clientX;
    this._downY = e.clientY;
  };
  private _downX = 0;
  private _downY = 0;
  private _hoverKey: string | null = null;
  // Reused pickables buffer (never re-allocated) — `_pickablesFor` runs on every pointermove.
  private _pickBuf: THREE.Object3D[] = [];

  private unsub: Array<() => void> = [];
  private metaTimer: ReturnType<typeof setInterval> | undefined;
  private onResize = () => this.ctx.resize?.();
  // FPS/ms monitor — dev only, or in prod via `?stats`/`#stats` for ad-hoc checks, so
  // it never shows for real users. Click the panel to cycle FPS → ms → MB.
  private stats?: Stats;
  // Fired once, after the first frame actually renders (see start()'s loop) — lets callers
  // (SceneCanvas → store.engineReady) know the scene has painted, not just constructed.
  private _onReady?: () => void;
  // Fired once the hypergraph scene is structurally complete — metagraph nodes AND the DAG core's
  // own validator nodes both placed. SceneCanvas → store.sceneReady, which holds the boot overlay
  // until then (a fully-formed reveal, no node pop-in). Tracked via the two _*NodesPlaced flags.
  private _onSceneReady?: () => void;
  private _metaNodesPlaced = false;
  private _coreNodesPlaced = false;

  constructor(canvas: HTMLCanvasElement, onReady?: () => void, onSceneReady?: () => void) {
    this.canvas = canvas;
    this._onReady = onReady;
    this._onSceneReady = onSceneReady;
    // Read the structural palette from the CSS design tokens (app/globals.css) — the single source
    // of truth. Every scene module below is fed these; none hardcodes a structural colour. In dev,
    // warn if config.COLORS (the static mirror the non-DOM data/palette layer needs) drifts from the
    // live tokens, so the two can't silently diverge.
    const colors = readSceneColors();
    if (process.env.NODE_ENV === "development") {
      // Tolerant compare (±2 per channel): oklch→sRGB resolution rounds, so only a genuine token
      // change (a different colour) should warn — not a 1-bit rounding wobble.
      const near = (a: number, b: number) =>
        Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= 2 &&
        Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= 2 &&
        Math.abs((a & 255) - (b & 255)) <= 2;
      const drift = ([["core", COLORS.core, colors.core], ["dagCore", COLORS.dagCore, colors.dagCore],
        ["bg", COLORS.bg, colors.bg]] as const)
        .filter(([, a, b]) => !near(a, b)).map(([k]) => k);
      if (drift.length) console.warn(
        `[sceneColors] config.COLORS drifts from globals.css tokens: ${drift.join(", ")} — update config.ts to match.`,
      );
    }
    this.ctx = createScene(canvas, colors);
    // HyperView builds all its hubs synchronously from config.METAGRAPHS inside its
    // constructor (before any API data exists), so the identity scene-color map has to be
    // handed in at construction — passing it as a 2nd ctor arg (read by _buildMetagraphs) means
    // the hubs are born in the identity color with no recolor pass and no first-paint flash.
    // HyperView only ever has these 10 config hubs, so this map never needs updating.
    this.layers = new HyperView(this.ctx.scene, colors, sceneColorsFor(METAGRAPHS.map((m) => m.id)));
    this.globe = new Globe(this.ctx.scene, this.layers, this.ctx.camera, colors);
    // ONE identity colour system everywhere: the ledger + globe are handed the same identity
    // SCENE map the hubs were born with, at construction, so nothing anywhere is built from a raw
    // config colour ("dag" included — its own brand hue, distinct from structural cyan; see
    // palette/identity.ts). refreshMeta below refreshes/extends both once the live set is known.
    const initialSceneColors = sceneColorsFor([...METAGRAPHS.map((m) => m.id), "dag"]);
    this.ledger = new LedgerView(this.ctx.scene, colors, initialSceneColors);
    // The globe colours the DAG's own validator nodes (the L0/cL1 shells) with sceneColors["dag"]
    // (see globe.js setNodes) — seed it here, synchronously, so it's populated before the first
    // setNodes call (which can fire from the "cluster" event before refreshMeta's API round-trip
    // resolves).
    this.globe.sceneColors = initialSceneColors;
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    // The engine owns the resize handler (createScene no longer adds one) so it's
    // cleaned up on dispose — no leak across StrictMode remounts / HMR.
    window.addEventListener("resize", this.onResize);

    const showStats =
      process.env.NODE_ENV === "development" ||
      /stats/.test(window.location.search + window.location.hash);
    if (showStats) {
      this.stats = new Stats();
      this.stats.showPanel(0); // 0 = fps
      const d = this.stats.dom;
      d.style.left = "8px";
      d.style.top = "auto";
      d.style.bottom = "56px"; // clear the bottom-left logo + the ribbon
      document.body.appendChild(d);
    }

    // Apply current store state, then react to changes (Lane B command bridge).
    const s = useStore.getState();
    this.mode = s.mode;
    this.filter = s.filter;
    this._layerCommitted = s.layer != null; // seed — subscription only sees CHANGES (HMR remount)
    // Booting straight into geo (deep link / persisted view): snap to the globe —
    // there's nothing to morph from on a fresh load (matches the old #geo behaviour).
    if (this.mode === "geo") this.morph = 1;
    this.unsub.push(
      useStore.subscribe((st, prev) => {
        if (st.mode !== prev.mode) this.setMode(st.mode);
        if (st.filter !== prev.filter) {
          this.filter = st.filter;
          // Switching network clears any country drill-down (matches the old geo UX).
          this.country = null;
          if (prev.country != null) useStore.getState().setCountry(null);
          // In hyper, a selected node card is tied to the node you clicked; changing the
          // network selection drops it (the node may no longer be in view).
          if (st.mode === "hyper" && st.inspect) useStore.getState().setInspect(null);
          this.applyFilter();
        }
        // Country drill-down is geo-only — gate on the view so a re-entrant clear
        // (e.g. from setMode while switching away) can't run a geo focus in hyper.
        if (st.country !== prev.country && st.filter === prev.filter && st.mode === "geo") {
          this.country = st.country;
          this.globe.setCountry(st.country);
          this._applyGeoFocus();
        }
        // The selected node card (geo or hyper) keeps that node's layer shells lit on the globe.
        if (st.inspect !== prev.inspect) this.globe.setSelectedNode(this._pickNodeId(st.inspect));
        // Geo: clicking a node (on the globe or in the left explorer both set `inspect`)
        // flies the camera to it; clearing it returns to the selection framing.
        if (st.inspect !== prev.inspect && st.mode === "geo") this._focusInspectNode(st.inspect);
        // Ledger: keep the hovered/selected snapshot coloured in the trail (hover wins, then the
        // clicked `snap`); everything else fades to the neutral background tone.
        if (st.hoverSnapOrd !== prev.hoverSnapOrd || st.snap !== prev.snap) {
          this.ledger.setSelected(st.hoverSnapOrd ?? st.snap?.data?.ordinal ?? null);
        }
        // Filter-chip hover: PREVIEW that selection's dim in any view (same per-view effect as the
        // real filter), without committing it. null restores the committed filter.
        if (st.hoverFilter !== prev.hoverFilter) {
          this.globe.setHoverFilter(st.hoverFilter);
          this.ledger.setFilter(st.hoverFilter ?? this.filter);
        }
        // Geo explorer list-row hover → glow that node's shells on the globe (same as a 3D hover).
        if (st.hoverNodeId !== prev.hoverNodeId) this.globe.setHoverNode(st.hoverNodeId);
        // Snapshots·Explore panel: the plane highlight = the transient hover PREVIEW, else the
        // COMMITTED layer selection (the layer card) — same resolve idiom as hoverFilter ?? filter.
        // Only a COMMITTED layer dims the other planes; a hover just brightens its own plane.
        if (st.ledgerHilite !== prev.ledgerHilite || st.layer !== prev.layer) {
          this.ledger.setHighlight(st.ledgerHilite ?? st.layer?.layerId ?? null, st.layer != null);
        }
        // While a layer is COMMITTED, the 3D planes stop being hover/click targets (see _pickAt) —
        // in the zoomed layer-focus pose the planes fill the screen and every idle mouse move stole
        // the committed highlight. Deliberate navigation stays: the panel rows + the card's ×.
        this._layerCommitted = st.layer != null;
        // Committing a layer flies the camera to the tilted layer-focus view of its plane (an
        // exploration move — the resting ledger pose is central/untilted); clearing returns to the
        // shared overview. Ledger-only: the planes exist nowhere else.
        if (st.layer !== prev.layer && st.mode === "ledger") {
          if (st.layer) this._focusLayer(st.layer.layerId);
          else this.focus("overview");
        }
      }),
    );

    this._loadData();
    this.setMode(this.mode); // also calls applyFilter()
    this.start();
  }

  // ---- data wiring (ports main.js loadGeoCache + metagraphs fetch + cluster) ----
  private async _loadData() {
    const net = initNetwork(); // idempotent; guarantees a NetworkData instance
    const n = net as unknown as { dagCore?: DagCore | null };
    if (n?.dagCore) this.dagCore = n.dagCore;
    net?.on("cluster", ({ dag }: { l0: ClusterNode[]; l1: ClusterNode[]; dag: DagCore }) => {
      this.dagCore = dag;
      this._buildGlobe();
      this._publishMetaList(); // the DAG core lives in the metaList — refresh it when clusters change
    });
    // Data-driven Hypergraph pulses: when a metagraph records a snapshot that anchored into a
    // global tick, fire a packet from its hub along the tether into the core; flash the core
    // itself on each new global snapshot (scaled by how many metagraphs it anchored).
    net?.on("anchor", ({ metaId }: { metaId: string }) => {
      this.layers.pulseMeta(metaId);
      if (this.mode === "ledger") this._ledgerDirty = true; // the per-tick breakdown filled in
    });
    net?.on("global", (evt: { latest: GlobalSnapshot | null }) => {
      if (this.mode === "ledger") this._ledgerDirty = true; // a new tick landed on the chain
      const ord = evt.latest?.ordinal;
      if (ord == null || ord === this._lastFlashOrdinal) return;
      this._lastFlashOrdinal = ord;
      const anchored = evt.latest?.metagraphSnapshotCount ?? 0;
      this.layers.flashCore(Math.min(1.3, 0.5 + anchored * 0.06)); // brighter when it anchored more
    });

    // Validator geo seed (instant plot); merged, not replaced, so it doesn't clobber
    // the metagraph IP geo that arrives from /api/metagraphs.
    loadGeo().then((m) => {
      this.geoMap = { ...this.geoMap, ...m };
      this._buildGlobe();
      this._applyMetagraphs();
    });

    // Live metagraphs + their geolocated node IPs (server-side; Phase 6 route).
    await this.refreshMeta(true);
    // Keep a long-open tab current. The snapshot/cluster/price feeds already poll
    // client-side (NetworkData), but the metagraph SET is fetched once — so re-pull
    // it on an interval too (Vercel never restarts; ISR only freshens the server
    // cache, not an idle client). Matches the route's revalidate window.
    this.metaTimer = setInterval(() => this.refreshMeta(false), 10 * 60 * 1000);
  }

  // Fetch the (server-cached, live) metagraph set + node geo. On the initial load we
  // build + frame as usual; on a periodic refresh we rebuild the nodes ONLY if the
  // set actually changed, and WITHOUT moving the camera (don't yank the user's view).
  private async refreshMeta(initial: boolean) {
    try {
      const r = await fetch("/api/metagraphs");
      if (!r.ok) return;
      const { metagraphs, geo } = await r.json();
      if (geo) this.geoMap = { ...this.geoMap, ...geo };
      const changed = JSON.stringify(metagraphs) !== JSON.stringify(this.metaData);
      this.metaData = metagraphs;
      this._publishMetaList(); // context-pane rows ready as soon as the route data is in
      // Globe colors nodes for ALL current metagraphs (incl. new ones the API adds later) AND the
      // DAG's own validator nodes, so rebuild the scene-color map over the live id set + "dag" on
      // every refresh, right before either path below calls setMetagraphs.
      const liveSceneColors = sceneColorsFor([...(this.metaData || []).map((m) => m.id), "dag"]);
      this.globe.sceneColors = liveSceneColors;
      this.ledger.setSceneColors(liveSceneColors); // re-tints the dials/pulses too (incl. new metagraphs)
      if (initial) {
        this._applyMetagraphs();
      } else if (this.metaData && changed && Object.keys(this.geoMap).length) {
        this.globe.setMetagraphs(this.metaData, this.geoMap);
        this._publishLeaderboard();
      }
    } catch {
      /* keep showing the last good data */
    }
  }

  // Fire onSceneReady exactly once, when the scene is structurally complete: the metagraph nodes
  // and the DAG core's own validator nodes have both been placed. Cheap to call on every placement
  // path — it self-guards after the first fire.
  private _maybeSceneReady() {
    if (!this._onSceneReady || !this._metaNodesPlaced || !this._coreNodesPlaced) return;
    const cb = this._onSceneReady;
    this._onSceneReady = undefined;
    cb();
  }

  private _buildGlobe() {
    if (!this.dagCore || !Object.keys(this.geoMap).length) return;
    this.globe.setNodes(this.dagCore, this.geoMap);
    this._coreNodesPlaced = true; // DAG core validator nodes are now in the scene
    this._applyMetagraphs(); // fires _maybeSceneReady once meta nodes are also placed
    const ips = this.dagCore.nodes.map((n) => n.ip);
    resolveGeo(this.geoMap, ips, (m) => {
      this.geoMap = m;
      if (this.dagCore) this.globe.setNodes(this.dagCore, this.geoMap);
      this._publishLeaderboard();
    });
    this._publishLeaderboard();
  }

  private _applyMetagraphs() {
    if (!this.metaData || !Object.keys(this.geoMap).length) return;
    this.globe.setMetagraphs(this.metaData, this.geoMap);
    this._metaNodesPlaced = true; // metagraph node shells are now in the scene
    this.applyFilter(false); // re-assert the filter's dimming on the new nodes — but DON'T move
    // the camera (this runs on every cluster/meta poll; moving it would reset the user's view).
    // metaList is published in refreshMeta (metagraph geo arrives with the route), so
    // we don't re-publish here — this runs on every cluster poll.
    this._maybeSceneReady(); // reveal the boot overlay once the core nodes are also in
  }

  // Push EVERY metagraph from the route data (not just the geo-filtered globe list) to
  // the store, so the context pane's Layers/Nodes/Make-up rows render from the raw node
  // data as soon as the route returns — independent of geolocation. `located` (count of
  // geolocatable nodes) + `countriesCount` come from the geo we have; the filter chips
  // use `located` for their count / disabled "(0)" state (what the globe can plot).
  private _publishMetaList() {
    const located = (nodes: { ip: string }[]) => nodes.filter((n) => this.geoMap[n.ip]).length;
    const countriesOf = (nodes: { ip: string }[]) =>
      new Set(nodes.map((n) => this.geoMap[n.ip]?.country).filter(Boolean)).size;
    const data: RouteMetagraph[] = this.metaData || [];
    const metas = data.map((m) => {
      const nodes = m.nodes || [];
      return {
        id: m.id, name: m.name, symbol: m.symbol, description: m.description,
        siteUrl: m.siteUrl, iconUrl: m.iconUrl,
        color: metagraphById(m.id)?.color ?? DEFAULT_META_COLOR,
        nodes, located: located(nodes), countriesCount: countriesOf(nodes),
      };
    });
    // The DAG is the root CORE — prepended so it's just another entry in the metaList that the
    // dossier / top-bar / leaderboard read uniformly (a metagraph-shaped network with roles).
    // `color` goes through the identity HUD map (like every other entry above) so the DAG shows
    // its own brand hue in the HUD, distinct from "All" — NOT `this.dagCore.color`, which api.js
    // hardcodes to structural COLORS.core for the (unrelated) 3D core-sphere default.
    const dag = this.dagCore
      ? [{
          id: "dag", name: "DAG", symbol: "DAG", description: this.dagCore.description,
          siteUrl: undefined, color: metagraphById("dag")?.color ?? this.dagCore.color, isRoot: true,
          nodes: this.dagCore.nodes, located: located(this.dagCore.nodes),
          countriesCount: countriesOf(this.dagCore.nodes),
        }]
      : [];
    const list = [...dag, ...metas];
    useStore.getState().setMetaList(list);
    // Tell the Hypergraph which hubs are live (have locatable nodes) so the rest render
    // dim + inactive; the engine also skips their picks (see _isPickActive).
    this._activeMetaIds = new Set(list.filter((m) => m.located > 0).map((m) => m.id));
    this.layers.setMetaActive(this._activeMetaIds);
  }

  // Re-read the ledger's live tick from the Global L0 buffer + the per-tick anchor index. Cheap
  // enough to call on each new tick / anchor fill, but only while the ledger view is showing.
  private _refreshLedger() {
    const net = getNetwork() as unknown as { globalSnapshots?: GlobalSnapshot[] } | null;
    this.ledger.setData(net?.globalSnapshots ?? [], (ts) => getAnchor(ts));
    this._ledgerDirty = false;
  }

  // ---- view + filter (ports ui.setMode / _applyFilter / camera focus) ----
  setMode(mode: Mode) {
    this.mode = mode;
    const policy = VIEW_POLICIES[mode];
    // View-derived sim gates → the scene modules (the render loop reads the rest of the policy).
    this.globe.setSimFlags(policy.sims);
    this.layers.setHubOrbits(policy.sims.hubOrbits);
    // Zoom floor: geo keeps the camera outside the globe surface (see viewPolicy.minCamDist).
    this.ctx.controls.minDistance = policy.minCamDist;
    // Snapshots view reuses the SAME hub/node meshes, laid out into planar rows. Toggle that
    // layout on the meshes (off restores the orbit/globe layout) and lock orbit so it reads 2D.
    const inLedger = mode === "ledger";
    this.layers.setLedger(inLedger);
    this.globe.setLedger(inLedger);
    this.ctx.controls.enableRotate = true; // the 3D layer stack is meant to be looked around
    // The country drill-down is geo-only; drop it on any view change so it can't
    // linger as a stale leaderboard highlight + mismatched zoom after leaving geo.
    if (this.country != null) {
      this.country = null;
      this.globe.setCountry(null);
      useStore.getState().setCountry(null);
    }
    // The Snapshots view: keep the reused meshes visible (the render loop places them into the
    // planar rows + shows the centered live snapshot); just dim non-selected columns and frame it.
    if (mode === "ledger") {
      this.layers.focusId = null;
      this.globe.focusDensest(false);
      this.ctx.controls.autoRotate = false;
      this.globe.setFilter(this.filter); // dim non-selected metagraph columns (no camera move)
      this.ledger.setFilter(this.filter); // neutralise the other lanes' tiles/links
      this._refreshLedger();
      // Ledger uses the SHARED overview camera — the camera never moves on a view switch; the group
      // transform (config.viewRotY/viewScale) frames the resting pose central/untilted. If a layer
      // is already committed, resume its tilted layer-focus framing instead.
      const selLayer = useStore.getState().layer;
      if (selLayer) this._focusLayer(selLayer.layerId);
      else this.focus("overview");
      return;
    }
    // The remaining placeholder views (status/transactions/staking) hide the 3D scene — reset to idle.
    if (mode !== "hyper" && mode !== "geo") {
      this.layers.focusId = null;
      this.globe.setFilter("all");
      this.globe.focusDensest(false);
      this.ctx.controls.autoRotate = true;
      this.focus("overview");
      return;
    }
    this.ctx.controls.autoRotate = mode !== "geo";
    this.applyFilter(false); // apply the filter's visuals, but leave the camera to _focusSelection
    // A selection's camera position carries across view switches: frame the selected node in the
    // new view (geo → its globe spot, hyper → its shell point), else the filter's default framing.
    this._focusSelection();
  }

  // `focusCamera` is false for BACKGROUND data refreshes (new cluster/meta/geo arriving) — they
  // must re-assert the filter's dimming/visibility on the freshly-built nodes WITHOUT yanking the
  // camera back to the filter preset (that was the "camera randomly resets" bug). Only a user
  // action (changing the view or the filter) moves the camera.
  applyFilter(focusCamera = true) {
    // Cache the focused hub record for the render loop's DoF read (killed the per-frame
    // `metas.find` — Task 15 allocation fix). `layers.metas` never gets rebuilt after
    // construction (config-driven, fixed 10 hubs), so this stays valid until the next filter/mode.
    this._dofMeta = this.layers.metas.find((x) => x.cfg.id === this.filter) ?? null;
    if (this.mode === "geo") {
      this.globe.setFilter(this.filter); // also clears globe.countryFilter
      if (focusCamera) this._applyGeoFocus();
    } else if (this.mode === "hyper") {
      // Dim the non-selected nodes ("the others") so the selected network stands out, on top
      // of the camera focus + DoF. "all" dims nothing (setFilter no-ops the dim).
      this.globe.setFilter(this.filter);
      if (focusCamera) {
        this.globe.focusDensest(false);
        this._focusFilter(this.filter);
      }
    } else if (this.mode === "ledger") {
      // Dim the non-selected metagraph columns so the selection stands out. The ledger neutralises
      // the other lanes' tiles/links. The camera stays put — EXCEPT when a layer is focused: the
      // layer framing is lane-aware (centres the selected metagraph's lane), so a filter change
      // re-runs it to slide over to the newly-selected lane.
      this.globe.setFilter(this.filter);
      this.ledger.setFilter(this.filter);
      const selLayer = useStore.getState().layer;
      if (focusCamera && selLayer) this._focusLayer(selLayer.layerId);
    }
    this._publishLeaderboard();
    // Tint the globe's land edge with the selected metagraph's SCENE colour (null → default
    // cyan). NOTE: globe.setEdgeColor currently ignores its argument and always uses the fixed
    // ice-blue rim (see scene/Globe.ts's setEdgeColor/`_edgeColor`) — kept here so a future
    // re-enable doesn't need call-site changes; "dag" now resolves to its own brand hue like
    // any other id, not structural cyan.
    const accent =
      this.filter && this.filter !== "all"
        ? new THREE.Color(identitySceneHex(this.filter)).getHex()
        : null;
    this.globe.setEdgeColor(accent);
  }

  // Aim/zoom the globe for the current network + country selection (ports
  // ui.js _applyGeoFocus): narrowed selections swing to the densest cluster, but only a
  // COUNTRY drill-down zooms in (proportional to concentration). A metagraph selection just
  // rotates the globe to its densest area at the DEFAULT geo distance — no zoom (node picks
  // zoom via _focusNode); "all" sits at the wide geo overview.
  private _applyGeoFocus() {
    const narrowed = this.filter !== "all" || this.country != null;
    const R = this.globe.focusDensest(narrowed);
    // Country drill-down zooms in proportional to concentration. A metagraph selection uses the
    // SAME framing at its wide end (R=0) — the camera drops low and looks across the front so the
    // tilted-up cluster is well-framed — but does NOT zoom (default geo distance). "all" = overview.
    if (this.country != null && R != null) this._focusGeo(R);
    else if (narrowed && R != null) this._focusGeo(0);
    else this.focus("geo");
  }

  // Frame the current SELECTION in whichever view we're in — so a selection's camera position
  // carries across view switches (geo → its globe spot, hyper → its shell point). No node
  // selected → the filter's default framing. One place, so every view stays consistent.
  private _focusSelection() {
    const inspect = useStore.getState().inspect;
    const isNode =
      !!inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode");
    if (this.mode === "geo") {
      if (isNode) this._focusInspectNode(inspect);
      else this._applyGeoFocus();
    } else if (this.mode === "hyper") {
      if (isNode) this._focusHyperNode(inspect!);
      else {
        this.globe.focusDensest(false);
        this._focusFilter(this.filter);
      }
    }
  }

  // Geo node selection (globe click or left-rail explorer): swing the node to the front
  // (with tilt) and zoom in closer than a country focus. Clearing the pick — or a pick we
  // can't locate — falls back to the current selection framing.
  private _focusInspectNode(p: PickDescriptor | null) {
    if (p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode")) {
      if (this.globe.focusNode(p.geo)) {
        this.ctx.controls.autoRotate = false;
        this._focusNode();
      }
    } else {
      this._applyGeoFocus();
    }
  }

  // Hypergraph node framing: fly to the node's live shell point (pulled back along its radial,
  // lifted a touch). Falls back to the network framing if the node can't be located.
  private _focusHyperNode(p: PickDescriptor) {
    const id = p.kind === "metanode" ? p.node?.ip : p.kind === "l0" || p.kind === "l1" ? p.node?.id : null;
    const pos = id ? this.globe.hyperWorldPos(id) : null;
    if (!pos) {
      this.globe.focusDensest(false);
      this._focusFilter(this.filter);
      return;
    }
    this.ctx.controls.autoRotate = false;
    this.layers.focusId = null;
    const dir = pos.clone().normalize();
    this._tweenTo(pos.clone().addScaledVector(dir, 9).add(new THREE.Vector3(0, 3, 0)), pos);
  }

  // Node framing: zoomed in, camera low in front of the node looking UP at a point ABOVE it
  // — so the line of sight skims across the globe surface toward the horizon, the node sitting
  // in the lower part of the frame (in view, but we look across rather than down at it).
  private _focusNode() {
    // z 21 → 19.4 (user: zoom in more) — close enough to read the hex prism's facets/edges,
    // still skimming the surface rather than staring down at it.
    this._tweenTo(new THREE.Vector3(0, 0, 19.4), new THREE.Vector3(0, 14, 2));
  }

  // Compute the per-country leaderboard for the active filter and push it to the store
  // (the React Leaderboard reads it). Cheap.
  private _publishLeaderboard() {
    if (!this.globe.nodes?.length) return;
    const countries = this.globe.countryStats(this.filter);
    useStore.getState().setLeaderboard({ countries });
    // Flat node list for the geo node browser (read-only; empty outside geo so the
    // browser stays quiet). Built on the same triggers as the leaderboard.
    useStore.getState().setSelNodes(this.mode === "geo" ? this.globe.listNodes(this.filter) : []);
  }

  // ---- picking (ports ui.js _pick / _pickablesFor / _onClick) ----
  // Resolve the view policy's pick sources to the actual mesh pools. Unlisted sources / flat views
  // (empty pickSources) raycast nothing. Order is immaterial — the raycaster sorts hits by distance.
  private _pickablesFor(): THREE.Object3D[] {
    const out = this._pickBuf;
    out.length = 0;
    for (const src of VIEW_POLICIES[this.mode].pickSources) {
      if (src === "globe") out.push(...this.globe.pickables);
      else if (src === "layers") out.push(...this.layers.pickables);
      else if (src === "ledger") out.push(...this.ledger.pickables);
    }
    return out;
  }

  private _pickAt(e: MouseEvent): PickDescriptor | null {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    const list = this._pickablesFor();
    if (!list.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(list, false);
    // Return the first hit that's part of the current selection — nodes filtered out of the
    // geo view are hidden, so they shouldn't be clickable/hoverable either (Three's raycaster
    // ignores scale/visibility, so the inactive ones must be skipped explicitly).
    // LAYER planes are FALLBACK picks: the big stacked floor planes sit between the camera and
    // everything below them, so a distance-ordered "first hit" would let the top plane steal every
    // pick. Content (blocks/nodes/hubs) wins; the nearest plane is returned only when nothing else
    // was hit along the ray.
    let layerFallback: PickDescriptor | null = null;
    for (const h of hits) {
      const pick: PickDescriptor | undefined = h.object.userData.picks
        ? h.object.userData.picks[h.instanceId as number]
        : h.object.userData.pick;
      if (!pick || !this._isPickActive(pick)) continue;
      if (pick.kind === "layer") {
        // Planes are only 3D targets while NO layer is committed — once one is selected (the
        // zoomed layer-focus pose), hovering/clicking the stack must not steal the highlight;
        // switching layers is the panel's job then (user decision).
        if (!this._layerCommitted) layerFallback ??= pick;
        continue;
      }
      return pick;
    }
    return layerFallback;
  }

  // The stable per-machine id of a node pick (a validator by its node id, a metagraph node by
  // its ip) — keys the persistent selection glow, matching the hover-pairing in _handleMove.
  private _pickNodeId(p: PickDescriptor | null): string | null {
    if (!p) return null;
    if (p.kind === "l0" || p.kind === "l1") return p.node?.id ?? null;
    if (p.kind === "metanode") return p.node?.ip ?? null;
    return null;
  }

  // The network (filter id) a node pick belongs to: its metagraph, or the DAG core for a
  // validator. Clicking a node sets the global filter to this, consistently in every view.
  private _pickNetId(p: PickDescriptor): string | null {
    if (p.kind === "metanode") return p.meta?.id ?? null;
    if (p.kind === "l0" || p.kind === "l1") return "dag";
    return null;
  }

  // Whether a pick participates in hover/click. In GEO the off-filter / off-country nodes are
  // genuinely hidden, so they're not pickable. In HYPER every node stays interactive — the
  // off-focus ones are only *dimmed*, not hidden, so clicking one (e.g. a core validator while
  // a metagraph is selected) drills into its network; gating them out there read as a bug.
  private _isPickActive(p: PickDescriptor): boolean {
    // A registered-but-node-less metagraph hub is shown (dim) but not selectable, so it
    // matches its inactive look + its "registered · no live nodes" filter chip.
    if (p.kind === "meta") return !this._activeMetaIds || this._activeMetaIds.has(p.cfg.id);
    if (this.mode !== "geo") return true;
    let id: string | undefined;
    if (p.kind === "l0" || p.kind === "l1") id = "dag"; // validators are the DAG core
    else if (p.kind === "metanode") id = p.meta?.id;
    else return true;
    if (!(this.filter === "all" || this.filter === id)) return false;
    if (this.country && p.geo?.cc !== this.country) return false;
    return true;
  }

  // Hover tooltip: only writes the store when the hovered target changes (not per
  // pixel); the Tooltip component positions itself from the pointer.
  private _handleMove(e: MouseEvent) {
    // Mid-drag (orbiting): no hover picking — raycasting the planes every move would flicker the
    // layer highlight across the stack while the user is just navigating.
    if (e.buttons !== 0) return;
    const p = this._pickAt(e);
    this.canvas.style.cursor = p ? "pointer" : "grab";
    const st = useStore.getState();

    // Route the hovered subject to ITS channel (each already drives a 3D effect + now the paired
    // card/row). Only the channel for the hovered kind is set; the others clear — so exactly one
    // subject is "hovered" at a time. Write only on change (mousemove is high-frequency).
    const nodeKey = hoverKeyOf(p);                                   // node → globe shell glow
    const snapOrd = p?.kind === "snapshot" ? p.data.ordinal : null;  // snapshot → ledger row
    const metaId = p?.kind === "meta" ? p.cfg?.id ?? null : null;    // hub → metagraph dim preview
    const layerId = p?.kind === "layer" ? p.layerId : null;          // floor plane → highlight preview
    if (nodeKey !== st.hoverNodeId) st.setHoverNodeId(nodeKey);
    if (snapOrd !== st.hoverSnapOrd) st.setHoverSnapOrd(snapOrd);
    if (metaId !== st.hoverFilter) st.setHoverFilter(metaId);
    if (layerId !== st.ledgerHilite) st.setLedgerHilite(layerId);    // same channel the panel rows write

    // The lean tooltip label — re-write the store only when the subject's identity changes so
    // following the cursor never re-renders React.
    const subj = tooltipSubject(p);
    const key = subj ? `${subj.ident}|${subj.name}|${subj.color}` : null;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    st.setHover(subj);
  }

  private _handleClick(e: MouseEvent) {
    // A click that ends a drag (orbit/pan) is navigation, not selection — see onDown.
    if (Math.hypot(e.clientX - this._downX, e.clientY - this._downY) > 5) return;
    const p = this._pickAt(e);
    if (!p) return;
    // A hub click selects the metagraph (opens its context pane + frames it).
    if (p.kind === "meta") {
      useStore.getState().setFilter(p.cfg.id);
      return;
    }
    // The ledger's centred snapshot tile selects that snapshot (opens the snapshot card) and pins
    // it (the FollowController only auto-follows the live tip when nothing is selected).
    if (p.kind === "snapshot") {
      useStore.getState().setFollowing(false);
      useStore.getState().setSnap(p);
      return;
    }
    // A floor PLANE click = the explore panel's row click: toggle the committed layer selection
    // (opens/clears the layer card; the layer-focus camera rides the store change).
    if (p.kind === "layer") {
      const st = useStore.getState();
      st.setLayer(st.layer?.layerId === p.layerId ? null : p);
      return;
    }
    // Clicking a node, in any view: drill the global filter into the node's network (its
    // metagraph, or the DAG core for a validator) and open its node card. Filter first, so the
    // node-focus camera move (set by the inspect) wins over the network framing.
    if (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode") {
      const netId = this._pickNetId(p);
      // Ledger: open the node card + light its lane (filter), but SKIP the camera move — the planar
      // settlement diagram must stay put. The card itself doesn't touch the 3D layout, so a node
      // click here behaves like every other view (card + filter), just without the focus tween.
      if (this.mode === "ledger") {
        if (netId) useStore.getState().setFilter(netId);
        useStore.getState().setInspect(p);
        return;
      }
      if (this.mode === "geo") this.ctx.controls.autoRotate = false;
      if (netId) useStore.getState().setFilter(netId);
      useStore.getState().setInspect(p);
    }
  }

  private focus(name: string) {
    const f = FOCI[name];
    if (f) this._tweenTo(f.pos, f.target);
  }


  private _tweenTo(toPos: Vec, toTgt: Vec) {
    const tw = this._tween;
    tw.fromPos.copy(this.ctx.camera.position);
    // Dolly every framing back by CAM_ZOOM (push the position out from its target) — one global lever
    // so all views sit a touch wider. Writes straight into tw.toPos, no extra allocation.
    tw.toPos.subVectors(toPos, toTgt).multiplyScalar(CAM_ZOOM).add(toTgt);
    tw.fromTgt.copy(this.ctx.controls.target);
    tw.toTgt.copy(toTgt);
    tw.t = 0;
    tw.dur = 1.4;
    tw.active = true;
  }


  // Fly to the tilted diagonal view of a settlement layer's floor plane (Snapshots view) — the
  // "nice tilted view" is an exploration move on layer selection, not the resting pose. The plane's
  // height is scaled by the ledger group's viewScale (the framing works in world units). For the
  // split hypergraph panes the framing also shifts LATERALLY so the sub-pane sits centred: the
  // group's viewRotY (−90°) maps the pane's local lane-centre z → world x = −laneZ (then scaled).
  private _focusLayer(layerId: string) {
    const l = LAYER_GEOM.find((x) => x.id === layerId);
    if (!l) return;
    ledgerLayerFraming(l.y * LEDGER.viewScale, this._framingOut);
    // Lateral centring: the METAGRAPH layers centre the selected metagraph's lane (its node ring /
    // snapshot cluster) when a network filter is active; the split hypergraph panes centre their
    // own pane; the global chain sits at lane-centre 0. The group's viewRotY (−90°) maps a local
    // lane z → world x = −z (then viewScale).
    let laneZ = l.laneZ;
    if (l.id === "ml1" || l.id === "ml0" || l.id === "msnap") {
      const idx = METAGRAPHS.findIndex((m) => m.id === this.filter);
      if (idx >= 0) laneZ = ledgerSite(idx, METAGRAPHS.length).z;
    }
    const dx = -laneZ * LEDGER.viewScale;
    this._framingOut.pos.x += dx;
    this._framingOut.target.x += dx;
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
  }

  private _focusGeo(R: number) {
    // Look head-on at the FRONT of the globe (target pushed forward in +Z, toward where the
    // focused country/selection is aimed) so it sits centred in the view rather than low.
    geoFraming(R, this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
  }

  private _focusFilter(filter: string) {
    this.layers.focusId = null;
    if (filter === "all") {
      this.ctx.controls.autoRotate = true;
      this.focus("overview");
      return;
    }
    this.ctx.controls.autoRotate = false;
    if (filter === "dag") {
      this.focus("dag"); // the central core — framed to fit both the L0 and cL1 shells
      return;
    }
    const meta = this.layers.metas.find((x) => x.cfg.id === filter);
    if (!meta) {
      this.focus("overview");
      return;
    }
    this.layers.focusId = filter; // anchor this hub so it stays framed
    hubFraming(meta.group.position, this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
  }

  // ---- render loop (ports main.js animate) ----
  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.stats?.begin();
      const dt = Math.min(this.clock.getDelta(), 0.05);

      const policy = VIEW_POLICIES[this.mode];
      const show = policy.show;

      // Ledger freezes morph at the view we entered from, so the reused node meshes fly in from
      // THAT layout (globe.ledgerT drives the lane fly-in instead). hyper/geo ease as usual.
      const target = policy.morph === "toGeo" ? 1 : policy.morph === "frozen" ? this.morph : 0;
      this.morph += (target - this.morph) * Math.min(1, dt * 1.1);
      this.layers.root.visible = this.morph < 0.985;
      this.layers.root.scale.setScalar(Math.max(0.0001, 1 - this.morph));

      this.globe.setMorph(this.morph);
      this.layers.update(dt, this.morph);
      this.globe.update(dt);
      this._updateTween(dt);
      this.ctx.controls.update();

      // Geometry visibility, driven by the view policy's `show.*`:
      //  - !hyperFurniture: the hyper root + core are force-managed — ledger keeps the root as its
      //    metagraph-L0 row (show.ledger), flat hides it; the core is hidden in both (the ledger's
      //    centred snapshot stands in for Global L0). When hyperFurniture is on (hyper/geo) the
      //    morph-driven root.visible above + HyperView's own core reveal stand.
      //  - globeSurface: the shared node group (+ earth surface).
      //  - ledger: the settlement chamber.
      // (There is no skydome — the scene's solid clear colour + fog are the whole backdrop.)
      if (!show.hyperFurniture) {
        this.layers.root.visible = show.ledger; // ledger: hubs become the metagraph-L0 row; flat: hidden
        this.layers.coreGroup.visible = false;
      }
      this.globe.group.visible = show.globeSurface;
      this.ledger.group.visible = show.ledger;
      if (show.ledger) {
        if (this._ledgerDirty) this._refreshLedger();
        this.ledger.update(dt);
      }

      // Depth of field: only a single focused metagraph, and only where the policy allows it (hyper).
      const metaSel = this.filter !== "all" && this.filter !== "dag";
      const dofMix = THREE.MathUtils.clamp(1 - (this.morph - 0.4) / 0.2, 0, 1);
      this.ctx.dof.enabled = policy.dofEligible && metaSel && dofMix > 0.001;
      if (this.ctx.dof.enabled) {
        const meta = this._dofMeta;
        const focusTarget = meta
          ? meta.group.getWorldPosition(this._dofTmp)
          : this.ctx.controls.target;
        this.ctx.dof.uniforms["focus"].value = this.ctx.camera.position.distanceTo(focusTarget);
        this.ctx.dof.uniforms["maxblur"].value = 0.07 * dofMix; // out-of-focus blur
      }

      this.ctx.composer.render();
      if (this._onReady) {
        const cb = this._onReady;
        this._onReady = undefined;
        cb();
      }
      this.stats?.end();
    };
    loop();
  }

  private _updateTween(dt: number) {
    const tw = this._tween;
    if (!tw.active) return;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = easeInOutQuad(tw.t);
    this.ctx.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.ctx.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
    if (tw.t >= 1) tw.active = false;
  }

  dispose() {
    this.disposed = true;
    if (this.metaTimer) clearInterval(this.metaTimer);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("resize", this.onResize);
    this.stats?.dom.remove();
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
