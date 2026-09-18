import * as THREE from "three";
import { PLANE_PX_W, PLANE_WORLD_W, stackPoses } from "./domain/trendStack";

// THE TREND STACK'S PER-FRAME PLACEMENT — `CalloutSync`'s sibling, and the second instance of the
// same mechanism (2026-09-18). React renders one transparent DOM plane per network
// (`components/TrendStack.tsx`) and owns everything inside it; this projects each `PlanePose`
// through the camera and writes ONE `transform` onto the matching `[data-plane]` anchor. So a plane
// following the camera never triggers a React render — the Tooltip discipline, exactly as the
// callout does it.
//
// ⚠️ THE ENGINE LAYER STAYS THE ONE STORE BRIDGE (rule 1). This module never imports the store
// as a VALUE — the Engine reads it once per frame and hands the slice in as `TrendStackState`,
// which is deliberately narrow: it is the executable list of what the stack actually depends on,
// so a new dependency is a visible line here rather than a silent `getState()` reach.
//
// ⚠️ RULE 5 governs `sync`. The host and every scratch object are bound ONCE at construction.
//
// ⚠️ AND IT NEVER TOUCHES THE DOM ITSELF. Element RESOLUTION is the host's (`plane(id)`, `root()`),
// which is not ceremony: `querySelector` is event-time work — React mounts a plane a commit after
// the store change that asks for it — and keeping the query in the Engine is what lets this module
// be tested at all in a `node` environment with no `document`. What arrives here is an object with
// a `style` and an `isConnected`, which is the whole surface a projector needs.
//
// ⚠️ FRONT-FACING, ALWAYS. The matrix is a uniform scale plus a translate and carries NO rotation
// or skew term. That is a look decision with a performance edge: the planes host real text, so an
// oblique plane would be both unreadable and a per-frame re-raster of a composited layer. Depth is
// carried by scale, by the pose's own opacity and by paint order — never by perspective on the box.

/** Exactly the store keys the stack reads. Engine passes this in; see the bridge note above. */
export interface TrendStackState {
  layout: "stack" | "flat";
  scroll: number;
  focus: string | null;
  /** The ranked roster, busiest first — store `trendIds`, the React → Engine publish channel.
   *  Compared BY REFERENCE: React publishes a fresh array only when the content changes. */
  ids: readonly string[];
}

/** One `[data-plane]` anchor, as narrowly as this module needs it — a `style` it writes and a
 *  liveness flag the host's cache keys on. Satisfied by a real `HTMLElement`. */
export interface TrendPlaneEl {
  style: { transform: string; visibility: string };
  isConnected: boolean;
}

/** The `#trend-stack` root, as narrowly as this module needs it: one attribute the CSS fades on. */
export interface TrendRootEl {
  dataset: { on?: string };
}

/** The engine-side values the projection needs. Bound once — a stable camera ref plus getters for
 *  the handful of things that change per frame. */
export interface TrendStackHost {
  camera: THREE.PerspectiveCamera;
  /** Canvas CSS size in px — the same box the renderer sizes against, so a projected point lands
   *  where the scene drew it. */
  width(): number;
  height(): number;
  /** Frame delta in seconds, already clamped by the Engine. */
  dt(): number;
  /** Resolve a plane's element by network id, or null while React has not mounted it yet. */
  plane(id: string): TrendPlaneEl | null;
  /** The stack's root, for the entrance fade's one attribute. */
  root(): TrendRootEl | null;
  /** Is the stack live in this view right now — the policy allows it AND the view has finished
   *  arriving? Mid-transition the camera is flying and the planes would ride a pose that means
   *  nothing yet, which is the same call the callout makes. */
  active(): boolean;
}

/** The ease rate, in e-folds per second. A layout or focus change TRAVELS: the stack is a spatial
 *  claim about which network is in front, and a jump reads as a redraw rather than a movement.
 *  Frame-rate independent by construction (`1 − e^(−k·dt)`), so the same gesture takes the same
 *  wall-clock time at 12fps and at 120. */
const EASE_K = 8;

/** Settled-enough, in world units / scale factor. Below it the value snaps to target and the idle
 *  skip may engage — an ease that only ever approaches would keep the projector awake forever. */
const EPS = 0.0005;

/** One plane's eased state. Pre-allocated per id; allocating for a newly seen id is event-time. */
interface Slot {
  /** Eased current pose. */
  x: number; y: number; z: number; s: number;
  /** The pose `stackPoses` last asked for. */
  tx: number; ty: number; tz: number; ts: number;
  /** The element this slot last wrote, and what it last said about visibility. React remounts the
   *  plane on a roster change, and a fresh mount arrives hidden — so the cache is keyed on the
   *  element's own identity or it goes stale exactly then (the `#callout` data-on lesson). */
  el: TrendPlaneEl | null;
  vis: boolean;
}

export class TrendStackSync {
  private readonly h: TrendStackHost;

