import * as THREE from "three";
import { METAGRAPHS } from "@/src/net/current";
import { R, LAND_H } from "../../domain/geoLayout";
import { ringPresence, type RingLevels, type RingSegment, type RingTier } from "../../domain/baseRing";
import { FOCUS_TUNE } from "../../domain/dimModel";
import { joinBloom } from "../SceneContext";
import { ENTRY_STAG, entryStep, entryTotal } from "../../domain/entryBeat";

// THE BASE RING ADAPTER — one flat arc mesh per network on the globe's base plane, the located
// fleet's share by network (`domain/baseRing.ts` does the arithmetic; this file owns the meshes).
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
//     `_applyDim` hands the ring the same selector it hands the chips, and each arc carries the
//     hub's own pick descriptor (`kind: "meta"`), so hovering an arc writes `hoverFilter` and a
//     click runs the filter commit the decision table already has — no new channel, no new arm.
// Event-time rebuilds (a data arrival, a retint) dispose and rebuild the meshes; the per-frame
// `update` only eases each entry's `base` toward its presence target — no allocation.

/** THREE NESTED RINGS, outer to inner: countries, providers, networks — the Geography explorer's
 *  own ladder, denser toward the centre (user, 2026-10-23). They nest just OUTSIDE the globe's
 *  silhouette: the base plane under the globe itself is hidden, so a ring at less than R would
 *  never be seen. */
export const RING_RADII = [R * 0.85, R * 0.815, R * 0.78] as const; // 15% smaller again and the rings closer (user, 2026-10-24)
/** HAIRLINES for the country and provider rings, a BAND for the network ring (user, 2026-10-24:
 *  "add the hairline effect (like left / right rails sections). Also the metagraph circle needs
 *  to be more bright and bloom (like the nodes and arcs)"): the two outer levels are rulers, the
 *  inner one is the identity reading, so it alone is a bloomed band at the nodes' own weight. */
export const RING_WIDTHS = [R * 0.005, R * 0.011, R * 0.02] as const; // the inner band thinner (user, 2026-10-24) // the OUTER ring alone is the hairline (user, 2026-10-24); the provider ring is a thin band
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
 *  subtle fill"): a LIT arc fills the wedge from the centre to its ring, in the arc's own hue on the
 *  network level and the accent on the two rulers, at a faint presence; at rest and dimmed the
 *  wedge is nothing. The three levels' wedges stack, so a subject reads as a pie slice that
 *  brightens toward the centre where its three readings agree. */
export const WEDGE_PRESENCE_DARK = 0.03;
export const WEDGE_PRESENCE_PAPER = 0.07;

/** THE ARRIVAL DROP (user, 2026-10-24: the rings "appear staggered and with the same timing as
 *  the snapshot view's actual snapshots"): every arc is held this high and dark through the
 *  choreography and falls to the stand on the chamber's own beat (`domain/entryBeat.ts`), one arc
 *  after another around the ring, the outer ruler first and the bloomed network band last. */
export const RING_ENTRY_H = 2.4;

/** The network ring's presence over the rulers' — it is a bloomed mark AT REST, not only when a
 *  subject lights it (user, 2026-10-24: "more bloom also at rest not only focus"); the dim tier
 *  still steps it back by the geo row's own dim-back. */
export const NET_RING_BOOST = 3.4; // 4.5 washed the hues toward white under the additive blend (user, 2026-10-24: "not color-coded to metagraph anymore")
/** A STAND under the globe, not a hoop through its base (user, 2026-10-23: at the rest pose "it
 *  looks like our angle is a bit unusual or the circle is strangely positioned" — the base
 *  plane's ellipse centred on the silhouette's bottom edge and cut it). Dropped so the ellipse
 *  sits below the globe, its far edge passing behind the body. */
