// The SNAPSHOT PLANE — the chamber's reusable blueprint (refactor 2026-08-07): every storey
// surface in the ledger is the SAME composed unit, just positioned and sized differently —
// a glass plane, an optional edge-aligned name label, and the plane's own TRAY of machines
// hanging under its front edge. The global floor is one instance (level digit + full-width
// validator tray), each metagraph's plane is another (ticker label + its own tray), the gutter
// a label-less, tray-less third.
//
// What the blueprint deliberately does NOT own: the snapshots themselves. Tiles, byte bars and
// ribbons are pooled instanced meshes spanning every plane (one draw call per instrument — the
// zero-allocation loop), and their shared styling (lead row identity, neutral trail) is one code
// path in LedgerView/ByteBar by construction. The plane owns the furniture, the pools own the data.
//
// Two tune channels (user, 2026-08-07): the GLOBAL plane and the METAGRAPH planes are tuned
// separately (`?tune` folders) — same blueprint, each caller passes its own PlaneTune.
import * as THREE from "three";
import { isLightGround, labelInk, type SceneColors } from "../../sceneColors";
import { CONT_X } from "../../domain/ledgerLayout";
import type { ContainerSpec } from "../../domain/ledgerRails";
import { applyGlassTheme, makeGlassFill, type GlassFillUniforms } from "./glassFill";
import type { TuneSchema } from "../../tune";

/** One plane's live-tunable look (dev `?tune` panel binds it; the values are the shipped look). */
export interface PlaneTune {
  fillOp: number;  // the edge-band fill
  innerOp: number; // the flat centre level
  edge: number;    // drop-off start (1 = only the rim, 0 = solid)
  trayOp: number;  // the tray panel's flat fill
}

export const GLOBAL_PLANE_TUNE_DEFAULTS: PlaneTune = {
  fillOp: 0.035, innerOp: 0.01, edge: 0.95, trayOp: 0.025,
};
export const META_PLANE_TUNE_DEFAULTS: PlaneTune = {
  fillOp: 0.035, innerOp: 0.01, edge: 0.98, trayOp: 0.025, // edge+tray user-tuned via ?tune, 2026-08-07
};

/** The `?tune` knob ranges (contract: src/engine/tune.ts) — ONE schema for both plane channels,
 *  since they are the same blueprint tuned separately. */
export const PLANE_TUNE_SCHEMA: TuneSchema<PlaneTune> = {
  fillOp: { min: 0, max: 0.3, step: 0.005, label: "edge fill" },
  innerOp: { min: 0, max: 0.1, step: 0.002, label: "centre fill" },
  edge: { min: 0, max: 0.99, label: "drop-off" },
  trayOp: { min: 0, max: 0.3, step: 0.005, label: "tray fill" },
};

/** THE DAY GLASS — the LIGHT ground's own pane look (user, 2026-08-26: "the snapshot page panels
 *  look really ugly in light mode (ok in dark mode) […] can you make it a nice glass panel?").
 *
 *  It is ONE set for the whole chamber, not a per-channel one like PlaneTune above: PlaneTune tunes
 *  how much PRESENCE a storey has, and the two storeys legitimately differ; this tunes what GLASS
 *  IS, and a floor made of different glass from the lane above it is two materials, not one
 *  chamber. The channels still separate — every term below is multiplied by the caller's own
 *  furniture alpha and fill boost — so the committed lane still leads. */
