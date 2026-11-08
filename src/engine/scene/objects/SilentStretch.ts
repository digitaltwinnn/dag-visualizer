// THE SILENT STRETCH — the Blocks register's mark between two adjacent trail slots for the run of
// global snapshots between them that hold no block anywhere (spec "What the visitor gets" 2:
// "a silent run between two such ticks is one quiet stretch stating its length … never one slot
// per tick and never nothing"). About 96% of global snapshots hold no block, so most gaps on the
// Blocks trail are silent, and the chamber says so rather than pretending its ticks are adjacent.
//
// One dashed LineSegments for every stretch, lying flush in the global floor's glass between the
// two rows' bars, plus a flat edge label stating the length for a run long enough to matter. The
// label is the chamber's own text — flat, edge-aligned, the ordinal column's recipe — not a
// billboard: the floor is named by flat text everywhere (`scene/CLAUDE.md`, "Labels").
//
// The view places every stretch from layout data at event time; the per-frame half only rides the
// trail's two boundaries, so a stretch leaves the chamber exactly where the rows it joins do.
//
// THE FRONT RUN (spec 2: "the live edge is the silent stretch growing at the front"): in the LIVE
// window one more stretch stands ahead of the lead row, from its bar toward the rim, for the globals
// since the newest block tick up to the live global — rebuilt on each live tick, so its words grow
// with the silence. It rides the lead row (`frontRunAt`), never the front boundary it stands past.

import * as THREE from "three";
import { frontAt, frontRunAt, horizonAt } from "../../domain/ledgerModel";
import { inkPresence, isLightGround, labelInk, type SceneColors } from "../../sceneColors";
import { makeEdgeLabel, retintEdgeLabel } from "./SnapshotPlane";

/** One stretch, chamber-local before the rewind offset: the dash from `x0` to `x1` at `y`, and the
 *  words for its length (null: too short to state). `key` names the pair of ticks it joins, so a
 *  rebuild re-uses the label of a stretch it already drew. */
export interface StretchItem {
  key: string;
  x0: number;
  x1: number;
  y: number;
  label: string | null;
  /** The FRONT RUN — the live-edge silence ahead of the lead row (`frontRunAt`): it rides the lead
   *  row rather than reading its own x against the front boundary, which it stands past by design. */
  front?: boolean;
}

/** The dash's and the words' resting opacity (dark-ground values; `inkPresence` asks the paper). */
const DASH_OP = 0.34;
const LABEL_OP = 0.5;
/** The label's text height — under the ordinal column's, a reading about silence, not a subject. */
const LABEL_H = 0.5;
/** Where the words start across the floor — just right of the dash, reading away from it. */
const LABEL_Z = -0.35;

export class SilentStretch {
  /** Rides the trail rewind (`setOffset` writes its x). */
  readonly group = new THREE.Group();

  private readonly _max: number;
  private readonly _geo = new THREE.BufferGeometry();
  private readonly _pos: THREE.Float32BufferAttribute;
  private readonly _col: THREE.Float32BufferAttribute;
  /** The dashed material's per-vertex line distances, written at rebuild (perf review, 2026-11-07:
   *  `computeLineDistances` allocated a fresh attribute — and a fresh GL buffer — per rebuild). */
  private readonly _dist: THREE.Float32BufferAttribute;
  private readonly _mat: THREE.LineDashedMaterial;
  private readonly _lines: THREE.LineSegments;
  private _items: StretchItem[] = [];
  private _labels = new Map<string, { mesh: THREE.Mesh; xMid: number; front: boolean; x1: number }>();
  private _colors: SceneColors;
  private _paper: boolean;
  private _off = 0;

  constructor(colors: SceneColors, maxStretches = 128) {
    this._max = maxStretches;
    this._colors = colors;
    this._paper = isLightGround(colors);
    this._pos = new THREE.Float32BufferAttribute(new Float32Array(maxStretches * 6), 3);
    this._col = new THREE.Float32BufferAttribute(new Float32Array(maxStretches * 8).fill(1), 4);
    this._pos.setUsage(THREE.DynamicDrawUsage);
    this._col.setUsage(THREE.DynamicDrawUsage);
    this._dist = new THREE.Float32BufferAttribute(new Float32Array(maxStretches * 2), 1);
    this._dist.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute("position", this._pos);
    this._geo.setAttribute("color", this._col);
    this._geo.setAttribute("lineDistance", this._dist);
    this._geo.setDrawRange(0, 0);
    // The ink is the material's colour (the ordinal column's readout ink); the vertex alpha is the
    // per-stretch boundary ramp.
    this._mat = new THREE.LineDashedMaterial({
      color: labelInk(colors, "readout"), vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, dashSize: 0.14, gapSize: 0.18,
    });
    this._lines = new THREE.LineSegments(this._geo, this._mat);
    this._lines.frustumCulled = false;
    this._lines.renderOrder = 2;
    this.group.add(this._lines);
  }

