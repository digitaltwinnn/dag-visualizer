import * as THREE from "three";
import Stats from "stats.js";
import { useStore, type Mode } from "@/src/store/store";
import { metagraphById, initNetwork, getNetwork, getAnchor, shortHash, CORE_HEX, DEFAULT_META_COLOR } from "@/src/data/network";
import { hex } from "@/src/util/format";
// Existing vanilla modules, reused. Bare specifiers resolve via npm; they ship no types
// of their own, so their surface is described in ./boundary and applied at construction.
import { createScene } from "../../js/scene.js";
import { Layers } from "../../js/layers.js";
import { Globe } from "../../js/globe.js";
import { Ledger } from "../../js/ledger.js";
import { loadGeoCache, resolveMissing } from "../../js/geo.js";
import type { GlobalSnapshot, PickDescriptor } from "@/src/data/types";
import type {
  ClusterNode,
  DagCore,
  GeoMap,
  GlobeApi,
  LayersApi,
  LedgerApi,
  RouteMetagraph,
  SceneCtx,
} from "./boundary";

type Vec = THREE.Vector3;

// The js/ modules ship no types and `allowJs` only infers partial/loose ones, so pin
// them to the curated surface in ./boundary here — the single place these assertions
// live. Everything downstream is then fully checked.
const makeScene = createScene as (canvas: HTMLCanvasElement) => SceneCtx;
const LayersCtor = Layers as unknown as new (scene: THREE.Scene) => LayersApi;
const GlobeCtor = Globe as unknown as new (
  scene: THREE.Scene,
  layers: LayersApi,
  camera: THREE.Camera,
) => GlobeApi;
const LedgerCtor = Ledger as unknown as new (scene: THREE.Scene) => LedgerApi;
const loadGeo = loadGeoCache as () => Promise<GeoMap>;
const resolveGeo = resolveMissing as (
  map: GeoMap,
  ips: string[],
  onResolved: (m: GeoMap) => void,
) => void;

// Camera presets (ported from ui.js FOCI).
const FOCI: Record<string, { pos: Vec; target: Vec }> = {
  overview: { pos: new THREE.Vector3(0, 15, 60), target: new THREE.Vector3(0, 2, 0) },
  l0: { pos: new THREE.Vector3(0, 6, 20), target: new THREE.Vector3(0, 1, 0) },
  // The whole DAG core: pulled back enough to frame the outer cL1 (purple) shell (radius 14)
  // — focus("l0") sat too close and clipped it off-frame.
  dag: { pos: new THREE.Vector3(0, 9, 38), target: new THREE.Vector3(0, 1, 0) },
  l1: { pos: new THREE.Vector3(14, 10, 26), target: new THREE.Vector3(0, 0, 0) },
  metagraphs: { pos: new THREE.Vector3(0, 30, 70), target: new THREE.Vector3(0, 0, 0) },
  geo: { pos: new THREE.Vector3(0, 11, 36), target: new THREE.Vector3(0, 2, 0) },
  // The Snapshots view is a stack of transparent wireframe FLOORS (layers) on Y. Frame it from an
  // elevated front angle so the stacked planes read in 3D — see js/ledger.js + config.LEDGER.
  // Default framing: the LEAD (latest block) sits toward the bottom-right, leaving the rest of the
  // view for the trailing chains; looking roughly along -X. Orbit is free.
  ledger: { pos: new THREE.Vector3(31, 14, 20), target: new THREE.Vector3(-17, 1, -2) },
};

// Imperative engine: owns the scene, the Hypergraph + globe, the render loop, the
// camera-focus tweens, and the command surface React drives via the store. Ports
// main.js's render loop + ui.js's camera focus, decoupled from any DOM/panels.
export class Engine {
  private ctx: SceneCtx;
  private layers: LayersApi;
  private globe: GlobeApi;
  private ledger: LedgerApi;
  private _ledgerDirty = false; // rebuild the ledger geometry next frame (set on data events)
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private _dofTmp = new THREE.Vector3();

  private mode: Mode = "hyper";
  private filter = "all";
  private country: string | null = null;
  private morph = 0; // 0 = hypergraph, 1 = globe (eased each frame)
  private _hoverMetaId: string | null = null; // metagraph currently hovered (hub/node) → filter preview
  private _baseFog: THREE.FogBase | null = null; // scene.js FogExp2 (hyper/geo); captured lazily
  private _ledgerFog: THREE.Fog | null = null;    // stronger linear depth fog for the trailing chain
  private tween: {
    fromPos: Vec; toPos: Vec; fromTgt: Vec; toTgt: Vec; t: number; dur: number;
  } | null = null;

