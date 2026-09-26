// THE TRENDS VIEW'S GROUND — and it is the ONLY thing this view draws in WebGL (2026-09-18).
//
// History is a stack of DOM chart planes (`components/TrendStack.tsx`, placed per frame by
// `src/engine/TrendStackSync.ts`), so the canvas under them is empty by design: no nodes, no
// hubs, no chamber. Empty is the problem. A composited DOM layer has no depth cues of its own —
// each plane is a flat rectangle that happens to be smaller and further right than the one in
// front — so with nothing behind them the five planes read as five unrelated cards floating in a
// void rather than as one stack receding into history. The ground is the depth axis made visible:
// ONE RUNG PER SLOT, at exactly the depth, width and stagger `domain/trendStack.ts` places that
// plane at — each plane's FOOTPRINT, the shadow it would cast — so the recession is something the
// eye can follow back instead of something the scale differences have to imply.
//
// ⚠️ A RUNG IS A SHADOW, NOT A LINE (user, 2026-09-26: "make the line look more like a nice shadow
// rather than cyan coloured; it's too distracting and does not present any useful information").
// It was an accent hairline, and an accent line is a MARK — the eye reads it as a gridline or a
// reading, and there is nothing to read. So each rung is a soft band hanging from the floor line:
// a quad billboard `SHADOW_H` tall whose alpha rises over the top `SHADOW_LIP` and decays to
// nothing at the bottom (`shadowTexture`), in the NEUTRAL ink (`SceneColors.fg`) rather than the
// accent, with the ends feathered so nothing about it has an edge. Furniture that recedes into the
// ground it sits on, on both grounds: additive haze on dark, ink on paper.
//
// ⚠️ THE TIME CURSOR IS NOT HERE, and that is a decision rather than an omission
// (2026-09-19). The plan gave this view a WebGL quad spanning the stack's depth at the cursor's
// instant. With the stagger landed, one quad cannot line up with five differently placed,
// differently scaled recharts plot areas — each has its own margins and its own axis strip — so
// the mark would sit beside the bucket it claims to name on four planes out of five. A cursor
// that misses its bucket MISSTATES THE DATA (rule 10), and "roughly there" is not a thing a
// reading instrument may be. The cursor is therefore drawn per plane, in the plane's own
// coordinate system, by the chart that owns the scale: `TrendChart`'s `cursorMs` prop over
// `src/data/trendWindow.ts`'s `bucketAt`.
//
// ⚠️ ONE RUNG PER CARD THAT IS THERE (user, 2026-09-19). The floor first drew all five slots
// whatever the roster held, on the argument that it states the stack's SHAPE — and under a
// committed filter that left four lines receding behind a single card, footprints of planes that
// do not exist. `face()` takes the window's count and lays exactly that many rungs, centred on the
// same `staggerCentre(count)` the poses use, so the floor is the footprint of what stands on it.
// A rung that has no card collapses AT ONCE (React unmounts its card at once); the centre and the
// lone card's shift EASE, at the projector's own `STACK_EASE_K`, because the surviving cards ease
// to their new places and a floor that arrived first would sit apart from them for the whole move.
//
// ⚠️ THERE IS NO `update(dt)`. The floor is furniture: colours are baked on a theme flip, the
// transition's alpha arrives through the `FadeSet`, and `face()` — the one per-frame call —
// returns before touching the buffer while its inputs hold still.
//
// ⚠️ AND IT NEVER WRITES ITS ROOT'S `visible` (rule 6). Root-group visibility is view LIFECYCLE
// and the Engine owns it, from `viewPolicy.show.trendGround` — a row on the allow-list rather
// than a `mode === "trend"` here, because scene modules are mode-agnostic (the scene-view
// contract) and because convention 7 wants a fifth view to answer the question for itself.

import * as THREE from "three";
import {
  PLANE_GAP,
  PLANE_STEP_Y,
  PLANE_WORLD_H,
  PLANE_WORLD_W,
  PLANE_Y,
  SCALE_FALLOFF,
  STACK_EASE_K,
  VISIBLE_PLANES,
  staggerCentre,
  stepX,
} from "../../domain/trendStack";
import { glowBlend, inkMix, isLightGround, type SceneColors } from "../../sceneColors";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";


/** Slot indices the ground draws a rung for, front to back — one per slot. There was a sixth, in
 *  FRONT of slot 0, for a focused plane that stood ahead of the stack; a focus RE-DEALS the deck
 *  now (the focused card takes slot 0), so no card ever stands out there. */
const RUNGS = Array.from({ length: VISIBLE_PLANES }, (_, i) => i);

