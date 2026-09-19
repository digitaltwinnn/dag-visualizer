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
// ⚠️ NOTHING HERE RUNS PER FRAME. The grid is static furniture — built once, re-styled only on a
// theme flip — and its one per-frame input is the transition's furniture alpha, which arrives
// through the `FadeSet` like every other view's. There is no `update(dt)` to call and the Engine
// does not call one.
//
// ⚠️ AND IT NEVER WRITES ITS ROOT'S `visible` (rule 6). Root-group visibility is view LIFECYCLE
// and the Engine owns it, from `viewPolicy.show.trendGround` — a row on the allow-list rather
// than a `mode === "trend"` here, because scene modules are mode-agnostic (the scene-view
// contract) and because convention 7 wants a fifth view to answer the question for itself.

import * as THREE from "three";
import {
  PLANE_GAP,
  PLANE_STEP_X,
  PLANE_STEP_Y,
  PLANE_WORLD_H,
  PLANE_WORLD_W,
  PLANE_Y,
  SCALE_FALLOFF,
  VISIBLE_PLANES,
  staggerCentre,
} from "../../domain/trendStack";
import { glowBlend, inkMix, isLightGround, type SceneColors } from "../../sceneColors";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";

/** The stagger's centre — `stackPoses`' own `staggerCentre` for a full window. The ground draws the SHAPE
 *  of the stack, which is the full five slots whether or not the roster fills them; a ground that
 *  shrank with a short roster would be a second, disagreeing statement about where the stack is. */
const MID = staggerCentre(VISIBLE_PLANES);

/** Slot indices the ground draws a rung for, front to back. `-0.5` is the FOCUS pose exactly —
 *  `stackPoses` lifts a focused plane to `FOCUS_LIFT` (= `PLANE_GAP / 2`) on slot 0's own x, so
 *  the fractional index reproduces its DEPTH from the same arithmetic and `slotX` pins its x. It is drawn whether or not a plane is focused: the floor has to continue toward the
 *  reader past the front plane, or a focused plane would hang over its far edge — which is the one
 *  thing this grid exists to prevent. */
const RUNGS = [-0.5, 0, 1, 2, 3, 4];

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

/** The floor's one world height, from the layout constants alone. */
const GROUND_Y = PLANE_Y - MID * PLANE_STEP_Y - GROUND_DROP;

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
const GROUND_PRESENCE = { dark: 0.3, paper: 0.4 } as const;

/** THE FLOOR RECEDES ON ITS OWN FALLOFF, SQUARED (`RUNG_FALLOFF`).
 *
 *  The planes are opaque cards composited in FRONT of the canvas whatever the depth buffer says,
 *  so a rung is only ever seen where no card covers it — beside and below the deck. There it is
 *  pure furniture establishing the depth axis, and the square keeps the far rungs to a whisper so
 *  the near ones carry it. (While the planes were transparent the square had a harder job: rear
 *  rungs showed THROUGH the front plot, where a horizontal hairline reads as a gridline — a claim
 *  about the data that furniture has no business making. Opaque cards ended that; the falloff is
 *  kept because a floor that does not recede reads as a set of loose lines.) The focus rung
 *  (index < 0) keeps full presence, like the pose it serves. */
const slotPresence = (i: number, paper: boolean): number => {
  const stack = Math.max(0, 1 - RUNG_FALLOFF * Math.max(0, i));
  return (paper ? GROUND_PRESENCE.paper : GROUND_PRESENCE.dark) * stack * stack;
};

/** The slot stagger's X and Z, as `stackPoses` states them — the RISE is the one component the
 *  floor drops (see `GROUND_DROP`). One home: re-tune the stagger in `domain/trendStack.ts` and
 *  the ground follows, because it is derived from the same arithmetic rather than eyeballed
 *  against a screenshot of it. */
// The focus rung (index −0.5) shares slot 0's x: `stackPoses` lifts a focused plane forward and
// down, never sideways.
const slotX = (i: number): number => (Math.max(0, i) - MID) * PLANE_STEP_X;
const slotZ = (i: number): number => -i * PLANE_GAP;