  private geoMap: GeoMap = {};
  private dagCore: DagCore | null = null;
  private metaData: RouteMetagraph[] | null = null;
  // Metagraph ids with locatable nodes (selectable hubs); null until counts load (all allowed).
  private _activeMetaIds: Set<string> | null = null;
  private _lastFlashOrdinal = -1; // de-dupes the core flash to genuinely new global snapshots

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private onClick = (e: MouseEvent) => this._handleClick(e);
  private onMove = (e: MouseEvent) => this._handleMove(e);
  private _hoverKey: string | null = null;

  private unsub: Array<() => void> = [];
  private metaTimer: ReturnType<typeof setInterval> | undefined;
  private onResize = () => this.ctx.resize?.();
  // FPS/ms monitor — dev only, or in prod via `?stats`/`#stats` for ad-hoc checks, so
  // it never shows for real users. Click the panel to cycle FPS → ms → MB.
  private stats?: Stats;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = makeScene(canvas);
    this.layers = new LayersCtor(this.ctx.scene);
    this.globe = new GlobeCtor(this.ctx.scene, this.layers, this.ctx.camera);
    this.ledger = new LedgerCtor(this.ctx.scene);
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("pointermove", this.onMove);
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
        if (st.learnFocus !== prev.learnFocus) this.setLearnFocus(st.learnFocus);
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
    net?.on("global", (evt: { latest?: GlobalSnapshot }) => {
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

  private _buildGlobe() {
    if (!this.dagCore || !Object.keys(this.geoMap).length) return;
    this.globe.setNodes(this.dagCore, this.geoMap);
    this._applyMetagraphs();
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
    this.ledger.setGroupSizes(this.globe.ledgerGroups); // size the Snapshots rings to the node counts
    this.applyFilter(false); // re-assert the filter's dimming on the new nodes — but DON'T move
    // the camera (this runs on every cluster/meta poll; moving it would reset the user's view).
    // metaList is published in refreshMeta (metagraph geo arrives with the route), so
    // we don't re-publish here — this runs on every cluster poll.
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
        siteUrl: m.siteUrl, color: metagraphById(m.id)?.color ?? DEFAULT_META_COLOR,
        nodes, located: located(nodes), countriesCount: countriesOf(nodes),
      };
    });
    // The DAG is the root CORE — prepended so it's just another entry in the metaList that the
    // dossier / top-bar / leaderboard read uniformly (a metagraph-shaped network with roles).
    const dag = this.dagCore
      ? [{
          id: "dag", name: "DAG", symbol: "DAG", description: this.dagCore.description,
          siteUrl: undefined, color: this.dagCore.color, isRoot: true,
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
    // Stronger DEPTH fog for the ledger trail — the oldest blocks recede + fog into the background
    // (that's the "old blocks fade" effect, depth-based, not a per-block hack). Restore the scene's
    // base FogExp2 (tuned for hyper/geo) on every other view.
    if (!this._ledgerFog) {
      this._baseFog = this.ctx.scene.fog;
      this._ledgerFog = new THREE.Fog(this._baseFog ? this._baseFog.color.getHex() : 0x05060e, 46, 70);
    }
    this.ctx.scene.fog = mode === "ledger" ? this._ledgerFog : this._baseFog;
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
      this._snapTo(FOCI.ledger.pos, FOCI.ledger.target); // appear already-oriented (no camera tween)
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
      // Dim the non-selected metagraph columns so the selection stands out; never move the camera
      // (the planar diagram stays framed head-on). The ledger neutralises the other lanes' tiles/links.
      this.globe.setFilter(this.filter);
      this.ledger.setFilter(this.filter);
    }
    this._publishLeaderboard();
    // Tint the globe's land edge with the selected metagraph's colour (null → default cyan).
    const accent = metagraphById(this.filter)?.color ?? null;
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
    this._tweenTo(new THREE.Vector3(0, 0, 21), new THREE.Vector3(0, 15, 2));
  }

  // Compute the per-country leaderboard + distribution score for the active filter
  // and push them to the store (the React Leaderboard reads them). Cheap.
  private _publishLeaderboard() {
    if (!this.globe.nodes?.length) return;
    const countries = this.globe.countryStats(this.filter);
    const { scores, refId } = this.globe.distributionScores();
    useStore.getState().setLeaderboard({ countries, score: scores[this.filter] ?? null, refId });
    // Flat node list for the geo node browser (read-only; empty outside geo so the
    // browser stays quiet). Built on the same triggers as the leaderboard.
    useStore.getState().setSelNodes(this.mode === "geo" ? this.globe.listNodes(this.filter) : []);
  }

