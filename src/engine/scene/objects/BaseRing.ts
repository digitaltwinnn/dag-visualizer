import * as THREE from "three";
import { METAGRAPHS } from "@/src/net/current";
import { R, LAND_H } from "../../domain/geoLayout";
import { ringPresence, ringWedge, type RingLevels, type RingSegment, type RingTier, type WedgeState } from "../../domain/baseRing";
import { FOCUS_TUNE } from "../../domain/dimModel";
import { joinBloom } from "../SceneContext";
import { entryStep, entryTotal } from "../../domain/entryBeat";
import { hookOcclusion } from "../occlusion";

// THE BASE RING ADAPTER — three nested rings of flat arcs on a plane under the globe, the located
// fleet by country, provider and network (`domain/baseRing.ts` does the arithmetic; this file owns
// the meshes, the pie wedges under them, the ruler's ticks and the arrival beat).
// Design A of the brainstorm's `globe-ring.html` (user, 2026-10-23). Three decisions carry it:
//   · IT DOES NOT SPIN WITH THE GLOBE. The globe's `group` turns to face a selection; a chart that
//     turned with it would read as geography. The ring's group is the Globe's sibling in the
//     scene, parked at the globe's centre and the base plane — the Engine shows and hides it with
//     the globe's own `show.globeSurface` flag.
//   · IT IS FURNITURE: its materials ride the geo view's `geoFades` (presence × the morph, the
//     paper ink rule applied by the Globe's one fade loop) and `geoBlends` (additive on dark, the
//     mask on Print), exactly like the compass rose and the graticule. The DAG remainder wears the
//     structural accent through `geoTints`, so a theme flip retints it with the rest.
//   · HOVER PREVIEWS, THE FILTER COMMITS, through the channels the chips already read: the Globe's
//     `_applyDim` hands the ring the same selector it hands the chips; a network arc (and its
//     wedge) carries the hub's own pick descriptor (`kind: "meta"`), a country arc's hit strip
//     (and wedge) the country code, so hovering an arc writes the channel its row would write and
//     a click runs the commit the decision table already has — no new channel, no new arm.
// Event-time rebuilds (a data arrival, a retint) dispose and rebuild the meshes; the per-frame
// `update` only eases each entry's `base` toward its presence target — no allocation.

/** THREE NESTED RINGS, outer to inner: countries, providers, networks — the Geography explorer's
 *  own ladder, denser toward the centre (user, 2026-10-23). A stand a little below the globe
 *  (`RING_Y`), so the whole disc is in view and its far half passes behind the body. */
export const RING_RADII = [R * 0.85, R * 0.815, R * 0.78] as const; // 15% smaller again and the rings closer (user, 2026-10-24)
/** HAIRLINES for the country and provider rings, a BAND for the network ring (user, 2026-10-24:
 *  "add the hairline effect (like left / right rails sections). Also the metagraph circle needs
 *  to be more bright and bloom (like the nodes and arcs)"): the two outer levels are rulers, the
 *  inner one is the identity reading, so it alone is a bloomed band at the nodes' own weight. */
export const RING_WIDTHS = [R * 0.005, R * 0.011, R * 0.02] as const; // hairline, thin band, band (user, 2026-10-24)
/** The country ring's hit strip: a hairline cannot be aimed at, so an invisible band ABOUT it picks —
 *  narrow and symmetric, so it never reaches the provider ring inside it (user, 2026-10-24: "the
 *  inner 2 rings have finger pointer" — the first strip ran inward over the provider ring). */
export const RING_PICK_HALF = R * 0.014;
/** THE RULER'S TICKS on the outer hairline — the rails' own ruler recipe (`RailThread`: a 1px
 *  rule, 1px ticks every 13px, every fourth longer, the lines at 60% of the marks' presence; user,
 *  2026-10-24: "by hairline I meant also the ruler"). An angular pitch that lands near 13px at the
 *  rest distance, ticks reaching OUTWARD so the countries' arcs stay the inner edge. */
export const TICK_PITCH = 0.07;
export const TICK_MINOR = R * 0.011; // half the first cut (user, 2026-10-24: "make the ruler smaller")
export const TICK_MAJOR = R * 0.026;
/** The ticks' presence on each ground: on dark the additive blend needs far more than the rails'
 *  60% to read at all (user, 2026-10-24: the ruler "only shows in light mode"); on paper the mask
 *  blend lays ink, so the rails' own level holds. */