export interface GlassTune {
  body: number;     // the pane's own tint: what the glass costs the ground beneath it
  sky: number;      // the reflected room's gradient — bright above the horizon, lit silver below
  rim: number;      // the Fresnel grazing sheen, CAPPED: a full mirror would hide the trail
  spec: number;     // the reflected window
  specPow: number;  // its tightness
  edge: number;     // the polished edge the SDF band already measures
  env: number;      // the studio SOFTBOXES in the reflected room — what makes orbiting sweep it
  trayBody: number; // the trays face the camera head-on: no sky, little Fresnel, so more body
  // ── THE COMMITTED LANE, on paper. Dark answers a commit by lifting the edge fill; the day glass
  // has no such term, and multiplying the REFLECTION terms instead is what blew the committed
  // plane to white (user, 2026-08-28: "the active metagraph plane is white") — the shader mixes
  // uColor toward white by those very terms, so twice the reflection IS white. Emphasis on paper
  // therefore rides the two channels that CAN'T bleach: the body tint's alpha, and hue.
  laneBody: number; // how much more of its own tint the committed lane's pane holds
  laneTint: number; // how far that tint moves from the neutral pane toward the lane's identity
}

export const GLASS_TUNE_DEFAULTS: Readonly<GlassTune> = Object.freeze({
  // Settled from the user's own EXPORT (2026-08-28) after the chamber blew out near-white
  // under a committed filter: the polished edge was the hot term (0.32 → 0.08), rim and the
  // reflection lobes came down a step — and the TRAYS came UP (0.12 → 0.42): with the planes
  // calmed, the trays finally earn real presence.
  // 2026-08-30 first pass at "too glossy, want shiny but not too much" (user): the DIFFUSE film
  // steps down (sky 0.33 → 0.26, env 0.48 → 0.40 — the milky all-over gloss) and the CRISP terms
  // step up and tighten (spec 0.5 → 0.62, specPow 19 → 30, edge 0.16 → 0.22, rim 0.3 → 0.34) —
  // sheen concentrated into highlights instead of spread as film.
  body: 0.185, sky: 0.26, rim: 0.34, spec: 0.62, specPow: 30, edge: 0.22, env: 0.4, trayBody: 0.42,
  laneBody: 1.75, laneTint: 0.8,
});
/** The live struct the `?tune` panel binds; DEFAULTS above is the shipped look and what tests pin. */
export const GLASS_TUNE: GlassTune = { ...GLASS_TUNE_DEFAULTS };

export const GLASS_TUNE_SCHEMA: TuneSchema<GlassTune> = {
  body: { min: 0, max: 0.4, step: 0.005, label: "body tint" },
  sky: { min: 0, max: 1, step: 0.02, label: "room colour" },
  rim: { min: 0, max: 1.5, step: 0.02, label: "reflectance" },
  spec: { min: 0, max: 1.5, step: 0.02, label: "window" },
  specPow: { min: 1, max: 64, step: 1, label: "window tightness" },
  edge: { min: 0, max: 1.5, step: 0.02, label: "polished edge" },
  env: { min: 0, max: 1.5, step: 0.02, label: "softboxes" },
  trayBody: { min: 0, max: 0.5, step: 0.005, label: "tray body" },
  laneBody: { min: 1, max: 4, step: 0.05, label: "lane body ×" },
  laneTint: { min: 0, max: 1, step: 0.02, label: "lane tint" },
};

/** The planes' corner radius — SQUARE (rounded corners belong to the trays). */
const PLANE_CORNER_R = 0;
/** The trays' corner radius — the smooth-corner clip of the shared glass fill. */
const TRAY_CORNER_R = 0.3;

/** Scratch for the committed lane's tint (rule 5: applyAlpha runs per frame and allocates nothing). */
const _hue = new THREE.Color();

/** A flat, edge-aligned label plane — the chamber's only text (moved out of LedgerView with the
 *  blueprint; the stack-level digit box went with the explorer's badges, user 2026-08-07).
 *  `align` reads `z` as the text's LEFT edge ("left", the floor-label idiom) or its CENTRE
 *  ("center" — the metagraph planes' tickers, user 2026-08-07). */
