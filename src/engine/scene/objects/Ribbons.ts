// The RIBBONS (spec §4.3): one tapering sheet per anchoring lane, leaving the lane's tiles on the
// metagraph floor and landing on that metagraph's own band in the byte bar below. The lane counts
// snapshots, the band measures bytes, and the ribbon is the relationship between the two — which is
// what replaced the old cubic anchor links.
//
// Drawn on the LEAD row and the HOT row only, so the trail stays calm; older ticks keep a hairline
// strut drawn by the view. One Mesh, one preallocated geometry, rewritten event-time.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import { METAGRAPHS } from "../../config";
import { FLOOR_Y } from "../../domain/ledgerLayout";
import { SLOT_SP } from "../../domain/ledgerModel";
import { ribbonQuad, RIBBON_LANE_HALF, UNLISTED_KEY, type BarSpec, type RibbonQuad } from "../../domain/ledgerBands";

export const RIBBON_ROWS = 2;
const PER_ROW = METAGRAPHS.length + 1;
const VERTS_PER_RIBBON = 6; // two triangles
const REST_OP = 0.5;
const DIM_OP = 0.12;

interface RowState {
  slot: number;
  count: number;
  keys: string[];
  quads: RibbonQuad[];
}

export class Ribbons {
  group = new THREE.Group();
  private _geo = new THREE.BufferGeometry();
  private _pos: THREE.Float32BufferAttribute;
  private _col: THREE.Float32BufferAttribute;
  private _mat: THREE.MeshBasicMaterial;
  private _mesh: THREE.Mesh;
  private _rows: RowState[] = [];
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  private _alpha = 0;
  private _filter = "all";
  private _c = new THREE.Color();

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.core;
    const verts = RIBBON_ROWS * PER_ROW * VERTS_PER_RIBBON;
    this._pos = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
    this._col = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
    this._pos.setUsage(THREE.DynamicDrawUsage);
    this._col.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute("position", this._pos);
    this._geo.setAttribute("color", this._col);
    this._geo.setDrawRange(0, 0);
    this._mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.frustumCulled = false;
    this.group.add(this._mesh);

    for (let r = 0; r < RIBBON_ROWS; r++) {
      const quads: RibbonQuad[] = [];
      for (let i = 0; i < PER_ROW; i++) quads.push({ topZ0: 0, topZ1: 0, botZ0: 0, botZ1: 0 });
      this._rows.push({ slot: -1, count: 0, keys: [], quads });
    }
  }

  setSceneColors(map: Record<string, number>): void { this._sceneColors = map; }

  /** `laneZ` returns the lane centre for a metagraph key, or null for one with no lane
   *  (an unlisted anchor's ribbon starts in mid-air — spec §6.6). */
  setRow(row: 0 | 1, slot: number, spec: BarSpec | null, laneZ: (key: string) => number | null): void {
    const st = this._rows[row];
    st.slot = slot;
    st.keys.length = 0;
    st.count = 0;
    if (!spec || !spec.measured) { this._writeGeometry(); return; }

    for (let i = 0; i < spec.bandCount; i++) {
      const band = spec.bands[i];
      if (band.bytes <= 0) continue;
      const z = band.key === UNLISTED_KEY ? null : laneZ(band.key);
      // An unlisted anchor has no lane, so its ribbon starts above the band it lands on.
      const centre = z ?? (band.z0 + band.z1) / 2;
      ribbonQuad(centre, z == null ? RIBBON_LANE_HALF * 0.4 : RIBBON_LANE_HALF, band, st.quads[st.count]);
      st.keys.push(band.key);
      st.count++;
    }
    this._writeGeometry();
  }

  clearRow(row: 0 | 1): void {
    this._rows[row].count = 0;
    this._rows[row].keys.length = 0;
    this._writeGeometry();
  }

  ribbonCount(row: 0 | 1): number { return this._rows[row].count; }

  centreLine(row: 0 | 1, i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const st = this._rows[row];
    // Caller contract: bound the loop by ribbonCount(row) — an empty row has no quad to walk.
    if (st.count === 0) return out;
    const q = st.quads[Math.min(i, st.count - 1)];
    const x = -st.slot * SLOT_SP;
    const topZ = (q.topZ0 + q.topZ1) / 2;
    const botZ = (q.botZ0 + q.botZ1) / 2;
    return out.set(x, FLOOR_Y.msnap + (FLOOR_Y.gl0 - FLOOR_Y.msnap) * t, topZ + (botZ - topZ) * t);
  }

  setAlpha(a: number): void { this._alpha = a; }
  /** The dim is baked into the VERTEX COLOURS, so a change has to rewrite the sheet — a hover
   *  preview would otherwise leave the ribbons lit until the next tick rebuilt a row. */
  setFilter(filter: string): void {
    const next = filter || "all";
    if (next === this._filter) return;
    this._filter = next;
    this._writeGeometry(); // event-time: a hover/commit transition, not a frame
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 5);
    const target = REST_OP * this._alpha;
    this._mat.opacity += (target - this._mat.opacity) * k;
  }

  /** event-time: the whole sheet is rewritten when a row changes. */
  private _writeGeometry(): void {
    const p = this._pos.array as Float32Array;
    const c = this._col.array as Float32Array;
    let v = 0;
    for (let r = 0; r < RIBBON_ROWS; r++) {
      const st = this._rows[r];
      const x = -st.slot * SLOT_SP;
      const yTop = FLOOR_Y.msnap;
      const yBot = FLOOR_Y.gl0;
      for (let i = 0; i < st.count; i++) {
        const q = st.quads[i];
        const key = st.keys[i];
        const hex = key === UNLISTED_KEY ? this._neutral : (this._sceneColors[key] ?? this._neutral);
        this._c.setHex(hex);
        const off = this._filter !== "all" && key !== this._filter;
        const s = off ? DIM_OP / REST_OP : 1;
        const push = (z: number, y: number) => {
          p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
          c[v * 3] = this._c.r * s; c[v * 3 + 1] = this._c.g * s; c[v * 3 + 2] = this._c.b * s;
          v++;
        };
        push(q.topZ0, yTop); push(q.topZ1, yTop); push(q.botZ1, yBot);
        push(q.topZ0, yTop); push(q.botZ1, yBot); push(q.botZ0, yBot);
      }
    }
    this._geo.setDrawRange(0, v);
    this._pos.needsUpdate = true;
    this._col.needsUpdate = true;
  }

  dispose(): void {
    this._geo.dispose();
    this._mat.dispose();
    this._rows.length = 0;
  }
}