export const RULER_PRESENCE_DARK = 0.45;
export const RULER_PRESENCE_PAPER = 0.85; // 0.4 was "almost invisible" on Print (user, 2026-10-24)

/** THE PIE FILL (user, 2026-10-24: "when we hover or select a subject, can we show the selected
 *  section of the rings by making it look like a pie-chart? … that part of the circle also with a
 *  subtle fill"): the level naming the subject fills its wedges from the centre to its ring — in
 *  the arc's own hue on the network level, the accent on the country ruler — resting faint, a
 *  hovered slice brighter, a dimmed slice fainter still. */
/** The pie wedge's presence under a HOVERED subject (user, 2026-10-24: "more visible when hover,
 *  and less visible when the filter is active" — a committed network re-partitions the whole ring,
 *  so its wedge is the whole disc; it rests, see `targetOf`). */
export const WEDGE_PRESENCE_DARK = 0.065; // 0.14 → 0.09 → 0.065 (user: the hover "too strong", then "reduce it a bit more")
export const WEDGE_PRESENCE_PAPER = 0.12; // 0.22 → 0.16 → 0.12, the same steps
/** The pie is READABLE AT REST too (user, 2026-10-24: "when at rest the pie is not very visible"),
 *  and the RESTING PRESENCE is the invariant — stated per ground, because additive light over
 *  black reads at a fraction of the ink the same number lays on paper (user: "ok for light but in
 *  dark it's too much"; then "increase rest fill just a bit"). A hover retune leaves these alone;
 *  `targetOf` derives the resting weight as rest / hover. A dimmed slice is a share of the hover. */
export const WEDGE_REST_DARK = 0.02;
export const WEDGE_REST_PAPER = 0.066;
export const WEDGE_DIM_MUL = 0.12;
/** A wedge state's weight on the hover presence, given the ground's resting weight. */
const wedgeWeight = (state: WedgeState, rest: number): number =>
  state === "off" ? 0 : state === "hover" ? 1 : state === "dim" ? WEDGE_DIM_MUL : rest;

/** THE ARRIVAL DROP (user, 2026-10-24: the rings "appear staggered and with the same timing as
 *  the snapshot view's actual snapshots"): every ring is held this high and dark through the
 *  choreography and falls to the stand on the chamber's own beat (`domain/entryBeat.ts`), outer
 *  ring first and the bloomed network band last, every arc of a ring together. */
/** The arrival beat's stagger between the three rings, outer to inner — three beats, not one per
 *  arc (see `applyEntry`). */
export const RING_ENTRY_STAG = 0.12;
const RING_ENTRY_TOTAL = entryTotal(RING_RADII.length, RING_ENTRY_STAG);
export const RING_ENTRY_H = 2.4;

/** The network ring's presence over the rulers' — it is a bloomed mark AT REST, not only when a
 *  subject lights it (user, 2026-10-24: "more bloom also at rest not only focus"); the dim tier
 *  still steps it back by the geo row's own dim-back. */
export const NET_RING_BOOST = 2.6; // 4.5 washed the hues toward white under the additive blend (user, 2026-10-24: "not color-coded to metagraph anymore"); 3.4 was "a little bit too present in the scene" at rest (user, same day) — dark only, the paper tiers are their own numbers
/** A STAND under the globe, not a hoop through its base (user, 2026-10-23: at the rest pose "it
 *  looks like our angle is a bit unusual or the circle is strangely positioned" — the base
 *  plane's ellipse centred on the silhouette's bottom edge and cut it). Dropped so the ellipse
 *  sits below the globe, its far edge passing behind the body. */
export const RING_Y = -(R + LAND_H + 0.8); // closer to the sphere (user, 2026-10-24)
/** Resting presence: the furniture tier (the graticule rests at 0.045, the compass dial at
 *  0.09–0.24) — a first cut at 0.55 bloomed into a neon band under the additive blend, and 0.2
 *  still pulled the eye off the globe (user, 2026-10-23: "a bit more transparent in normal mode,
 *  so they don't distract too much from the globe"). */
export const RING_BASE = 0.12; // 0.13 → 0.12 with the network boost's step down (user, 2026-10-24: "slightly more subtle, mostly the metagraph ring")