/** Settled-enough for the floor's ease (slot units / px): below it the value snaps to its target
 *  and `face()` can go back to skipping. */
const EASE_EPS = 0.0005;

/** How much presence a rung loses per slot of depth — the FLOOR's own recession. It was the
 *  planes' `OPACITY_FALLOFF` while they faded with depth; the cards are opaque now (2026-09-19), so
 *  that coefficient is 0 and the floor states its own. */
const RUNG_FALLOFF = 0.16;

// ⚠️ THERE ARE NO SIDE RAILS, and the pair was built and cut after one look. Joining the rungs'
// ends along the depth axis sounds like the thing that makes a ladder read as a ladder — but the
// stagger moves the near rung's LEFT end far out to the left while the far one converges on the
// vanishing point, so the left rail became a single hard diagonal slashing up across the front
// chart's plot: the loudest line on the canvas, drawn over the one thing the reader is reading.
// The rungs alone already carry the recession (five parallels, each narrowing and rising), and
// this view's whole job is to stay out of the charts' way.

/** How far below the NEAREST slot's centre the floor lies: half the plane's own height
 *  (`PLANE_WORLD_H` — the domain states it beside the width, so a re-tune of either moves the floor
 *  with it), plus the half step the FOCUS pose carries a plane further down, plus a small margin.
 *  Derived, not eyeballed: the first cut was a multiple of the slot step, which only cleared the
 *  plot while the plane happened to be shorter than a step — enlarging the plane (2026-09-19) would
 *  have run the floor through the front chart.
 *
 *  ⚠️ THE FLOOR IS LEVEL, AND A RAMP RISING WITH THE STACK WAS BUILT AND CUT (the second look).
 *  Putting each rung one step under its OWN plane is the obvious reading of "every plane stands on
 *  its own line", and it cannot work here: `PLANE_STEP_Y` is much smaller than a plane's own
 *  height (`PLANE_WORLD_H`), so the planes OVERLAP — a rung tucked under
 *  plane i lands inside plane i−1's plot, and there is no drop that escapes it (clear your own
 *  plane's bottom and you are already past the top of the one in front). A hairline crossing a
 *  chart's plot area reads as a gridline or a zero line, which is a claim about the DATA that the
 *  furniture has no business making. Level, below everything, is the version that stays furniture.
 *  What the rungs say instead is each plane's FOOTPRINT on the floor: same depth, same width, same
 *  stagger — the shadow the stack would cast. */
const GROUND_DROP = PLANE_WORLD_H / 2 + PLANE_STEP_Y / 2 + PLANE_WORLD_H * 0.12;

/** The floor's world height for a stagger centred on `centre` (`staggerCentre(count)`, eased):
 *  `GROUND_DROP` below the FRONT card's centre, which `stackPoses` places from the same number. */
const groundY = (centre: number): number => PLANE_Y - centre * PLANE_STEP_Y - GROUND_DROP;

/** The nearest rung's PRESENCE, one number per ground — how much of the accent the floor carries
 *  at the front. Quiet by intent on both: this is furniture establishing an axis, and everything a
 *  reader is here to read is on the planes above it. `inkMix` then expresses that level for the
 *  ground it lands on — a multiply toward black where the mark is additive glow, a lerp toward the
 *  page where it is ink.
 *
 *  ⚠️ TWO NUMBERS, MEASURED, rather than one run through `inkPresence` — `Globe`'s `paperBase`
 *  escape, and for its reason. The gamma is tuned for the marks that carry DATA (it lifts a
 *  resting band off the page so emphasis can be spent downward from there), and on 0.3 it answers
 *  0.84, which on this ground paints very nearly full teal: a floor louder than the charts
 *  standing on it. A floor has no emphasis span to protect, so it states its own paper level, and
 *  the one it needs is higher than dark's — measured, because the two grounds are genuinely
 *  different instruments (dark adds light to nothing and bloom lifts it further; paper only has
 *  ink, and this ground is a 0.88-L page). */
const GROUND_PRESENCE = { dark: 0.07, paper: 0.2 } as const;

/** The shadow band's height in world units — how far below the floor line the soft falloff runs.
 *  A little over a tenth of the card: enough to read as a shadow's spread, not a second card. */
const SHADOW_H = PLANE_WORLD_H * 0.22;
/** The band's alpha ramps UP over this fraction of its height before it decays, so the floor line
 *  itself has no hard edge — a shadow's darkest part is just under the object, not a crease. */
const SHADOW_LIP = 0.04;
/** How far in from each end the band feathers (fraction of its width). */
const SHADOW_FEATHER = 0.08;