  // ---- scratch, bound ONCE (rule 5) ----------------------------------------------------------
  private _v = new THREE.Vector3();
  /** The camera's world + projection matrices as of the last WRITE. ⚠️ Float32 on purpose, and
   *  compared through `Math.fround`: the elements are float64, so a plain copy-and-compare would
   *  differ forever and the idle skip below would never engage. Float32's ~1e-7 relative step is
   *  an imperceptible-drift filter at this scene's scale (~6e-6 world units at the resting pose). */
  private _cam = new Float32Array(32);
  private _slots = new Map<string, Slot>();
  /** The visible window's ids, in slot order — rebuilt only when the state changes. */
  private _order: string[] = [];

  // ---- last-seen state, for the idle skip ----------------------------------------------------
  private _layout: TrendStackState["layout"] | null = null;
  private _scroll = -1;
  private _focus: string | null = null;
  private _ids: readonly string[] | null = null;
  private _w = -1;
  private _h = -1;
  private _settled = false;
  private _wasActive = false;
  /** Set when a pose had no element to write to — React has not mounted it yet, so the projector
   *  must keep looking rather than falling asleep on a plane that never got placed. */
  private _missing = false;
  /** The root's announced state; `null` = never written. */
  private _on: boolean | null = null;

  constructor(host: TrendStackHost) {
    this.h = host;
  }

  /** Called once per frame from the Engine's scene-write phase — after the camera has settled,
   *  because every number here is derived from the camera's final pose for this frame. */
  sync(st: TrendStackState): void {
    if (!this.h.active()) {
      if (this._wasActive) this._hideAll();
      this._wasActive = false;
      this._announce(false);
      return;
    }
    this._announce(true);

    // The camera settled in the Engine's CAMERA phase, but `matrixWorld` is only recomputed by the
    // renderer — which runs AFTER the scene writes. Deriving it here costs one invert and makes a
    // plane land on the frame the scene actually renders; the renderer's own later call recomputes
    // byte-identical values from the same position/quaternion. A read, not a pose mutation.
    const cam = this.h.camera;
    cam.updateMatrixWorld();

    let retarget = false;
    if (
      st.ids !== this._ids ||
      st.layout !== this._layout ||
      st.scroll !== this._scroll ||
      st.focus !== this._focus
    ) {
      this._ids = st.ids;
      this._layout = st.layout;
      this._scroll = st.scroll;
      this._focus = st.focus;
      this._retarget(st);
      retarget = true;
    }

    const w = this.h.width();
    const h = this.h.height();
    const moved = this._camMoved();

    // THE IDLE SKIP — the main performance lever. The trends feed refreshes every five minutes and
    // the camera parks between gestures, so this view's steady state is "nothing to say"; five DOM
    // style writes a frame for an unchanged answer is exactly the cost a DOM-in-3D layer has to
    // avoid. Every clause is a real way the answer can change: the camera, the canvas box, the
    // requested poses, an ease still travelling, a plane React has not mounted yet, and the view
    // itself coming back.
    if (!retarget && !moved && w === this._w && h === this._h && this._settled && this._wasActive && !this._missing) {
      return;
    }
    this._w = w;
    this._h = h;
    this._wasActive = true;

    this._ease(this.h.dt());
    this._write(cam, w, h);
  }

