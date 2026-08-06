import * as THREE from "three";
import Stats from "stats.js";
import { useStore, type Mode } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { metagraphById, initNetwork, getNetwork, getAnchor, DEFAULT_META_COLOR, resolveSignerIps } from "@/src/data/network";
import { hoverKeyOf, tooltipSubject } from "@/src/data/hoverSubject";
import { identityMap, identitySceneHex } from "@/src/palette/identity";
import { createScene, type SceneCtx } from "./scene/SceneContext";
import { HyperView, type MetaHubRec } from "./scene/views/HyperView";
import { Globe, GATHER_CELL } from "./scene/Globe";
import { LedgerView } from "./scene/views/LedgerView";
import { StageLights } from "./scene/objects/StageLights";
import { loadGeoCache, resolveMissing } from "@/src/data/geoResolve";
import { METAGRAPHS, COLORS } from "@/src/engine/config";
import { LEDGER, LAYER_GEOM, railX, BYTE_SCALE_KB, type RailGroup } from "./domain/ledgerLayout";
import { railLit } from "./domain/ledgerRails";
import { HYPER_TILT, HYPER_TILT_FOCUS } from "./domain/hyperLayout";
import { readSceneColors } from "./sceneColors";
import { VIEW_POLICIES, type ViewPolicy } from "./domain/viewPolicy";
import { FOCI, hubFraming, geoFraming, ledgerFloorFraming, ledgerRailFraming, ledgerNodeFraming, nodeFraming, cohortFraming, hyperNodeFraming, dollyBack, easeInOutQuad, type CameraFraming } from "./domain/cameraRig";
import { countryFraming } from "./domain/countryShape";
import { R as GEO_R, LAND_H } from "./domain/geoLayout";
import { clickActions, pickActive, pickNetId, viewEntryActions, metaSnapSelectActions, bandSelectActions } from "./domain/pickActions";
import { ViewTransition, is3D, type View3D } from "./domain/viewTransition";
import { LADDERS, hasLevel, type CohortSel, type CompositionSel, type SelectionSnapshot, type ResolverKey } from "./domain/focusLadder";
import { compositionGroups, compositionKey, compositionRows } from "@/src/data/composition";
import { metaSnapDeepKey } from "@/src/data/types";
import { snapsAtTick } from "@/src/data/anchorLog";
import type { CurrencyActivity, GlobalSnapshot, NodeRow, PickDescriptor } from "@/src/data/types";
import type { ClusterNode, DagCore, GeoMap, RouteMetagraph } from "@/src/data/types";

type Vec = THREE.Vector3;

// View-transition staging plane (the gather grids the nodes fly to at the top of the viewport).
// GATHER_DIST = the plane's depth in front of the camera; GATHER_TOP_FRAC = fraction of the
// frustum half-height above centre where the band sits (the top third). Both camera-anchored, so
// the grids read the same at any pose.
const GATHER_DIST = 34;
const GATHER_TOP_FRAC = 0.62;
// The aspect the staging grid's cell size (Globe's GATHER_CELL) was tuned at (desktop-ish
// 16:10). Narrower viewports (phone portrait, aspect ~0.46) scale the cell down proportionally
// so the packed row of per-network squares (domain/gatherLayout) still fits the frustum width —
// verified live (Task 8): unscaled, the DAG's big square ran off the right edge at phone width.
const GATHER_CELL_ASPECT_REF = 1.6;

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

// Camera presets + framing math + the global CAM_ZOOM dolly all live in ./domain/cameraRig —
// pure, allocation-free (writes into caller-provided out structs); the Engine only orchestrates.

// Imperative engine: owns the scene, the Hypergraph + globe, the render loop, the
// camera-focus tweens, and the command surface React drives via the store. Ports
// main.js's render loop + ui.js's camera focus, decoupled from any DOM/panels.
export class Engine {
  private ctx: SceneCtx;
  private layers: HyperView;
  private globe: Globe;
  private ledger: LedgerView;
  // The ONE stage-light lifecycle owner (spec A#3): every view's FocusSpot registers here at
  // construction; the render loop gates it once per frame with the per-view furniture alphas so
  // a view can no longer forget its own spotOff (the lingering-light bug class this replaced).
  private _stageLights = new StageLights();
  // Per-frame gate-call scratch (zero-allocation) — mutated in place, never re-literal'd.
  private _lightAlphas: Record<View3D, number> = { hyper: 0, geo: 0, ledger: 0 };
  private _ledgerDirty = false; // rebuild the ledger geometry next frame (set on data events)
  // The frame timer — THREE.Timer (THREE.Clock was deprecated in r180). Unlike Clock it must be
  // updated once per frame before reading the delta; the render loop does that.
  private clock = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private _dofTmp = new THREE.Vector3();

  private mode: Mode = "hyper";
  // This frame's view-policy row (domain/viewPolicy.ts), resolved once in _integrateInputs and
  // read by every later phase this frame — a table-row reference, no allocation.
  private _policy: ViewPolicy = VIEW_POLICIES.hyper;
  private filter = "all";
  private _hoverFilter: string | null = null; // previewed filter (chip/hub hover); drives the core dim
  private country: string | null = null;
  // Committed cohort (city×provider) selection, mirrored from the store — read by
  // `_handleClick`'s `clickActions` call (kept in sync by the subscription below; Task 3 also
  // reads it for camera resolution).
  private cohortSel: CohortSel | null = null;
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
  // The mesh that produced the LAST pick returned by `_pickAt` (null when nothing was picked).
  // Some ledger subjects carry a second fact on the hit object itself rather than in the descriptor
  // — a byte-bar band's `userData.bandKey` beside its tick `userData.pick` — and the click handler
  // needs both. Event-time only; never read from the render loop.
  private _hitObj: THREE.Object3D | null = null;
  private _hubWorld = new THREE.Vector3(); // scratch: hub local pos tilted into world for framing
  private _focusEuler = new THREE.Euler(); // scratch: the focus TARGET rotation (flat tilt + spin)
  private _hyperSpinY = 0; // shared hyper-structure spin angle (globe group + root + core, in lockstep)
  // The shared structure TILT, eased per frame: HYPER_TILT at rest → HYPER_TILT_FOCUS while a
  // metagraph is committed (the structure flattens so the side-on hub pose sees horizontal discs).
  private _hyperTiltX = HYPER_TILT;