export function makeEdgeLabel(
  colors: SceneColors,
  text: string,
  frontX: number,
  y: number,
  z: number,
  height = 1.05,
  align: "left" | "center" = "left",
  weight: "name" | "readout" = "name",
): THREE.Mesh {
  const c = document.createElement("canvas");
  const SS = 2;
  c.width = 512 * SS;
  c.height = 64 * SS;
  const ctx = c.getContext("2d")!;
  // THEME — the ink is drawn WHITE and tinted by the material's own `color` (map RGB × color, so
  // this is pixel-identical to baking the tone into the canvas). That is the whole reason: a flip
  // is then one `setHex` on a material instead of a canvas redraw + texture re-upload per label,
  // and the chamber names every visible row at both ends. Grayscale is rule-3 exempt.
  const tone = "rgba(255,255,255,0.85)";
  const textX = 6 * SS;
  ctx.font = `400 ${26 * SS}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = tone;
  ctx.fillText(text, align === "center" ? c.width / 2 : textX, c.height / 2 + 2 * SS);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const h = height,
    w = h * (c.width / c.height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(labelInk(colors, weight)), // the label's tone — see `tone` above; retintEdgeLabel re-points it
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ),
  );
  // Centered: the canvas centre (where the text sits) lands on `z`; left: text starts at `z`.
  mesh.position.set(frontX - h / 2, y + 0.06, align === "center" ? z : z - w / 2);
  mesh.renderOrder = 2;
  return mesh;
}

/** THEME FLIP for an edge label built by `makeEdgeLabel` — the tone lives on the material, so this
 *  is the whole retint (no canvas, no texture upload). Event-time; the caller owns the meshes.
 *  `weight` must match what the label was BUILT with, or a flip silently re-weights it. */
export function retintEdgeLabel(mesh: THREE.Mesh, colors: SceneColors, weight: "name" | "readout" = "name"): void {
  (mesh.material as THREE.MeshBasicMaterial).color.setHex(labelInk(colors, weight));
}

export interface SnapshotPlaneOpts {
  w: number;  // X extent (the time trail run)
  d: number;  // Z extent (the lane/width field)
  y: number;  // storey height
  cx: number; // plane centre X
  cz: number; // plane centre Z
  /** The plane's name at its front edge; omit for an anonymous piece. `align` defaults left
   *  (text starts at z); "center" centres the text on z. */
  label?: { text: string; x: number; z: number; height?: number; align?: "left" | "center" };
}

export class SnapshotPlane {
  /** The glass surface — a pick BLOCKER (Engine._pickAt returns null on a glass hit). */
  readonly fill: THREE.Mesh;
  /** The edge label, when the plane is named — the caller registers it with its FadeSet. */
  readonly label: THREE.Mesh | null;
  private readonly _fillU: GlassFillUniforms;
  private readonly _minHalf: number;
  private readonly _cx: number;
  private readonly _parent: THREE.Group;
  private readonly _colors: SceneColors;
  /** GROUND, hoisted at event time — applyAlpha runs per frame and reads a boolean. */
  private _paper: boolean;
  private _tray: THREE.Mesh | null = null;
  private _trayU: GlassFillUniforms | null = null;
  /** The staged light's own eased intensity, pushed by setSpot and spent by applyAlpha (which owns
   *  the alpha scaling every other glass term goes through). 0 whenever nothing is staged. */
  private _spotI = 0;
  /** The pane's own neutral tone, captured from the theme — what a lane tint lerps AWAY from, and
   *  what it must return to the moment the commit is released. */
  private _base = 0;

  constructor(parent: THREE.Group, colors: SceneColors, o: SnapshotPlaneOpts) {
    this._parent = parent;
    this._colors = colors;
    this._paper = isLightGround(colors);
    const fm = makeGlassFill(colors, o.w / 2, o.d / 2, PLANE_CORNER_R);
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), fm);
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.set(o.cx, o.y, o.cz);
    this.fill.renderOrder = -2;
    this.fill.userData.blocker = true; // a normal surface: rays stop here (no pick, no pass-through)
    this._fillU = fm.uniforms as unknown as GlassFillUniforms;
    this._base = this._fillU.uColor.value.getHex();
    this._minHalf = Math.min(o.w, o.d) / 2;
    this._cx = o.cx;
    parent.add(this.fill);
    this.label = o.label
      ? makeEdgeLabel(colors, o.label.text, o.label.x, o.y, o.label.z, o.label.height, o.label.align)
      : null;
    if (this.label) parent.add(this.label);
  }

  /** Hang the plane's tray of machines under its front edge, or hide it. Event-time (a data
   *  rebuild) — the tray mesh is created once on first use and re-posed after. */
  setTray(spec: ContainerSpec | null): void {
    if (!spec) {
      if (this._tray) this._tray.visible = false;
      return;
    }
    if (!this._tray) {
      const tm = makeGlassFill(this._colors, 1, 1, TRAY_CORNER_R);
      this._tray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tm);
      this._trayU = tm.uniforms as unknown as GlassFillUniforms;
      this._parent.add(this._tray);
    }
    // A unit plane scaled to the spec's extents, facing the camera (+X) on the shared tray
    // plane; the shader works in uv space, so scale + uHalf carry the size.
    this._tray.visible = true;
    this._tray.scale.set(spec.hz * 2, spec.hy * 2, 1);
    this._tray.rotation.set(0, Math.PI / 2, 0);
    this._tray.position.set(CONT_X - 0.05, spec.cy, spec.cz);
    this._trayU!.uHalf.value.set(spec.hz, spec.hy);
  }

  /** THEME FLIP — the plane's three construction-time captures: the fill's shader uniform (whose
   *  BLEND MODE themes too — see applyGlassTheme), the lazily-built tray's, and the edge label's
   *  material tint. `_colors` is the Engine's own mutated object, so it already reads new; this
   *  re-applies the values that were copied OUT of it. Event-time. */
  setColors(c: SceneColors): void {
    this._paper = isLightGround(c);
    applyGlassTheme(this.fill.material as THREE.ShaderMaterial, c);
    this._base = this._fillU.uColor.value.getHex();
    if (this._tray) applyGlassTheme(this._tray.material as THREE.ShaderMaterial, c);
    if (this.label) retintEdgeLabel(this.label, c);
  }

  /** The HORIZON — dissolve the glass out before its own far edge, so the surface the time trail
   *  runs away into has no visible end (user, 2026-08-09: "the snapshot lanes logically go all the
   *  way to the back […] currently there is a hard edge"). `atX` is the GROUP-space x where the
   *  alpha reaches zero, `span` the ramp length in front of it; the plane's local +x is the group's
   *  +x, so the ramp is a plain offset. Construction-time — the trays never call it (they sit at
   *  the front, where an end is the truth). */
  setHorizon(atX: number, span: number): void {
    this._fillU.uFadeDir.value.set(1, 0);
    this._fillU.uFadeAt.value = atX - this._cx;
    this._fillU.uFadeSpan.value = span;
  }

  /** THE MOVABLE HIGHLIGHT — the app's one StageLight, handed to the glass as a WORLD POSITION so
   *  an unlit ShaderMaterial can still compute a Blinn-Phong lobe from it (glassFill's `uSpot*`).
   *  Per frame, uniform writes only, no allocation. `i` is the light's own eased intensity, so the
   *  lobe fades in and out with the lamp and is exactly 0 whenever the ledger has not claimed it —
   *  which on the dark ground is always. */
  setSpot(pos: THREE.Vector3, i: number): void {
    this._spotI = i;
    this._fillU.uSpotPos.value.copy(pos);
    if (this._trayU) this._trayU.uSpotPos.value.copy(pos);
  }

  /** Per-frame look: the caller passes ITS tune channel (global vs metagraph planes) and the
   *  furniture alpha. `rimRef` is the shared drop-off reference depth so the rim reads as one
   *  width across planes; narrow pieces clamp it to stay a rim. `fillBoost` lifts the edge
   *  fill alone — the committed lane's plane glows a step brighter (user, 2026-08-07). `hue` is
   *  the committed lane's identity, which only the day glass spends (see GlassTune.laneTint). */
  applyAlpha(tune: PlaneTune, alpha: number, rimRef: number, fillBoost = 1, hue: number | null = null): void {
    this._fillU.uEdgeW.value = Math.min((1 - tune.edge) * rimRef, 0.8 * this._minHalf);
    if (this._paper) {
      // THE DAY GLASS. The dark look's two flat fills are not dimmed here, they are REPLACED: an
      // additive whisper over black is a glow, and the same whisper shaded onto paper through
      // inkPresence's gamma is a sheet of grey card at ~0.6 alpha — which is exactly what the user
      // saw. So the light branch drives the view-dependent terms instead and the flat channels stay
      // off. `alpha` is the furniture fade (geometry, not emphasis) so it multiplies every term.
      //
      // THE COMMITTED LANE IS THE SAME GLASS AS EVERY OTHER LANE (user, 2026-08-28: "the active
      // metagraph plane is white"). fillBoost used to scale every term here; the shader mixes the
      // pane's colour toward WHITE by its reflection terms, so boosting them does not emphasise a
      // pane, it bleaches one. Glass is glass — the commit is spent on the two channels that carry
      // it without bleaching: `uBody`, which appears in the ALPHA term alone, so more of it is more
      // pane and no more light; and the pane's own tint, lerped toward the lane's identity so the
      // committed plane reads as ITS lane rather than as heat.
      const g = GLASS_TUNE;
      const lane = fillBoost > 1;
      this._fillU.uOpacity.value = 0;
      this._fillU.uInner.value = 0;
      this._fillU.uBody.value = g.body * alpha * (lane ? g.laneBody : 1);
      this._fillU.uSky.value = g.sky * alpha;
      this._fillU.uRim.value = g.rim * alpha;
      this._fillU.uSpec.value = g.spec * alpha;
      this._fillU.uSpecPow.value = g.specPow;
      this._fillU.uEdgeA.value = g.edge * alpha;
      this._fillU.uEnv.value = g.env * alpha;
      this._fillU.uSpotI.value = this._spotI * alpha;
      // Written every frame, both ways: a released commit must return the pane to neutral.
      const uc = this._fillU.uColor.value.setHex(this._base);
      if (lane && hue != null) uc.lerp(_hue.setHex(hue), g.laneTint);
      if (this._trayU && this._tray?.visible) {
        this._trayU.uOpacity.value = 0;
        this._trayU.uInner.value = 0;
        this._trayU.uBody.value = g.trayBody * alpha;
        this._trayU.uSky.value = g.sky * alpha;
        this._trayU.uRim.value = g.rim * alpha;
        this._trayU.uSpec.value = g.spec * alpha;
        this._trayU.uSpecPow.value = g.specPow;
        this._trayU.uEdgeA.value = g.edge * alpha;
        this._trayU.uEnv.value = g.env * alpha;
        this._trayU.uSpotI.value = this._spotI * alpha;
      }
      return;
    }
    this._fillU.uOpacity.value = tune.fillOp * fillBoost * alpha;
    this._fillU.uInner.value = tune.innerOp * alpha;
    if (this._trayU && this._tray?.visible) {
      // FLAT tray fill: the rim channel stays off, the centre level carries the whole panel.
      this._trayU.uOpacity.value = 0;
      this._trayU.uInner.value = tune.trayOp * alpha;
    }
  }

  dispose(): void {
    for (const m of [this.fill, this.label, this._tray]) {
      if (!m) continue;
      this._parent.remove(m);
      m.geometry.dispose();
      const mat = m.material as THREE.Material & { map?: { dispose?: () => void } };
      mat.map?.dispose?.();
      mat.dispose();
    }
  }
}
