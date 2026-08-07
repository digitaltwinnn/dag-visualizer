// The global snapshot layer's BYTE BAR (redesign 2026-08-04, spec §4.2): one bar per tick, fixed
// height and depth, WIDTH alone encoding the bytes that tick carried — divided into bands
// proportional to each metagraph's share, in the same order as the lanes above so the ribbons
// between them never cross.
//
// Every band is its own Mesh so it can be picked (a band selects that metagraph + that tick). The
// whole pool is allocated once at construction — SLOT_N x (METAGRAPHS.length + 1) meshes sharing a
// unit box geometry — and each slot's meshes are positioned/scaled or zero-scaled on a tick, never
// per frame.
import * as THREE from "three";
import type { SceneColors } from "../../sceneColors";
import type { PickDescriptor } from "@/src/data/types";
import { METAGRAPHS } from "../../config";
import { BAR_H, BAR_D, BAR_MIN_W, FLOOR_Y } from "../../domain/ledgerLayout";
import { UNLISTED_KEY, type BarSpec } from "../../domain/ledgerBands";
import { SLOT_SP, SLOT_N, slotFade } from "../../domain/ledgerModel";

const BANDS_PER_SLOT = METAGRAPHS.length + 1;

/** The live-tunable bar look (dev `?tune` panel binds these; the values are the shipped look). */
export interface BarTune {
  restOp: number; // a resting band's opacity
  hotOp: number;  // the lead/selected row's bands
  dimOp: number;  // an off-filter band (never removed — spec §5.2)
  seamOp: number; // the unmeasured/empty tick's dashed seam outline
}

export const BAR_TUNE_DEFAULTS: BarTune = {
  restOp: 0.5,
  hotOp: 0.95,
  dimOp: 0.16,
  seamOp: 0.3,
};

interface Slot {
  ordinal: number;
  bands: THREE.Mesh[];
  mats: THREE.MeshBasicMaterial[];
  outline: THREE.LineSegments;
  outMat: THREE.LineBasicMaterial;
  measured: boolean;
  /** True when this slot renders as the seam outline instead of bands — no exact read yet, OR a
   *  measured tick that anchored nothing (bandCount === 0). Both are honest "no bytes to show"
   *  states, distinct from `measured` (which only tracks whether the exact read landed). */
  seam: boolean;
  keys: string[];
  used: number;
}

export class ByteBar {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  tune: BarTune = { ...BAR_TUNE_DEFAULTS };
  private _slots: Slot[] = [];
  private _geo = new THREE.BoxGeometry(1, BAR_H, 1);
  private _outGeo: THREE.BufferGeometry;
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  private _alpha = 0;
  private _filter = "all";
  private _selected = -1;

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.core;
    this._outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR_D, BAR_H, BAR_MIN_W));

    for (let s = 0; s < SLOT_N; s++) {
      const bands: THREE.Mesh[] = [];
      const mats: THREE.MeshBasicMaterial[] = [];
      for (let b = 0; b < BANDS_PER_SLOT; b++) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(this._geo, mat);
        mesh.scale.set(0, 0, 0);
        mesh.visible = false;
        this.group.add(mesh);
        bands.push(mesh);
        mats.push(mat);
      }
      const outMat = new THREE.LineBasicMaterial({ color: this._neutral, transparent: true, opacity: 0 });
      const outline = new THREE.LineSegments(this._outGeo, outMat);
      outline.visible = false;
      this.group.add(outline);
      this._slots.push({
        ordinal: -1, bands, mats, outline, outMat,
        measured: false, seam: true, keys: [], used: 0,
      });
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this._sceneColors = map;
  }

  /** Lay out one tick's bar. Event-time only. */
  setBar(slot: number, ordinal: number, spec: BarSpec | null, pick: PickDescriptor): void {
    const s = this._slots[slot];
    if (!s) return;
    s.ordinal = ordinal;
    s.keys.length = 0;
    const x = -slot * SLOT_SP;
    const y = FLOOR_Y.gl0;

    if (!spec || !spec.measured || spec.bandCount === 0) {
      // No exact read yet, or a measured tick that anchored nothing: the seam outline stands in
      // for the bar either way (the tick still happened; width is never inferred).
      for (let i = 0; i < s.used; i++) { s.bands[i].visible = false; s.bands[i].scale.set(0, 0, 0); }
      s.used = 0;
      s.measured = !!spec && spec.measured;
      s.seam = true;
      s.outline.visible = true;
      s.outline.position.set(x, y, 0); // the seam is centered, like the bar (z0 = -width/2)
      this._syncPickables();
      return;
    }

    s.measured = true;
    s.seam = false;
    s.outline.visible = false;
    const n = spec.bandCount;
    for (let i = 0; i < BANDS_PER_SLOT; i++) {
      const mesh = s.bands[i];
      if (i >= n) { mesh.visible = false; mesh.scale.set(0, 0, 0); continue; }
      const band = spec.bands[i];
      const w = Math.max(0.001, band.z1 - band.z0);
      mesh.visible = true;
      // The bar runs along Z (the lane/width field); X is time, so the box's own X is its depth.
      mesh.scale.set(BAR_D, 1, w);
      mesh.position.set(x, y, band.z0 + w / 2);
      s.mats[i].color.setHex(
        band.key === UNLISTED_KEY ? this._neutral : (this._sceneColors[band.key] ?? this._neutral),
      );
      mesh.userData.pick = pick;
      mesh.userData.bandKey = band.key;
      s.keys.push(band.key);
    }
    s.used = n;
    this._syncPickables();
  }

  setAlpha(a: number): void { this._alpha = a; }
  setFilter(filter: string): void { this._filter = filter; }
  setSelected(slot: number): void { this._selected = slot; }

  update(dt: number): void {
    const k = Math.min(1, dt * 5);
    for (let si = 0; si < this._slots.length; si++) {
      const s = this._slots[si];
      const fade = slotFade(si);
      const hot = si === this._selected || si === 0;
      if (s.seam) {
        // A tick with no exact read yet, OR a measured tick that anchored nothing: the dashed
        // seam outline — honest about the read not having landed (or the tick having carried
        // nothing), never a width inferred from anchor count or fee (spec §6.2).
        const t = this.tune.seamOp * fade * this._alpha;
        s.outMat.opacity += (t - s.outMat.opacity) * k;
        continue;
      }
      for (let i = 0; i < s.used; i++) {
        const key = s.keys[i];
        // A filter never removes a band — the bar keeps its full composition and the committed
        // metagraph's share simply lights (spec §5.2).
        const off = this._filter !== "all" && key !== this._filter;
        const base = off ? this.tune.dimOp : hot ? this.tune.hotOp : this.tune.restOp;
        const t = base * fade * this._alpha;
        s.mats[i].opacity += (t - s.mats[i].opacity) * k;
      }
    }
  }

  private _syncPickables(): void {
    this.pickables.length = 0;
    for (const s of this._slots) {
      for (let i = 0; i < s.used; i++) this.pickables.push(s.bands[i]);
    }
  }

  dispose(): void {
    for (const s of this._slots) {
      for (const m of s.mats) m.dispose();
      s.outMat.dispose();
    }
    this._geo.dispose();
    this._outGeo.dispose();
    this._slots.length = 0;
    this.pickables.length = 0;
  }
}