/** The band's alpha, as a texture the material samples: a vertical rise-then-decay, feathered at
 *  both ends. Grayscale on purpose (rule 3 allows luminance) — the COLOUR is the vertex bake's.
 *  Event-time: built once per ground, at construction. */
function shadowTexture(): THREE.Texture {
  const w = 128, h = 64;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  // ⚠️ LUMINANCE, NOT CANVAS ALPHA. Three reads an alphaMap's GREEN channel, and a canvas whose
  // pixels vary only in alpha uploads as white everywhere — the band then draws as a solid slab
  // (seen live, 2026-09-26). So the ramps are black→white→black, and the feather MULTIPLIES in.
  const v = ctx.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, "rgb(0,0,0)");
  v.addColorStop(SHADOW_LIP, "rgb(255,255,255)");
  v.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // Feather the ends: the horizontal ramp multiplies the vertical one.
  ctx.globalCompositeOperation = "multiply";
  const u = ctx.createLinearGradient(0, 0, w, 0);
  u.addColorStop(0, "rgb(0,0,0)");
  u.addColorStop(SHADOW_FEATHER, "rgb(255,255,255)");
  u.addColorStop(1 - SHADOW_FEATHER, "rgb(255,255,255)");
  u.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = u;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; // an alpha map, not a colour
  return tex;
}

/** THE FLOOR RECEDES ON ITS OWN FALLOFF, SQUARED (`RUNG_FALLOFF`).
 *
 *  The planes are opaque cards composited in FRONT of the canvas whatever the depth buffer says,
 *  so a rung is only ever seen where no card covers it — beside and below the deck. There it is
 *  pure furniture establishing the depth axis, and the square keeps the far rungs to a whisper so
 *  the near ones carry it. (While the planes were transparent the square had a harder job: rear
 *  rungs showed THROUGH the front plot, where a horizontal hairline reads as a gridline — a claim
 *  about the data that furniture has no business making. Opaque cards ended that; the falloff is
 *  kept because a floor that does not recede reads as a set of loose lines.) */
const slotPresence = (i: number, paper: boolean): number => {
  const stack = Math.max(0, 1 - RUNG_FALLOFF * i);
  return (paper ? GROUND_PRESENCE.paper : GROUND_PRESENCE.dark) * stack * stack;
};

/** The slot stagger's X and Z, as `stackPoses` states them — the RISE is the one component the
 *  floor drops (see `GROUND_DROP`). One home: re-tune the stagger in `domain/trendStack.ts` and
 *  the ground follows, because it is derived from the same arithmetic rather than eyeballed
 *  against a screenshot of it. */
const slotX = (i: number, centre: number, narrow: boolean): number => (i - centre) * stepX(narrow);
const slotZ = (i: number): number => -i * PLANE_GAP;

/** Half the width of the card standing on rung `i` — the card's world width at ITS slot's scale
 *  (`stackPoses` shrinks each slot by `SCALE_FALLOFF`).
 *  A rung as wide as the unscaled plane overhung the rear cards by up to 12%. */
const halfW = (i: number): number => (PLANE_WORLD_W / 2) * (1 - SCALE_FALLOFF * i);

export class TrendsView implements SceneView {
  /** The view root. ⚠️ Its `visible` is the ENGINE's (rule 6) — never written here. */
  readonly group: THREE.Group;

  private readonly _mat: THREE.MeshBasicMaterial;
  private readonly _mesh: THREE.Mesh;
  private readonly _alpha: THREE.Texture;
  private readonly _fades = new FadeSet();
  private _colors: SceneColors;
  /** One entry per band VERTEX, in buffer order — the SLOT its colour is baked from. The slot,
   *  not the resolved presence: the presence depends on the ground, so a theme flip re-bakes from
   *  the same geometry rather than rebuilding it. */
  private readonly _vertSlot: number[] = [];
  /** Scratch for the colour bake. Module-free and bound once; the bake is event-time either way. */
  private readonly _col = new THREE.Color();
  /** `face()`'s scratch, and the camera orientation it last laid the rungs for (NaN = never). */
  private readonly _right = new THREE.Vector3();
  private readonly _up = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private _qx = NaN;
  private _qy = NaN;
  private _qz = NaN;
  private _qw = NaN;
  private _count = -1;
  /** The stagger centre and the lone card's screen shift AS DRAWN — eased toward their targets. */
  private _centre = 0;
  private _shift = 0;
  /** True until the first `face()` of a showing — the floor starts AT its targets, never slides in. */
  private _fresh = true;
  private _viewH = 0;
  private _px = NaN;
  private _py = NaN;
  private _pz = NaN;
  private _narrow = false;

