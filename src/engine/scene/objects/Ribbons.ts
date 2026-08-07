// The RIBBONS (spec §4.3): one tapering sheet per anchoring lane, leaving the lane's tiles on the
// metagraph floor and landing on that metagraph's own band in the byte bar below. The lane counts
// snapshots, the band measures bytes, and the ribbon is the relationship between the two — which is
// what replaced the old cubic anchor links.
//
// The sheet is CURVED (finetune 2026-08-06): each ribbon is subdivided into SEG vertical segments
// and its Z sweep eased (smootherstep, blended by `tune.curve`), so it falls from the lane, sweeps
// mid-run and lands vertically on its band instead of slicing diagonally across the chamber. Bands
// follow lane order (fillBarSpec), and both edges of adjacent ribbons interpolate with the SAME
// ease, so ribbons can never cross each other. A HIDDEN lane (another network is committed) draws
// NO ribbon at all — its lane laid no tiles, so a sheet from its old position would just overlap
// the committed lane's field (the caller's laneZ resolver returns null for it).
//
// Brightness/opacity are TUNABLE (RibbonTune) — the dev ?tune panel binds them live; the defaults
// here are the shipped look.
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
/** Vertical subdivisions per ribbon — enough for the eased sweep to read as a curve. */
export const RIBBON_SEG = 16;
const PER_ROW = METAGRAPHS.length + 1;
const VERTS_PER_RIBBON = RIBBON_SEG * 6; // two triangles per segment

/** The live-tunable ribbon look (dev `?tune` panel binds these; the values are the shipped look). */
export interface RibbonTune {
  restOp: number;    // resting sheet opacity (× view alpha)
  dimOp: number;     // opacity for an off-filter ribbon (baked into vertex colours)
  brightness: number; // vertex-colour multiplier (additive blending → perceived brightness)
  curve: number;     // 0 = straight diagonal sheet, 1 = full smootherstep S-sweep
}

export const RIBBON_TUNE_DEFAULTS: RibbonTune = {
  // User-tuned via ?tune, 2026-08-07: rest == dim (an off-filter ribbon keeps the same quiet
  // level — under a commit the hidden lanes draw no ribbon at all, so dim only ever meant the
  // hover preview, and equal reads calmer).
  restOp: 0.15,
  dimOp: 0.15,
  brightness: 0.85,
  curve: 1,
};

/** The eased Z progress at vertical progress `t` — linear blended toward smootherstep. */
function sweep(t: number, curve: number): number {
  const s = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
  return t + (s - t) * curve;
}

interface RowState {
  slot: number;
  count: number;
  keys: string[];
  quads: RibbonQuad[];
}

export class Ribbons {
  group = new THREE.Group();
  tune: RibbonTune = { ...RIBBON_TUNE_DEFAULTS };
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

  /** Live-tune the look (dev panel). Event-time: rewrites the sheet. */
  setTune(t: Partial<RibbonTune>): void {
    Object.assign(this.tune, t);
    this._writeGeometry();
  }

  /** `laneZ` returns the lane centre for a metagraph key — null when the lane is HIDDEN (another
   *  network committed): a hidden lane laid no tiles, so it gets no ribbon either. An unlisted
   *  anchor never has a lane; its ribbon starts in mid-air above its band (spec §6.6). */
  setRow(row: 0 | 1, slot: number, spec: BarSpec | null, laneZ: (key: string) => number | null): void {
    const st = this._rows[row];
    st.slot = slot;
    st.keys.length = 0;
    st.count = 0;
    if (!spec || !spec.measured) { this._writeGeometry(); return; }

    for (let i = 0; i < spec.bandCount; i++) {
      const band = spec.bands[i];
      if (band.bytes <= 0) continue;
      const unlisted = band.key === UNLISTED_KEY;
      const z = unlisted ? null : laneZ(band.key);
      if (!unlisted && z == null) continue; // hidden lane → no sheet
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

  /** A point on ribbon `i`'s centre line at vertical progress `t` — follows the SAME eased sweep
   *  the sheet is drawn with, so the anchor pulses ride the curve. */
  centreLine(row: 0 | 1, i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const st = this._rows[row];
    // Caller contract: bound the loop by ribbonCount(row) — an empty row has no quad to walk.
    if (st.count === 0) return out;
    const q = st.quads[Math.min(i, st.count - 1)];
    const x = -st.slot * SLOT_SP;
    const topZ = (q.topZ0 + q.topZ1) / 2;
    const botZ = (q.botZ0 + q.botZ1) / 2;
    const s = sweep(t, this.tune.curve);
    return out.set(x, FLOOR_Y.msnap + (FLOOR_Y.gl0 - FLOOR_Y.msnap) * t, topZ + (botZ - topZ) * s);
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
    const target = this.tune.restOp * this._alpha;
    this._mat.opacity += (target - this._mat.opacity) * k;
  }

  /** event-time: the whole sheet is rewritten when a row changes. */
  private _writeGeometry(): void {
    const p = this._pos.array as Float32Array;
    const c = this._col.array as Float32Array;
    const { curve, dimOp, restOp, brightness } = this.tune;
    let v = 0;
    const push = (x: number, z: number, y: number, r: number, g: number, b: number) => {
      p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
      c[v * 3] = r; c[v * 3 + 1] = g; c[v * 3 + 2] = b;
      v++;
    };
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
        const s = (off ? dimOp / restOp : 1) * brightness;
        const cr = this._c.r * s, cg = this._c.g * s, cb = this._c.b * s;
        for (let j = 0; j < RIBBON_SEG; j++) {
          const t0 = j / RIBBON_SEG, t1 = (j + 1) / RIBBON_SEG;
          const s0 = sweep(t0, curve), s1 = sweep(t1, curve);
          const y0 = yTop + (yBot - yTop) * t0, y1 = yTop + (yBot - yTop) * t1;
          const l0 = q.topZ0 + (q.botZ0 - q.topZ0) * s0, r0 = q.topZ1 + (q.botZ1 - q.topZ1) * s0;
          const l1 = q.topZ0 + (q.botZ0 - q.topZ0) * s1, r1 = q.topZ1 + (q.botZ1 - q.topZ1) * s1;
          push(x, l0, y0, cr, cg, cb); push(x, r0, y0, cr, cg, cb); push(x, r1, y1, cr, cg, cb);
          push(x, l0, y0, cr, cg, cb); push(x, r1, y1, cr, cg, cb); push(x, l1, y1, cr, cg, cb);
        }
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