  // ---- picking (ports ui.js _pick / _pickablesFor / _onClick) ----
  private _pickablesFor(): THREE.Object3D[] {
    if (this.mode === "hyper") return this.layers.pickables.concat(this.globe.pickables);
    if (this.mode === "geo") return this.globe.pickables;
    // Ledger: the centered snapshot (snapshot pick) + the reused producer dots (metanode/validator
    // picks → filter into that column).
    if (this.mode === "ledger") return this.ledger.pickables.concat(this.globe.pickables);
    return []; // placeholder views: nothing pickable
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
    for (const h of hits) {
      const pick: PickDescriptor | undefined = h.object.userData.picks
        ? h.object.userData.picks[h.instanceId as number]
        : h.object.userData.pick;
      if (pick && this._isPickActive(pick)) return pick;
    }
    return null;
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
    const p = this._pickAt(e);
    // The node's identity line for the tooltip — its node ID (shortened) when it has one,
    // else its IP. Same identity the geo node card leads with, so hover ≈ that card.
    const idText =
      p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode")
        ? p.node?.id
          ? shortHash(p.node.id)
          : p.node?.ip ?? ""
        : "";
    // The hovered subject's network colour, for the tooltip's leading bullet: a metagraph
    // node / hub takes its metagraph colour; a DAG validator or the L0 core, the core cyan.
    const color =
      p?.kind === "metanode" && p.meta
        ? hex(p.meta.color)
        : p?.kind === "meta"
          ? hex(p.cfg.color)
          : p && (p.kind === "l0" || p.kind === "l1" || p.kind === "core")
            ? CORE_HEX
            : undefined;
    const key = p ? `${p.title}|${p.sub}|${p.roles?.join(",") ?? ""}|${idText}|${color ?? ""}` : null;
    this.canvas.style.cursor = p ? "pointer" : "grab";
    // Hover-pairing: glow every layer-shell instance of the hovered node (a validator by its
    // machine id, a metagraph node by its ip) — so a hybrid's shells read as one machine.
    const hoverId =
      p?.kind === "metanode" ? p.node?.ip : p?.kind === "l0" || p?.kind === "l1" ? p.node?.id : null;
    this.globe.setHoverNode(hoverId ?? null);
    // Hovering a metagraph HUB sphere previews that metagraph's filter highlight — the SAME effect as
    // hovering its filter pill (dims the others). (Its nodes keep the node-shell glow above.) Cleared
    // when not over a hub.
    const hoverMeta = p?.kind === "meta" ? p.cfg?.id ?? null : null;
    if (hoverMeta !== this._hoverMetaId) {
      this._hoverMetaId = hoverMeta;
      useStore.getState().setHoverFilter(hoverMeta);
    }
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    useStore
      .getState()
      .setHover(
        p ? { title: p.title ?? "", sub: p.sub ?? "", roles: p.roles, id: idText || undefined, color } : null,
      );
  }