  constructor(scene: THREE.Scene, colors: SceneColors) {
    this._colors = colors;
    this.group = new THREE.Group();

    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    // A band per rung — four corners (top-left, top-right, bottom-right, bottom-left), each
    // remembering its slot so the colour bake can follow. Laid along world X here; `face()`
    // re-lays them along the camera's right and up vectors before the first frame draws, so this
    // is only the buffer's shape. `v = 1` is the floor line (the texture's opaque lip sits just
    // under it), `v = 0` the faded foot.
    for (const i of RUNGS) {
      const c = staggerCentre(VISIBLE_PLANES);
      const x0 = slotX(i, c, false) - halfW(i), x1 = slotX(i, c, false) + halfW(i);
      const y = groundY(c), z = slotZ(i);
      const b = pos.length / 3;
      pos.push(x0, y, z, x1, y, z, x1, y - SHADOW_H, z, x0, y - SHADOW_H, z);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this._vertSlot.push(i, i, i, i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(this._vertSlot.length * 3), 3));
    geo.setIndex(idx);
    this._alpha = shadowTexture();
    this._mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      alphaMap: this._alpha,
      side: THREE.DoubleSide,
      // A floor must never occlude — the chart planes composite in FRONT of the canvas whatever
      // depth says, so a depth-writing floor would only ever hide something else.
      depthWrite: false,
      opacity: 1,
    });
    this._mesh = new THREE.Mesh(geo, this._mat);
    // Never culled: the bands are re-laid every frame the camera moves and the sphere three would
    // compute from the constructor's shape is stale the moment `face()` runs.
    this._mesh.frustumCulled = false;
    this.group.add(this._mesh);
    scene.add(this.group);

    // The one static material: opacity is exactly base × the view alpha, so the floor builds and
    // tears down with the rest of the view's furniture. PRESENCE rides the vertex COLOUR instead
    // (see `_restyle`) — which is what lets the theme change a mark's weight without touching the
    // registration this contract asks to happen exactly once.
    this._fades.register(this._mat, 1);
    this._restyle();
  }

  /** The transition's furniture alpha — the whole of this view's per-frame surface. */
  setViewAlpha(a: number): void {
    this._fades.apply(a);
    // Dark: whatever the floor last drew is stale by the time the view returns.
    if (a <= 0.001) this._fresh = true;
  }

  /** Lay every rung along the CAMERA'S RIGHT vector, centred on its slot's floor point.
   *
   *  ⚠️ THE CARDS ARE BILLBOARDS, SO THE RUNGS HAVE TO BE (user, 2026-09-19: "the lines under the
   *  charts don't align with the cards anymore when I move the camera around"). The projector
   *  writes a card as a translate and a uniform scale with NO rotation — that is what keeps its
   *  text crisp — so a card always faces the screen. A rung fixed along world X is a real 3D
   *  segment: orbit the camera and it turns in perspective while the card above it does not, and
   *  the footprint slides out from under the thing it is the footprint of. A segment parallel to
   *  the image plane at the card's depth projects to exactly the card's pixel width at every pose,
   *  so that is what a rung is: its CENTRE is layout data (the slot's x and z on the level floor),
   *  its DIRECTION is the camera's.
   *
   *  `count` is how many planes the window holds (`trendStack.windowCount`) — one rung each, and a
   *  rung past the count collapses to a point, which draws nothing. `shiftPx` is the SCREEN shift
   *  the projector gives a lone card (`trendStack.loneShiftPx`); the rung takes the same shift,
   *  converted to world units at its own view depth and laid along the camera's right vector, so
   *  the line stays under the card it belongs to. `viewH` is the canvas height that conversion
   *  needs — the Engine passes 0 while no shift is asked for, and the last real one is kept for the
   *  ease back. `dt` drives the ease of the centre and the shift. `narrow` is the canvas tier
   *  (`trendStack.stepX`): below desktop the deck stacks straight up and so do its rungs. All
   *  plain data from the Engine.
   *
   *  Per-frame, allocation-free (rule 5): two scratch vectors, writes straight into the position
   *  buffer, and skips entirely while nothing it reads has changed — the camera's orientation and
   *  the eased values always, the camera's position too while a shift stands (the px→world
   *  conversion reads the view depth). */
  face(camera: THREE.PerspectiveCamera, count: number, shiftPx: number, viewH: number, dt: number, narrow: boolean): void {
    const centreT = staggerCentre(count);
    let moved = false;
    if (this._fresh) {
      this._fresh = false;
      this._centre = centreT;
      this._shift = shiftPx;
      moved = true;
    } else if (this._centre !== centreT || this._shift !== shiftPx) {
      const k = 1 - Math.exp(-STACK_EASE_K * dt);
      this._centre += (centreT - this._centre) * k;
      this._shift += (shiftPx - this._shift) * k;
      if (Math.abs(centreT - this._centre) < EASE_EPS) this._centre = centreT;
      if (Math.abs(shiftPx - this._shift) < EASE_EPS) this._shift = shiftPx;
      moved = true;
    }
    if (viewH > 0 && viewH !== this._viewH) {
      this._viewH = viewH;
      moved = true;
    }
    const q = camera.quaternion;
    const p = camera.position;
    const still =
      !moved && count === this._count && narrow === this._narrow &&
      q.x === this._qx && q.y === this._qy && q.z === this._qz && q.w === this._qw &&
      (this._shift === 0 || (p.x === this._px && p.y === this._py && p.z === this._pz));
    if (still) return;
    this._qx = q.x; this._qy = q.y; this._qz = q.z; this._qw = q.w;
    this._px = p.x; this._py = p.y; this._pz = p.z;
    this._count = count;
    this._narrow = narrow;
    this._right.set(1, 0, 0).applyQuaternion(q);
    this._up.set(0, 1, 0).applyQuaternion(q);
    this._fwd.set(0, 0, -1).applyQuaternion(q);
    // px per world unit at one unit of depth — the projector's own expression.
    const pxPerUnitAt1 = this._viewH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const c = this._centre;
    const y = groundY(c);
    const shift = this._shift;
    const attr = this._mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const R = this._right, U = this._up;
    for (let r = 0; r < RUNGS.length; r++) {
      const i = RUNGS[r];
      // A rung past the count collapses to a point, which draws nothing.
      const h = i < count ? halfW(i) : 0;
      const drop = i < count ? SHADOW_H : 0;
      let cx = slotX(i, c, narrow), cy = y, cz = slotZ(i);
      if (shift !== 0 && pxPerUnitAt1 > 0) {
        const d = (cx - p.x) * this._fwd.x + (cy - p.y) * this._fwd.y + (cz - p.z) * this._fwd.z;
        const s = d > 0 ? (shift * d) / pxPerUnitAt1 : 0;
        cx += R.x * s; cy += R.y * s; cz += R.z * s;
      }
      const v = r * 4;
      // The floor line along the camera's right, the band hanging down the camera's up: a
      // billboard, like the card whose footprint it is (see the header on why the rungs face).
      attr.setXYZ(v, cx - R.x * h, cy - R.y * h, cz - R.z * h);
      attr.setXYZ(v + 1, cx + R.x * h, cy + R.y * h, cz + R.z * h);
      attr.setXYZ(v + 2, cx + R.x * h - U.x * drop, cy + R.y * h - U.y * drop, cz + R.z * h - U.z * drop);
      attr.setXYZ(v + 3, cx - R.x * h - U.x * drop, cy - R.y * h - U.y * drop, cz - R.z * h - U.z * drop);
    }
    attr.needsUpdate = true;
  }

  /** The theme flip. Joins the Engine's `_colorConsumers` fan-out like the other views. */
  setColors(c: SceneColors): void {
    this._colors = c;
    this._restyle();
  }

  /** Bake the accent at each vertex's presence for the ground it is painted on, and pick the
   *  blend mode that ground needs. Event-time — a theme flip, and construction.
   *
   *  Both halves are `sceneColors`' own questions, asked the one way the rest of the scene asks
   *  them: `inkMix` multiplies toward black on the dark ground (where the mark is additive glow)
   *  and lerps toward the page on paper (where it is ink, and a multiply would make the FAINTEST
   *  line the DARKEST thing on the page), and `glowBlend` flips additive → normal to match. A
   *  material whose blending changes after construction has to say `needsUpdate` — three caches
   *  the program per blending mode. */
  private _restyle(): void {
    const paper = isLightGround(this._colors);
    const attr = this._mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let v = 0; v < this._vertSlot.length; v++) {
      // NEUTRAL: the foreground ink, never the accent — a shadow has no hue of its own.
      this._col.setHex(this._colors.fg);
      inkMix(this._col, slotPresence(this._vertSlot[v], paper), this._colors);
      attr.setXYZ(v, this._col.r, this._col.g, this._col.b);
    }
    attr.needsUpdate = true;
    this._mat.blending = glowBlend(this._colors);
    this._mat.needsUpdate = true;
  }

  dispose(): void {
    this._mesh.geometry.dispose();
    this._mat.dispose();
    this._alpha.dispose();
    this.group.removeFromParent();
  }
}
