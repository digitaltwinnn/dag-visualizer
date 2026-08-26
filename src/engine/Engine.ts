import * as THREE from "three";
import Stats from "stats.js";
import { useStore, type Mode } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { metagraphById, initNetwork, getNetwork, getAnchor, DEFAULT_META_COLOR, resolveSignerIps } from "@/src/data/network";
import { ledgerLens, tickInStory } from "@/src/data/ledgerStory";
import { LISTED_IDS, UNLISTED_ID, UNLISTED_SCENE_HEX_BY_THEME } from "@/src/data/unlisted";
import { hoverKeyOf, tooltipSubject } from "@/src/data/hoverSubject";
import { identityMap, identitySceneHex } from "@/src/palette/identity";
import { createScene, type SceneCtx } from "./scene/SceneContext";
import { HyperView, type MetaHubRec } from "./scene/views/HyperView";
import { Globe } from "./scene/Globe";
import { LedgerView } from "./scene/views/LedgerView";
import { UNLISTED_KEY } from "./domain/ledgerBands";

// The public catalog's ids — the unknown-lane tile resolver splits listed from unlisted rows.
import { StageLight } from "./scene/objects/StageLight";
import { loadGeoCache, resolveMissing } from "@/src/data/geoResolve";
import { METAGRAPHS, NET, netUrl } from "@/src/net/current";
import { COLORS } from "@/src/engine/config";
import { BYTE_SCALE_KB, type RailGroup } from "./domain/ledgerLayout";
import { HYPER_TILT, HYPER_TILT_FOCUS } from "./domain/hyperLayout";
import { readSceneColors, type SceneColors } from "./sceneColors";
import { setNodeDimTarget } from "./scene/objects/NodeFabric";
import { THEME_KEY, parseThemePref, resolveTheme, type Theme } from "@/src/theme/resolve";
import { VIEW_POLICIES, type ViewPolicy } from "./domain/viewPolicy";
import { FOCI, hubFraming, geoFraming, nodeFraming, cohortFraming, ledgerCommitTilt, dollyBack, railsLean, restOrbit, easeInOutQuad, isSamePose, nudgeMix, NUDGE_DUR, type CameraFraming, type FocusName } from "./domain/cameraRig";
import { countryFraming } from "./domain/countryShape";
import { R as GEO_R, LAND_H, latLonToVec3 } from "./domain/geoLayout";
import { clickActions, pickActive, pickNetId, viewEntryActions, metaSnapSelectActions, bandSelectActions } from "./domain/pickActions";
import { ViewTransition, is3D } from "./domain/viewTransition";
import { gatherBand, type GatherBand } from "./domain/gatherLayout";
import { isDoubleTap, tapZoomAround, tapZoomDistance, DOUBLE_TAP_SLOP, TAP_ZOOM_DUR, type Tap } from "./domain/tapZoom";
import { LADDERS, LEVEL_CARRY, hasLevel, type CohortSel, type CompositionSel, type FocusLevel, type SelectionSnapshot, type ResolverKey } from "./domain/focusLadder";
import { compositionGroups, compositionKey, compositionRows } from "@/src/data/composition";
import { metaSnapDeepKey, metaSnapHoverKey } from "@/src/data/types";
import { snapsAtTick } from "@/src/data/anchorLog";
import { breakpointOf } from "@/src/data/breakpoint";
import { calloutPlacement } from "./domain/calloutPlacement";
import type { GlobalSnapshot, NodeRow, PickDescriptor } from "@/src/data/types";
import type { ClusterNode, DagCore, GeoMap, RouteMetagraph } from "@/src/data/types";

type Vec = THREE.Vector3;

// View-transition staging plane (the gather grids the nodes fly to at the top of the viewport).
// GATHER_DIST is the plane's depth in front of the camera; WHERE the band sits and how wide it
// may run is `gatherBand` (domain/gatherLayout), which measures the HUD rather than guessing —
// the top edge lines up with the rail cards' own top, and the band spans the whole viewport
// when the rails are hidden (user, 2026-08-12). Camera-anchored, so it reads the same at any pose.
const GATHER_DIST = 34;

// id[] -> { id: sceneColorNumber }, resolved through the identity map (Task 1). The scene
// layer never imports the TS generator — the Engine owns the map and hands scene colors
// over as plain data.
// localStorage throws in a hardened/private context; a missing pref is the System state, which is
// exactly what parseThemePref answers for null — so a failed read degrades to System, not to a crash.
const safeRead = (key: string): string | null => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};

