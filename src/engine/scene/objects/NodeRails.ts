// The ledger's NODE TRAYS (redesign 2026-08-07 — one tray per snapshot plane): flat rounded
// glass panels hanging under the front edge of the plane they serve, facing the camera. Each
// metagraph's own plane carries its own tray of machines (deduped — no role split; other views
// dissect roles), the global floor one full-width validator tray. The CHIPS themselves are the
// shared node InstancedMeshes that Globe places on the same `ContainerSpec`s — this adapter owns
// only the tray glass.
//
// The trays are FLAT rounded-corner panels (user, 2026-08-07 — the drop-off/rim treatment
// belongs to the snapshot floors alone): the shared glassFill shader with the rim disabled,
// its flat centre level carrying the whole fill. Rounded corners stay — they are the trays'
// signature. Trays carry NO label of their own — the plane above each one is already named.
//
// Containers are PURE VISUAL AID (user, 2026-08-06): no pick proxies — the machines inside stay
// pickable as nodes, the glass itself is furniture.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { CONT_X, type RailGroup } from "../../domain/ledgerLayout";
import { type ContainerSpec } from "../../domain/ledgerRails";
import { makeGlassFill, type GlassFillUniforms } from "./glassFill";

/** The trays' live-tunable look (dev `?tune` panel binds it; the value is the shipped look). */
export interface TrayTune {
  fillOp: number; // the flat panel fill
}
export const TRAY_TUNE_DEFAULTS: TrayTune = { fillOp: 0.085 }; // user-tuned via ?tune, 2026-08-07

/** The trays' corner radius (local units) — the smooth-corner clip of the shared glass fill. */
const CONT_CORNER_R = 0.3;

interface Slot {
  group: RailGroup;
  fill: THREE.Mesh;
  fillMat: THREE.ShaderMaterial;
  uniforms: GlassFillUniforms;
  minHalf: number;
  used: boolean;
}

export class NodeRails {
  group = new THREE.Group();
  /** Kept for LedgerView's pickable sync — always empty now (containers are not pickable). */
  pickables: THREE.Object3D[] = [];
  private _slots: Slot[] = [];
  private _core: number;
  private _alpha = 0;
  tune: TrayTune = { ...TRAY_TUNE_DEFAULTS };

  constructor(colors: SceneColors) {
    this._core = colors.core;
  }

  // The pool grows to the largest tray count seen (event-time: a data rebuild, never per frame —
  // one slot per metagraph plane at most, plus the DAG tray).
  private _ensureSlots(group: RailGroup, n: number): Slot[] {
    const mine = this._slots.filter((s) => s.group === group);
    while (mine.length < n) {
      const fillMat = makeGlassFill(this._core, 1, 1, CONT_CORNER_R);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMat);
      fill.visible = false;
      this.group.add(fill);
      const slot: Slot = {
        group, fill, fillMat,
        uniforms: fillMat.uniforms as unknown as GlassFillUniforms,
        minHalf: 1, used: false,
      };
      this._slots.push(slot);
      mine.push(slot);
    }
    return mine;
  }

  /** Lay out a group's trays. Called on a data rebuild only (event-time). */
  setContainers(group: RailGroup, specs: ContainerSpec[]): void {
    const mine = this._ensureSlots(group, specs.length);
    mine.forEach((s, i) => {
      const spec = specs[i];
      s.used = !!spec;
      s.fill.visible = s.used;
      if (!spec) return;
      // The tray glass: a unit plane scaled to the spec's extents, facing the camera (+X) on the
      // shared container plane; the shader works in uv space, so scale + uHalf carry the size.
      s.fill.scale.set(spec.hz * 2, spec.hy * 2, 1);
      s.fill.rotation.set(0, Math.PI / 2, 0);
      s.fill.position.set(CONT_X - 0.05, spec.cy, spec.cz);
      s.uniforms.uHalf.value.set(spec.hz, spec.hy);
      s.minHalf = Math.min(spec.hz, spec.hy);
    });
  }

  setAlpha(a: number): void {
    this._alpha = a;
  }

  update(_dt: number): void {
    for (const s of this._slots) {
      if (!s.used) continue;
      // FLAT fill: the rim channel stays off, the centre level carries the whole panel.
      s.uniforms.uOpacity.value = 0;
      s.uniforms.uInner.value = this.tune.fillOp * this._alpha;
    }
  }

  dispose(): void {
    for (const s of this._slots) {
      s.fill.geometry.dispose();
      s.fillMat.dispose();
    }
    this._slots.length = 0;
    this.pickables.length = 0;
  }
}