/** Half the width of the card standing on rung `i` — the card's world width at ITS slot's scale
 *  (`stackPoses` shrinks each slot by `SCALE_FALLOFF`; the focus rung, index < 0, is full size).
 *  A rung as wide as the unscaled plane overhung the rear cards by up to 12%. */
const halfW = (i: number): number => (PLANE_WORLD_W / 2) * (1 - SCALE_FALLOFF * Math.max(0, i));

export class TrendsView implements SceneView {
  /** The view root. ⚠️ Its `visible` is the ENGINE's (rule 6) — never written here. */
  readonly group: THREE.Group;

  private readonly _mat: THREE.LineBasicMaterial;
  private readonly _lines: THREE.LineSegments;
  private readonly _fades = new FadeSet();
  private _colors: SceneColors;
  /** One entry per line VERTEX, in buffer order — the SLOT its colour is baked from. The slot,
   *  not the resolved presence: the presence depends on the ground, so a theme flip re-bakes from
   *  the same geometry rather than rebuilding it. */
  private readonly _vertSlot: number[] = [];
  /** Scratch for the colour bake. Module-free and bound once; the bake is event-time either way. */
  private readonly _col = new THREE.Color();
  /** `face()`'s scratch, and the camera orientation it last laid the rungs for (NaN = never). */
  private readonly _right = new THREE.Vector3();
  private _qx = NaN;
  private _qy = NaN;
  private _qz = NaN;
  private _qw = NaN;

  constructor(scene: THREE.Scene, colors: SceneColors) {
    this._colors = colors;
    this.group = new THREE.Group();

    const pos: number[] = [];
    // A rung, remembering each end's slot so the colour bake can follow. The ends are laid along
    // world X here; `face()` re-lays them along the camera's right vector before the first frame
    // draws, so this is only the buffer's shape.
    for (const i of RUNGS) {
      pos.push(slotX(i) - halfW(i), GROUND_Y, slotZ(i), slotX(i) + halfW(i), GROUND_Y, slotZ(i));
      this._vertSlot.push(i, i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(this._vertSlot.length * 3), 3));
    this._mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      // A hairline floor must never occlude — the chart planes composite in FRONT of the canvas
      // whatever depth says, so a depth-writing floor would only ever hide something else.
      depthWrite: false,
      opacity: 1,
    });
    this._lines = new THREE.LineSegments(geo, this._mat);
    this.group.add(this._lines);
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
   *  Per-frame, allocation-free (rule 5): one scratch vector, writes straight into the position
   *  buffer, and skips entirely while the camera's orientation holds still — which, in a view
   *  whose camera does not idle-orbit, is nearly always. */
  face(camera: THREE.Camera): void {
    const q = camera.quaternion;
    if (q.x === this._qx && q.y === this._qy && q.z === this._qz && q.w === this._qw) return;
    this._qx = q.x; this._qy = q.y; this._qz = q.z; this._qw = q.w;
    this._right.set(1, 0, 0).applyQuaternion(q);
    const attr = this._lines.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let r = 0; r < RUNGS.length; r++) {
      const i = RUNGS[r];
      const cx = slotX(i), cz = slotZ(i), h = halfW(i);
      attr.setXYZ(r * 2, cx - this._right.x * h, GROUND_Y - this._right.y * h, cz - this._right.z * h);
      attr.setXYZ(r * 2 + 1, cx + this._right.x * h, GROUND_Y + this._right.y * h, cz + this._right.z * h);
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
    const attr = this._lines.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let v = 0; v < this._vertSlot.length; v++) {
      this._col.setHex(this._colors.core);
      inkMix(this._col, slotPresence(this._vertSlot[v], paper), this._colors);
      attr.setXYZ(v, this._col.r, this._col.g, this._col.b);
    }
    attr.needsUpdate = true;
    this._mat.blending = glowBlend(this._colors);
    this._mat.needsUpdate = true;
  }

  dispose(): void {
    this._lines.geometry.dispose();
    this._mat.dispose();
    this.group.removeFromParent();
  }
}
