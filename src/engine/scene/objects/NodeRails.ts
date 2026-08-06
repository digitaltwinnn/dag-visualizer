// The ledger's NODE RAILS (redesign 2026-08-04): hairline guides with a label, one per non-empty
// make-up rail, along the front edge of each snapshot floor. The CHIPS themselves are the shared
// node InstancedMeshes that Globe places — this adapter owns only the rail furniture and the pick
// proxies, so the machines on a rail stay the same objects the other views render.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { railX, railY, LANE_HALF_Z, type RailGroup } from "../../domain/ledgerLayout";
import { railLayerId, railLit, RAIL_ORDER, type RailKind } from "../../domain/ledgerRails";

const RAIL_REST_OP = 0.16;
const RAIL_LIT_OP = 0.5;
const RAIL_DIM_OP = 0.05;

interface Rail {
  kind: RailKind;
  group: RailGroup;
  line: THREE.LineSegments;
  mat: THREE.LineBasicMaterial;
  proxy: THREE.Mesh;
  visible: boolean;
  target: number;
}

export class NodeRails {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private _rails: Rail[] = [];
  private _alpha = 0;
  private _hilite: string | null = null;
  private _dimOthers = false;

  constructor(colors: SceneColors) {
    // One rail object per (group, kind) up front — six in total, so nothing allocates later.
    for (const group of ["meta", "dag"] as RailGroup[]) {
      for (const kind of RAIL_ORDER) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(
          [0, 0, -LANE_HALF_Z, 0, 0, LANE_HALF_Z], 3,
        ));
        const mat = new THREE.LineBasicMaterial({ color: colors.core, transparent: true, opacity: 0 });
        const line = new THREE.LineSegments(geo, mat);
        const proxy = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2 * LANE_HALF_Z),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        proxy.rotation.x = -Math.PI / 2;
        proxy.userData.pick = { kind: "layer", layerId: railLayerId(group, kind) };
        line.visible = false;
        proxy.visible = false;
        this.group.add(line, proxy);
        this._rails.push({ kind, group, line, mat, proxy, visible: false, target: 0 });
      }
    }
  }

  /** Place the rails a group actually has. Called on a data rebuild only. */
  setRails(group: RailGroup, kinds: RailKind[]): void {
    for (const r of this._rails) {
      if (r.group !== group) continue;
      const idx = kinds.indexOf(r.kind);
      r.visible = idx >= 0;
      r.line.visible = r.visible;
      r.proxy.visible = r.visible;
      if (idx < 0) continue;
      const x = railX(idx);
      const y = railY(group, 0) - 0.02;
      r.line.position.set(x, y, 0);
      r.proxy.position.set(x, y, 0);
    }
    this.pickables.length = 0;
    for (const r of this._rails) if (r.visible) this.pickables.push(r.proxy);
  }

  setHighlight(layerId: string | null, dimOthers: boolean): void {
    this._hilite = layerId;
    this._dimOthers = dimOthers;
  }

  setAlpha(a: number): void {
    this._alpha = a;
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 6);
    for (const r of this._rails) {
      if (!r.visible) continue;
      const lit = this._hilite ? railLit(this._hilite, r.group, r.kind) : false;
      const base = lit ? RAIL_LIT_OP : this._dimOthers ? RAIL_DIM_OP : RAIL_REST_OP;
      r.target = base * this._alpha;
      r.mat.opacity += (r.target - r.mat.opacity) * k;
    }
  }

  dispose(): void {
    for (const r of this._rails) {
      r.line.geometry.dispose();
      r.mat.dispose();
      r.proxy.geometry.dispose();
      (r.proxy.material as THREE.Material).dispose();
    }
    this._rails.length = 0;
    this.pickables.length = 0;
  }
}