/** A tier's presence, from the geo view's OWN focus row: the subject's arcs take the chips' boost,
 *  the rest drop by the chips' dim-back — brighter and dimmer by the app's standard, not the
 *  ring's (user, 2026-10-23: "the selection/hover a bit brighter while dimming down the others;
 *  do aim for consistency across views"). Read per call, so the `?tune` knobs reach it. */
function tierPresence(t: RingTier): number {
  const row = FOCUS_TUNE.geo;
  return RING_BASE * (t === "lit" ? 1 + row.boost : t === "dim" ? 1 - row.back : 1);
}

/** ON PAPER THE TIERS ARE STATED, NOT DERIVED (user, 2026-10-24: in light mode "the hover effect is
 *  not clear on the circle"): `inkPresence` maps a dark presence to ink through a gamma that
 *  compresses the step from rest to lit, so the same three multipliers read as one weight. The
 *  paper levels are the ink the rails' own ladder uses — a resting mark, the subject in full ink,
 *  the rest well back — and the fade loop takes `paperBase` as the opacity outright. */
const PAPER_REST = 0.72; // 0.5 read "a bit too dim in normal mode" on Print (user, 2026-10-24)
function paperPresence(t: RingTier, band: boolean): number {
  const rest = band ? PAPER_REST : PAPER_REST * 0.8;
  return t === "lit" ? Math.min(1, rest * 1.8) : t === "dim" ? rest * 0.3 : rest;
}
/** How fast an arc's presence follows its target (per second, exponential). */
export const RING_EASE = 7;
const SEGMENTS_PER_RAD = 10;
/** THE GAP IS A STRIPE OF CONSTANT WIDTH (user, 2026-10-24: the angular gaps looked "angled to the
 *  centre instead of normal lines"): the domain's arcs are contiguous, and every arc is inset by
 *  half this width AT EACH RADIUS (an angle of (w/2)/r), so the gap's two edges run parallel through
 *  the three rings and the pie, and a pie slice closes at the radius where the gap is all of it. */
export const RING_GAP_W = 0.18; // 0.55 → 0.28 → 0.18 (user, 2026-10-24: "smaller, like 1/2", then "even thinner")

/** An annular sector [r0, r1] × [from, to] in the XY plane, inset by `gapW/2` at every radius —
 *  `rows` radial subdivisions follow the 1/r inset (two suffice for a band, a pie slice takes
 *  more). A full circle takes no inset. Event-time; a plain indexed BufferGeometry. */
