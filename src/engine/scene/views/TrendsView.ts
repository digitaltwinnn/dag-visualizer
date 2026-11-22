// THE TRENDS VIEW'S GROUND — and it is the ONLY thing this view draws in WebGL (2026-09-18).
//
// History is a stack of DOM chart planes (`components/TrendStack.tsx`, placed per frame by
// `src/engine/TrendStackSync.ts`), so the canvas under them is empty by design: no nodes, no
// hubs, no chamber. Empty is the problem. A composited DOM layer has no depth cues of its own —
// each plane is a flat rectangle that happens to be smaller and further right than the one in
// front — so with nothing behind them the five planes read as five unrelated cards floating in a
// void rather than as one stack receding into history. The ground is the depth axis made visible:
// a DOT FLOOR under the deck (`DOT_FLOOR`), a lattice whose rows close up toward the horizon, in the
// identity hues of the cards standing over it.
//
// ⚠️ IT IS NOT A SHADOW UNDER EACH CARD, and that was built first. One soft band per slot — the
// card's footprint, neutral, then in its identity hue, then hugging the card's foot — read as a
// smudge under a crisp DOM card every time, and a DOM mirror of the front chart did no better
// (user, 2026-11-22, four rounds: "drop mirror and wash and come with a completely different but
// subtle scene background"). Git has the bands.
//
// ⚠️ THE FLOOR IS LEVEL AND THERE ARE NO LINES IN DEPTH. The deck's up-stagger is much smaller than
// a card's own height, so the cards OVERLAP and a floor rising with the stack would run through
// the plot in front of it; and lines along the depth axis converge on the vanishing point as hard
// diagonals across the front chart (side rails were built and cut after one look, 2026-09-18).
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
// ⚠️ NO FLOOR UNDER NOTHING (user, 2026-09-19). `face()` takes the window's count: a scope with no
// card to draw draws no floor under the sentence that says so, and the floor's height follows the
// same `staggerCentre(count)` the poses use, EASED at the projector's own `STACK_EASE_K` — the
// surviving cards ease to their new places, and a floor that arrived first would sit apart from
// them for the whole move.
//
// ⚠️ THERE IS NO `update(dt)`. The floor is furniture: its colours are set on a theme flip or a
// change of deck, the transition's alpha arrives through the `FadeSet`, and `face()` — the one
// per-frame call — returns before writing anything while its inputs hold still.
//
// ⚠️ AND IT NEVER WRITES ITS ROOT'S `visible` (rule 6). Root-group visibility is view LIFECYCLE
// and the Engine owns it, from `viewPolicy.show.trendGround` — a row on the allow-list rather
// than a `mode === "trend"` here, because scene modules are mode-agnostic (the scene-view
// contract) and because convention 7 wants a fifth view to answer the question for itself.

import * as THREE from "three";
import { PLANE_GAP, PLANE_Y, STACK_EASE_K, VISIBLE_PLANES, planeFormat, staggerCentre, type PlaneFormat } from "../../domain/trendStack";
import { glowBlend, isLightGround, structureInk, type SceneColors } from "../../sceneColors";
import { FadeSet } from "../objects/FadeSet";
import type { SceneView } from "./SceneView";

/** The deck's slots, front to back — one colour band of the floor each. */
const SLOTS = Array.from({ length: VISIBLE_PLANES }, (_, i) => i);

/** Settled-enough for the floor's ease (slot units): below it the value snaps to its target and
 *  `face()` can go back to skipping. */
const EASE_EPS = 0.0005;

/** The front card's FOOT, in world height, for a stagger centred on `centre`
 *  (`staggerCentre(count)`, eased): half the card's own height (`PlaneFormat.worldH`) below the
 *  front card's centre, which `stackPoses` places from the same number. Derived, so enlarging a
 *  card moves the floor with it. */
const footY = (centre: number, f: PlaneFormat): number => PLANE_Y - centre * f.stepY - f.worldH / 2;