const sceneColorsFor = (ids: string[], theme: Theme): Record<string, number> => {
  const out: Record<string, number> = {};
  // identityMap ASSIGNS the hues (the guard-band walk over the whole id set), so it still runs;
  // only each hue's L/C themes, which is what identitySceneHex(id, theme) resolves.
  for (const [id] of identityMap(ids)) out[id] = parseInt(identitySceneHex(id, theme).slice(1), 16);
  // The unlisted pseudo-network rides every map with its NEUTRAL gray (one home: unlisted.ts,
  // 2026-08-08) — so the lane/band/ribbon/tile machinery colors it like any catalog id and the
  // scene needs no special case (ByteBar/Ribbons' UNLISTED_KEY→neutral branch was retired with
  // this). Harmless in maps whose consumer never draws it (HyperView's hub map).
  out[UNLISTED_ID] = UNLISTED_SCENE_HEX_BY_THEME[theme];
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
  // THE stage light — one shared SpotLight the focused view CLAIMS per frame (scene/objects/
  // StageLight). Constructed after the scene exists, so it is assigned in the constructor.
  private _stageLight!: StageLight;
  private _ledgerDirty = false; // rebuild the ledger geometry next frame (set on data events)
  // The frame timer — THREE.Timer (THREE.Clock was deprecated in r180). Unlike Clock it must be
  // updated once per frame before reading the delta; the render loop does that.
  private clock = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private _dofTmp = new THREE.Vector3();
  private _calloutV = new THREE.Vector3(); // scratch: the subject callout's anchor, world → NDC
  // Geo callout anchors, cached EVENT-TIME (latLonToVec3 allocates and ring extraction is
  // heavy — neither may run per frame): the node anchor recomputes when the pick REFERENCE
  // changes, the country centroid when the cc string does; the cohort dir is already
  // event-time in Globe and read through its getter.
  private _geoNodePick: unknown = null;
  private _geoNodeLocal = new THREE.Vector3();
  private _geoCcKey: string | null = null;
  private _geoCcDir = new THREE.Vector3();
  private _geoCcOk = false;

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
    t: 0, dur: 1.4, active: false, nudge: false,
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
  private _gatherBand: GatherBand = { topFrac: 0, halfWidthFrac: 0, heightFrac: 0 }; // scratch: the measured band
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
  private onDown = (e: PointerEvent) => {
    this._downX = e.clientX;
    this._downY = e.clientY;
    this._ptrDown++;
    // A stale eat-flag would swallow the NEXT real click, so every gesture starts clean.
    this._eatClick = false;
    if (this._ptrDown > 1) {
      // Two fingers down is a pinch, not a tap pair: drop any half-recognized pair, and drop a
      // running step too — pinch dollies the same axis, and the two would fight for 0.4s. A
      // single-finger orbit is left alone (it rotates, it doesn't dolly) and a pan re-anchors for
      // free, because the step measures against the live `controls.target` every frame.
      this._lastTap = null;
      this._zoom.active = false;
    }
  };
  private _downX = 0;
  private _downY = 0;
  // ── Double-tap zoom (domain/tapZoom) ──────────────────────────────────────────
  // TOUCH ONLY (the `pointerType` gate below, the `RailScroll` idiom): a mouse already has the
  // wheel, and a double CLICK would fight click-select — the second click of the pair would toggle
  // off what the first committed.
  private _ptrDown = 0; //             pointers currently down, for the multi-touch invalidation
  private _lastTap: Tap | null = null; // the unpaired tap waiting for its partner
  private _eatClick = false; //        set when a pair fires; `_handleClick` spends it
  // The step's own eased dolly, owned here because it is not a POSE: it composes onto whatever the
  // controls and the tween have already put the camera at (see _updateTapZoom's ordering note).
  private _zoom = { active: false, t: 0, from: 0, to: 0 };
  private onCancelTap = () => {
    this._ptrDown = 0;
    this._lastTap = null;
  };
  private onUp = (e: PointerEvent) => {
    const solo = this._ptrDown === 1; // a pinch's two ups are not two taps
    this._ptrDown = Math.max(0, this._ptrDown - 1);
    if (e.pointerType === "mouse") return;
    // A tap is a touch that didn't travel — same fingertip tolerance the pair itself gets.
    if (!solo || Math.hypot(e.clientX - this._downX, e.clientY - this._downY) > DOUBLE_TAP_SLOP) {
      this._lastTap = null;
      return;
    }
    const now: Tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (isDoubleTap(this._lastTap, now)) {
      this._lastTap = null; // a pair is spent — a third tap starts a fresh first one
      // ⚠️ THE SECOND TAP MUST NOT PICK. `click` fires after this handler, and while a scene click
      // never deselects a NODE, hub / country / cohort / tile / band clicks all TOGGLE — so an
      // unsuppressed second tap would undo exactly what the first one just committed.
      this._eatClick = true;
      this._tapZoom();
      return;
    }
    this._lastTap = now;
  };
  private _hoverKey: string | null = null;
  // Reused pickables buffer (never re-allocated) — `_pickablesFor` runs on every pointermove.
  private _pickBuf: THREE.Object3D[] = [];

  private unsub: Array<() => void> = [];
  private metaTimer: ReturnType<typeof setInterval> | undefined;
  // Trailing debounce for the direct-manipulation signal (see the constructor's controls
  // listeners): wheel-zoom fires start/end per notch, so `sceneDragging` only drops after a
  // quiet 350ms. A POINTER gesture doesn't wait for it — see `_onPointerRelease`.
  private _dragEndT: ReturnType<typeof setTimeout> | undefined;
  // Store mirror for the rails-hidden camera lean — _tweenTo composes railsLean into every
  // dolly-eligible destination while it holds (see the subscription note). Seeded at boot.
  private railsHidden = false;
  private _onControlsStart = () => {
    clearTimeout(this._dragEndT);
    this._dragEndT = undefined;
    if (!useStore.getState().sceneDragging) useStore.getState().setSceneDragging(true);
  };
  private _onControlsEnd = () => {
    clearTimeout(this._dragEndT);
    this._dragEndT = setTimeout(() => {
      this._dragEndT = undefined;
      useStore.getState().setSceneDragging(false);
    }, 350);
  };
  // ⚠️ THE DEBOUNCE IS FOR THE WHEEL, AND A DRAG MUST NOT PAY IT (user, 2026-08-13 — "there is a
  // slight delay before it re-appears"). A wheel gesture has no end: OrbitControls dispatches
  // start+end synchronously PER NOTCH, so only a quiet window can say the hand is done, and 350ms
  // of it sat in front of every fade-back. A drag's end is known exactly — the pointer lifting —
  // so this handler collapses the wait to zero for that case, leaving the debounce to the one
  // input that needs it.
  //
  // It is gated on a PENDING drop rather than on `sceneDragging`, which is what keeps a pinch
  // intact: lifting one finger of two makes OrbitControls re-dispatch `start` for the remaining
  // pointer (its own document-level handler runs before this window-level one), so `_onControlsStart`
  // has already cleared the timer and this is correctly a no-op. Only a gesture that really ended
  // leaves a timer standing.
  private _onPointerRelease = () => {
    if (this._dragEndT === undefined) return;
    clearTimeout(this._dragEndT);
    this._dragEndT = undefined;
    useStore.getState().setSceneDragging(false);
  };
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
  // The live-tuning panel's handle (devTune.ts) — dev tooling, disposed with the engine.
  private _devTune?: { dispose(): void };
  // Its dev-only DOM switch (user, 2026-08-18 — "can't we just add a switch and show it only for
  // dev?"). `?tune` still opens the panel anywhere, which is what makes it usable against a
  // DEPLOYED build; the switch is the everyday route and exists in `next dev` alone, so nothing
  // here reaches a real user. It sits beside the stats panel bottom-left, outside the four HUD
  // zones — dev chrome is not view chrome, and the same reasoning that keeps Stats out of React
  // keeps this out of it. Grayscale only, per the colour rule: dev tooling states nothing about
  // the palette.
  private _tuneBtn?: HTMLButtonElement;
  // Fired once, after the first frame actually renders (see start()'s loop) — lets callers
  // (SceneCanvas → store.engineReady) know the scene has painted, not just constructed.
  private _onReady?: () => void;
  // Fired once the hypergraph scene is structurally complete — metagraph nodes AND the DAG core's
  // own validator nodes both placed. SceneCanvas → store.sceneReady, which holds the boot overlay
  // until then (a fully-formed reveal, no node pop-in). Tracked via the two _*NodesPlaced flags.
  private _onSceneReady?: () => void;
  private _metaNodesPlaced = false;
  private _coreNodesPlaced = false;

  // ---- theme -------------------------------------------------------------------------------
  // The resolved theme the SCENE currently wears. Resolved at construction from the same two
  // inputs ThemeController reads (stored pref + the media query), because the store's own `theme`
  // may not have been corrected yet when the engine is built; kept current by _refreshTheme.
  private _theme: Theme = "dark";
  // The ONE structural palette object every scene module was threaded at construction. A theme
  // flip mutates it IN PLACE (Object.assign), so every per-frame reader repaints next frame with
  // no call at all — only the construction-time captures need the _colorConsumers fan-out.
  private _colors!: SceneColors;
  // The ONE identity scene map, likewise threaded once and mutated in place. Holds every config
  // metagraph, every live one, "dag" and "unlisted".
  private _sceneColorMap!: Record<string, number>;
  // Adapters holding construction-time captures of either palette. Registered once, in
  // construction order; a flip calls both setters on each.
  private _colorConsumers: {
    setColors(c: SceneColors): void;
    setSceneColors(m: Record<string, number>): void;
  }[] = [];
  // Per-view bloom level, themed (spec §5). ON PAPER THE PASS IS OFF, and the reason is the
  // HIGHPASS: bloom keeps what is brighter than `threshold` (0.13, low so every identity hue
  // clears it), blurs it and adds it back. A ~0.94-L page clears that by itself, so on light the
  // pass returns a blurred copy of the PAGE and adds it over everything — equal RGB everywhere,
  // which lifts every dark mark toward white and crushes its saturation. That veil, not any
  // material value, is what made the day look read as washed-out pastel (measured 2026-08-21:
  // turning it off dropped the scene's dark marks from 140 to 65 luminance and multiplied its
  // strongly-coloured pixels 17×). With the SILVER scene ground (fork C, 2026-08-25) the pass
  // returns in light at a calm level: marks CAN exceed a 0.78-L ground, so a whisper of glow is
  // physically meaningful again — strength scaled well down, threshold floored high so only the
  // genuinely bright marks halo, never the ground.
  private _bloomMul = 1;

  constructor(canvas: HTMLCanvasElement, onReady?: () => void, onSceneReady?: () => void) {
    this.canvas = canvas;
    this._onReady = onReady;
    this._onSceneReady = onSceneReady;
    // Read the structural palette from the CSS design tokens (app/globals.css) — the single source
    // of truth. Every scene module below is fed these; none hardcodes a structural colour. In dev,
    // warn if config.COLORS (the static mirror the non-DOM data/palette layer needs) drifts from the
    // live tokens, so the two can't silently diverge.
    const colors = readSceneColors();
    this._colors = colors;
    // Resolve the theme the way ThemeController does. The pre-paint stamp has already run, so the
    // tokens read above are ALREADY the right theme's — this only tells us WHICH one they are, for
    // the identity lane (which resolves in JS, not CSS) and the drift gate below.
    this._theme = resolveTheme(
      parseThemePref(safeRead(THEME_KEY)),
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    this._bloomMul = this._theme === "light" ? 0.75 : 1; // silver: calm pass (see the field)
    if (process.env.NODE_ENV === "development" && this._theme === "dark") {
      // Tolerant compare (±2 per channel): oklch→sRGB resolution rounds, so only a genuine token
      // change (a different colour) should warn — not a 1-bit rounding wobble.
      const near = (a: number, b: number) =>
        Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= 2 &&
        Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= 2 &&
        Math.abs((a & 255) - (b & 255)) <= 2;
      // The mirror mirrors :root — under a dev network the [data-net] override re-points
      // --primary ON PURPOSE, so only mainnet checks core. dagCore/bg are never overridden.
      // And config.COLORS stays the DARK mirror (spec §4) — its consumers (SSR, the bake scripts)
      // have no DOM and no theme — so the whole comparison is gated on dark above: mainnet-dark is
      // the one state `:root` fully describes, and on paper every row would "drift" by design.
      const drift = ([...(NET === "mainnet" ? [["core", COLORS.core, colors.core] as const] : []),
        ["dagCore", COLORS.dagCore, colors.dagCore] as const,
        ["bg", COLORS.bg, colors.bg] as const])
        .filter(([, a, b]) => !near(a, b)).map(([k]) => k);
      if (drift.length) console.warn(
        `[sceneColors] config.COLORS drifts from globals.css tokens: ${drift.join(", ")} — update config.ts to match.`,
      );
    }
    setNodeDimTarget(colors); // the fabrics' shared mute target follows the ground (see NodeFabric)
    this.ctx = createScene(canvas, colors);
    // HyperView builds all its hubs synchronously from config.METAGRAPHS inside its
    // constructor (before any API data exists), so the identity scene-color map has to be
    // handed in at construction — passing it as a 2nd ctor arg (read by _buildMetagraphs) means
    // the hubs are born in the identity color with no recolor pass and no first-paint flash.
    // HyperView only ever has these 10 config hubs, so this map never GAINS keys — but its VALUES
    // theme (each hue's L/C is per-theme, spec §4), so it is the same mutated-in-place object the
    // globe and the ledger hold rather than a private build of its own.
    this._sceneColorMap = sceneColorsFor([...METAGRAPHS.map((m) => m.id), "dag"], this._theme);
    this._stageLight = new StageLight(this.ctx.scene);
    this.layers = new HyperView(this.ctx.scene, colors, this._stageLight, this._sceneColorMap);
    this.globe = new Globe(this.ctx.scene, this.layers, this.ctx.camera, colors, this._stageLight);
    // The Globe reads the transition machine each frame (geo furniture alpha + the node gather).
    this.globe.transition = this.transition;
    // ONE identity colour system everywhere: the ledger + globe are handed the same identity
    // SCENE map the hubs were born with, at construction, so nothing anywhere is built from a raw
    // config colour ("dag" included — its own brand hue, distinct from structural cyan; see
    // palette/identity.ts). refreshMeta below refreshes/extends both once the live set is known.
    this.ledger = new LedgerView(this.ctx.scene, colors, this._sceneColorMap);
    // The theme fan-out, in construction order. Each holds construction-time captures of one or
    // both palettes (materials, shader uniforms, baked vertex colours, canvas-texture labels);
    // everything else in the scene reads the mutated objects per frame and needs no call.
    this._colorConsumers = [this.layers, this.globe, this.ledger];
    // A tile's identity comes from the POLLED feed (spec §6.1) — the Engine is the store/data
    // bridge, so the lookup lives here and the model stays pure. A tile the buffer can't name is
    // anonymous: drawn, but not pickable. `k` is the tile's index within ITS TICK.
    this.ledger.setTileResolver((metaId, ts, k) => {
      const net = getNetwork();
      if (!net) return null;
      const g = net.globalSnapshots.find((gs) => gs.timestamp === ts);
      if (!g) return null;
      const global = {
        kind: "snapshot",
        data: g,
        title: `Global snapshot #${g.ordinal}`,
      } as Extract<PickDescriptor, { kind: "snapshot" }>;
      if (metaId === UNLISTED_KEY) {
        // The UNKNOWN lane's tiles (user, 2026-08-07: inspectable like any other): the exact
        // read is the only source that knows the unlisted channels — resolve tile `k` to the
        // k-th unlisted row, whose real state-channel ADDRESS becomes the metaSnap subject
        // (the deep read works for any address; the card names it by its address).
        const ex = useStore.getState().snapshotExact[g.ordinal];
        const row = ex?.rows?.filter((r) => !LISTED_IDS.has(r.metaId))[k];
        if (!row) return null;
        return {
          kind: "metaSnap",
          sel: { metaId: row.metaId, ordinal: row.ordinal, hash: "", globalOrdinal: g.ordinal, ts },
          global,
        };
      }
      const s = snapsAtTick(net.metaSnaps, metaId, ts)[k];
      if (!s) return null;
      return {
        kind: "metaSnap",
        sel: { metaId, ordinal: s.ordinal, hash: s.hash, globalOrdinal: g.ordinal, ts },
        global,
      };
    });
    // The globe colours the DAG's own validator nodes (the L0/cL1 shells) with sceneColors["dag"]
    // (see globe.js setNodes) — seed it here, synchronously, so it's populated before the first
    // setNodes call (which can fire from the "cluster" event before refreshMeta's API round-trip
    // resolves).
    this.globe.setSceneColors(this._sceneColorMap);
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerleave", this.onLeave);
    // Double-tap zoom (touch only — see onUp). On the CANVAS rather than the window, so a tap pair
    // that ends on a rail card can't zoom the scene behind it.
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancelTap);
    // The engine owns the resize handler (createScene no longer adds one) so it's
    // cleaned up on dispose — no leak across StrictMode remounts / HMR.
    window.addEventListener("resize", this.onResize);
    // DIRECT-MANIPULATION signal (rail dim, 2026-08-08): OrbitControls' `start`/`end` fire on
    // real pointer/touch/wheel input ONLY — Engine tweens and programmatic camera moves never
    // do — so `store.sceneDragging` is exactly "the user's hand is on the scene". The trailing
    // debounce keeps wheel-zoom bursts (start/end per notch) from strobing the rails.
    this.ctx.controls.addEventListener("start", this._onControlsStart);
    this.ctx.controls.addEventListener("end", this._onControlsEnd);
    // On WINDOW, so it runs after OrbitControls' own document-level pointerup — see the handler.
    window.addEventListener("pointerup", this._onPointerRelease);
    window.addEventListener("pointercancel", this._onPointerRelease);

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

    // Live tuning panel — `?tune` (the ?stats idiom): tweakpane is dynamically imported so it
    // never enters the normal bundle; the panel binds the scene's *TUNE_DEFAULTS-backed objects.
    // In `next dev` a switch offers the same thing without a reload (see _tuneBtn).
    if (/[?#&]tune/.test(window.location.search + window.location.hash)) this._openDevTune();
    if (process.env.NODE_ENV === "development") this._mountTuneSwitch();

    // Apply current store state, then react to changes (Lane B command bridge).
    const s = useStore.getState();
    // Seed the rails-lean mirror (an HMR/StrictMode remount can boot with the flag already on).
    this.railsHidden = s.railsHidden;
    this.mode = s.mode;
    this.filter = s.filter;
    this.cohortSel = s.cohort;
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
        // The engine learns of a theme flip the one allowed way (spec §3). The CSS has already
        // flipped on this same click — `data-theme` / `color-scheme` are stamped by
        // ThemeController before it writes the store — so the tokens re-read below resolve to the
        // new theme with no ordering handshake.
        if (st.theme !== prev.theme) this._refreshTheme(st.theme);
        // The rails-hidden camera LEAN (2026-08-08, review-hardened): the lean is composed into
        // EVERY tween destination by _tweenTo while the flag holds, so the toggle just mirrors
        // the flag and RE-RESOLVES the canonical pose — focus flights, transition landings and
        // the toggle all agree, and no inverse math can desync (holdCamera gates the OUT phase
        // internally; the boundary's own re-derive composes the lean on arrival).
        if (st.railsHidden !== prev.railsHidden) {
          this.railsHidden = st.railsHidden;
          if (VIEW_POLICIES[this.mode].canvas) this._resolveFocus();
        }
        // THE CAMERA FRAMES THE BOXED RUNG (user, 2026-08-09). Opening a rail card asks for that
        // rung's pose — the same resolver its explorer row would have run, just entered from a
        // named rung instead of the finest committed one. It writes no selection, so a finer
        // commitment stands and the NEXT real state change re-derives from it as usual: this is a
        // one-shot gesture, exactly like a click on a row.
        if (st.focusRung !== prev.focusRung && st.focusRung && VIEW_POLICIES[this.mode].canvas) {
          this._resolveFocus(st.focusRung.level);
        }
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
          // (Committing a METAGRAPH in the ledger turns LIVE MODE on for it — the
          // FollowController owns that flow now, 2026-08-07: following flips true and
          // followLatest rides the whole card chain on the heartbeat.)
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
        // A node commit is answered by the camera in every 3D view (user, 2026-08-13). The pose is
        // the view's own business: geo flies to the node, hyper and the ledger resolve to a pose
        // they may already hold and answer with the NUDGE (_tweenTo). Hyper had no branch here at
        // all, so a node click there was the one commit the camera never acknowledged. An
        // allow-list, per convention 7 — the flat views have no camera to move.
        if (st.inspect !== prev.inspect && VIEW_POLICIES[st.mode].canvas) this._resolveFocus();
        // Ledger: keep the hovered/selected snapshot coloured in the trail (hover wins, then the
        // clicked `snap`); everything else fades to the neutral background tone.
        if (st.hoverSnapOrd !== prev.hoverSnapOrd || st.snap !== prev.snap) {
          // COMMITTED and HOVER ride separate channels (user, 2026-08-07): the committed row is
          // the hot one, the hover is a colored-dim PREVIEW that never demotes it, and the
          // REWIND follows only the committed pin (a hover must never drag the trail).
          this.ledger.setSelected(st.snap?.data?.ordinal ?? null);
          this.ledger.setHovered(st.hoverSnapOrd ?? null);
          // The rewind tracks the shown snapshot in EVERY committed state (2026-08-07): a pin,
          // or the filtered live follow — where the card sits on the network's newest ANCHORED
          // tick, the trail holds that row at the front and only advances when the network
          // anchors again (following "all" the shown snap IS the lead, so the offset is 0).
          this.ledger.setPinned(st.snap?.data?.ordinal ?? null);
        }
        // ONE hovered metagraph snapshot (user, 2026-08-09) — its own channel, so a snapshot's
        // hover lights its own tile instead of every sibling anchored into the same tick.
        if (st.hoverMetaSnap !== prev.hoverMetaSnap) {
          this.ledger.setHoveredMetaSnap(st.hoverMetaSnap);
        }
        // A landing EXACT read is what turns a tick from an unmeasured seam into a measured byte
        // bar (spec §6.3), so re-hand the map the moment it changes. Ledger-only: nothing else
        // reads it from the scene, and the view re-reads it on entry via _refreshLedger.
        // The forming block's GIVE-UP path (user, 2026-08-16 — every acquiring state needs
        // one): a FAILED exact read must stop the pulse, or it promises an arrival that isn't
        // coming (bounded by the next tick, but the card rules call that a hang).
        if (st.exactMiss !== prev.exactMiss) this.ledger.setExactMisses(st.exactMiss);
        if (st.snapshotExact !== prev.snapshotExact) {
          if (this.mode === "ledger") this.ledger.setExact(st.snapshotExact);
          // event-time: one pass per landing exact read, over a ~30-entry record. Gated on the
          // dev-only scale check itself (`_scaleWatchOn`) so production never walks the record.
          if (this._scaleWatchOn()) {
            for (const [k, v] of Object.entries(st.snapshotExact)) {
              if (prev.snapshotExact[Number(k)] === undefined) this._noteTickKb(v.totalSizeKB);
            }
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
          // The callout's tile anchor rides the same commit (see LedgerView.setSelectedTile).
          this.ledger.setSelectedTile(sel ? { metaId: sel.metaId, ordinal: sel.ordinal } : null);
          if (!sel) this.globe.setSignerIds(null);
          else {
            const deep = st.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId, sel.ordinal)];
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
          // Through the ledger's own lens (ledgerLens): a hovered DAG chip previews the whole
          // chamber, exactly what committing it means there (user, 2026-08-13).
          this.ledger.setHoverFilter(st.hoverFilter == null ? null : ledgerLens(st.hoverFilter));
        }
        // Geo explorer list-row hover → glow that node's shells on the globe (same as a 3D hover).
        if (st.hoverNodeId !== prev.hoverNodeId) this.globe.setHoverNode(st.hoverNodeId);
        // Geo explorer country-row hover → preview that country's border outline (whisper level;
        // the committed drill's full hairline wins inside the Globe).
        if (st.hoverCountry !== prev.hoverCountry) this.globe.setHoverCountry(st.hoverCountry);
        // Explorer cohort-row hover → glow the whole 3D stack (every member id together).
        if (st.hoverCohort !== prev.hoverCohort) this.globe.setHoverCohort(st.hoverCohort);
        // (The layer-highlight subscription is RETIRED with the layer navigation, 2026-08-06 —
        // the floors and containers are pure visual aid now.)
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

    // Live metagraphs + their geolocated node IPs (server-side; Phase 6 route).
    await this.refreshMeta(true);
    // Keep a long-open tab current. The snapshot/cluster/price feeds already poll
    // client-side (NetworkData), but the metagraph SET is fetched once — so re-pull
    // it on an interval too (Vercel never restarts; ISR only freshens the server
    // cache, not an idle client). Matches the route's revalidate window.
    this.metaTimer = setInterval(() => this.refreshMeta(false), 5 * 60 * 1000); // matches the route's 5m revalidate
  }

  // Fetch the (server-cached, live) metagraph set + node geo. On the initial load we
  // build + frame as usual; on a periodic refresh we rebuild the nodes ONLY if the
  // set actually changed, and WITHOUT moving the camera (don't yank the user's view).
  /** Push the identity scene map at every holder. One home for the fan-out — refreshMeta (new
   *  metagraphs) and _refreshTheme (new L/C for the same hues) both go through it. */
  private _pushSceneColors(): void {
    for (const m of this._colorConsumers) m.setSceneColors(this._sceneColorMap);
  }

  /**
   * A theme flip, applied in one frame (spec §3). The CSS has already flipped, so the two palette
   * objects are swapped IN PLACE and every per-frame writer — the dimModel resolvers, the
   * instanced colour passes, the tile brightness — repaints next frame with no call at all. Only
   * the construction-time captures need the fan-out below.
   *
   * Deliberately an instant snap: a scene cross-fade synchronised against an atomic CSS repaint is
   * complexity with no payoff, and reduced motion is therefore a no-op by construction.
   */
  private _refreshTheme(theme: Theme): void {
    this._theme = theme;
    Object.assign(this._colors, readSceneColors()); // CSS already flipped — the tokens resolve new
    for (const id of Object.keys(this._sceneColorMap)) {
      this._sceneColorMap[id] =
        id === UNLISTED_ID
          // The unlisted network is neutral gray in both lanes and generates no hue, so it is not
          // in identityMap's domain — it carries its own per-theme pair (src/data/unlisted.ts).
          ? UNLISTED_SCENE_HEX_BY_THEME[theme]
          : parseInt(identitySceneHex(id, theme).slice(1), 16);
    }
    // Hue never themes (spec §4), so identityMap is NOT re-run here: the assignment is unchanged
    // and only each hue's L/C moved. refreshMeta stays the one place ids are assigned.
    this.ctx.setClearColor(this._colors.bg);
    this.ctx.setGround(theme === "light");
    setNodeDimTarget(this._colors);
    this._pushSceneColors();
    for (const m of this._colorConsumers) m.setColors(this._colors);
    this._bloomMul = theme === "light" ? 0.75 : 1;
  }

  private async refreshMeta(initial: boolean) {
    try {
      const r = await fetch(netUrl("/api/metagraphs"));
      if (!r.ok) return;
      const { metagraphs, geo } = await r.json();
      if (geo) this.geoMap = { ...this.geoMap, ...geo };
      const changed = JSON.stringify(metagraphs) !== JSON.stringify(this.metaData);
      this.metaData = metagraphs;
      this._publishMetaList(); // context-pane rows ready as soon as the route data is in
      // Globe colors nodes for ALL current metagraphs (incl. new ones the API adds later) AND the
      // DAG's own validator nodes, so rebuild the scene-color map over the live id set + "dag" on
      // every refresh, right before either path below calls setMetagraphs.
      // Mutated IN PLACE, never rebuilt: the same object was threaded into all three views at
      // construction and a theme flip mutates that same object, so a fresh one here would silently
      // strand whichever holder kept the old reference. The live set only ever ADDS ids to the
      // config set, so stale keys are impossible to reach and harmless to keep.
      Object.assign(
        this._sceneColorMap,
        sceneColorsFor([...(this.metaData || []).map((m) => m.id), "dag"], this._theme),
      );
      this._pushSceneColors(); // re-tints the dials/pulses too (incl. new metagraphs)
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
    for (const g of ["meta", "dag"] as RailGroup[]) this.ledger.setContainers(g, this.globe.containerSpecs(g));
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
  /** Whether the sampling is live at all — hoisted so the subscription can skip its whole
   *  Object.entries walk in production (and once the warning has fired). */
  private _scaleWatchOn(): boolean {
    return process.env.NODE_ENV !== "production" && !this._warnedScale;
  }
  private _noteTickKb(kb: number): void {
    if (!this._scaleWatchOn()) return;
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
    // View-scoped selections: LEVEL_CARRY names the levels that clear when leaving their view,
    // and the destination LADDER says whether this view is theirs (`hasLevel`) — read from the
    // table, never re-encoded as `mode !== "x"` here (focusLadder's own rule: "a consumer …
    // reads THAT instead of naming the view"), so a rung moving between ladders can't leave a
    // stale clear behind. Each level's clear is its own store write; country also owns scene
    // state (the drilled border), which is this bridge's half of the job.
    const st0 = useStore.getState();
    const dest3D = is3D(mode) ? mode : null;
    const carries = (lvl: FocusLevel & keyof typeof LEVEL_CARRY): boolean =>
      LEVEL_CARRY[lvl] === "always" || (dest3D != null && hasLevel(dest3D, lvl));
    if (!carries("country")) {
      if (this.country != null) { this.country = null; this.globe.setCountry(null); }
      if (st0.country != null) st0.setCountry(null);
    }
    if (!carries("cohort") && st0.cohort != null) st0.setCohort(null);
    if (!carries("composition") && st0.composition != null) st0.setComposition(null);
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
  // The per-view owner of the subject-arrival beat (see _applyDestLayout's note).
  private _entryViewFor(mode: Mode): { beginEntry(): void; releaseEntry(): void } | null {
    if (mode === "ledger") return this.ledger;
    if (mode === "geo") return this.globe;
    if (mode === "hyper") return this.layers;
    return null;
  }

  private _applyDestLayout(mode: Mode) {
    // THE SUBJECT-ARRIVAL BEAT (user, 2026-08-16 — "give each view a place to animate their
    // view-specific subjects as the final view construction part"): every 3D view owns a
    // begin/release pair — armed here as the destination layout lands, held through the
    // choreography, RELEASED at the transition's completion edge as the scene's closing beat
    // (ledger: the snapshot drop; geo: the density glow breathing in under the stacks; hyper:
    // the tethers sweeping out from the core). A direct arrival with no transition releases
    // immediately. (⚠️ 2026-08-16: the ledger call was silently LOST once by an edit anchored
    // on a wrong parameter name — the effect ran nowhere while every test passed.)
    const entryView = this._entryViewFor(mode);
    if (entryView) {
      entryView.beginEntry();
      if (!this.transition.active()) entryView.releaseEntry();
    }
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
      this.ledger.setFilter(ledgerLens(this.filter)); // the chamber's COLOURED dim, through the ledger's lens (dag = the whole chamber)
      this._refreshLedger();
      // Ledger uses the SHARED overview camera — the group transform (config.viewRotY/viewScale)
      // frames the resting pose central/untilted, and it is the view's ONE pose: every rung
      // resolves to it, so arriving with a node or a network carried lands here too.
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
  // what puts the country/provider (geo) or the composition group (hyper) back under the carried
  // node instead of leaving its parent card slots on their ghosts.
  private _commitViewEntryAncestry(mode: Mode) {
    const st = useStore.getState();
    const acts = viewEntryActions({
      mode,
      pick: st.inspect,
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
      // The committed network's COLOURED DIM: the other networks' ribbons, bands and tiles drop to
      // their own hue, this one's hold identity down the whole trail (four-tier emphasis). Geometry
      // never moves and the camera's only answer is the shared commit tilt inside the settled ledger
      // pose — the per-lane and per-node framings were retired (2026-08-09), so the ladder's NETWORK
      // rung resolves to that one pose, not a lane fly-to.
      this.globe.setFilter(this.filter);
      this.ledger.setFilter(ledgerLens(this.filter));
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
        ? new THREE.Color(identitySceneHex(this.filter, this._theme)).getHex()
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
      // Hyper's node rung has no pose of its own — it frames the node's NETWORK, exactly as the
      // composition rung below it does (user, 2026-08-13: arriving here with a node selected "should
      // behave the same as when (only) a metagraph filter is selected"). The view's subject is the
      // structure; a node is one bead on a shell, and the retired per-node framing (cameraRig's hyper
      // block) dived past the hub and shells that say what the bead belongs to. The click is still
      // answered — the destination is the pose already held, so _tweenTo runs the commit NUDGE.
      return this._resolvers.hyperNetwork();
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
    // The Snapshots view has ONE camera POSE (user, 2026-08-09) — both finer rungs delegate to the
    // overview, so committing a network or a node is answered by COLOUR (plus the overview's own
    // commit orbit), never by a pose of its own. Two framings were tried here and RETIRED, for the
    // same reason in two shapes:
    //
    //   · `cameraRig.ledgerLaneNudge` shifted the pose a fraction toward the committed lane as a
    //     commit acknowledgement. But the field is FIXED and symmetric — every lane always owns its
    //     slice — so any lateral move pushes the far end out of frame, losing geometry the view
    //     just promised stays put. The colour tiers already say which network leads.
    //   · `cameraRig.ledgerNodeFraming` flew to the selected chip in its tray. The trays are visual
    //     aid: machines FILLING the chamber, not the actors in it. The snapshots are the subjects,
    //     so a node pick commits its cards and leaves the room where it is.
    //
    // Kept as their own resolver keys rather than dropped from LADDERS.ledger — the rungs still
    // drive deselect stepping and their rail slots — and they return TRUE so the walk stops here.
    // View entry runs through `_resolveFocus`, so falling through would reach this very pose under
    // another name, and a `false` would read as "no pose available" when there is exactly one.
    ledgerNode: () => this._resolvers.ledgerOverview(),
    ledgerNetwork: () => this._resolvers.ledgerOverview(),
    ledgerOverview: () => {
      // The frontal resting pose (FOCI.ledger, 2026-08-07) — which ORBITS into a three-quarter
      // view while a metagraph is committed (cameraRig.ledgerCommitTilt, user 2026-08-09). Keyed on
      // the FILTER rather than on the rung, so the two finer rungs inherit it by delegating here and
      // clearing the filter tweens back to frontal on its own.
      const f = FOCI.ledger;
      if (!this.filter || this.filter === "all") {
        this.focus("ledger");
        return true;
      }
      ledgerCommitTilt(f.pos, f.target, this._framingOut.pos);
      this._framingOut.target.copy(f.target);
      this._tweenTo(this._framingOut.pos, this._framingOut.target);
      return true;
    },
  };


  // Resolve the camera for the CURRENT selection state by walking the current view's ladder  // (domain/focusLadder.LADDERS) — the one entry point every selection-driven camera flight
  // goes through (a filter/country/cohort/layer/inspect change, a view switch, a transition
  // boundary). No-ops outside the three 3D views.
  //
  // `from` starts the walk at a COARSER rung, skipping the finer ones: the rail's boxed rung asking
  // to be framed (store.focusRung). Same rungs, same resolvers, same poses a row click lands on —
  // the only difference is where the walk begins, so a card and a row can't drift. Falling THROUGH
  // to coarser rungs stays intact, which is also the safety net if the named rung isn't active.
  private _resolveFocus(from?: FocusLevel): void {
    const st = useStore.getState();
    if (this.mode !== "hyper" && this.mode !== "geo" && this.mode !== "ledger") return;
    const sel: SelectionSnapshot = {
      inspectIsNode:
        !!st.inspect && (st.inspect.kind === "l0" || st.inspect.kind === "l1" || st.inspect.kind === "metanode"),
      cohort: st.cohort,
      composition: st.composition,
      country: this.country,
      filter: this.filter,
    };
    const rungs = LADDERS[this.mode];
    const start = from ? rungs.findIndex((r) => r.level === from) : 0;
    for (let i = Math.max(start, 0); i < rungs.length; i++) {
      const rung = rungs[i];
      if (rung.active(sel) && this._resolvers[rung.resolver]()) return;
    }
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
    this._hitObj = null;
    for (const h of hits) {
      // A BLOCKER (the ledger's floor glass) is a normal surface: the ray stops here, and the
      // glass itself is no subject — content underneath must not pick through it (user,
      // 2026-08-07). Hits are distance-sorted, so anything before the glass already returned.
      if (h.object.userData.blocker) return null;
      const pick: PickDescriptor | undefined = h.object.userData.picks
        ? h.object.userData.picks[h.instanceId as number]
        : h.object.userData.pick;
      if (!pick || !pickActive(pick, this.mode, this.filter, this._activeMetaIds)) continue;
      this._hitObj = h.object;
      return pick;
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
  // Drop every transient hover: the tooltip subject + all four hover channels (each store
  // write also resets its 3D effect via the command-bridge subscription). Event-driven only
  // (view switch) — never on the per-frame path.
  private _clearHover() {
    const st = useStore.getState();
    if (st.hoverNodeId != null) st.setHoverNodeId(null);
    if (st.hoverSnapOrd != null) st.setHoverSnapOrd(null);
    if (st.hoverMetaSnap != null) st.setHoverMetaSnap(null);
    if (st.hoverFilter != null) st.setHoverFilter(null);
    if (st.hoverCountry != null) st.setHoverCountry(null);
    if (st.hoverCohort != null) st.setHoverCohort(null);
    if (this._hoverKey != null || st.hover != null) {
      this._hoverKey = null;
      st.setHover(null);
    }
    this.canvas.style.cursor = "grab";
  }

  // Hover tooltip: only writes the store when the hovered target changes (not per
  // pixel); the Tooltip component positions itself from the pointer.

  // Picking stays suppressed while the transition MISLEADS — but not a moment longer (user,
  // 2026-08-16: "when I arrive in hyper I can't click a node ... at some moment it starts to
  // work"). The full choreography runs ~3.9s while the destination READS ready after ~1.9s
  // (furniture built, most nodes landed): the OUT phase and early IN stay suppressed (nodes
  // bunched at the staging grid — a ray there hits the wrong machine), but once the disperse
  // ramp passes 0.6 the fleet is in its ease-out tail, converging on real positions, and a
  // click means what it looks like. `settleAlpha` is the same ramp the geo glow rides.
  private _pickSuppressed(): boolean {
    if (!this.transition.active()) return false;
    if (this.transition.phase !== "in") return true;
    return !is3D(this.mode) || this.transition.settleAlpha(this.mode) < 0.6;
  }

  private _handleMove(e: MouseEvent) {
    // Mid-drag (orbiting): no hover picking — raycasting the planes every move would flicker the
    // layer highlight across the stack while the user is just navigating.
    if (e.buttons !== 0) return;
    if (this._pickSuppressed()) return; // early flight only — see the note on _pickSuppressed
    const p = this._pickAt(e);
    this.canvas.style.cursor = p ? "pointer" : "grab";
    const st = useStore.getState();

    // Route the hovered subject to ITS channel (each already drives a 3D effect + now the paired
    // card/row). Only the channel for the hovered kind is set; the others clear — so exactly one
    // subject is "hovered" at a time. Write only on change (mousemove is high-frequency).
    const nodeKey = hoverKeyOf(p);                                   // node → globe shell glow
    // snapshot → its ledger row. A metagraph-snapshot TILE routes to the SNAPSHOT channel instead
    // (user, 2026-08-09): it is one snapshot, not its tick, so hovering it must not light every
    // sibling that anchored into the same global tick — in the scene OR in the explorer/raw rows.
    const snapOrd = p?.kind === "snapshot" ? p.data.ordinal : null;
    const metaSnapKey = p?.kind === "metaSnap" ? metaSnapHoverKey(p.sel.metaId, p.sel.ordinal) : null;
    const metaId = p?.kind === "meta" ? p.cfg?.id ?? null : null;    // hub → metagraph dim preview
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
    if (metaSnapKey !== st.hoverMetaSnap) st.setHoverMetaSnap(metaSnapKey);
    if (metaId !== st.hoverFilter) st.setHoverFilter(metaId);
    if (countryCc !== st.hoverCountry) st.setHoverCountry(countryCc);

    // The lean tooltip label — re-write the store only when the subject's identity changes so
    // following the cursor never re-renders React.
    const subj = tooltipSubject(p);
    const key = subj ? `${subj.ident}|${subj.name}|${subj.color}` : null;
    if (key === this._hoverKey) return;
    this._hoverKey = key;
    st.setHover(subj);
  }

  private _handleClick(e: MouseEvent) {
    // The second tap of a double tap zoomed instead — see onUp. Spent here, so it can only ever
    // eat the one click its own pair produced.
    if (this._eatClick) {
      this._eatClick = false;
      return;
    }
    // A click that ends a drag (orbit/pan) is navigation, not selection — see onDown.
    if (Math.hypot(e.clientX - this._downX, e.clientY - this._downY) > 5) return;
    if (this._pickSuppressed()) return; // early flight only — see the note on _pickSuppressed
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
        metaSnapSelectActions(p.sel, p.global, { filter: st.filter, metaSnap: st.metaSnap, following: st.following }),
      );
      return;
    }
    // A byte-bar BAND: the tick descriptor rides `userData.pick`, the band's metagraph key rides
    // `userData.bandKey` on the same mesh (a band is a slice of a tick, not a subject of its own).
    const bandKey = this._hitObj?.userData.bandKey as string | undefined;
    if (p?.kind === "snapshot" && bandKey) {
      applyClickActions(
        bandSelectActions(bandKey, p, {
          filter: st.filter,
          metaSnap: st.metaSnap,
          tickHasFilter: this._tickHasFilter(p, st.filter),
        }),
      );
      return;
    }
    applyClickActions(
      clickActions({
        mode: this.mode,
        pick: p,
        countryCc,
        // Hyper's node ancestry (FULL-ANCESTRY rule): a node click commits the composition group
        // it belongs to. The group is derivable from the node itself — its make-up IS the group
        // key — so no list lookup.
        compositionSel: this._compositionOf(p),
        current: {
          filter: st.filter,
          country: st.country,
          hasInspect: !!st.inspect,
          cohort: this.cohortSel,
          pinnedOrdinal: !st.following ? st.snap?.data?.ordinal ?? null : null,
          metaSnap: st.metaSnap,
          tickHasFilter: this._tickHasFilter(p, st.filter),
        },
      }),
    );
  }

  // The composition group a PICK belongs to — network + make-up key. null when the pick isn't a
  // node, carries no role info (the group would be meaningless), or the CURRENT view's ladder has
  // no composition rung (today: hyper alone, but the ladder table says so, not this method).
  /** The filter-releases rule's input for scene band clicks — the ONE story rule
   *  (src/data/ledgerStory.ts; explorer/strip read the same home). */
  private _tickHasFilter(p: PickDescriptor | null, filter: string): boolean | undefined {
    if (!p || p.kind !== "snapshot") return undefined;
    const d = (p as { data?: GlobalSnapshot }).data;
    if (!d) return undefined;
    return tickInStory(filter, getAnchor(d.timestamp), useStore.getState().snapshotExact[d.ordinal]);
  }

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

  private focus(name: FocusName) {
    const f = FOCI[name];
    this._tweenTo(f.pos, f.target);
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
    // The rails-hidden LEAN composes into every destination a dolly may touch (2026-08-08,
    // review-hardened): a property of pose resolution, so focus flights, transition landings and
    // the presentation toggle can never disagree about it. In place (railsLean is outPos===pos
    // safe). It rides the SAME `dolly` gate as dollyBack — both scale (pos − target) about the
    // target, so a pose whose target is a composed look-at is exempt from both (see the exemption
    // note next to CAM_ZOOM). And it RAMPS with how close the pose already sits to the view's
    // resting orbit, which is what `restOrbit` measures — see railsLean's own note.
    if (dolly && this.railsHidden) railsLean(tw.toPos, tw.toTgt, is3D(this.mode) ? restOrbit(this.mode) : 0, tw.toPos);
    // THE COMMIT NUDGE (user, 2026-08-13): "we always animate the position but a 'nudge' is allowed
    // which means the new pos will be same as old pos". Every rung answers a click, including the
    // ones whose pose is their parent's — hyper's node and composition rungs resolve to the network
    // they belong to, so committing one lands exactly where the camera already is. A dead 1.4s
    // no-op reads as a broken click; the nudge is the acknowledgement, and it ends on this same
    // committed pose, so nothing is lost by taking it.
    tw.nudge = isSamePose(tw.fromPos, tw.fromTgt, tw.toPos, tw.toTgt);
    tw.t = 0;
    tw.dur = tw.nudge ? NUDGE_DUR : 1.4;
    tw.active = true;
    // The HUD yields while this flight runs (store.cameraFlying — see its comment): a commit made
    // from a card is a request to LOOK at what was committed, so the cards step back out of the
    // way exactly as they do under a direct drag. NOT during a view transition: that choreography
    // is already the 3.9s answer to the user's gesture, and a 1.4s dim inside it reads as a blink.
    // And NOT for a nudge: the dim exists so the scene can be SEEN changing, and here it doesn't.
    if (!tw.nudge && !this.transition.active() && !useStore.getState().cameraFlying) useStore.getState().setCameraFlying(true);
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
    // × the theme's level (spec §5). Strength alone: radius and threshold say WHAT blooms and how
    // wide the halo is — the pass's shape — while strength is how much of it lands, which is the
    // one thing a paper ground wants near-zero.
    this.ctx.bloom.strength = pb.strength * this._bloomMul;
    this.ctx.bloom.radius = pb.radius;
    // On silver the threshold floors high: only marks brighter than the ground may halo.
    this.ctx.bloom.threshold = this._bloomMul < 1 ? Math.max(pb.threshold, 0.62) : pb.threshold;
    // Paper skips the pass outright rather than running it at zero strength — the composer's own
    // `enabled` flag, the same lever the DoF pass sits behind (SceneContext). A plain boolean
    // write, so the frame body still allocates nothing.
    this.ctx.bloom.enabled = this._bloomMul > 0;

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
    // The transition's completion edge releases the destination view's held subject-arrival
    // beat — the choreography is over, the closing beat may play (see _applyDestLayout).
    if (this._wasTransitionActive && !this.transition.active()) {
      this._entryViewFor(this.mode)?.releaseEntry();
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
    this._updateTapZoom(dt);
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
    //
    // NOT during the OUT phase (user, 2026-08-11 — "the globe jumps to another position when it
    // starts the fade effect"): the teardown still SHOWS the from-view, so writing the
    // destination's frame state there snaps it in plain sight. `mode` flips at switch time and
    // setMode applies the destination's sim gates immediately, which drops geo's `globeSpin` and
    // so un-gates Globe.setHyperSpin — on the very first faded frame the globe group left geo's
    // rotation for hyper's Euler rig. The boundary is where the destination's orientation belongs
    // and _applyBoundary already asserts it there, with the nodes gathered and both furnitures
    // dark. Same rule as the camera hold (viewTransition.holdCamera), one phase later than `mode`.
    if (this.mode === "hyper" && this.transition.phase !== "out") {
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
      // The band clears the HUD it flies in front of: its top edge sits on the rail cards' own
      // top, and it spans the full viewport width when the rails are away. `_gatherO` is the
      // band's TOP EDGE (gatherLayout hangs every grid downward from it).
      const band = gatherBand(window.innerWidth, window.innerHeight, this.railsHidden, this._gatherBand);
      this._gatherO.addScaledVector(this._gatherU2, h * band.topFrac);
      this.globe.setGatherFrame(this._gatherO, this._gatherR, this._gatherU2);
      // The live band, and it decides the pack's DEPTH rather than the chip size: the Globe
      // measures it in capped chip pitches and packs the blocks to fit, so a presentation with
      // more width stages the same chips in fewer, longer rows. Measuring a RAILED band here to
      // size the chips (which is what this did) is no longer needed — nothing about the chip
      // depends on the presentation any more.
      const w = h * this.ctx.camera.aspect * 2;
      this.globe.setGatherFit(w * band.halfWidthFrac, h * band.heightFrac);
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
    // The stage light's per-view PRESENCE, published BEFORE the view updates that claim it: a claim
    // is scaled by its view's furniture alpha, so a fading view's light fades with its furniture and
    // a dark view's claim is worth nothing. That is the whole off-switch — not claiming IS off.
    this._stageLight.setPresence(hyperAlpha, this.transition.furnitureAlpha("geo"));

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
    // The geo SURFACE subtree hard-hides as one unit whenever its fades are fully out (settled
    // ledger/hyper/flat) — the structural fix for the invisible-but-depth-writing furniture class
    // (2026-08-07): opacity handles the transitions, visibility handles the OFF state. The Engine
    // owns the flag; Globe.setMorph computes the alpha (one source, no drift).
    this.globe.surface.visible = this.globe.surfaceAlpha > 0.001;
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
    // Resolve the frame's stage-light claim (hyper/geo made theirs in their update above): stage,
    // aim and ease the winner, then release. No claim = the light eases out.
    this._stageLight.update(dt);

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

    this._syncCallout();
  }

  // ---- the subject callout (policy.callout) --------------------------------------------------
  // components/SceneCallout.tsx renders the label; `#callout` is the marker contract, and the
  // Engine owns only its per-frame PLACEMENT: the committed subject's rendered anchor projected
  // to screen, written straight to the DOM — the Tooltip discipline, so following the subject
  // never triggers a React render (getElementById survives the component's own remounts). The
  // anchor reads the RENDERED world transform on purpose: a label must track where the object is
  // THIS frame — orbit spin, structure tilt and morph included — this is not framing math.
  // render-state OK. Hidden during the view transition (mid-flight positions mislead, same reason
  // picking is suppressed), behind the camera, and wherever the policy or subject says no; the
  // component independently declines to render the same cases from store state, so `data-on` is
  // belt on top of braces, never the only gate.
  //
  // NOT ON A PHONE (user, 2026-08-18 — "drop the callout when in mobile mode"). The label's whole
  // value is CO-LOCATION with its subject, and under 700px the ~298px reach can't deliver it:
  // shortening the leader parks the panel ON the thing it points at, clamping points it sideways
  // at nothing — both keep the pixels and throw the meaning away. It is the same judgement the
  // view already makes for a distributed subject (a filtered fleet gets no callout, because "a
  // single anchor would lie about where it is"); a callout that cannot say WHERE is not a smaller
  // callout, it is a wrong one. Nothing is lost that isn't one tap away — the phone's Details
  // sheet carries the box and the dock's icon tray announces when it updates. `breakpointOf` is
  // the ONE home for the tier (the component gates on the same call through `useBreakpoint`), so
  // the two owners cannot drift apart at the boundary.
  private _syncCallout(): void {
    const el = document.getElementById("callout");
    if (!el) return;
    let on =
      this._policy.callout && !this.transition.active() && breakpointOf(window.innerWidth) !== "phone";
    if (on) {
      const v = this._calloutV;
      on =
        this.mode === "geo"
          ? this._geoCalloutAnchor(v)
          : this.mode === "ledger"
            ? this._ledgerCalloutAnchor(v)
            : this._hyperCalloutAnchor(v);
      if (on) {
        v.applyMatrix4(this.ctx.camera.matrixWorldInverse); // world → view (camera looks −z)
        if (v.z > -0.1) on = false; // behind (or grazing) the camera plane
        else {
          v.applyMatrix4(this.ctx.camera.projectionMatrix); // view → NDC (w-divide included)
          const r = this.ctx.renderer.domElement.getBoundingClientRect();
          const x = r.left + (v.x * 0.5 + 0.5) * r.width;
          const y = r.top + (-v.y * 0.5 + 0.5) * r.height;
          // Placement is `domain/calloutPlacement.ts` — the flip/drop rules and the panel's reach
          // live there with their test, and globals.css mirrors the geometry off the attributes
          // written below (guarded writes, like data-on).
          // ⚠️ MEASURE THE FREE CANVAS BAND, NOT THE CANVAS. Below 1100px the rails are
          // sheets that OVERLAY a still-viewport-sized canvas, so `r.left`/`r.right` describe room
          // the callout does not have: at 900px with both sheets open a geo node's panel rendered
          // as a ~25px fragment in the strip between them. `sceneCoverL`/`sceneCoverR` are what the
          // open sheets measured off themselves (0 on desktop and phone, so this is a no-op there).
          const st = useStore.getState();
          const p = calloutPlacement(x, y, r.left + st.sceneCoverL, r.right - st.sceneCoverR, r.top);
          if (!p.show) on = false;
          else {
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            if ((el.dataset.flip != null) !== p.flip) {
              if (p.flip) el.dataset.flip = "";
              else delete el.dataset.flip;
            }
            if ((el.dataset.drop != null) !== p.drop) {
              if (p.drop) el.dataset.drop = "";
              else delete el.dataset.drop;
            }
          }
        }
      }
    }
    // Guard on the ELEMENT's own attribute, not a cached flag: React remounts the wrapper on a
    // subject change (fresh data-on="0"), so a field would go stale exactly then.
    const flag = on ? "1" : "0";
    if (el.dataset.on !== flag) el.dataset.on = flag;
  }

  // HYPER anchors the committed NODE's own bead when one is committed (user, 2026-08-15 —
  // clickable, has a card, so it gets its callout; the CAMERA still answers a node with its
  // network's framing, but the label points at the thing itself), else the network's hub or
  // the core. The label needs the RENDERED position, not a layout anchor — not framing math.
  private _hyperCalloutAnchor(v: THREE.Vector3): boolean {
    const st = useStore.getState();
    const p = st.inspect;
    // THE BOX LEADS (user, 2026-08-15): re-boxing an ancestor card (clicking a committed
    // node's hub) steps the callout up to the network — the box is the subject, exactly as
    // the camera answers it. SceneCallout mirrors this preference for the content.
    if (
      st.boxedCard !== "context" &&
      p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode") &&
      this.globe.selectedNodeHyperAnchor(v)
    ) {
      this.globe.group.localToWorld(v); // the rendered structure transform — a label read. render-state OK
      return true;
    }
    if (this.filter === "all") return false;
    if (this.filter === "dag") {
      this.layers.coreGroup.getWorldPosition(v); // render-state OK
      return true;
    }
    if (!this._dofMeta) return false; // unlisted / unknown: no 3D anchor — honest absence
    this._dofMeta.group.getWorldPosition(v); // render-state OK
    return true;
  }

  // GEO anchors the finest committed rung with a POINT to point at — node > cohort > country.
  // The network rung deliberately has none: a filtered fleet is spread across the globe, and a
  // single anchor would lie about where it is (the component agrees and renders nothing).
  // Anchors are globe-LOCAL surface points lifted just above the land, carried into world
  // space through the rotating globe group each frame — a render-path label read, the same
  // justification as the hyper anchors above.
  private _geoCalloutAnchor(v: THREE.Vector3): boolean {
    const st = useStore.getState();
    const lift = GEO_R + LAND_H + 0.5;
    // THE BOX LEADS (user, 2026-08-15), then the default finest-first order — a boxed rung
    // whose anchor can't resolve falls through rather than blanking the callout.
    const boxed = st.boxedCard;
    const ok =
      (boxed === "cohort" && this._geoAnchorCohort(st, v, lift)) ||
      (boxed === "country" && this._geoAnchorCountry(st, v, lift)) ||
      this._geoAnchorNode(st, v, lift) ||
      this._geoAnchorCohort(st, v, lift) ||
      this._geoAnchorCountry(st, v, lift);
    if (!ok) return false;
    this.globe.group.localToWorld(v); // the rendered globe rotation — a label read. render-state OK
    return true;
  }

  private _geoAnchorNode(st: ReturnType<typeof useStore.getState>, v: THREE.Vector3, lift: number): boolean {
    const p = st.inspect;
    if (!p || (p.kind !== "l0" && p.kind !== "l1" && p.kind !== "metanode") || p.geo?.lat == null || p.geo.lon == null)
      return false;
    // THE chip, not the stack's base (user, 2026-08-15): the spotlight's own per-record
    // resolution, exposed by Globe. The lat/lon surface point stays as the fallback for the
    // brief window before the selection record resolves on fresh data.
    if (!this.globe.selectedNodeAnchor(v)) {
      if (this._geoNodePick !== p) {
        this._geoNodePick = p;
        this._geoNodeLocal.copy(latLonToVec3(p.geo.lat, p.geo.lon, lift)); // event-time
      }
      v.copy(this._geoNodeLocal);
    }
    return true;
  }

  private _geoAnchorCohort(st: ReturnType<typeof useStore.getState>, v: THREE.Vector3, lift: number): boolean {
    if (!st.cohort) return false;
    const d = this.globe.cohortAnchorDir;
    if (!d) return false;
    v.copy(d).multiplyScalar(lift);
    return true;
  }

  private _geoAnchorCountry(st: ReturnType<typeof useStore.getState>, v: THREE.Vector3, lift: number): boolean {
    if (!st.country) return false;
    if (this._geoCcKey !== st.country) {
      this._geoCcKey = st.country;
      this._geoCcOk = this.globe.countryAnchorDir(st.country, this._geoCcDir); // event-time
    }
    if (!this._geoCcOk) return false;
    v.copy(this._geoCcDir).multiplyScalar(lift);
    return true;
  }

  // LEDGER anchors the pinned SNAPSHOT — the metagraph snapshot's lane lead, or the committed
  // global tick's byte-bar lead one storey down. The rewind brings a committed row to the lead
  // position, so the lead slot IS where the subject settles (LedgerView.calloutAnchor is pure
  // layout data). An uncataloged channel's rows live on the unlisted lane.
  private _ledgerCalloutAnchor(v: THREE.Vector3): boolean {
    const st = useStore.getState();
    // THE BOX LEADS (user, 2026-08-15/16): the boxed NODE card anchors the machine's own tray
    // chip; the boxed GLOBAL card anchors the tick's bar — even while a finer subject stays
    // committed. The boxed METAGRAPH card shows NOTHING (user, 2026-08-16 — like geo's network
    // rung: a network in the chamber is a whole LANE, and a single anchor would lie about it).
    // Then the default order: metagraph tile > global bar > tray node.
    if (st.boxedCard === "context") return false;
    if (st.boxedCard === "node" && this._ledgerNodeAnchor(st, v)) return true;
    if (st.boxedCard === "snap" && st.snap) {
      this._ledgerBarAnchor(v);
      this.ledger.group.localToWorld(v); // render-state OK
      return true;
    }
    if (st.metaSnap) {
      // THE committed snapshot's tile (user, 2026-08-15), rewind offsets included; the lane
      // lead stays as the fallback while the tile is off-trail (aged out of the window or not
      // drawn this frame).
      if (!this.ledger.selectedTileAnchor(v)) {
        if (!this.ledger.calloutAnchor(st.metaSnap.metaId, v) && !this.ledger.calloutAnchor(UNLISTED_ID, v)) return false;
      }
    } else if (st.snap) {
      this._ledgerBarAnchor(v);
    } else if (this._ledgerNodeAnchor(st, v)) return true;
    else return false;
    this.ledger.group.localToWorld(v); // the rendered chamber transform — a label read. render-state OK
    return true;
  }

  // The tick's byte-bar anchor: under a committed filter, the network's OWN band on the shown
  // row (user, 2026-08-16 — "the correct segment of the byte bar"); unfiltered, or when the
  // band isn't drawn (unmeasured tick), the bar's lead centre. Chamber-local (caller lifts).
  private _ledgerBarAnchor(v: THREE.Vector3): void {
    const lens = ledgerLens(this.filter);
    if (lens !== "all" && this.ledger.bandAnchor(lens, v)) return;
    this.ledger.calloutAnchor(null, v);
  }

  // The committed node's tray chip — the same `ledgerPos` its instance lerps to. The chips
  // live in the GLOBE group's space (the fabric is shared), so the lift goes through it.
  private _ledgerNodeAnchor(st: ReturnType<typeof useStore.getState>, v: THREE.Vector3): boolean {
    const p = st.inspect;
    if (!p || (p.kind !== "l0" && p.kind !== "l1" && p.kind !== "metanode")) return false;
    if (!this.globe.selectedNodeLedgerAnchor(v)) return false;
    this.globe.group.localToWorld(v); // render-state OK
    return true;
  }

  /**
   * One double-tap step (domain/tapZoom owns the arithmetic). Two branches, because the camera has
   * two owners:
   *
   * - A commit flight in the air → scale its DESTINATION once, in place, and let the flight land
   *   zoomed in. ⚠️ NOT through `_tweenTo`, which composes `dollyBack` and `railsLean` into every
   *   destination it is handed — routing a direct dolly through it would apply both levers a
   *   second time.
   * - Settled → the eased step below, which is the only camera motion the Engine owns that isn't
   *   a pose.
   */
  private _tapZoom() {
    if (!this._policy.canvas) return; // the flat placeholder views are inert (convention 7)
    if (this.transition.active()) return; // the choreography owns the camera
    const controls = this.ctx.controls;
    const tw = this._tween;
    if (tw.active) {
      tapZoomAround(tw.toPos, tw.toTgt, controls.minDistance, controls.maxDistance, tw.toPos);
      return;
    }
    // Measured live, so a second pair mid-step continues from where the first one has got to.
    const from = this.ctx.camera.position.distanceTo(controls.target);
    const to = tapZoomDistance(from, controls.minDistance, controls.maxDistance);
    if (to === from) return; // already at the floor — nothing to animate
    const z = this._zoom;
    z.from = from;
    z.to = to;
    z.t = 0;
    z.active = true;
  }

  /**
   * The step, applied between the tween and `controls.update()` — so OrbitControls recomputes its
   * spherical from the position we wrote (exactly as it does for the tween), and the altitude
   * clamp downstream still gets the last word. Distance only: the direction is whatever the user
   * has orbited to, and the anchor is the live `controls.target`, so a pan mid-step composes.
   */
  private _updateTapZoom(dt: number) {
    const z = this._zoom;
    if (!z.active) return;
    // A commit flight is a POSE and outranks a nudge along the view vector — drop the step rather
    // than fight it for the camera position.
    if (this._tween.active) {
      z.active = false;
      return;
    }
    z.t = Math.min(1, z.t + dt / TAP_ZOOM_DUR);
    const d = z.from + (z.to - z.from) * easeInOutQuad(z.t);
    const tgt = this.ctx.controls.target;
    this.ctx.camera.position.sub(tgt).setLength(d).add(tgt);
    if (z.t >= 1) z.active = false;
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
    // The nudge rides ON TOP of what is otherwise a zero-length flight: a soft push toward the
    // pose's own target and back out, contributing exactly 0 at t=1 so the tween still lands on
    // the committed pose to the pixel.
    if (tw.nudge) this.ctx.camera.position.lerp(tw.toTgt, nudgeMix(tw.t));
    if (tw.t >= 1) {
      tw.active = false;
      // The flight's trailing edge — one write, and unconditionally, so a tween STARTED before a
      // transition (or suppressed by one) can never strand the HUD dimmed.
      if (useStore.getState().cameraFlying) useStore.getState().setCameraFlying(false);
    }
  }

  // ── The dev tuning panel: one open path, whether the URL flag or the switch asked ──────────
  // `_tuneOpening` is the re-entrancy guard: the import is async, so without it a second click
  // during the load mounts a second panel bound to the same objects.
  private _tuneOpening = false;
  private async _openDevTune(): Promise<void> {
    if (this._devTune || this._tuneOpening) return;
    this._tuneOpening = true;
    try {
      const m = await import("./devTune");
      if (this.disposed) return;
      this._devTune = await m.mountDevTune({
        ledger: this.ledger,
        hyper: this.layers,
        camera: this.ctx.camera,
        controls: this.ctx.controls,
      });
      if (this.disposed) this._devTune.dispose();
    } finally {
      this._tuneOpening = false;
      this._syncTuneSwitch();
    }
  }

  private _closeDevTune(): void {
    this._devTune?.dispose();
    this._devTune = undefined;
    this._syncTuneSwitch();
  }

  private _syncTuneSwitch(): void {
    const b = this._tuneBtn;
    if (!b) return;
    const on = !!this._devTune;
    b.setAttribute("aria-pressed", String(on));
    b.style.opacity = on ? "1" : "0.55";
  }

  // The switch itself. Plain DOM beside Stats, built here rather than in devTune.ts because it has
  // to exist BEFORE the panel module loads — it is what asks for the load.
  private _mountTuneSwitch(): void {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "tune";
    b.title = "Live-tune the scene look (dev only). Same panel as ?tune.";
    b.setAttribute("aria-pressed", "false");
    // Offset right of Next's own dev-tools badge, which claims the bottom-left corner in `next dev`
    // and was covering half this pill — including its hit area.
    Object.assign(b.style, {
      position: "fixed",
      left: "66px",
      bottom: "8px",
      zIndex: "10000",
      padding: "3px 8px",
      font: "11px/1.4 ui-monospace, monospace",
      letterSpacing: "0.06em",
      color: "#fff",
      background: "rgba(0,0,0,0.72)",
      border: "1px solid rgba(255,255,255,0.22)",
      borderRadius: "4px",
      cursor: "pointer",
      opacity: "0.55",
    } satisfies Partial<CSSStyleDeclaration>);
    b.addEventListener("click", () => {
      if (this._devTune) this._closeDevTune();
      else void this._openDevTune();
    });
    document.body.appendChild(b);
    this._tuneBtn = b;
  }

  dispose() {
    this.disposed = true;
    if (this.metaTimer) clearInterval(this.metaTimer);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onCancelTap);
    window.removeEventListener("resize", this.onResize);
    this.ctx.controls.removeEventListener("start", this._onControlsStart);
    this.ctx.controls.removeEventListener("end", this._onControlsEnd);
    window.removeEventListener("pointerup", this._onPointerRelease);
    window.removeEventListener("pointercancel", this._onPointerRelease);
    clearTimeout(this._dragEndT);
    // A dispose mid-drag must not leave the rails dimmed (StrictMode remount / HMR). Same for a
    // dispose mid-FLIGHT: nothing else clears the flag once the render loop stops.
    if (useStore.getState().sceneDragging) useStore.getState().setSceneDragging(false);
    if (useStore.getState().cameraFlying) useStore.getState().setCameraFlying(false);
    this.stats?.dom.remove();
    this._tuneBtn?.remove();
    this._devTune?.dispose();
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    this.ctx.controls.dispose?.();
    this.ctx.renderer.dispose?.();
    this.ctx.composer.dispose?.();
  }
}