  // ---- targets -------------------------------------------------------------------------------
  // Recomputed only on a state change, so `stackPoses`' allocation is event-time and the ease below
  // runs against plain numbers. A plane SEEN FOR THE FIRST TIME starts AT its target: a fly-in from
  // the origin would make every roster refresh look like an entrance.
  private _retarget(st: TrendStackState): void {
    const poses = stackPoses(st.ids, { layout: st.layout, scroll: st.scroll, focus: st.focus }); // event-time
    this._order.length = 0;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      this._order.push(p.id);
      let sl = this._slots.get(p.id);
      if (!sl) {
        sl = { x: p.x, y: p.y, z: p.z, s: p.scale, tx: 0, ty: 0, tz: 0, ts: 0, el: null, vis: false }; // event-time
        this._slots.set(p.id, sl);
      }
      sl.tx = p.x;
      sl.ty = p.y;
      sl.tz = p.z;
      sl.ts = p.scale;
    }
    // BOUNDED: a roster that scrolls or re-ranks would otherwise accumulate a slot per id ever seen.
    for (const id of this._slots.keys()) {
      if (!this._order.includes(id)) this._slots.delete(id);
    }
    this._settled = false;
  }

  private _ease(dt: number): void {
    const k = 1 - Math.exp(-EASE_K * dt);
    let settled = true;
    for (let i = 0; i < this._order.length; i++) {
      const sl = this._slots.get(this._order[i]!)!;
      sl.x += (sl.tx - sl.x) * k;
      sl.y += (sl.ty - sl.y) * k;
      sl.z += (sl.tz - sl.z) * k;
      sl.s += (sl.ts - sl.s) * k;
      if (
        Math.abs(sl.tx - sl.x) < EPS && Math.abs(sl.ty - sl.y) < EPS &&
        Math.abs(sl.tz - sl.z) < EPS && Math.abs(sl.ts - sl.s) < EPS
      ) {
        sl.x = sl.tx; sl.y = sl.ty; sl.z = sl.tz; sl.s = sl.ts;
      } else {
        settled = false;
      }
    }
    this._settled = settled;
  }

  // ---- the write -----------------------------------------------------------------------------
  // One `matrix3d` per plane: the pose projected to canvas px for the translate, and the plane's
  // own world width converted to px for the scale. The anchor is a 0-size element at the layer's
  // top-left with `transform-origin: 0 0`, so the matrix's translate IS the projected point and the
  // plane's centring is its child's business — which keeps this side pure arithmetic.
  private _write(cam: THREE.PerspectiveCamera, w: number, h: number): void {
    // px per world unit at one unit of depth: h / (2·tan(fov/2)). Divided by the plane's own view
    // depth below, which is the whole of perspective.
    const pxPerUnitAt1 = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this._missing = false;
    for (let i = 0; i < this._order.length; i++) {
      const id = this._order[i]!;
      const sl = this._slots.get(id)!;
      const el = this.h.plane(id);
      if (el !== sl.el) {
        sl.el = el;
        sl.vis = false; // a fresh mount arrives hidden (the component's own `invisible`)
      }
      if (!el) {
        this._missing = true;
        continue;
      }
      const v = this._v;
      v.set(sl.x, sl.y, sl.z).applyMatrix4(cam.matrixWorldInverse); // world → view (camera looks −z)
      const d = -v.z;
      // BEHIND (or grazing) THE NEAR PLANE. The projection's w goes non-positive there, so the NDC
      // that comes back is not "off screen" — it is mirrored and arbitrarily large. Hiding is the
      // only honest answer; a clamped matrix would park a chart at a corner as if it were placed.
      if (d <= cam.near) {
        this._setVis(sl, el, false);
        continue;
      }
      v.applyMatrix4(cam.projectionMatrix); // view → NDC (w-divide included)
      const tx = (v.x * 0.5 + 0.5) * w;
      const ty = (-v.y * 0.5 + 0.5) * h;
      const s = (PLANE_WORLD_W * (pxPerUnitAt1 / d)) / PLANE_PX_W * sl.s;
      // Rounded so an imperceptible drift never shows up as a fresh string: 3 decimals of scale is
      // ~0.27px at the plane's own edge, 2 decimals of translate is a hundredth of a px.
      el.style.transform = `matrix3d(${s.toFixed(3)},0,0,0,0,${s.toFixed(3)},0,0,0,0,1,0,${tx.toFixed(2)},${ty.toFixed(2)},0,1)`;
      this._setVis(sl, el, true);
    }
  }

  /** True when the camera's pose or lens changed since the last write — and copies the new one in.
   *  Costs 32 compares a frame, against five style writes and five projections it saves. */
  private _camMoved(): boolean {
    const c = this._cam;
    const mw = this.h.camera.matrixWorld.elements;
    const pm = this.h.camera.projectionMatrix.elements;
    let moved = false;
    for (let i = 0; i < 16; i++) {
      const a = Math.fround(mw[i]!);
      if (c[i] !== a) { c[i] = a; moved = true; }
      const b = Math.fround(pm[i]!);
      if (c[16 + i] !== b) { c[16 + i] = b; moved = true; }
    }
    return moved;
  }

  private _setVis(sl: Slot, el: TrendPlaneEl, on: boolean): void {
    if (sl.vis === on) return;
    sl.vis = on;
    el.style.visibility = on ? "visible" : "hidden";
  }

  private _hideAll(): void {
    for (let i = 0; i < this._order.length; i++) {
      const id = this._order[i]!;
      const sl = this._slots.get(id);
      if (!sl) continue;
      const el = this.h.plane(id);
      if (el) this._setVis(sl, el, false);
      else sl.vis = false;
    }
  }

  // THE ENTRANCE, as one attribute. React owns each plane's opacity (it comes from the pose), so
  // the LAYER's own fade is the honest place to answer "the view has arrived": `#trend-stack` sits
  // at opacity 0 until this says otherwise, and the CSS transition beside it does the rest. Guarded
  // on the cached flag, so the steady state costs one boolean compare and never touches the DOM.
  //
  // ⚠️ THE TWO DIRECTIONS ARE NOT SYMMETRIC about a missing root, and getting that wrong is a
  // per-frame `getElementById` in EVERY OTHER VIEW. Turning ON must retry — the stack mounts a
  // commit after the store change, so a root that is not there yet would strand the layer at
  // opacity 0 forever. Turning OFF must NOT: leaving the view unmounts the stack, so the element
  // is legitimately gone and it remounts carrying no attribute at all, which already reads as off.
  // Retrying that one would leave this reaching for a node that is never coming back.
  private _announce(on: boolean): void {
    if (this._on === on) return;
    const root = this.h.root();
    if (root) root.dataset.on = on ? "1" : "0";
    if (root || !on) this._on = on;
  }
}