/** THE DOT FLOOR — History's scene background: a lattice of small dots on a level floor under the
 *  deck, receding to nothing. It is TEXTURE, not a mark: a dot states no line, no row and no edge,
 *  so nothing in it can be read as a gridline or a reading, and being crisp at every size it sits
 *  with the cards' own type instead of smearing under them. Perspective does the work: the lattice
 *  is even in the world, so on screen its rows close up toward the horizon, which is the depth
 *  axis the stack recedes along.
 *
 *  It was level HAIRLINES for a day (2026-11-22, on "we use dots also for nodes, can we use
 *  something else (lines?)") and the user came back to the dots the day after: "I actually like the
 *  earlier proposal where we had a plane of dots instead of the lines". Git has the lines.
 *
 *  `spacing` is the lattice pitch in world units (the card is 58 wide), `dot` a dot's radius as a
 *  fraction of the pitch (`paperDot` times that on paper, where ink has no glow to carry a
 *  two-pixel dot), `band` the depth of one card's colour band in slot gaps, `reach` the radius of
 *  the pool the field fades out over, `drop` how far below the front card's foot the floor lies (a
 *  fraction of the card's height), and the two presences are the dots' level per ground (a gain on
 *  the pool's falloff, capped at a full dot — paper's is above 1 so the ink holds its hue further
 *  out from the pool's centre).
 *
 *  ⚠️ THE POOL IS PER TIER (`centre`, `reach` and their `phone` twins; user, 2026-11-23: on the
 *  phone the floor "sits behind the card"). `centre` is where the pool is centred in depth (world
 *  z; the front card stands at 0, the deck recedes into the negative). On a wide screen it lies
 *  well BEHIND the deck, so the lattice thins toward the viewer, where dots seen close up turn
 *  coarse. A phone's card fills the width and stands in the upper half of a tall screen: the floor
 *  behind the deck is all covered by the card, and everything the reader can see of it is the part
 *  between the card and themselves. There the pool is centred in FRONT of the deck and reaches
 *  further, so the card stands at the back of a field that runs down the screen to the dock. */
export const DOT_FLOOR: Readonly<{
  spacing: number; dot: number; paperDot: number; band: number; drop: number; dark: number; paper: number;
  centre: number; reach: number; centrePhone: number; reachPhone: number;
}> = {
  spacing: 2.0, dot: 0.065, paperDot: 2.0, band: 2.5, drop: 0.172, dark: 0.75, paper: 3.2,
  centre: -34, reach: 85, centrePhone: 20, reachPhone: 130,
};
/** The floor plane's side: comfortably past `reach`, so its edge is never on screen. */
const FLOOR_FIELD = 320;

export class TrendsView implements SceneView {
  /** The view root. ⚠️ Its `visible` is the ENGINE's (rule 6) — never written here. */
  readonly group: THREE.Group;

  private readonly _fades = new FadeSet();
  private readonly _floor: THREE.Mesh;
  private readonly _floorMat: THREE.ShaderMaterial;
  private _colors: SceneColors;
  /** The identity hue of the network on each slot's card (0 = none known → the structure ink),
   *  handed in by the Engine whenever the deck or the theme changes (the hue lanes differ by
   *  ground). */
  private readonly _slotHue: number[] = SLOTS.map(() => 0);
  private _count = -1;
  /** The stagger centre AS DRAWN — eased toward its target. */
  private _centre = 0;
  /** True until the first `face()` of a showing — the floor starts AT its target, never slides in. */
  private _fresh = true;
  private _fmt: PlaneFormat | null = null;