export const RING_Y = -(R + LAND_H + 0.8); // closer to the sphere (user, 2026-10-24)
/** Resting presence: the furniture tier (the graticule rests at 0.045, the compass dial at
 *  0.09–0.24) — a first cut at 0.55 bloomed into a neon band under the additive blend, and 0.2
 *  still pulled the eye off the globe (user, 2026-10-23: "a bit more transparent in normal mode,
 *  so they don't distract too much from the globe"). */
export const RING_BASE = 0.13;

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
/** The occluding body: the globe's plateau radius, with a soft rim either side. */
const OCCLUDER_R = R + LAND_H;
const OCCLUDER_SOFT_IN = 0.9;
const OCCLUDER_SOFT_OUT = 0.4;

/** FADED WHERE THE GLOBE STANDS IN FRONT (user, 2026-10-23: "can you fade it when the globe sits
 *  in front? I believe this is also an issue with the arc animation"). The hologram globe is
 *  additive and never writes depth, so nothing behind it is depth-occluded; a hemisphere "facing"
 *  fade (the arcs' `uCamN`) is wrong for a ring that lies OUTSIDE the sphere — a point on the far
 *  side is still in plain view beside the silhouette. So the fragment asks the exact question: does
 *  the line of sight from the camera to this fragment pass through the globe? The closest approach
 *  of that segment to the globe's centre (the origin) against the plateau radius, smoothed over a
 *  short rim, is the fragment's alpha. One uniform, the camera's world position, copied per frame. */