  /** How many stretches are drawn — 0 is the cleared mark. */
  get count(): number {
    return this._items.length;
  }

  /** EVENT-TIME: every stretch on the trail. Labels are kept by key, so a rebuild on each tick
   *  re-draws a canvas only for a stretch it has not drawn before. */
  rebuild(items: StretchItem[]): void {
    const n = Math.min(items.length, this._max);
    this._items = items.slice(0, n); // event-time
    const pos = this._pos.array as Float32Array;
    const dist = this._dist.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = this._items[i];
      pos.set([s.x0, s.y, 0, s.x1, s.y, 0], i * 6); // event-time
      // A dashed line needs its distances per segment: each runs from 0 to its own length.
      dist[i * 2] = 0;
      dist[i * 2 + 1] = Math.abs(s.x1 - s.x0);
    }
    if (n > 0) {
      this._pos.clearUpdateRanges();
      this._pos.addUpdateRange(0, n * 6);
      this._pos.needsUpdate = true;
      this._dist.clearUpdateRanges();
      this._dist.addUpdateRange(0, n * 2);
      this._dist.needsUpdate = true;
    }
    this._geo.setDrawRange(0, n * 2);
    const seen = new Set<string>(); // event-time
    for (const s of this._items) {
      if (!s.label) continue;
      const key = `${s.key}|${s.label}`;
      seen.add(key);
      const xMid = (s.x0 + s.x1) / 2;
      let l = this._labels.get(key);
      if (!l) {
        const mesh = makeEdgeLabel(this._colors, s.label, 0, s.y, LABEL_Z, LABEL_H, "left", "readout");
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        this.group.add(mesh);
        l = { mesh, xMid, front: false, x1: s.x1 };
        this._labels.set(key, l);
      }
      l.xMid = xMid;
      l.front = !!s.front;
      l.x1 = s.x1;
      // The plane's centre on the gap between the two rows (its text runs across the floor).
      l.mesh.position.x = xMid;
    }
    for (const [key, l] of this._labels) {
      if (seen.has(key)) continue;
      this._disposeLabel(l.mesh);
      this._labels.delete(key);
    }
  }

  clear(): void {
    this.rebuild([]); // event-time
  }

  setOffset(x: number): void {
    this._off = x;
    this.group.position.x = x;
  }

  setColors(c: SceneColors): void {
    this._colors = c;
    this._paper = isLightGround(c);
    this._mat.color.setHex(labelInk(c, "readout"));
    for (const l of this._labels.values()) retintEdgeLabel(l.mesh, c, "readout");
  }

  /** Per frame: each stretch and its words ride the trail's two boundaries. No allocation. */
  update(alpha: number): void {
    const dashOp = inkPresence(DASH_OP, this._paper);
    const labelOp = inkPresence(LABEL_OP, this._paper);
    const col = this._col.array as Float32Array;
    for (let i = 0; i < this._items.length; i++) {
      const s = this._items[i];
      // The front run rides the lead row (whole at rest, gone before its far end reaches the rim);
      // every other stretch reads both boundaries at its own two ends.
      const run = s.front ? frontRunAt(s.x1, this._off) : -1;
      const a0 = run >= 0 ? run : frontAt(s.x0 + this._off) * horizonAt(s.x0 + this._off);
      const a1 = run >= 0 ? run : frontAt(s.x1 + this._off) * horizonAt(s.x1 + this._off);
      col[i * 8 + 3] = dashOp * a0 * alpha;
      col[i * 8 + 7] = dashOp * a1 * alpha;
    }
    if (this._items.length > 0) {
      this._col.clearUpdateRanges();
      this._col.addUpdateRange(0, this._items.length * 8);
      this._col.needsUpdate = true;
    }
    for (const l of this._labels.values()) {
      const x = l.xMid + this._off;
      const a = l.front ? frontRunAt(l.x1, this._off) : frontAt(x) * horizonAt(x);
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = labelOp * a * alpha;
    }
  }

  private _disposeLabel(mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    const m = mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }

  dispose(): void {
    for (const l of this._labels.values()) this._disposeLabel(l.mesh);
    this._labels.clear();
    this._geo.dispose();
    this._mat.dispose();
  }
}
