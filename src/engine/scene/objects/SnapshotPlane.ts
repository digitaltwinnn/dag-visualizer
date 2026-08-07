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
import type { SceneColors } from "../../sceneColors";
import { CONT_X } from "../../domain/ledgerLayout";
import type { ContainerSpec } from "../../domain/ledgerRails";
import { makeGlassFill, type GlassFillUniforms } from "./glassFill";

/** One plane's live-tunable look (dev `?tune` panel binds it; the values are the shipped look). */
export interface PlaneTune {
  fillOp: number;  // the edge-band fill
  innerOp: number; // the flat centre level
  edge: number;    // drop-off start (1 = only the rim, 0 = solid)
  trayOp: number;  // the tray panel's flat fill
}

export const GLOBAL_PLANE_TUNE_DEFAULTS: PlaneTune = {
  fillOp: 0.035, innerOp: 0.01, edge: 0.95, trayOp: 0.085,
};
export const META_PLANE_TUNE_DEFAULTS: PlaneTune = {
  fillOp: 0.035, innerOp: 0.01, edge: 0.98, trayOp: 0.085, // edge user-tuned via ?tune, 2026-08-07
};

/** The planes' corner radius — SQUARE (rounded corners belong to the trays). */
const PLANE_CORNER_R = 0;
/** The trays' corner radius — the smooth-corner clip of the shared glass fill. */
const TRAY_CORNER_R = 0.3;

const rgbTriplet = (c: THREE.Color): string =>
  `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;

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
): THREE.Mesh {
  const c = document.createElement("canvas");
  const SS = 2;
  c.width = 512 * SS;
  c.height = 64 * SS;
  const ctx = c.getContext("2d")!;
  const cc = new THREE.Color(colors.core);
  const tone = `rgba(${rgbTriplet(cc)},0.85)`;
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
  private readonly _parent: THREE.Group;
  private readonly _colors: SceneColors;
  private _tray: THREE.Mesh | null = null;
  private _trayU: GlassFillUniforms | null = null;

  constructor(parent: THREE.Group, colors: SceneColors, o: SnapshotPlaneOpts) {
    this._parent = parent;
    this._colors = colors;
    const fm = makeGlassFill(colors.core, o.w / 2, o.d / 2, PLANE_CORNER_R);
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), fm);
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.set(o.cx, o.y, o.cz);
    this.fill.renderOrder = -2;
    this.fill.userData.blocker = true; // a normal surface: rays stop here (no pick, no pass-through)
    this._fillU = fm.uniforms as unknown as GlassFillUniforms;
    this._minHalf = Math.min(o.w, o.d) / 2;
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
      const tm = makeGlassFill(this._colors.core, 1, 1, TRAY_CORNER_R);
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

  /** Per-frame look: the caller passes ITS tune channel (global vs metagraph planes) and the
   *  furniture alpha. `rimRef` is the shared drop-off reference depth so the rim reads as one
   *  width across planes; narrow pieces clamp it to stay a rim. */
  applyAlpha(tune: PlaneTune, alpha: number, rimRef: number): void {
    this._fillU.uOpacity.value = tune.fillOp * alpha;
    this._fillU.uInner.value = tune.innerOp * alpha;
    this._fillU.uEdgeW.value = Math.min((1 - tune.edge) * rimRef, 0.8 * this._minHalf);
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