function hookOcclusion(mat: THREE.Material, uCam: THREE.Vector3): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = { value: uCam };
    sh.uniforms.uOccR = { value: OCCLUDER_R };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "varying vec3 vWorld;\n#include <common>")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "uniform vec3 uCam; uniform float uOccR; varying vec3 vWorld;\n#include <common>")
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
{
  vec3 d = vWorld - uCam;
  float L = length(d);
  vec3 dir = d / max(L, 1e-5);
  float t = clamp(dot(-uCam, dir), 0.0, L);
  float dist = length(uCam + dir * t);
  diffuseColor.a *= smoothstep(uOccR - ${OCCLUDER_SOFT_IN.toFixed(2)}, uOccR + ${OCCLUDER_SOFT_OUT.toFixed(2)}, dist);
}`,
      );
  };
  mat.customProgramCacheKey = () => "baseRing-occluded";
}

interface FadeEntry { mat: THREE.Material & { opacity: number }; base: number; paperBase?: number }
export interface RingHost {
  geoFades: FadeEntry[];
  geoBlends: THREE.Material[];
  geoTints: THREE.Color[];
  blending: () => THREE.Blending;
  accent: () => number;
}

const arcKey = (level: number, seg: RingSegment): string => `${level}|${seg.cc ?? ""}|${seg.isp ?? ""}|${seg.net ?? ""}`;

interface Arc {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; seg: RingSegment; level: number; fade: FadeEntry; target: number; paperTarget: number; entryMul: number;
  /** The pie wedge under the arc and its own fade entry; `wedgeOn` is 1 while the arc is lit. */
  wedge: THREE.Mesh; wedgeFade: FadeEntry; wedgeOn: number;
}

export class BaseRing {
  readonly group = new THREE.Group();
  /** The arc meshes, each with its network's pick descriptor — joined to the Globe's pickables by
   *  the Engine's pick gathering. */
  readonly pickables: THREE.Object3D[] = [];
  private arcs: Arc[] = [];
  /** The country ring's invisible hit strips, disposed with the arcs. */
  private strips: THREE.Mesh[] = [];
  private sel = "all";
  private cc: string | null = null;
  private _entryT = 1;
  private _entryHold = false;
  private _entryTotal = 1;
  private _ticksMul = 1;
  private readonly _ticks: THREE.LineSegments;
  private readonly _tickFade: FadeEntry;
  /** The camera's world position, shared by every arc's shader; written per frame in `update`. */
  private readonly uCam = new THREE.Vector3(0, 0, 1);

  constructor(private readonly host: RingHost) {
    this.group.position.y = RING_Y;
    this.group.rotation.x = -Math.PI / 2; // RingGeometry lies in XY; the base plane is XZ
    // The ruler's ticks: one static LineSegments at the outer radius, furniture like the rings.
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
    const mat = new THREE.LineBasicMaterial({ color: host.accent(), transparent: true, opacity: 0, depthWrite: false });
    mat.blending = host.blending();
    host.geoBlends.push(mat);
    host.geoTints.push(mat.color);
    this._tickFade = { mat, base: RULER_PRESENCE_DARK, paperBase: RULER_PRESENCE_PAPER };
    host.geoFades.push(this._tickFade);
    this._ticks = new THREE.LineSegments(geo, mat);
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

  /** One moment of the beat: each arc's lift and its presence multiplier, the ruler with the first
   *  arc. Per frame while the beat runs, nothing once it has parked at 1. */
  private applyEntry(tSec: number): void {
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i]!;
      const step = entryStep(tSec, i * ENTRY_STAG);
      a.mesh.position.z = RING_ENTRY_H * step.drop;
      a.entryMul = step.fade;
    }
    const t = entryStep(tSec, 0);
    this._ticks.position.z = RING_ENTRY_H * t.drop;
    this._ticksMul = t.fade;
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
    // PRESENCE CARRIES ACROSS A REBUILD (2026-10-24, measured: the data poll rebuilds the rings
    // every few seconds, and every arc restarted from dark and eased back up — a dip on every poll
    // that read as "less bright than at rest" whenever it coincided with a hover). An arc that
    // exists on both sides keeps its eased presence and its place in the arrival beat.
    const keep = new Map<string, Arc>();
    for (const a of this.arcs) keep.set(arcKey(a.level, a.seg), a);
    for (const a of this.arcs) {
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
    }
    this.arcs = [];
    for (const s of this.strips) {
      this.group.remove(s);
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    }
    this.strips = [];
    this.pickables.length = 0;
    for (const { seg, level } of entries) {
      const span = seg.to - seg.from;
      if (!(span > 0)) continue;
      const radius = RING_RADII[level] ?? RING_RADII[2];
      const width = RING_WIDTHS[level] ?? RING_WIDTHS[2];
      const geo = new THREE.RingGeometry(radius - width, radius, Math.max(4, Math.ceil(span * SEGMENTS_PER_RAD)), 1, seg.from, span);
      const mat = new THREE.MeshBasicMaterial({
        color: seg.color ?? this.host.accent(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mat.blending = this.host.blending();
      hookOcclusion(mat, this.uCam);
      this.host.geoBlends.push(mat);
      if (seg.color == null) this.host.geoTints.push(mat.color);
      const fade: FadeEntry = { mat, base: 0, paperBase: 0 };
      this.host.geoFades.push(fade);
      const mesh = new THREE.Mesh(geo, mat);
      // The outer ring picks as the COUNTRY (`userData.country`, the Engine routes it through the
      // same hover channel and click arm the land under the cursor takes) — on an INVISIBLE strip
      // under the hairline, since a hairline cannot be aimed at; the inner ring as the NETWORK,
      // through the hub's own descriptor. A provider arc has no route of its own yet (the
      // explorer's cohort rows are its door), so it does not pick.
      if (level === 0 && seg.cc) {
        const strip = new THREE.Mesh(
          new THREE.RingGeometry(radius - RING_PICK_HALF, radius + RING_PICK_HALF, Math.max(4, Math.ceil(span * SEGMENTS_PER_RAD)), 1, seg.from, span),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide }),
        );
        strip.userData.country = seg.cc;
        this.group.add(strip);
        this.pickables.push(strip);
        this.strips.push(strip);
      }
      const cfg = level === 2 && seg.net ? METAGRAPHS.find((c) => c.id === seg.net) : undefined;
      if (cfg) {
        mesh.userData.pick = { kind: "meta", cfg };
        this.pickables.push(mesh);
      }
      if (level === 2) joinBloom(mesh); // the identity reading glows like the chips it counts
      this.group.add(mesh);
      // The wedge: centre → the ring's inner edge, same arc, same hue, its own faint fade.
      const wedgeMat = new THREE.MeshBasicMaterial({ color: seg.color ?? this.host.accent(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      wedgeMat.blending = this.host.blending();
      this.host.geoBlends.push(wedgeMat);
      if (seg.color == null) this.host.geoTints.push(wedgeMat.color);
      const wedgeFade: FadeEntry = { mat: wedgeMat, base: 0, paperBase: 0 };
      this.host.geoFades.push(wedgeFade);
      const wedge = new THREE.Mesh(new THREE.RingGeometry(0.001, radius - width, Math.max(4, Math.ceil(span * SEGMENTS_PER_RAD)), 1, seg.from, span), wedgeMat);
      wedge.position.z = -0.01 * (level + 1); // under the arcs, the outer wedge lowest so the three stack
      this.group.add(wedge);
      const prev = keep.get(arcKey(level, seg));
      if (prev) {
        fade.base = prev.fade.base;
        fade.paperBase = prev.fade.paperBase;
        mesh.position.z = prev.mesh.position.z;
        wedgeFade.base = prev.wedgeFade.base;
        wedgeFade.paperBase = prev.wedgeFade.paperBase;
      }
      this.arcs.push({ mesh, mat, seg, level, fade, target: 0, paperTarget: 0, entryMul: prev ? prev.entryMul : this._entryT >= 1 ? 1 : 0, wedge, wedgeFade, wedgeOn: 0 });
      this.arcs[this.arcs.length - 1]!.target = this.targetOf(this.arcs[this.arcs.length - 1]!);
    }
  }

  /** The chips' own selector — the hover when there is one, else the committed filter. */
  setSubject(sel: string): void {
    this.sel = sel;
    this.retarget();
  }

  /** The country selector — the hover when there is one, else the committed drill, else null. */
  setCountry(cc: string | null): void {
    this.cc = cc;
    this.retarget();
  }

  private targetOf(a: Arc): number {
    // The bloomed band is capped: lit × boost ran past 1 under a committed filter, where every
    // arc is the subject, and the additive blend blew the ring out to a white-hot band.
    const tier = ringPresence(a.seg, null, this.sel, this.cc);
    // The wedge belongs to the LEVEL THAT NAMES THE SUBJECT: a network's band when a network is
    // the selector, else the country's ruler — a first cut filled every lit level and a network
    // hover painted its whole countries' wedges in the accent, which was not subtle.
    const netSel = this.sel !== "all";
    a.wedgeOn = tier === "lit" && (netSel ? a.level === 2 : a.level === 0) ? 1 : 0;
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
      if (!this._entryHold) {
        this._entryTotal = entryTotal(this.arcs.length);
        this._entryT = Math.min(1, this._entryT + dt / this._entryTotal);
      }
      this.applyEntry(this._entryT * this._entryTotal);
      this._tickFade.base = RULER_PRESENCE_DARK * this._ticksMul;
      this._tickFade.paperBase = RULER_PRESENCE_PAPER * this._ticksMul;
    }
    const k = 1 - Math.exp(-RING_EASE * dt);
    for (const a of this.arcs) {
      a.fade.base += (a.target * a.entryMul - a.fade.base) * k;
      const pt = a.paperTarget * a.entryMul;
      a.fade.paperBase = (a.fade.paperBase ?? pt) + (pt - (a.fade.paperBase ?? pt)) * k;
      const w = a.wedgeOn * a.entryMul;
      a.wedgeFade.base += (WEDGE_PRESENCE_DARK * w - a.wedgeFade.base) * k;
      const wp = WEDGE_PRESENCE_PAPER * w;
      a.wedgeFade.paperBase = (a.wedgeFade.paperBase ?? wp) + (wp - (a.wedgeFade.paperBase ?? wp)) * k;
    }
  }

}