  private _handleClick(e: MouseEvent) {
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
    // Clicking a node, in any view: drill the global filter into the node's network (its
    // metagraph, or the DAG core for a validator) and open its node card. Filter first, so the
    // node-focus camera move (set by the inspect) wins over the network framing.
    if (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode") {
      const netId = this._pickNetId(p);
      // Ledger: a producer dot just highlights its column (set the filter) — no node card / camera
      // move, so the planar diagram stays put.
      if (this.mode === "ledger") {
        if (netId) useStore.getState().setFilter(netId);
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

  // "Understand the network" topic: frame it + dim the rest (ports ui.js focus +
  // _highlight). null clears the dim and returns to the idle overview.
  setLearnFocus(name: string | null) {
    // The "metagraphs" topic ("networks of their own") is about the orbiting metagraphs —
    // if one is currently selected (the filter), frame THAT metagraph (the explore card is
    // tied to the active filter) instead of the generic pulled-back metagraphs shot.
    if (name === "metagraphs") {
      const filter = useStore.getState().filter;
      const isMeta = this.layers.metas.some((x) => x.cfg.id === filter);
      if (isMeta) this._focusFilter(filter);
      else this.focus("metagraphs");
    } else {
      this.focus(name || "overview");
    }
    this.layers.setHighlight(name);
    this.globe.setHighlight(name);
    this.ctx.controls.autoRotate = !name;
  }

  private _tweenTo(toPos: Vec, toTgt: Vec) {
    this.tween = {
      fromPos: this.ctx.camera.position.clone(),
      toPos: toPos.clone(),
      fromTgt: this.ctx.controls.target.clone(),
      toTgt: toTgt.clone(),
      t: 0,
      dur: 1.4,
    };
  }

  // Jump the camera straight to a framing — no tween (used for the Snapshots view, whose planar diagram
  // is meant to appear already-oriented; tweening it in read as the planes swinging into place).
  private _snapTo(toPos: Vec, toTgt: Vec) {
    this.tween = null; // cancel any in-flight tween
    this.ctx.camera.position.copy(toPos);
    this.ctx.controls.target.copy(toTgt);
    this.ctx.controls.update();
  }

  private _focusGeo(R: number) {
    const t = THREE.MathUtils.smoothstep(R, 0.7, 1.0);
    // Look head-on at the FRONT of the globe (target pushed forward in +Z, toward where the
    // focused country/selection is aimed) so it sits centred in the view rather than low.
    this._tweenTo(
      new THREE.Vector3(0, THREE.MathUtils.lerp(7, 6, t), THREE.MathUtils.lerp(34, 26, t)),
      new THREE.Vector3(0, THREE.MathUtils.lerp(2, 2.5, t), 7),
    );
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
    const hub = meta.group.position.clone();
    const out = hub.clone().normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
    const camPos = hub
      .clone()
      .addScaledVector(out, 12)
      .addScaledVector(side, -6)
      .addScaledVector(new THREE.Vector3(0, 1, 0), 5.5);
    this._tweenTo(camPos, hub);
  }

  // ---- render loop (ports main.js animate) ----
  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.stats?.begin();
      const dt = Math.min(this.clock.getDelta(), 0.05);

      // Ledger freezes morph at the view we entered from, so the reused node meshes fly in from
      // THAT layout (globe.ledgerT drives the lane fly-in instead). hyper/geo ease as usual.
      const target = this.mode === "geo" ? 1 : this.mode === "ledger" ? this.morph : 0;
      this.morph += (target - this.morph) * Math.min(1, dt * 1.1);
      this.layers.root.visible = this.morph < 0.985;
      this.layers.root.scale.setScalar(Math.max(0.0001, 1 - this.morph));

      this.globe.setMorph(this.morph);
      // Stars/nebula belong to geo only; in ledger force the plain hyper-end backdrop (no starfield).
      this.ctx.background.update(dt, this.mode === "ledger" ? 0 : this.morph);
      this.layers.update(dt, this.morph);
      this.globe.update(dt);
      this._updateTween(dt);
      this.ctx.controls.update();

      // The Snapshots view REUSES the hub/node meshes (placed into planar rows by layers/globe) +
      // its own centered live snapshot; only the hyper core is hidden (the snapshot stands in for
      // it). The placeholder views (status/transactions/staking) stay fully flat (scene hidden).
      const showLedger = this.mode === "ledger";
      const flat = this.mode !== "hyper" && this.mode !== "geo" && !showLedger;
      if (flat) {
        this.layers.root.visible = false;
        this.layers.coreGroup.visible = false;
      } else if (showLedger) {
        this.layers.root.visible = true; // hubs become the metagraph-L0 row
        this.layers.coreGroup.visible = false; // the centered snapshot represents Global L0
      }
      this.globe.group.visible = !flat; // ledger shows the reused node dots
      this.ctx.background.mesh.visible = !flat; // ledger keeps the starfield/backdrop
      this.ledger.group.visible = showLedger;
      if (showLedger) {
        if (this._ledgerDirty) this._refreshLedger();
        this.ledger.update(dt);
      }

      // Depth of field: only a single focused metagraph in the Hypergraph (not all / the DAG core).
      const metaSel = this.mode === "hyper" && this.filter !== "all" && this.filter !== "dag";
      const dofMix = THREE.MathUtils.clamp(1 - (this.morph - 0.4) / 0.2, 0, 1);
      this.ctx.dof.enabled = metaSel && dofMix > 0.001;
      if (this.ctx.dof.enabled) {
        const meta = this.layers.metas.find((x) => x.cfg.id === this.filter);
        const focusTarget = meta
          ? meta.group.getWorldPosition(this._dofTmp)
          : this.ctx.controls.target;
        this.ctx.dof.uniforms["focus"].value = this.ctx.camera.position.distanceTo(focusTarget);
        this.ctx.dof.uniforms["maxblur"].value = 0.07 * dofMix; // out-of-focus blur
      }

      this.ctx.composer.render();
      this.stats?.end();
    };
    loop();
  }

  private _updateTween(dt: number) {
    if (!this.tween) return;
    const tw = this.tween;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2; // easeInOutQuad
    this.ctx.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    this.ctx.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e);
    if (tw.t >= 1) this.tween = null;
  }

  dispose() {
    this.disposed = true;
    if (this.metaTimer) clearInterval(this.metaTimer);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("resize", this.onResize);
    this.stats?.dom.remove();
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
