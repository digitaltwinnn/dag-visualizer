// The ledger's NODE CONTAINERS (finetune 2026-08-06, replacing the on-floor rails): one glass
// tray per ROLE, hanging under the front edge of each snapshot floor and facing the camera. The
// CHIPS themselves are the shared node InstancedMeshes that Globe places on the same
// `containerLayout` specs — this adapter owns only the tray glass and the role labels.
//
// The trays are FLAT rounded-corner panels (user, 2026-08-07 — the drop-off/rim treatment
// belongs to the snapshot floors alone): the shared glassFill shader with the rim disabled,
// its flat centre level carrying the whole fill. Rounded corners stay — they are the trays'
// signature. The old hairline line frame is retired.
//
// Containers are PURE VISUAL AID (user, 2026-08-06): no pick proxies, no layer-rung highlight —
// the machines inside stay pickable as nodes, the glass itself is furniture.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { CONT_X, CONT_PAD, type RailGroup } from "../../domain/ledgerLayout";
import { ROLE_CODE, type ContainerSpec } from "../../domain/ledgerRails";
import { makeGlassFill, type GlassFillUniforms } from "./glassFill";

/** The trays' live-tunable look (dev `?tune` panel binds it; the value is the shipped look). */
export interface TrayTune {
  fillOp: number; // the flat panel fill
}
export const TRAY_TUNE_DEFAULTS: TrayTune = { fillOp: 0.05 };

const LABEL_OP = 0.85;
/** The trays' corner radius (local units) — the smooth-corner clip of the shared glass fill. */
const CONT_CORNER_R = 0.3;
/** Per-group container pool — three roles is the most a group can have. */
const MAX_PER_GROUP = 3;

const rgbTriplet = (c: THREE.Color): string =>
  `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;

interface Slot {
  group: RailGroup;
  fill: THREE.Mesh;
  fillMat: THREE.ShaderMaterial;
  uniforms: GlassFillUniforms;
  minHalf: number;
  label: THREE.Mesh;
  labelMat: THREE.MeshBasicMaterial;
  used: boolean;
}

export class NodeRails {
  group = new THREE.Group();
  /** Kept for LedgerView's pickable sync — always empty now (containers are not pickable). */
  pickables: THREE.Object3D[] = [];
  private _slots: Slot[] = [];
  private _alpha = 0;
  private _core: number;
  tune: TrayTune = { ...TRAY_TUNE_DEFAULTS };

  constructor(colors: SceneColors) {
    this._core = colors.core;
    // One glass + label object per (group, index) up front — geometry/texture are rewritten on a
    // data rebuild (event-time), nothing allocates per frame.
    for (const group of ["meta", "dag"] as RailGroup[]) {
      for (let i = 0; i < MAX_PER_GROUP; i++) {
        const fillMat = makeGlassFill(colors.core, 1, 1, CONT_CORNER_R);
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMat);
        fill.visible = false;
        const labelMat = new THREE.MeshBasicMaterial({
          transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        });
        const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
        label.visible = false;
        this.group.add(fill, label);
        this._slots.push({
          group, fill, fillMat,
          uniforms: fillMat.uniforms as unknown as GlassFillUniforms,
          minHalf: 1, label, labelMat, used: false,
        });
      }
    }
  }

  /** Lay out a group's containers. Called on a data rebuild only (event-time). */
  setContainers(group: RailGroup, specs: ContainerSpec[]): void {
    let i = 0;
    for (const s of this._slots) {
      if (s.group !== group) continue;
      const spec = specs[i++];
      s.used = !!spec;
      s.fill.visible = s.used;
      s.label.visible = s.used;
      if (!spec) continue;

      // The tray glass: a unit plane scaled to the spec's extents, facing the camera (+X) on the
      // shared container plane; the shader works in uv space, so scale + uHalf carry the size.
      s.fill.scale.set(spec.hz * 2, spec.hy * 2, 1);
      s.fill.rotation.set(0, Math.PI / 2, 0);
      s.fill.position.set(CONT_X - 0.05, spec.cy, spec.cz);
      s.uniforms.uHalf.value.set(spec.hz, spec.hy);
      s.minHalf = Math.min(spec.hz, spec.hy);

      // The role label — INSIDE the glass at its screen-left end, on the reserved label strip
      // (the floor-label idiom: the plane names itself along its left edge; user 2026-08-07).
      this._drawLabel(s, ROLE_CODE[spec.role]);
      s.label.rotation.set(0, Math.PI / 2, 0);
      const labelW = s.label.scale.x;
      s.label.position.set(
        CONT_X + 0.02,
        spec.cy,
        spec.cz + spec.hz - CONT_PAD - labelW / 2,
      );
    }
  }

  // The SAME text treatment as the floor labels (LedgerView._makeLabel: system-ui 26px on the
  // core tone at 0.85) — the tray names itself in the plane's own voice, not a muted variant.
  private _drawLabel(s: Slot, text: string): void {
    const c = document.createElement("canvas");
    const SS = 2;
    c.width = 128 * SS;
    c.height = 44 * SS;
    const ctx = c.getContext("2d")!;
    const cc = new THREE.Color(this._core);
    ctx.font = `400 ${26 * SS}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(${rgbTriplet(cc)},0.85)`;
    ctx.fillText(text, 2 * SS, c.height / 2 + 2 * SS);
    s.labelMat.map?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    s.labelMat.map = tex;
    s.labelMat.needsUpdate = true;
    const h = 0.5;
    s.label.scale.set(h * (c.width / c.height), h, 1);
  }

  setAlpha(a: number): void {
    this._alpha = a;
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 6);
    for (const s of this._slots) {
      if (!s.used) continue;
      // FLAT fill: the rim channel stays off, the centre level carries the whole panel.
      s.uniforms.uOpacity.value = 0;
      s.uniforms.uInner.value = this.tune.fillOp * this._alpha;
      s.labelMat.opacity += (LABEL_OP * this._alpha - s.labelMat.opacity) * k;
    }
  }

  dispose(): void {
    for (const s of this._slots) {
      s.fill.geometry.dispose();
      s.fillMat.dispose();
      s.label.geometry.dispose();
      s.labelMat.map?.dispose();
      s.labelMat.dispose();
    }
    this._slots.length = 0;
    this.pickables.length = 0;
  }
}