  constructor(scene: THREE.Scene, colors: SceneColors) {
    this._colors = colors;
    this.group = new THREE.Group();
    scene.add(this.group);

    // THE DOT FLOOR (see DOT_FLOOR). One level plane; the lattice is a fragment term over the
    // world position, antialiased in screen space (`fwidth`) so a dot is round at any
    // distance, and handed over to nothing where the pitch falls under a few pixels, so the far
    // field dissolves instead of shimmering.
    this._floorMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uOp: { value: 0 },
        uPresence: { value: 0 },
        uLattice: { value: new THREE.Vector3(DOT_FLOOR.spacing, DOT_FLOOR.dot, DOT_FLOOR.reach) },
        // The pool's centre in depth, per tier (see DOT_FLOOR); `face()` writes both with the format.
        uCentre: { value: new THREE.Vector2(0, DOT_FLOOR.centre) },
        // THE DOTS WEAR THE DECK'S COLOURS (user, 2026-11-22: "can we give it metagraph colors"):
        // the lattice takes the cards' identity hues IN THE DECK'S ORDER, front to back
        // (`setSlotHues`) — the front card's from the viewer to its foot, then a band per card
        // behind it, each easing into the next, and the structure ink beyond the last and where no
        // hue is known. A band is `DOT_FLOOR.band` slot gaps deep, not one: at the cards' true
        // spacing a band was three rows of dots and the whole deck's colours a thin stripe (seen
        // live). The floor echoes the deck's order; it does not survey it.
        uHue: { value: SLOTS.map(() => new THREE.Color()) },
        uGap: { value: PLANE_GAP * DOT_FLOOR.band },
      },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vXZ = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOp; uniform float uPresence;
        uniform vec3 uLattice; uniform vec2 uCentre;
        uniform vec3 uHue[${VISIBLE_PLANES}]; uniform float uGap;
        varying vec2 vXZ;
        void main() {
          // Which card's depth this row lies at: slot 0 is the front card and everything nearer.
          float t = clamp(-vXZ.y / uGap, 0.0, float(${VISIBLE_PLANES - 1}));
          int i0 = int(floor(t));
          int i1 = min(i0 + 1, ${VISIBLE_PLANES - 1});
          vec3 hue = mix(uHue[i0], uHue[i1], smoothstep(0.3, 0.7, fract(t)));
          // Past the last card the lattice returns to the structure ink.
          hue = mix(hue, uColor, smoothstep(float(${VISIBLE_PLANES - 1}) + 0.5, float(${VISIBLE_PLANES}) + 1.5, -vXZ.y / uGap));
          // One dot per lattice cell, round at any distance: aa is a pixel in lattice space.
          vec2 g = vXZ / uLattice.x;
          vec2 fw = fwidth(g);
          float aa = max(fw.x, fw.y);
          float d = length(fract(g) - 0.5);
          float dotA = 1.0 - smoothstep(uLattice.y - aa, uLattice.y + aa, d);
          float crowd = 1.0 - smoothstep(0.16, 0.4, aa);
          float far = 1.0 - smoothstep(0.0, uLattice.z, length(vXZ - uCentre));
          gl_FragColor = vec4(hue, min(1.0, dotA * crowd * far * far * uPresence) * uOp);
        }
      `,
    });
    this._floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_FIELD, FLOOR_FIELD), this._floorMat);
    this._floor.rotation.x = -Math.PI / 2;
    this._floor.frustumCulled = false;
    this._floor.renderOrder = -1;
    // The fade set drives `opacity`; a ShaderMaterial has no opacity uniform of its own.
    this._floor.onBeforeRender = () => { this._floorMat.uniforms.uOp.value = this._floorMat.opacity; };
    this.group.add(this._floor);
    // Registered once: opacity is exactly base × the view alpha, so the floor builds and tears
    // down with the rest of the view's furniture. Its LEVEL is a uniform (`_restyle`), which is
    // what lets a theme flip change it without touching this registration.
    this._fades.register(this._floorMat, 1);
    this._restyle();
  }

  /** WHOSE card stands over each band of the floor: one identity hue per slot, nearest first
   *  (0 = no hue). Event-time: the Engine calls it when the deck, the focus, the page or the theme
   *  changes. */
  setSlotHues(hues: readonly number[]): void {
    let changed = false;
    for (const i of SLOTS) {
      const h = hues[i] ?? 0;
      if (this._slotHue[i] !== h) { this._slotHue[i] = h; changed = true; }
    }
    if (changed) this._restyle();
  }

  /** The transition's furniture alpha — the whole of this view's per-frame surface. */
  setViewAlpha(a: number): void {
    this._fades.apply(a);
    // Dark: whatever the floor last drew is stale by the time the view returns.
    if (a <= 0.001) this._fresh = true;
  }

  /** Set the floor under the deck. `count` is how many planes the window holds
   *  (`trendStack.windowCount`): none draws no floor, and the floor's height follows the stagger
   *  centred on that count, eased by `dt` (the projector's own clock). `phone` picks the card's
   *  format (`trendStack.planeFormat`), whose height the drop is a fraction of. All plain data from
   *  the Engine.
   *
   *  Per-frame, allocation-free (rule 5), and it returns before writing anything while the count,
   *  the format and the eased centre all hold still. */
  face(count: number, dt: number, phone = false): void {
    // Two stable objects, so the reference is the change signal.
    const fmt = planeFormat(phone);
    const centreT = staggerCentre(count);
    let moved = false;
    if (this._fresh) {
      this._fresh = false;
      this._centre = centreT;
      moved = true;
    } else if (this._centre !== centreT) {
      this._centre += (centreT - this._centre) * (1 - Math.exp(-STACK_EASE_K * dt));
      if (Math.abs(centreT - this._centre) < EASE_EPS) this._centre = centreT;
      moved = true;
    }
    if (!moved && count === this._count && fmt === this._fmt) return;
    this._count = count;
    this._fmt = fmt;
    this._floor.visible = count > 0;
    // The pool for this tier (see DOT_FLOOR).
    (this._floorMat.uniforms.uCentre.value as THREE.Vector2).y = phone ? DOT_FLOOR.centrePhone : DOT_FLOOR.centre;
    (this._floorMat.uniforms.uLattice.value as THREE.Vector3).z = phone ? DOT_FLOOR.reachPhone : DOT_FLOOR.reach;
    // A little under the front card's foot. A card is DOM and composites in front of the canvas,
    // so the floor can never cross its plot whatever the drop.
    this._floor.position.y = footY(this._centre, fmt) - fmt.worldH * DOT_FLOOR.drop;
  }

  /** The theme flip. Joins the Engine's `_colorConsumers` fan-out like the other views. */
  setColors(c: SceneColors): void {
    this._colors = c;
    this._restyle();
  }

  /** The dots' colours, level and blend for the ground they are drawn on. Event-time — a theme
   *  flip, a change of deck, and construction. A material whose blending changes after
   *  construction has to say `needsUpdate` — three caches the program per blending mode. */
  private _restyle(): void {
    const paper = isLightGround(this._colors);
    // The structure ink (what the hoops and the graticule are made of) where no card's hue is
    // known and beyond the last card.
    const ink = structureInk(this._colors);
    (this._floorMat.uniforms.uColor.value as THREE.Color).setHex(ink);
    const hues = this._floorMat.uniforms.uHue.value as THREE.Color[];
    for (const i of SLOTS) hues[i].setHex(this._slotHue[i] || ink);
    this._floorMat.uniforms.uPresence.value = paper ? DOT_FLOOR.paper : DOT_FLOOR.dark;
    // Ink has no bloom and no glow to carry a two-pixel dot: on paper the dot is drawn larger.
    (this._floorMat.uniforms.uLattice.value as THREE.Vector3).y = DOT_FLOOR.dot * (paper ? DOT_FLOOR.paperDot : 1);
    this._floorMat.blending = glowBlend(this._colors);
    this._floorMat.needsUpdate = true;
  }

  dispose(): void {
    this._floor.geometry.dispose();
    this._floorMat.dispose();
    this.group.removeFromParent();
  }
}