  // The ONE view-transition state machine (domain/viewTransition). Every 3D↔3D view switch runs the
  // staged gather choreography through it; the render loop advances it + feeds the furniture alphas,
  // and the boundary (tick() true once) applies the destination layout while the nodes are gathered.
  private transition = new ViewTransition();
  private _gatherO = new THREE.Vector3(); // scratch: staging-plane origin (world), per frame
  private _gatherR = new THREE.Vector3(); // scratch: staging-plane right (world)
  private _gatherU2 = new THREE.Vector3(); // scratch: staging-plane up (world)
  private _pendingBoundary: Mode | null = null; // destination whose layout applies at the boundary
  // Set when a 3D→3D retarget reverses straight back to its origin mid-OUT (no boundary will
  // fire, so the held camera never replays a mid-flight commit) — re-resolve focus once the
  // transition settles. See _integrateInputs' completion-edge check below.
  private _resettleFocus = false;
  private _wasTransitionActive = false; // last frame's transition.active(), for the completion-edge check

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
  // Land-sphere hit scratch for the scene country hover/click (ray→sphere analytically —
  // the sphere is rotation-invariant, so no mesh raycast is needed).
  private _landSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GEO_R + LAND_H);
  private _landHit = new THREE.Vector3();
  private pointer = new THREE.Vector2();
  private canvas: HTMLCanvasElement;
  private onClick = (e: MouseEvent) => this._handleClick(e);
  private onMove = (e: MouseEvent) => this._handleMove(e);
  // Leaving the canvas (onto a card/rail) stops pointermoves, so transient hovers would
  // otherwise linger — clear them all at the boundary.
  private onLeave = () => this._clearHover();
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
  // Transition slow-motion — dev only, or via `?slowmo=4` in prod (like ?stats): scales the
  // choreography clock so mid-flight states are screenshotable WITHOUT hand-stretching the
  // DUR_* constants in source (spec C#4 — three separate hand-stretch-and-revert rounds).
  // Clamped to [0.1, 20]; applies to the transition machine AND the camera tween while a
  // transition is live, so the flight and the camera stay in sync. Values <1 SPEED UP the
  // choreography instead (e.g. `?slowmo=0.3` for a quick UI/UX pass — the ~3.9s 3D↔3D switch
  // completes in ~1.2s) — dt is divided by `_slowmo` at both call sites, so a fraction grows dt.
  // No param → stays 1 → the whole mechanism is a no-op, so the parse itself is the dev/prod gate
  // (unlike `stats`, which toggles a visible DOM panel and so needs an explicit environment check).
  private _slowmo = 1;
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
    this.layers = new HyperView(this.ctx.scene, colors, this._stageLights, sceneColorsFor(METAGRAPHS.map((m) => m.id)));
    this.globe = new Globe(this.ctx.scene, this.layers, this.ctx.camera, colors, this._stageLights);
    // The Globe reads the transition machine each frame (geo furniture alpha + the node gather).
    this.globe.transition = this.transition;
    // ONE identity colour system everywhere: the ledger + globe are handed the same identity
    // SCENE map the hubs were born with, at construction, so nothing anywhere is built from a raw
    // config colour ("dag" included — its own brand hue, distinct from structural cyan; see
    // palette/identity.ts). refreshMeta below refreshes/extends both once the live set is known.
    const initialSceneColors = sceneColorsFor([...METAGRAPHS.map((m) => m.id), "dag"]);
    this.ledger = new LedgerView(this.ctx.scene, colors, initialSceneColors, this._stageLights);
    // A tile's identity comes from the POLLED feed (spec §6.1) — the Engine is the store/data
    // bridge, so the lookup lives here and the model stays pure. A tile the buffer can't name is
    // anonymous: drawn, but not pickable. `k` is the tile's index within ITS TICK.
    this.ledger.setTileResolver((metaId, ts, k) => {
      const net = getNetwork();
      if (!net) return null;
      const s = snapsAtTick(net.metaSnaps, metaId, ts)[k];
      if (!s) return null;
      const g = net.globalSnapshots.find((gs) => gs.timestamp === ts);
      if (!g) return null;
      return {
        kind: "metaSnap",
        sel: { metaId, ordinal: s.ordinal, hash: s.hash, globalOrdinal: g.ordinal, ts },
        global: { kind: "snapshot", data: g, title: `Global snapshot #${g.ordinal}` },
      };
    });
    // The globe colours the DAG's own validator nodes (the L0/cL1 shells) with sceneColors["dag"]
    // (see globe.js setNodes) — seed it here, synchronously, so it's populated before the first
    // setNodes call (which can fire from the "cluster" event before refreshMeta's API round-trip
    // resolves).
    this.globe.sceneColors = initialSceneColors;
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerleave", this.onLeave);
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

    const smMatch = /[?#&]slowmo=([\d.]+)/.exec(window.location.search + window.location.hash);
    const smVal = smMatch ? parseFloat(smMatch[1]) : NaN;
    this._slowmo = Number.isFinite(smVal) && smVal > 0 ? Math.min(20, Math.max(0.1, smVal)) : 1;

    // Apply current store state, then react to changes (Lane B command bridge).
    const s = useStore.getState();
    this.mode = s.mode;
    this.filter = s.filter;
    this.cohortSel = s.cohort;
    this._layerCommitted = s.layer != null; // seed — subscription only sees CHANGES (HMR remount)
    // Booting straight into geo (deep link / persisted view): seed morph=1 so the boot layout
    // is the globe from the first frame.
    if (this.mode === "geo") this.morph = 1;
    // Seed a valid transition state before the first render frame. NB the `setMode(this.mode)`
    // call in the constructor tail runs `place(mode)` from this idle seed, so a fresh load into
    // a 3D view plays the staging-dissolve INTRO (nodes disperse from the top grids into the
    // view — user 2026-07-17: accepted as the boot animation, final layout is correct). A
    // flat/"soon" boot parks the fleet at the grids instead; the first 3D view entered later
    // runs step 2 from there — one choreography everywhere.
    if (this.mode === "hyper" || this.mode === "geo" || this.mode === "ledger") this.transition.settle(this.mode);
    else this.transition.stageInstant();
    this.unsub.push(
      useStore.subscribe((st, prev) => {
        if (st.mode !== prev.mode) this.setMode(st.mode);
        if (st.filter !== prev.filter) {
          this.filter = st.filter;
          // Switching network clears any country drill-down (matches the old geo UX).
          this.country = null;
          if (prev.country != null) useStore.getState().setCountry(null);
          // A filter switch is a NETWORK-level event (focusLadder): it drops every finer
          // selection — node (any view; in geo the switch can hide the inspected node outright),
          // cohort, composition, country — so _resolveFocus lands on the network rung. The
          // ordering contract holds because nodeSelectActions emits filter FIRST and
          // inspect/cohort/composition AFTER it: this clear runs on the filter write, then the
          // later actions re-commit the new ancestry.
          if (st.inspect) useStore.getState().setInspect(null);
          if (st.cohort) useStore.getState().setCohort(null);
          if (st.composition) useStore.getState().setComposition(null);
          // A metagraph snapshot belongs to exactly ONE network, so a switch can only orphan it.
          if (st.metaSnap) useStore.getState().setMetaSnap(null);
          this.applyFilter();
        }
        // Country drill-down is geo-only — gate on the view so a re-entrant clear
        // (e.g. from setMode while switching away) can't run a geo focus in hyper.
        if (st.country !== prev.country && st.filter === prev.filter && st.mode === "geo") {
          this.country = st.country;
          this.globe.setCountry(st.country);
          this._resolveFocus();
        }
        // Keep the mirrored cohort field in sync so `_handleClick`'s clickActions call never
        // reads stale state; a geo cohort commit/clear re-walks the ladder (the geoCohort rung
        // is inert until Task 5, but the channel is live now).
        if (st.cohort !== prev.cohort) {
          this.cohortSel = st.cohort;
          this.globe.setSelectedCohort(st.cohort); // the glow is geo-gated by the fabric's morph ramps
          if (st.mode === "geo") this._resolveFocus();
        }
        // Hyper's twin channel: the committed COMPOSITION group holds the same steady group-tier
        // glow a cohort does in geo. Membership is re-resolved whenever EITHER the selection or
        // the published node list changes (selNodes lands asynchronously after a filter commit,
        // so resolving only on the selection change would leave the group unlit).
        if (st.composition !== prev.composition || st.selNodes !== prev.selNodes) {
          this.globe.setSelectedGroup(this._compositionIds(st.composition, st.selNodes));
          if (st.composition !== prev.composition && st.mode === "hyper") this._resolveFocus();
        }
        // The selected node card (geo or hyper) keeps that node's layer shells lit on the globe.
        if (st.inspect !== prev.inspect) this.globe.setSelectedNode(this._pickNodeId(st.inspect));
        // Geo: clicking a node (on the globe or in the left explorer both set `inspect`)
        // flies the camera to it; clearing it returns to the selection framing.
        if (st.inspect !== prev.inspect && st.mode === "geo") this._resolveFocus();
        // Ledger: the same ladder — a node pick zooms to its chip, a clear steps back to the layer.
        if (st.inspect !== prev.inspect && st.mode === "ledger") this._resolveFocus();
        // Ledger: keep the hovered/selected snapshot coloured in the trail (hover wins, then the
        // clicked `snap`); everything else fades to the neutral background tone.
        if (st.hoverSnapOrd !== prev.hoverSnapOrd || st.snap !== prev.snap) {
          this.ledger.setSelected(st.hoverSnapOrd ?? st.snap?.data?.ordinal ?? null);
        }
        // A landing EXACT read is what turns a tick from an unmeasured seam into a measured byte
        // bar (spec §6.3), so re-hand the map the moment it changes. Ledger-only: nothing else
        // reads it from the scene, and the view re-reads it on entry via _refreshLedger.
        if (st.snapshotExact !== prev.snapshotExact) {
          if (this.mode === "ledger") this.ledger.setExact(st.snapshotExact);
          // event-time: one pass per landing exact read, over a ~30-entry record.
          for (const [k, v] of Object.entries(st.snapshotExact)) {
            if (prev.snapshotExact[Number(k)] === undefined) this._noteTickKb(v.totalSizeKB);
          }
        }
        // spec §5.3 — a selected metagraph snapshot lights the chips that SIGNED it on the ml0
        // rail (the pairing back is free: chips write hoverNodeId like any other node). Signers
        // are truncated node-id prefixes (decodeChannel.SIGNER_LEN); the shallow exact row
        // carries them too, so the glow lands before the deep fetch resolves and simply sharpens
        // after. The scene keys metagraph nodes by IP, not id (see resolveSignerIps), so the
        // prefixes are resolved against the live metaList before reaching the glow set.
        if (st.metaSnap !== prev.metaSnap || st.metaSnapDeep !== prev.metaSnapDeep || st.metaList !== prev.metaList) {
          const sel = st.metaSnap;
          if (!sel) this.globe.setSignerIds(null);
          else {
            const deep = st.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)];
            const ex = st.snapshotExact[sel.globalOrdinal];
            const row = ex?.rows?.find((r) => r.metaId === sel.metaId && r.ordinal === sel.ordinal);
            const signers = deep?.signers ?? row?.signers ?? null;
            this.globe.setSignerIds(resolveSignerIps(st.metaList, sel.metaId, signers));
          }
        }
        // Filter-chip hover: PREVIEW that selection's dim in any view (same per-view effect as the
        // real filter), without committing it. null restores the committed filter. In the ledger
        // the preview is dim-ONLY — `setFilter` there also rearranges the lane field, which a hover
        // must never do, so the hover has its own entry point.
        if (st.hoverFilter !== prev.hoverFilter) {
          this._hoverFilter = st.hoverFilter;
          this.globe.setHoverFilter(st.hoverFilter);
          this.ledger.setHoverFilter(st.hoverFilter);
        }
        // Geo explorer list-row hover → glow that node's shells on the globe (same as a 3D hover).
        if (st.hoverNodeId !== prev.hoverNodeId) this.globe.setHoverNode(st.hoverNodeId);
        // Geo explorer country-row hover → preview that country's border outline (whisper level;
        // the committed drill's full hairline wins inside the Globe).
        if (st.hoverCountry !== prev.hoverCountry) this.globe.setHoverCountry(st.hoverCountry);
        // Explorer cohort-row hover → glow the whole 3D stack (every member id together).
        if (st.hoverCohort !== prev.hoverCohort) this.globe.setHoverCohort(st.hoverCohort);
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
        if (st.layer !== prev.layer && st.mode === "ledger") this._resolveFocus();
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
    net?.on("anchor", ({ metaId, timestamps, seed }: { metaId: string; timestamps: string[]; seed: boolean }) => {
      if (!seed) this.layers.pulseMeta(metaId, timestamps?.length ?? 1); // one packet per LIVE snapshot (skip the history seed)
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

    // Whether each metagraph's own token is moving — the ledger's currency gutter (spec §6.7).
    // Non-blocking and fetched ONCE: it's a slow-moving fact, and the gutter is honest without it
    // (activityLine renders the NO SIGNAL wording for a missing entry).
    fetch("/api/currency-activity")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // event-time: one map per load. The route answers { items }, the view wants it keyed by id.
        const byId: Record<string, CurrencyActivity | null> = {};
        for (const it of (j?.items ?? []) as CurrencyActivity[]) byId[it.metaId] = it;
        this.ledger.setCurrencyActivity(byId);
      })
      .catch(() => this.ledger.setCurrencyActivity({}));

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
        this._pushRails();
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
    this._pushRails();
    this._metaNodesPlaced = true; // metagraph node shells are now in the scene
    this.applyFilter(false); // re-assert the filter's dimming on the new nodes — but DON'T move
    // the camera (this runs on every cluster/meta poll; moving it would reset the user's view).
    // metaList is published in refreshMeta (metagraph geo arrives with the route), so
    // we don't re-publish here — this runs on every cluster poll.
    this._maybeSceneReady(); // reveal the boot overlay once the core nodes are also in
  }

  /** Hand the chamber the rail tally, event-time, after every node-record rebuild. The kinds are
   *  READ from Globe (it derives them while building the records the chips stand on) rather than
   *  mirrored in an Engine field, so the camera can never frame a rail the chips didn't populate. */
  private _pushRails() {
    for (const g of ["meta", "dag"] as RailGroup[]) this.ledger.setRails(g, this.globe.railKinds(g));
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
    // The byte bar measures ticks from the EXACT reads (spec §6.3) — re-hand the map on each
    // refresh so a tick that landed since the last one gets measured instead of staying a seam.
    this.ledger.setExact(useStore.getState().snapshotExact);
    this._ledgerDirty = false;
  }

  /** The byte bar's width reference is a BAKED p99 (spec §6.3). If the network's real traffic moves,
   *  the constant goes stale silently — so track the session's own p99 and warn in dev, the same
   *  idiom as the config.COLORS ↔ CSS-token drift check. */
  private _kbSamples: number[] = [];
  private _warnedScale = false;
  private _noteTickKb(kb: number): void {
    if (process.env.NODE_ENV === "production" || this._warnedScale) return;
    this._kbSamples.push(kb);
    if (this._kbSamples.length < 200) return;
    const sorted = [...this._kbSamples].sort((a, b) => a - b); // event-time: once per 200 ticks
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    if (p99 > BYTE_SCALE_KB * 1.6 || p99 < BYTE_SCALE_KB * 0.5) {
      this._warnedScale = true;
      console.warn(
        `[ledger] observed p99 ${p99.toFixed(0)} KB/tick vs baked BYTE_SCALE_KB ${BYTE_SCALE_KB} — ` +
        `re-run scripts/bake-ledger-scale.ts`,
      );
    }
    this._kbSamples.length = 0;
  }

  // ---- view + filter (ports ui.setMode / _applyFilter / camera focus) ----

  setMode(mode: Mode) {
    const prevMode = this.mode; // capture BEFORE the reassignment — the choreography branches on it
    this.mode = mode;
    // A view switch re-lays the scene under a stationary pointer, so any in-flight hover
    // (tooltip + the hover channels) would linger re-projected at a wrong screen position
    // until the next pointermove — clear it as part of the switch.
    this._clearHover();
    const policy = VIEW_POLICIES[mode];
    // View-derived sim gates → the scene modules (the render loop reads the rest of the policy).
    // These + the filter dim / country clear apply IMMEDIATELY (the choreography defers only the
    // destination LAYOUT + the camera flight to the mid-flight boundary).
    this.globe.setSimFlags(policy.sims);
    this.layers.setHubOrbits(policy.sims.hubOrbits);
    // Zoom floor: geo keeps the camera outside the globe surface (see viewPolicy.minCamDist).
    this.ctx.controls.minDistance = policy.minCamDist;
    // Polar clamp: globe views keep the "no pole crossing" limit; hyper relaxes it so the ring
    // layout can be viewed straight from the top (viewPolicy.minPolarAngle).
    this.ctx.controls.minPolarAngle = policy.minPolarAngle;
    this.ctx.controls.enableRotate = true; // the 3D layer stack is meant to be looked around
    // View-scoped selections (focusLadder.LEVEL_CARRY): country + cohort live only in geo,
    // composition only in hyper, layer only in ledger — clear them when the destination view
    // isn't theirs, so no view-scoped card/framing lingers (the layer card used to follow into
    // hyper/geo).
    const st0 = useStore.getState();
    if (mode !== "geo") {
      if (this.country != null) { this.country = null; this.globe.setCountry(null); }
      if (st0.country != null) st0.setCountry(null);
      if (st0.cohort != null) st0.setCohort(null);
    }
    if (mode !== "hyper" && st0.composition != null) st0.setComposition(null);
    if (mode !== "ledger" && st0.layer != null) st0.setLayer(null);
    // The snapshot card is LEDGER-SCOPED too (spec 2026-08-01): the pin no longer carries out
    // of the view — leaving ledger clears it. `following` stays with the FollowController,
    // whose mode effect already flips it false outside ledger (no fight: with `following`
    // false its tick is a no-op, so the clear sticks).
    if (mode !== "ledger" && st0.snap != null) st0.setSnap(null);
    // A metagraph snapshot is a ledger subject too (spec §7.1) — a tile only exists on that floor,
    // so its card can't follow the view out. This also drops the signer glow (the store effect
    // below re-fires on the null), so a glow can never outlive its subject.
    if (mode !== "ledger" && st0.metaSnap != null) st0.setMetaSnap(null);

    if (is3D(prevMode) && is3D(mode) && prevMode !== mode) {
      // 3D → 3D: run the staged gather choreography. The machine handles retargeting (a switch
      // mid-flight) without teleports; the render loop applies _pendingBoundary's layout + camera
      // at the OUT→IN boundary, while the nodes are gathered and both furnitures are dark.
      this.transition.start(prevMode, mode);
      // Reverse-to-origin retarget: the machine flips straight to IN (no boundary will
      // fire) and the origin's layout is still applied — clear the stale pending so no
      // later tick can mis-apply it (defensive; provably unreachable today).
      this._pendingBoundary = this.transition.phase === "in" ? null : mode;
      this._resettleFocus = this.transition.phase === "in"; // no boundary will fire — re-derive at settle
    } else if (!is3D(mode)) {
      // Entering a "soon"/placeholder view: STEP 1 ONLY (user, 2026-07-17) — the old view's
      // furniture fades and the nodes fly to the staging grids, where they PARK (the machine
      // ends in "staged", no boundary, no destination layout). SceneCanvas still cross-fades
      // the canvas out; the parked grids are the state the next 3D view resumes from. From a
      // flat/boot origin there is nothing to gather — the machine parks instantly.
      this._pendingBoundary = null;
      this._resettleFocus = false; // any pending reversal re-resolve is moot — this path resolves/parks on its own
      if (is3D(prevMode)) this.transition.stage(prevMode);
      else this.transition.stageInstant();
    } else {
      // Flat/boot → 3D: STEP 2 from the parked grids — the nodes dissolve out of staging into
      // the destination. place() says whether the layout applies NOW (parked: it's invisible —
      // the boundary-equivalent) or at the normal boundary (still mid-gather toward the grids).
      this._resettleFocus = false; // any pending reversal re-resolve is moot — this path resolves/parks on its own
      if (this.transition.place(mode) === "immediate") {
        this._pendingBoundary = null;
        this._applyBoundary(mode);
      } else {
        this._pendingBoundary = mode;
      }
    }
  }

  // The boundary-equivalent layout application: morph snapped to the destination's value +
  // the per-view layout/camera. Called at the mid-flight OUT→IN boundary (render loop) and
  // immediately when step 2 starts from the parked grids (both moments are invisible: nodes
  // gathered, furnitures dark).
  private _applyBoundary(dest: Mode): void {
    if (dest === "geo") this.morph = 1;
    if (dest === "hyper") this.morph = 0;
    // ledger snaps nothing — it freezes morph at the source view's value.
    // Bring the DESTINATION's frame state up BEFORE any framing math reads it: the hyper
    // root's scale is still collapsed from geo's morph 1 at this instant (a hub
    // getWorldPosition would return ~the origin), and the globe group still carries the
    // source view's rotation (the hyper tilt+spin only reasserts later in the loop).
    this.layers.root.scale.setScalar(Math.max(0.0001, 1 - this.morph));
    if (dest === "hyper") {
      this.globe.setHyperSpin(this._hyperSpinY, this._hyperTiltX);
      this.layers.setHyperSpin(this._hyperSpinY, this._hyperTiltX);
    }
    this._applyDestLayout(dest);
  }

  // The per-view destination LAYOUT + camera framing, applied either immediately (flat/boot path)
  // or at the mid-flight transition boundary (3D↔3D). Moved here verbatim from setMode's per-mode
  // blocks; the ledger LAYOUT snaps (globe.applyLedgerLayout + layers.setLedger's hard hide) belong
  // at the boundary so the hyper furniture FADES out under the alpha instead of vanishing at switch
  // time, and the camera flies during the IN phase rather than at transition start.
  // Reached ONLY via _applyBoundary, whose `dest` is always a 3D view (hyper/geo/ledger) —
  // flat/"soon" views never route here (they PARK the fleet and never apply a destination
  // layout, see setMode's !is3D branch). So there is no flat-view reset case below.
  private _applyDestLayout(mode: Mode) {
    // Snapshots view reuses the SAME hub/node meshes, laid into planar rows / lanes. These are the
    // boundary-only layout snaps (invisible: the nodes are gathered): the hyper furniture hard
    // hide/show and the node lane placement.
    const inLedger = mode === "ledger";
    this.layers.setLedger(inLedger);
    this.globe.applyLedgerLayout(inLedger);
    // The Snapshots view: keep the reused meshes visible (the render loop places them into the
    // planar rows + shows the centered live snapshot); just dim non-selected columns and frame it.
    if (mode === "ledger") {
      this.layers.focusId = null;
      this.globe.focusDensest(false);
      this.ctx.controls.autoRotate = false;
      this.globe.setFilter(this.filter); // dim non-selected metagraph columns (no camera move)
      this.ledger.setFilter(this.filter); // neutralise the other lanes' tiles/links
      this._refreshLedger();
      // Ledger uses the SHARED overview camera — the group transform (config.viewRotY/viewScale)
      // frames the resting pose central/untilted. A carried node re-commits its floor here (and
      // an already-committed layer resumes its tilted layer-focus framing instead).
      this._commitViewEntryAncestry(mode);
      // That commit runs first (through the ONE executor), so the ladder's snapshot sees the
      // layer — the node level still wins the camera if one is selected.
      this._resolveFocus();
      return;
    }
    // hyper / geo (ledger returned above; flat views never reach here — see the method note):
    this.ctx.controls.autoRotate = mode !== "geo";
    this.applyFilter(false); // apply the filter's visuals, but leave the camera to _resolveFocus
    // The carried node's ancestry for THIS view (country + provider in geo, the composition
    // group in hyper) — committed before the focus walk, so the finer node rung still wins the
    // camera and every parent card is on the rail.
    this._commitViewEntryAncestry(mode);
    // A selection's camera position carries across view switches: frame the selected node in the
    // new view (geo → its globe spot, hyper → its shell point), else the filter's default framing.
    this._resolveFocus();
  }

  // Re-derive the destination view's own ancestry rungs for a node selection that carried into it
  // (domain/pickActions.viewEntryActions — the same table a click in this view runs), and apply
  // them through the ONE executor. View-scoped rungs are cleared on leaving their view, so this is
  // what puts the country/provider (geo), the composition group (hyper) or the floor (ledger) back
  // under the carried node instead of leaving its parent card slots on their ghosts.
  private _commitViewEntryAncestry(mode: Mode) {
    const st = useStore.getState();
    const acts = viewEntryActions({
      mode,
      pick: st.inspect,
      ledgerLayerId: st.layer?.layerId ?? null,
      compositionSel: this._compositionOf(st.inspect),
    });
    if (acts.length) applyClickActions(acts);
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
      // Re-assert a live country drill: setFilter clears the Globe's drill BY DESIGN for a
      // user filter switch (the subscription nulls this.country before calling us), but this
      // also runs on every background cluster/meta poll (_applyMetagraphs → applyFilter(false))
      // — without the re-assert, the poll silently wiped the drill's dim + border seconds
      // after every drill while the store/engine still said drilled (long-standing bug).
      if (this.country != null) this.globe.setCountry(this.country);
      if (focusCamera) this._resolveFocus();
    } else if (this.mode === "hyper") {
      // Dim the non-selected nodes ("the others") so the selected network stands out, on top
      // of the camera focus + DoF. "all" dims nothing (setFilter no-ops the dim).
      this.globe.setFilter(this.filter);
      if (focusCamera) this._resolveFocus();
    } else if (this.mode === "ledger") {
      // Dim the non-selected metagraph columns so the selection stands out. The ledger neutralises
      // the other lanes' tiles/links. A committed LAYER wins the camera (finer than network): its
      // framing is lane-aware (centres the selected metagraph's lane), so a filter change re-runs
      // it to slide over to the newly-selected lane. With no layer committed, the ladder's NETWORK
      // rung frames the filtered metagraph's lane at its L0 floor (ledgerNetwork resolver, 2026-07-18
      // — replaced the old fall-through to the overview pose); "all" still resolves to overview.
      this.globe.setFilter(this.filter);
      this.ledger.setFilter(this.filter);
      if (focusCamera) this._resolveFocus();
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

  // The ladder walk (domain/focusLadder): first ACTIVE rung whose resolver succeeds wins the
  // camera; resolver failure (unlocatable subject, topology not loaded) falls through — the
  // per-view fallback chains, made uniform. Resolvers are the ONLY camera-framing entry points
  // for selection state; they keep their scene side effects (globe lean/spin, autoRotate).
  private _resolvers: Record<ResolverKey, () => boolean> = {
    geoNode: () => {
      const p = useStore.getState().inspect;
      if (!p || !("geo" in p) || !this.globe.focusNode(p.geo)) return false;
      this.ctx.controls.autoRotate = false;
      this._focusNode();
      return true;
    },
    geoCohort: () => {
      if (!this.globe.focusCohort()) return false;
      this.ctx.controls.autoRotate = false;
      cohortFraming(this._framingOut);
      this._tweenTo(this._framingOut.pos, this._framingOut.target, false); // dolly-exempt, like nodeFraming
      return true;
    },
    geoCountry: () => {
      if (this.country == null) return false;
      // Country drill: the country's SHAPE leads — spin to its polygon centroid and frame its
      // angular extent (domain countryShape), so the country itself sits centred regardless of
      // where its nodes cluster.
      const shape = this.globe.focusCountryShape(this.country);
      if (shape) {
        countryFraming(shape.latAngle, shape.angularRadius, this._framingOut);
        this._tweenTo(this._framingOut.pos, this._framingOut.target);
        return true;
      }
      // Degraded mode while the countries topology loads: the node-mean concentration framing
      // (still a COUNTRY-level pose — this rung handles its own fallback, it does not fall to
      // the network rung; matches the pre-ladder behaviour).
      const R = this.globe.focusDensest(true);
      if (R == null) return false;
      this._focusGeo(R);
      return true;
    },
    geoNetwork: () => {
      const R = this.globe.focusDensest(true);
      if (R == null) return false;
      // Three zoom LEVELS (user design): metagraph = a WIDE network pose (rotated to the
      // densest cluster, held clearly farther out than the country pose so the country drill
      // still reads as a zoom).
      this.focus("geoNetwork");
      return true;
    },
    geoOverview: () => {
      this.globe.focusDensest(false);
      this.focus("geo");
      return true;
    },
    hyperNode: () => {
      const p = useStore.getState().inspect;
      const id = !p ? null : p.kind === "metanode" ? p.node?.ip : p.kind === "l0" || p.kind === "l1" ? p.node?.id : null;
      const pos = id ? this.globe.hyperWorldPos(id) : null;
      if (!pos) return false;
      this.ctx.controls.autoRotate = false;
      this.layers.focusId = null;
      hyperNodeFraming(pos, this._framingOut);
      this._tweenTo(this._framingOut.pos, this._framingOut.target);
      return true;
    },
    hyperComposition: () => {
      // A composition group is network-scoped by construction (its toggle commits the filter
      // first), so it has no pose of its own — it frames its NETWORK, the containment the card
      // describes. Same resolver body as the network rung, kept as its own key so the rung can
      // grow a pose later without touching the ladder.
      return this._resolvers.hyperNetwork();
    },
    hyperNetwork: () => {
      this.globe.focusDensest(false);
      this._focusFilter(this.filter); // handles hub-not-found by falling to overview internally
      return true;
    },
    hyperOverview: () => {
      this.globe.focusDensest(false);
      this._focusFilter("all"); // the existing "all" path: focusId cleared, tilt eased, overview pose
      return true;
    },
    ledgerNode: () => {
      const p = useStore.getState().inspect;
      return !!p && this._focusLedgerNode(p);
    },
    ledgerLayer: () => {
      const layerId = useStore.getState().layer?.layerId;
      if (!layerId) return false;
      return this._focusLayer(layerId);
    },
    ledgerNetwork: () => {
      // Frame the committed network's L0 rail column (user, 2026-07-18): camera-only — no
      // store.layer commit, so the layer card stays a ghost. "dag" reads its own rail group.
      return this._focusLayer(this.filter === "dag" ? "hypl0" : "ml0");
    },
    ledgerOverview: () => {
      this.focus("overview");
      return true;
    },
  };

  // Resolve the camera for the CURRENT selection state by walking the current view's ladder
  // (domain/focusLadder.LADDERS) — the one entry point every selection-driven camera flight
  // goes through (a filter/country/cohort/layer/inspect change, a view switch, a transition
  // boundary). No-ops outside the three 3D views.
  private _resolveFocus(): void {
    const st = useStore.getState();
    if (this.mode !== "hyper" && this.mode !== "geo" && this.mode !== "ledger") return;
    const sel: SelectionSnapshot = {
      inspectIsNode:
        !!st.inspect && (st.inspect.kind === "l0" || st.inspect.kind === "l1" || st.inspect.kind === "metanode"),
      cohort: st.cohort,
      composition: st.composition,
      country: this.country,
      layerId: st.layer?.layerId ?? null,
      filter: this.filter,
    };
    for (const rung of LADDERS[this.mode]) {
      if (rung.active(sel) && this._resolvers[rung.resolver]()) return;
    }
  }

  // Snapshots NODE zoom (user, 2026-07-17): the level after the layer zoom, mirroring geo's
  // country→node ladder. Frames the selected node's chip in the chamber; false when the node
  // can't be located (caller falls back to the layer framing).
  private _focusLedgerNode(p: PickDescriptor): boolean {
    const id = p.kind === "metanode" ? p.node?.ip : p.kind === "l0" || p.kind === "l1" ? p.node?.id : null;
    const pos = id ? this.globe.ledgerWorldPos(id) : null;
    if (!pos) return false;
    this.ctx.controls.autoRotate = false;
    ledgerNodeFraming(pos, this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
    return true;
  }

  // Node framing: zoomed in, camera low in front of the node, line of sight skimming across the
  // globe surface toward the horizon. The look-at point sits ABOVE the node's apparent position,
  // which settles the node at the LOWER-third line (user; rule-of-thirds — centred read wrong)
  // with the horizon + sky filling the upper frame.
  private _focusNode() {
    // The one geo node pose (cameraRig.nodeFraming — latitude-independent via Globe.focusNode's
    // NODE_RAISE contract). Dolly-exempt: its numbers are absolute (see CAM_ZOOM's note).
    nodeFraming(this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target, false);
  }

  // Compute the per-country leaderboard for the active filter and push it to the store
  // (the React Leaderboard reads it). Cheap.
  private _publishLeaderboard() {
    // Flat node list for the explorer node browsers (read-only; the policy says which views have
    // one — geo's Nodes-by-country, hyper's Nodes-by-network — so it empties elsewhere). Published
    // FIRST + unconditionally: a metagraph's rows come from metaNodes, which load independently of
    // the DAG core, so this must NOT be gated on the validator set (bug: "no nodes reported" while
    // the core was still loading).
    useStore.getState().setSelNodes(VIEW_POLICIES[this.mode].nodeList ? this.globe.listNodes(this.filter) : []);
    // The per-country leaderboard needs the validator set — skip it until the core has loaded.
    if (!this.globe.nodes?.length) return;
    const countries = this.globe.countryStats(this.filter);
    useStore.getState().setLeaderboard({ countries });
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
    this._hitObj = null;
    for (const h of hits) {
      const pick: PickDescriptor | undefined = h.object.userData.picks
        ? h.object.userData.picks[h.instanceId as number]
        : h.object.userData.pick;
      if (!pick || !pickActive(pick, this.mode, this.filter, this._activeMetaIds)) continue;
      if (pick.kind === "layer") {
        // Planes are only 3D targets while NO layer is committed — once one is selected (the
        // zoomed layer-focus pose), hovering/clicking the stack must not steal the highlight;
        // switching layers is the panel's job then (user decision).
        if (!this._layerCommitted) layerFallback ??= pick;
        continue;
      }
      this._hitObj = h.object;
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
  // Drop every transient hover: the tooltip subject + all four hover channels (each store
  // write also resets its 3D effect via the command-bridge subscription). Event-driven only
  // (view switch) — never on the per-frame path.
  private _clearHover() {
    const st = useStore.getState();
    if (st.hoverNodeId != null) st.setHoverNodeId(null);
    if (st.hoverSnapOrd != null) st.setHoverSnapOrd(null);
    if (st.hoverFilter != null) st.setHoverFilter(null);
    if (st.hoverCountry != null) st.setHoverCountry(null);
    if (st.hoverCohort != null) st.setHoverCohort(null);
    if (st.ledgerHilite != null) st.setLedgerHilite(null);
    if (this._hoverKey != null || st.hover != null) {
      this._hoverKey = null;
      st.setHover(null);
    }
    this.canvas.style.cursor = "grab";
  }

  // Hover tooltip: only writes the store when the hovered target changes (not per
  // pixel); the Tooltip component positions itself from the pointer.
  private _handleMove(e: MouseEvent) {
    // Mid-drag (orbiting): no hover picking — raycasting the planes every move would flicker the
    // layer highlight across the stack while the user is just navigating.
    if (e.buttons !== 0) return;
    if (this.transition.active()) return; // nodes are mid-flight; raycasting moving targets misleads (spec)
    const p = this._pickAt(e);
    this.canvas.style.cursor = p ? "pointer" : "grab";
    const st = useStore.getState();

    // Route the hovered subject to ITS channel (each already drives a 3D effect + now the paired
    // card/row). Only the channel for the hovered kind is set; the others clear — so exactly one
    // subject is "hovered" at a time. Write only on change (mousemove is high-frequency).
    const nodeKey = hoverKeyOf(p);                                   // node → globe shell glow
    // snapshot → ledger row. A metagraph-snapshot TILE hovers ITS TICK too: the tile sits on the
    // tick's row, so cross-highlighting the row is the honest preview of what a click would pin.
    const snapOrd = p?.kind === "snapshot" ? p.data.ordinal
      : p?.kind === "metaSnap" ? p.global.data.ordinal
      : null;
    const metaId = p?.kind === "meta" ? p.cfg?.id ?? null : null;    // hub → metagraph dim preview
    const layerId = p?.kind === "layer" ? p.layerId : null;          // floor plane → highlight preview
    // Country under the cursor (policy-gated): the SCENE side of the bidirectional country
    // pairing — writes the same hoverCountry channel the explorer rows use, so the border
    // preview + the row wash light from either end. Hovering a NODE hovers its country too
    // (user); with no object hit, the land point under the cursor resolves analytically
    // (ray→sphere — the sphere is rotation-invariant; the Globe resolves WHICH country).
    let countryCc: string | null = null;
    if (VIEW_POLICIES[this.mode].countryHover && this.morph > 0.9) {
      if (p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode")) {
        countryCc = p.geo?.cc ?? null;
      } else if (!p) {
        const hit = this.raycaster.ray.intersectSphere(this._landSphere, this._landHit);
        if (hit) countryCc = this.globe.countryCcAtPoint(hit);
      }
    }
    if (countryCc) this.canvas.style.cursor = "pointer"; // the border preview invites the drill
    if (nodeKey !== st.hoverNodeId) st.setHoverNodeId(nodeKey);
    if (snapOrd !== st.hoverSnapOrd) st.setHoverSnapOrd(snapOrd);
    if (metaId !== st.hoverFilter) st.setHoverFilter(metaId);
    if (countryCc !== st.hoverCountry) st.setHoverCountry(countryCc);
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
    if (this.transition.active()) return; // nodes are mid-flight; raycasting moving targets misleads (spec)
    const p = this._pickAt(e);
    // With nothing picked, resolve the drillable country under the cursor (geo only — the
    // land-sphere hit is analytic; the Globe resolves WHICH country in its rotated frame).
    let countryCc: string | null = null;
    if (!p && VIEW_POLICIES[this.mode].countryHover && this.morph > 0.9) {
      const hit = this.raycaster.ray.intersectSphere(this._landSphere, this._landHit);
      countryCc = hit ? this.globe.countryCcAtPoint(hit) : null;
    }
    // The SEMANTICS live in the pure, tested decision table (domain/pickActions) — what a
    // click means per view × pick kind, including the ordering contracts. This handler only
    // resolves inputs above and executes the actions below.
    const st = useStore.getState();
    // The two Snapshots subjects that resolve to a PAIR (a metagraph + a tick) have their own
    // builders in the same table, because a single descriptor can't express both halves.
    // A metagraph-snapshot TILE: commit the tile AND pin the global tick it anchored into.
    if (p?.kind === "metaSnap") {
      applyClickActions(
        metaSnapSelectActions(p.sel, p.global, { filter: st.filter, metaSnap: st.metaSnap }),
      );
      return;
    }
    // A byte-bar BAND: the tick descriptor rides `userData.pick`, the band's metagraph key rides
    // `userData.bandKey` on the same mesh (a band is a slice of a tick, not a subject of its own).
    const bandKey = this._hitObj?.userData.bandKey as string | undefined;
    if (p?.kind === "snapshot" && bandKey) {
      applyClickActions(bandSelectActions(bandKey, p, { filter: st.filter, metaSnap: st.metaSnap }));
      return;
    }
    applyClickActions(
      clickActions({
        mode: this.mode,
        pick: p,
        countryCc,
        // Hyper's node ancestry (FULL-ANCESTRY rule): a node click commits the composition group
        // it belongs to, the same way a ledger node click commits its floor. The group is
        // derivable from the node itself — its make-up IS the group key — so no list lookup.
        compositionSel: this._compositionOf(p),
        current: {
          filter: st.filter,
          country: st.country,
          hasInspect: !!st.inspect,
          layerId: st.layer?.layerId ?? null,
          cohort: this.cohortSel,
        },
      }),
    );
  }

  // The composition group a PICK belongs to — network + make-up key. null when the pick isn't a
  // node, carries no role info (the group would be meaningless), or the CURRENT view's ladder has
  // no composition rung (today: hyper alone, but the ladder table says so, not this method).
  private _compositionOf(p: PickDescriptor | null): CompositionSel | null {
    if (!p || !is3D(this.mode) || !hasLevel(this.mode, "composition")) return null;
    const node = "node" in p ? p.node : null;
    const netId = pickNetId(p);
    if (!node || !netId) return null;
    const comp = compositionRows([node])[0]; // event-time (a click)
    if (!comp) return null;
    return { netId, key: compositionKey(comp.label, comp.codes) };
  }

  // Member ids of a committed composition group, resolved from the published node list the
  // explorer browses (one id per MACHINE — the same dedupe, so the 3D glow and the row count
  // can't disagree). null when the group has vanished from the current list.
  private _compositionIds(sel: CompositionSel | null, rows: NodeRow[]): string[] | null {
    if (!sel) return null;
    const g = compositionGroups(rows).find((x) => x.key === sel.key); // event-time
    if (!g) return null;
    return g.rows.map((r) => hoverKeyOf(r.pick)).filter((k): k is string => !!k);
  }

  private focus(name: string) {
    const f = FOCI[name];
    if (f) this._tweenTo(f.pos, f.target);
  }


  private _tweenTo(toPos: Vec, toTgt: Vec, dolly = true) {
    // OUT-phase camera hold (spec A#6): the state commit stands; the boundary's
    // _applyDestLayout re-derives this pose from it, so dropping the tween loses nothing.
    if (this.transition.holdCamera()) return;
    const tw = this._tween;
    tw.fromPos.copy(this.ctx.camera.position);
    // The global CAM_ZOOM dolly (see cameraRig) — writes straight into tw.toPos, no extra
    // allocation. `dolly: false` is for poses whose TARGET is a composed look-at rather than
    // the subject (nodeFraming — see the exemption note next to CAM_ZOOM).
    if (dolly) dollyBack(toPos, toTgt, tw.toPos);
    else tw.toPos.copy(toPos);
    tw.fromTgt.copy(this.ctx.controls.target);
    tw.toTgt.copy(toTgt);
    tw.t = 0;
    tw.dur = 1.4;
    tw.active = true;
  }


  // Fly to a settlement layer (Snapshots view). Two shapes of subject after the two-floor redesign
  // (spec §4): a SNAPSHOT layer is a glass floor plane, so the camera frames the plane; a NODE layer
  // is carried by the vertical RAILS, so the camera frames the rail column instead. Heights are
  // scaled by the ledger group's viewScale (the framing works in world units); the lateral
  // lane-centring block is gone — every rung now sits on the shared lane field (`laneZ` is 0 for all
  // six). Returns false when the id names no layer, so the focus ladder can fall through.
  private _focusLayer(layerId: string): boolean {
    const l = LAYER_GEOM.find((x) => x.id === layerId);
    if (!l) return false;
    const y = l.y * LEDGER.viewScale;
    if (l.isRail) {
      // The rail tally is READ from Globe (which computes it while building the records the chips
      // stand on), never mirrored here — so the camera can't frame a rail the chips didn't populate.
      const group: RailGroup = layerId === "ml0" || layerId === "ml1" ? "meta" : "dag";
      const kinds = this.globe.railKinds(group);
      const idx = kinds.findIndex((k) => railLit(layerId, group, k));
      ledgerRailFraming(railX(Math.max(0, idx)) * LEDGER.viewScale, y, this._framingOut);
    } else {
      ledgerFloorFraming(y, this._framingOut);
    }
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
    return true;
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
      this.ctx.controls.autoRotate = false; // the STRUCTURE spins (setHyperSpin), not the camera
      this.focus("overview"); // SHARED pose — the hyper structure is tilted (HYPER_TILT) to read
      return; // top-down instead of moving the camera, so other views tween cleanly from here.
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
    this.layers.focusId = filter; // anchor this hub so it stays framed (its orbit + the spin freeze)
    // Frame against the hub's morph-0 world position: root carries the structure's tilt+spin in its
    // ROTATION and the morph collapse in its SCALE. On a geo→hyper switch morph is still 1 at this
    // instant (it eases to 0 over the next frames), so root.scale ≈ 0 and getWorldPosition would
    // return the origin (the "doesn't focus the metagraph" bug). Apply ONLY the rotation to the
    // hub's local orbit position — that's where the hub lands once the morph settles; the spin/orbit
    // are frozen (focusId + non-"all" filter) so it stays valid for the whole tween.
    // Frame against the TARGET rotation — the flattened focus tilt + the (frozen) spin — not the
    // still-easing current root.rotation, so the tween ends exactly where the structure settles.
    this._focusEuler.set(HYPER_TILT_FOCUS, this.layers.root.rotation.y, 0);
    this._hubWorld.copy(meta.group.position).applyEuler(this._focusEuler);
    // Plain radial hub framing, world-up, NO camera roll and NO core-corner composition
    // (user, 2026-07-17: the rolled pose + DoF read fuzzy/off — keep the focused pose simple
    // and correct; the rolled hub-focus camera-roll pose was deleted — structure-tilt + plain
    // hubFraming won).
    hubFraming(this._hubWorld, this._framingOut);
    this._tweenTo(this._framingOut.pos, this._framingOut.target);
  }

  // ---- render loop (ports main.js animate) ----
  private start() {
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.stats?.begin();
      this.clock.update(); // Timer: advance once per frame before reading the delta
      const dt = Math.min(this.clock.getDelta(), 0.05);
      // ---- THE FRAME ORDER CONTRACT (spec C#1) -------------------------------------------
      // Phases run in this order and NOTHING may mutate a pose after the phase that derives
      // from it: inputs/boundary → camera → motion (spin/rotation) → derived frames (staging
      // plane) → scene writes → render. Three staging bugs were same-frame ordering bugs
      // (consumer read state a later mutation changed: group matrix, camera pose, rotation
      // tween). New per-frame work goes in the phase whose inputs it needs — never earlier.
      this._integrateInputs(dt);   // policy/bloom + transition tick + boundary application
      this._integrateCamera(dt);   // tween → controls → altitude clamp (the camera settles HERE)
      const zoomedIn = this._integrateMotion(dt); // hyper spin/tilt ease + globe rotation (poses final after this)
      this._deriveFrames();        // staging plane from the SETTLED camera + rotation
      this._writeScene(dt, zoomedIn); // morph/alphas/visibility/view updates/DoF — reads only settled state
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

  private _integrateInputs(dt: number) {
    const policy = VIEW_POLICIES[this.mode];
    this._policy = policy;

    // Per-view bloom (ViewPolicy.bloom): hyper/geo run calmer than ledger — their dense, bright
    // emitters (core, node field, additive coastal walls) piled up an additive bleed + a
    // strength-driven "black halo" ring + fuzzy walls, worst on OLED/HDR. UnrealBloomPass reads
    // strength/radius/threshold live each render, so a per-frame set is enough (and it tracks a
    // mode switch immediately).
    const pb = policy.bloom;
    this.ctx.bloom.strength = pb.strength;
    this.ctx.bloom.radius = pb.radius;
    this.ctx.bloom.threshold = pb.threshold;

    // ---- view-transition choreography ------------------------------------------------------
    // Advance the machine; tick() returns TRUE exactly once, at the OUT→IN boundary. The nodes
    // are then fully gathered and both furnitures are dark, so snapping the destination layout +
    // morph + starting the camera flight here is invisible.
    if (this.transition.tick(dt / this._slowmo) && this._pendingBoundary) {
      const dest = this._pendingBoundary;
      this._pendingBoundary = null;
      this._applyBoundary(dest);
    }
    // Reversal-gap completion edge: a 3D→3D retarget that flipped straight back to its origin
    // mid-OUT never fires a boundary, so a commit landing mid-flight only updated the store —
    // the camera was held (transition.holdCamera()) and never replayed. Re-derive it once the
    // transition settles.
    if (this._wasTransitionActive && !this.transition.active() && this._resettleFocus) {
      this._resettleFocus = false;
      this._resolveFocus(); // a mid-OUT commit's framing was held — re-derive from committed state
    }
    this._wasTransitionActive = this.transition.active();
  }

  private _integrateCamera(dt: number) {
    const policy = this._policy;
    // Camera integration runs BEFORE the staging plane is derived: the plane is anchored to
    // the camera, and computing it from a pre-tween pose made every staged node trail the
    // camera by one frame — a visible drift-and-return on the hyper→geo flight (user,
    // 2026-07-17). Tween → roll ease → controls → altitude clamp, THEN the plane.
    this._updateTween(dt);
    this.ctx.controls.update();
    // Altitude clamp (policy.minCamAlt): OrbitControls' minDistance is target-relative, and
    // the geo target is off-centre — so after the controls settle, push the camera back out
    // to the minimum radius from the ORIGIN if a dolly/orbit carried it inside. In-place (no
    // alloc); grazing feel: past the floor the camera slides along the sphere to the target.
    const minAlt = policy.minCamAlt;
    if (minAlt != null && this.ctx.camera.position.lengthSq() < minAlt * minAlt) {
      this.ctx.camera.position.setLength(minAlt);
    }
  }

  private _integrateMotion(dt: number): boolean {
    // Freeze the overall sphere spin once the camera is zoomed in to inspect (hyper) — a close-up
    // reads still; the per-node axis spin keeps going. Threshold is well inside the resting pose.
    const zoomedIn = this.mode === "hyper" &&
      this.ctx.camera.position.distanceTo(this.ctx.controls.target) < 45;
    // Hyper resting: spin the whole TILTED structure about its own vertical axis so it reads as
    // slowly-rotating top-down rings (replaces camera autoRotate, which wobbles a tilted
    // structure). ONE shared angle → globe group + root + coreGroup can't desync from the hoops.
    // Frozen when a hub is focused (filter ≠ all) or the camera is zoomed in to inspect.
    if (this.mode === "hyper") {
      if (this.filter === "all" && !zoomedIn) this._hyperSpinY += dt * 0.06;
      // Ease the shared structure tilt: near-flat while a metagraph is committed so its discs
      // read horizontal from the plain side-on hub framing (user, 2026-07-17 — the structure
      // moves, not the camera); back to the resting overview tilt otherwise.
      const tiltTarget = this.filter !== "all" && this.filter !== "dag" ? HYPER_TILT_FOCUS : HYPER_TILT;
      this._hyperTiltX += (tiltTarget - this._hyperTiltX) * Math.min(1, dt * 2.5);
      this.globe.setHyperSpin(this._hyperSpinY, this._hyperTiltX);
      this.layers.setHyperSpin(this._hyperSpinY, this._hyperTiltX);
    }
    // The globe group's rotation integrates HERE — before the staging-plane conversion — so
    // the world→group-local mapping always reflects THIS frame's final orientation (the geo
    // focusDensest tween otherwise lagged the staged nodes by one frame: the hyper→geo snap).
    this.globe.updateRotation(dt);
    return zoomedIn;
  }

  private _deriveFrames() {
    // The staging plane: a camera-anchored band across the TOP of the viewport (world space;
    // the Globe converts to group-local). Height from the frustum so the grids read the same at
    // any camera pose.
    if (this.transition.active()) {
      // The plane's basis comes from the camera's ACTUAL orientation (its quaternion), NOT
      // the raw camera.up — .up is only the lookAt CONSTRAINT and can diverge from the true
      // screen-up (any camera roll), which anchored the grid below the top of the view and
      // tilted it (user: focused NDT → geo). Local +X/+Y through the quaternion ARE
      // screen-right/screen-up, exactly, whatever the camera's orientation.
      this._gatherR.set(1, 0, 0).applyQuaternion(this.ctx.camera.quaternion); // screen-right
      this._gatherU2.set(0, 1, 0).applyQuaternion(this.ctx.camera.quaternion); // screen-up
      this.ctx.camera.getWorldDirection(this._gatherO); // forward (scratch reuse)
      this._gatherO.multiplyScalar(GATHER_DIST).add(this.ctx.camera.position);
      const h = Math.tan(THREE.MathUtils.degToRad(this.ctx.camera.fov / 2)) * GATHER_DIST;
      this._gatherO.addScaledVector(this._gatherU2, h * GATHER_TOP_FRAC);
      this.globe.setGatherFrame(this._gatherO, this._gatherR, this._gatherU2);
      // Phone/narrow viewports: shrink the cell so the row's total width still fits — never
      // grow it past the reference aspect's size (Math.min(1, …)).
      const cellScale = Math.min(1, this.ctx.camera.aspect / GATHER_CELL_ASPECT_REF);
      this.globe.setGatherCell(GATHER_CELL * cellScale);
    }
  }

  private _writeScene(dt: number, zoomedIn: boolean) {
    const policy = this._policy;
    const show = policy.show;

    // Ledger freezes morph at the view we entered from, so the reused node meshes fly in from
    // THAT layout (globe.ledgerT drives the lane fly-in instead). hyper/geo ease as usual —
    // but a transition FREEZES morph (the boundary snaps it), so the OUT phase keeps the source
    // layout and the IN phase the destination one.
    const target = policy.morph === "toGeo" ? 1 : policy.morph === "frozen" ? this.morph : 0;
    if (!this.transition.active()) this.morph += (target - this.morph) * Math.min(1, dt * 1.1);
    // Keep the hyper root alive across a whole transition (its scale collapses at morph≈1, but the
    // gathered nodes live in globe.group; the furniture fades under setViewAlpha, not this flag).
    this.layers.root.visible = this.morph < 0.985 || this.transition.active();
    this.layers.root.scale.setScalar(Math.max(0.0001, 1 - this.morph));

    // Per-view furniture build/teardown alphas. geo's alpha is read inside globe.setMorph via
    // globe.transition; hyper + ledger read it here (each multiplies its own furniture opacity).
    const hyperAlpha = this.transition.furnitureAlpha("hyper");
    this.layers.setViewAlpha(hyperAlpha);
    const ledgerAlpha = this.transition.furnitureAlpha("ledger");
    this.ledger.setViewAlpha(ledgerAlpha);

    this.globe.setMorph(this.morph);
    // Core-dim target: the DAG core fades back when a specific metagraph is the effective subject
    // (hover-preview wins over the committed filter), and stays lit for "all"/"dag".
    const coreSubj = this._hoverFilter ?? this.filter;
    const coreDim = coreSubj === "all" || coreSubj === "dag" ? 0 : 1;
    this.layers.update(dt, this.morph, coreDim, zoomedIn, this.ctx.camera, this.filter === "dag");
    this.globe.update(dt);

    // Geometry visibility, driven by the view policy's `show.*`:
    //  - !hyperFurniture: the hyper root + core are force-managed — ledger keeps the root as its
    //    metagraph-L0 row (show.ledger), flat hides it; the core is hidden in both (the ledger's
    //    centred snapshot stands in for Global L0). When hyperFurniture is on (hyper/geo) the
    //    morph-driven root.visible above + HyperView's own core reveal stand.
    //  - globeSurface: the shared node group (+ earth surface).
    //  - ledger: the settlement chamber.
    // (There is no skydome — the scene's solid clear colour + fog are the whole backdrop.)
    // Force-manage the hyper root/core ONLY in a settled non-hyper/geo view. During a transition
    // the morph collapse + furnitureAlpha (fed to HyperView above) govern the core/hub fade —
    // hard-hiding coreGroup here every frame would make the core VANISH at switch time (mode flips
    // to ledger immediately) instead of fading out under the alpha.
    if (!show.hyperFurniture && !this.transition.active()) {
      this.layers.root.visible = show.ledger; // ledger: hubs become the metagraph-L0 row; flat: hidden
      this.layers.coreGroup.visible = false;
    }
    // True for all three 3D views (the shared nodes never blink out mid-flight); the flat
    // "soon" views set it false, but the PARKED staging grids live in this group too — the
    // active/staged machine keeps it visible so the fleet shows above the Blueprint.
    this.globe.group.visible = show.globeSurface || this.transition.active();
    // Ledger chamber is live while settled in ledger OR a transition involving it is running (the
    // build/teardown must animate). The Engine is the SINGLE owner of ledger.group.visible —
    // LedgerView.setViewAlpha no longer writes it (the two would fight). The alpha gates whether it
    // currently shows; ledgerActive gates whether it CAN (so it hides in unrelated views/flights).
    const ledgerActive = this.mode === "ledger" ||
      (this.transition.active() && (this.transition.from === "ledger" || this.transition.to === "ledger"));
    this.ledger.group.visible = ledgerActive && ledgerAlpha > 0.001;
    if (ledgerActive) {
      if (this._ledgerDirty) this._refreshLedger();
      this.ledger.update(dt);
    }
    // Central stage-light gate: any view whose furniture is dark gets its spot blacked out
    // here — a view cannot forget its own off-switch (spec A#3). update() stops ticking a
    // view's own spot off-view, so without this a lit spot would otherwise linger.
    this._lightAlphas.hyper = hyperAlpha;
    this._lightAlphas.geo = this.transition.furnitureAlpha("geo");
    this._lightAlphas.ledger = ledgerActive ? ledgerAlpha : 0;
    this._stageLights.gate(this._lightAlphas);

    // Depth of field: only a single focused metagraph, and only where the policy allows it (hyper).
    const metaSel = this.filter !== "all" && this.filter !== "dag";
    const dofMix = THREE.MathUtils.clamp(1 - (this.morph - 0.4) / 0.2, 0, 1);
    this.ctx.dof.enabled = policy.dofEligible && metaSel && dofMix > 0.001;
    if (this.ctx.dof.enabled) {
      const meta = this._dofMeta;
      // The bokeh focal-plane distance is a RENDER property — it needs the hub's actual
      // rendered world position, not a layout anchor (this is not framing math). render-state OK
      const focusTarget = meta ? meta.group.getWorldPosition(this._dofTmp) : this.ctx.controls.target;
      this.ctx.dof.uniforms["focus"].value = this.ctx.camera.position.distanceTo(focusTarget);
      // out-of-focus blur — the ceiling the background core/hubs saturate to. The selected
      // cluster stays crisp regardless (the wide sharp zone comes from the LOW aperture, not
      // this cap — see SceneContext's dofParams note); raised 0.08 → 0.16 (user 2026-07-17:
      // more background separation while focused).
      this.ctx.dof.uniforms["maxblur"].value = 0.16 * dofMix;
    }
  }

  private _updateTween(dt: number) {
    const tw = this._tween;
    if (!tw.active) return;
    // Scale ONLY while the transition choreography is live, so an ordinary focus flight (a
    // click while settled — no transition running) stays full speed under ?slowmo.
    tw.t = Math.min(1, tw.t + dt / (tw.dur * (this.transition.active() ? this._slowmo : 1)));
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
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("resize", this.onResize);
    this.stats?.dom.remove();
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