function arcGeometry(r0: number, r1: number, from: number, to: number, gapW: number, rows: number): THREE.BufferGeometry {
  const span = to - from;
  const full = span >= Math.PI * 2 - 1e-6;
  const cols = Math.max(4, Math.ceil(span * SEGMENTS_PER_RAD));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const r = r0 + ((r1 - r0) * i) / rows;
    const ins = full ? 0 : Math.min(span / 2, (gapW / 2) / Math.max(r, 1e-4));
    const f = from + ins, t = to - ins;
    for (let j = 0; j <= cols; j++) {
      const a = f + ((t - f) * j) / cols;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
interface FadeEntry { mat: THREE.Material & { opacity: number }; base: number; paperBase?: number }
export interface RingHost {
  geoFades: FadeEntry[];
  geoBlends: THREE.Material[];
  geoTints: THREE.Color[];
  blending: () => THREE.Blending;
  accent: () => number;
}

/** An angle folded into (−π, π], so its distance to 0 is its magnitude. Module-scope: read per frame. */
const wrapAngle = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

/** Two angles the eye cannot tell apart — the rebuild diff's "unchanged" test, so float noise in
 *  a partition can never silently fall back to a full dispose-and-rebuild. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

const arcKey = (level: number, seg: RingSegment): string => `${level}|${seg.cc ?? ""}|${seg.isp ?? ""}|${seg.net ?? ""}`;

interface Arc {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; seg: RingSegment; level: number; fade: FadeEntry; target: number; paperTarget: number; entryMul: number;
  /** The pie wedge under the arc and its own fade entry; `wedgeOn`/`wedgeOnDark` are the state's
   *  weight per ground (`ringWedge` → `wedgeWeight`). */
  wedge: THREE.Mesh; wedgeFade: FadeEntry; wedgeOn: number; wedgeOnDark: number;
  /** The country ring's invisible hit strip, kept with its arc across a rebuild. */
  strip: THREE.Mesh | null;
}

export class BaseRing {
  readonly group = new THREE.Group();
  /** The arc meshes, each with its network's pick descriptor — joined to the Globe's pickables by
   *  the Engine's pick gathering. */
  readonly pickables: THREE.Object3D[] = [];
  private arcs: Arc[] = [];
  private sel = "all";
  private selPreview = false;
  private cc: string | null = null;
  private ccPreview = false;
  private _entryT = 1;
  private _entryHold = false;
  private _ticksMul = 1;
  private _ticks: THREE.LineSegments | null = null;
  private _tickFade: FadeEntry | null = null;
  /** The camera's world position, shared by every arc's shader; written per frame in `update`. */
  private readonly uCam = new THREE.Vector3(0, 0, 1);

  constructor(private readonly host: RingHost) {
    this.group.position.y = RING_Y;
    this.group.rotation.x = -Math.PI / 2; // RingGeometry lies in XY; the base plane is XZ
  }

  /** The ruler's ticks: one static LineSegments at the outer radius, furniture like the rings.
   *  Built on the FIRST data arrival, not in the constructor (2026-10-24, user: the ruler was
   *  "only visible in dark when I go to light and then back to dark"): the Globe constructs this
   *  before its structure ink and ground are set, so a tick material born there took a black
   *  colour and the wrong blend, and only the theme flip's retint pass ever corrected it. */
  private ensureTicks(): void {
    if (this._ticks) return;
    const pts: number[] = [];
    const r0 = RING_RADII[0];
    const n = Math.round((Math.PI * 2) / TICK_PITCH);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = i % 4 === 0 ? TICK_MAJOR : TICK_MINOR;
      pts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len), 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: this.host.accent(), transparent: true, opacity: 0, depthWrite: false });
    mat.blending = this.host.blending();
    this.host.geoBlends.push(mat);
    this.host.geoTints.push(mat.color);
    this._tickFade = { mat, base: RULER_PRESENCE_DARK * this._ticksMul, paperBase: RULER_PRESENCE_PAPER * this._ticksMul };
    this.host.geoFades.push(this._tickFade);
    this._ticks = new THREE.LineSegments(geo, mat);
    this._ticks.position.z = this._entryT < 1 ? RING_ENTRY_H : 0;
    this.group.add(this._ticks);
  }

  /** Arm the drop — the arcs held high and dark until `releaseEntry` (the Engine's contract). */
  beginEntry(): void {
    this._entryT = 0;
    this._entryHold = true;
    this.applyEntry(0);
  }

  /** The choreography settled — the arcs fall in, staggered. */
  releaseEntry(): void {
    this._entryHold = false;
  }

  /** One moment of the beat: each RING's lift and presence multiplier — the three levels fall in
   *  one after another, outer first, every arc of a ring together (user, 2026-10-24: "too
   *  detailed, just animate each circle but not the sections"; a per-arc stagger read as a
   *  flicker of fifty pieces). The ruler falls with the outer ring. Per frame while the beat
   *  runs, nothing once it has parked at 1. */
  private applyEntry(tSec: number): void {
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i]!;
      const step = entryStep(tSec, a.level * RING_ENTRY_STAG);
      a.mesh.position.z = RING_ENTRY_H * step.drop;
      a.entryMul = step.fade;
    }
    const t = entryStep(tSec, 0);
    this._ticksMul = t.fade;
    if (this._ticks) this._ticks.position.z = RING_ENTRY_H * t.drop;
  }

  /** Event-time: a data arrival or a retint rebuilds every arc on every level. */
  setLevels(levels: RingLevels): void {
    this.setSegments([
      ...levels.countries.map((seg) => ({ seg, level: 0 })),
      ...levels.providers.map((seg) => ({ seg, level: 1 })),
      ...levels.networks.map((seg) => ({ seg, level: 2 })),
    ]);
  }

  private setSegments(entries: readonly { seg: RingSegment; level: number }[]): void {
    this.ensureTicks();
    this._anchorFor = null; // the callout's cached anchor re-resolves against the new arcs
    this._anchorArc = null;
    // A REBUILD IS A DIFF (review, 2026-10-24 — the first cut disposed and recreated every arc on
    // every data poll and carried presence across by key): an arc whose level, angles and hue are
    // unchanged KEEPS its meshes, materials, fade entries and eased presence; only an arc that
    // moved, appeared or vanished is built or disposed. The entry beat and the hover carry over
    // for free, because nothing restarts.
    const prevByKey = new Map<string, Arc>();
    for (const a of this.arcs) prevByKey.set(arcKey(a.level, a.seg), a);
    const next: Arc[] = [];
    const kept = new Set<Arc>();
    for (const { seg, level } of entries) {
      const span = seg.to - seg.from;
      if (!(span > 0)) continue;
      const prev = prevByKey.get(arcKey(level, seg));
      if (prev && near(prev.seg.from, seg.from) && near(prev.seg.to, seg.to) && prev.seg.color === seg.color) {
        prev.seg = seg; // counts and shares may have moved; the picture has not
        kept.add(prev);
        next.push(prev);
        continue;
      }
      const arc = this._buildArc(seg, level);
      if (prev) {
        // The same subject at a new angle: its presence and its place in the beat carry over.
        arc.fade.base = prev.fade.base;
        arc.fade.paperBase = prev.fade.paperBase;
        arc.mesh.position.z = prev.mesh.position.z;
        arc.wedgeFade.base = prev.wedgeFade.base;
        arc.wedgeFade.paperBase = prev.wedgeFade.paperBase;
        arc.entryMul = prev.entryMul;
      }
      next.push(arc);
    }
    for (const a of this.arcs) if (!kept.has(a)) this._disposeArc(a);
    this.arcs = next;
    this.pickables.length = 0;
    for (const a of this.arcs) {
      if (a.strip) this.pickables.push(a.strip);
      if (a.mesh.userData.pick) this.pickables.push(a.mesh);
      if (a.wedge.userData.country || a.wedge.userData.pick) this.pickables.push(a.wedge);
    }
    this.retarget();
  }

  /** One arc, its wedge and (on the country ring) its hit strip — built, added, not yet targeted. */
  private _buildArc(seg: RingSegment, level: number): Arc {
    const span = seg.to - seg.from;
    const radius = RING_RADII[level] ?? RING_RADII[2];
    const width = RING_WIDTHS[level] ?? RING_WIDTHS[2];
    const mat = this._furnitureMat(seg.color);
    const fade: FadeEntry = { mat, base: 0, paperBase: 0 };
    this.host.geoFades.push(fade);
    const mesh = new THREE.Mesh(arcGeometry(radius - width, radius, seg.from, seg.to, RING_GAP_W, 2), mat);
    // The outer ring picks as the COUNTRY (`userData.country`, the Engine routes it through the
    // same hover channel and click arm the land under the cursor takes) — on an INVISIBLE strip
    // under the hairline, since a hairline cannot be aimed at; the inner ring as the NETWORK,
    // through the hub's own descriptor. A provider arc has no route of its own yet (the
    // explorer's cohort rows are its door), so it does not pick.
    let strip: THREE.Mesh | null = null;
    if (level === 0 && seg.cc) {
      strip = new THREE.Mesh(
        arcGeometry(radius - RING_PICK_HALF, radius + RING_PICK_HALF, seg.from, seg.to, RING_GAP_W, 2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide }),
      );
      strip.userData.country = seg.cc;
      strip.visible = false; // never drawn (the raycaster ignores `visible` — CLAUDE.md's own warning, used here on purpose)
      this.group.add(strip);
    }
    const cfg = level === 2 && seg.net ? METAGRAPHS.find((c) => c.id === seg.net) : undefined;
    if (cfg) mesh.userData.pick = { kind: "meta", cfg };
    if (level === 2) joinBloom(mesh); // the identity reading glows like the chips it counts
    this.group.add(mesh);
    // The wedge: centre → the ring's inner edge, same arc, its own faint fade — and the NEUTRAL
    // accent on every level (user, 2026-10-25: "the pie fill … can be the neutral color also when
    // filter is active"): the arc above it carries the network's hue, the fill below it is the
    // structural wash the country ruler's slices already wear, so a committed network's whole-disc
    // fill reads as the same instrument lit, not as a second colour field under the hued ring.
    const wedgeMat = this._furnitureMat(null);
    const wedgeFade: FadeEntry = { mat: wedgeMat, base: 0, paperBase: 0 };
    this.host.geoFades.push(wedgeFade);
    // The slice closes where the stripe is all of it: r = gapW / span, never the centre.
    const wedge = new THREE.Mesh(arcGeometry(Math.min(radius - width, Math.max(0.01, RING_GAP_W / span)), radius - width, seg.from, seg.to, RING_GAP_W, 12), wedgeMat);
    wedge.position.z = -0.01 * (level + 1); // under the arcs, the outer wedge lowest so the three stack
    // THE DISC PICKS AS ITS SLICE (user, 2026-10-24: "when we hover the section within the circle
    // it should hover the pie chart section and the related sections on the circle"): the
    // country wedge carries the country's route, the network wedge the network's, and the
    // raycaster's nearest hit is the country's (its wedge sits highest of the three), so the
    // interior answers as the outer ring does — which is the explorer's own root level.
    if (level === 0 && seg.cc) wedge.userData.country = seg.cc;
    else if (cfg) wedge.userData.pick = { kind: "meta", cfg };
    this.group.add(wedge);
    return { mesh, mat, seg, level, fade, target: 0, paperTarget: 0, entryMul: this._entryT >= 1 ? 1 : 0, wedge, wedgeFade, wedgeOn: 0, wedgeOnDark: 0, strip };
  }

  /** Remove an arc's meshes, materials and fade entries. */
  private _disposeArc(a: Arc): void {
    for (const [mesh, mat, fade] of [[a.mesh, a.mat, a.fade], [a.wedge, a.wedge.material as THREE.MeshBasicMaterial, a.wedgeFade]] as const) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mat.dispose();
      const fi = this.host.geoFades.indexOf(fade);
      if (fi >= 0) this.host.geoFades.splice(fi, 1);
      const bi = this.host.geoBlends.indexOf(mat);
      if (bi >= 0) this.host.geoBlends.splice(bi, 1);
      const ti = this.host.geoTints.indexOf(mat.color);
      if (ti >= 0) this.host.geoTints.splice(ti, 1);
    }
    if (a.strip) {
      this.group.remove(a.strip);
      a.strip.geometry.dispose();
      (a.strip.material as THREE.Material).dispose();
    }
  }

  /** One recipe for every arc and wedge (review, 2026-10-24): the ground's blend, the exact
   *  occlusion, the structural accent through `geoTints` where the segment has no hue of its own. */
  private _furnitureMat(color: number | null | undefined): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: color ?? this.host.accent(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    mat.blending = this.host.blending();
    hookOcclusion(mat, this.uCam);
    this.host.geoBlends.push(mat);
    if (color == null) this.host.geoTints.push(mat.color);
    return mat;
  }

  /** The chips' own selector — the hover when there is one, else the committed filter.
   *  `preview` says which: the tiers are the same either way, only the wedge's weight differs. */
  setSubject(sel: string, preview = false): void {
    this.sel = sel;
    this.selPreview = preview;
    this.retarget();
  }

  /** The country selector — the hover when there is one, else the committed drill, else null. */
  setCountry(cc: string | null, preview = false): void {
    this.cc = cc;
    this.ccPreview = preview;
    this.retarget();
  }

  /** The committed network's place on the inner ring, ring-LOCAL: the point of its arcs nearest
   *  the ring's RIGHT SIDE (local angle 0 — the side as the resting camera sees it, clear of the
   *  globe's silhouette; user, 2026-10-24: the midpoint of the largest arc "connects to the back
   *  of the ring which is behind the globe, connect to the side instead"), at the band's outer
   *  edge. The subject callout's geo network anchor (CalloutSync) — a filtered fleet is spread
   *  across the globe, so the ring is the one honest point that stands for the whole network.
   *  False while the ring holds no arc of it (no located participants, the unlisted set, data not
   *  yet in). No allocation: a scan over the arcs. */
  networkAnchor(id: string, out: THREE.Vector3): boolean {
    // The ARC and its ANGLE are cached per rebuild and id (review, 2026-10-24: the scan ran every
    // frame a network was committed); the arc's lift is read LIVE, because the arrival beat moves
    // it every frame and a cached height left the leader floating until the next poll (follow-up
    // review, same day). setSegments clears the cache when the arcs change.
    if (this._anchorFor !== id) {
      this._anchorFor = id;
      this._anchorArc = this._resolveAnchor(id);
    }
    const a = this._anchorArc;
    if (!a) return false;
    const r = RING_RADII[2];
    out.set(Math.cos(this._anchorAngle) * r, Math.sin(this._anchorAngle) * r, a.mesh.position.z);
    return true;
  }
  private _anchorFor: string | null = null;
  private _anchorArc: Arc | null = null;
  private _anchorAngle = 0;
  private _resolveAnchor(id: string): Arc | null {
    let best: Arc | null = null;
    let bestAngle = 0;
    let bestDist = Infinity;
    for (const a of this.arcs) {
      if (a.level !== 2 || a.seg.net !== id) continue;
      // The angle of this arc nearest 0 on the circle: 0 itself when the arc spans it (arcs are
      // authored from −π/2 upward, so a span over 0 is simply from ≤ 0 ≤ to), else the nearer end.
      const spans0 = a.seg.to - a.seg.from >= Math.PI * 2 - 1e-6 || (a.seg.from <= 0 && a.seg.to >= 0);
      const ang = spans0 ? 0 : Math.abs(wrapAngle(a.seg.from)) < Math.abs(wrapAngle(a.seg.to)) ? a.seg.from : a.seg.to;
      const dist = Math.abs(wrapAngle(ang));
      if (dist < bestDist) { bestDist = dist; bestAngle = ang; best = a; }
    }
    this._anchorAngle = bestAngle;
    return best;
  }

  private targetOf(a: Arc): number {
    // The bloomed band is capped: lit × boost ran past 1 under a committed filter, where every
    // arc is the subject, and the additive blend blew the ring out to a white-hot band.
    const tier = ringPresence(a.seg, null, this.sel, this.cc);
    // The pie's decision table is the domain's (`ringWedge`, tested); this turns its state into a
    // weight per ground. A HOVER on either selector is a preview (user, 2026-10-24: hovering a
    // country row under a committed filter lights its slice at hover strength).
    const state = ringWedge(a.level, tier, this.sel !== "all", this.selPreview || this.ccPreview);
    a.wedgeOn = wedgeWeight(state, WEDGE_REST_PAPER / WEDGE_PRESENCE_PAPER);
    a.wedgeOnDark = wedgeWeight(state, WEDGE_REST_DARK / WEDGE_PRESENCE_DARK);
    a.paperTarget = paperPresence(tier, a.level === 2);
    return Math.min(0.62, tierPresence(tier) * (a.level === 2 ? NET_RING_BOOST : 1));
  }

  private retarget(): void {
    for (const a of this.arcs) a.target = this.targetOf(a);
  }

  /** Per frame: ease each arc's presence toward its target. The Globe's fade loop turns `base`
   *  into opacity under the morph and the ground. No allocation. */
  update(dt: number, cameraWorldPos: THREE.Vector3 | null): void {
    if (cameraWorldPos) this.uCam.copy(cameraWorldPos);
    // The arrival beat (see beginEntry): held while the transition runs, then the staggered drop;
    // parked at 1 in steady state, where this block costs nothing.
    if (this._entryT < 1) {
      if (!this._entryHold) this._entryT = Math.min(1, this._entryT + dt / RING_ENTRY_TOTAL);
      this.applyEntry(this._entryT * RING_ENTRY_TOTAL);
      if (this._tickFade) {
        this._tickFade.base = RULER_PRESENCE_DARK * this._ticksMul;
        this._tickFade.paperBase = RULER_PRESENCE_PAPER * this._ticksMul;
      }
    }
    const k = 1 - Math.exp(-RING_EASE * dt);
    for (const a of this.arcs) {
      a.fade.base += (a.target * a.entryMul - a.fade.base) * k;
      const pt = a.paperTarget * a.entryMul;
      a.fade.paperBase = (a.fade.paperBase ?? pt) + (pt - (a.fade.paperBase ?? pt)) * k;
      const w = a.wedgeOnDark * a.entryMul;
      a.wedgeFade.base += (WEDGE_PRESENCE_DARK * w - a.wedgeFade.base) * k;
      const wp = WEDGE_PRESENCE_PAPER * a.wedgeOn * a.entryMul;
      a.wedgeFade.paperBase = (a.wedgeFade.paperBase ?? wp) + (wp - (a.wedgeFade.paperBase ?? wp)) * k;
    }
  }

}
