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
import { BAR_H, BAR_D, BAR_LIFT, FLOOR_Y, LEAD_X } from "../../domain/ledgerLayout";
import { type BarSpec } from "../../domain/ledgerBands";
import { SLOT_SP, SLOT_N, horizonAt } from "../../domain/ledgerModel";
import { offNetMul } from "../../domain/dimModel";
import type { TuneSchema } from "../../tune";

const BANDS_PER_SLOT = METAGRAPHS.length + 1;

/** The live-tunable bar look — the SAME parameter vocabulary as the tiles' TileTune (user,
 *  2026-08-07: the two snapshot instruments share one tuning language; no blueprint needed,
 *  the shared names ARE the reuse). Values are the shipped look. */
export interface BarTune {
  hot: number;  // the lead/selected row's bands
  rest: number; // a resting band's opacity
}

// hot/rest user-tuned via ?tune, 2026-08-07. (The off-filter dim was removed entirely the same
// day — a committed filter changes the CAMERA, never the bar.)
export const BAR_TUNE_DEFAULTS: BarTune = { hot: 0.7, rest: 0.05 };

/** The `?tune` knob ranges (contract: src/engine/tune.ts), colocated with the numbers they bound. */
export const BAR_TUNE_SCHEMA: TuneSchema<BarTune> = {
  hot: { min: 0, max: 1 },
  rest: { min: 0, max: 1 },
};

/** The HOVER-preview tier (user, 2026-08-07): a hovered snapshot row shows its identity
 *  colours at this fraction of the hot level — the ACTIVE row stays fully coloured, the
 *  preview reads as "this is what a click pins". Deliberately the OFF-FILTER dim's family
 *  (the ledger's `elem` knob, 0.2), a bit brighter — one dim language, two nearby levels. Shared
 *  with the tiles and the hover ribbon row. */
export const SNAP_PREVIEW = 0.3;

/** The COMMITTED-NETWORK resting tier (user, 2026-08-09 — "when a metagraph is selected, give
 *  all the blocks their real metagraph color and not the neutral cyan"): with a filter committed,
 *  that network's OWN bands and lane tiles keep their identity hue down the WHOLE trail, not just
 *  on the hot row — the committed story reads as one coloured thread through the chamber while
 *  every other network's resting rows stay the neutral trail. Expressed as a fraction of `hot`,
 *  like the preview tier; it sits BELOW the preview (a hover still previews louder than a
 *  standing commitment) and above the neutral rest, which `dimTiers.test.ts` pins. Shared by the
 *  bar and the tiles. */
export const SNAP_ONNET = 0.17;

interface Slot {
  ordinal: number;
  bands: THREE.Mesh[];
  mats: THREE.MeshBasicMaterial[];
  measured: boolean;
  keys: string[];
  /** Per-band identity hex, parallel to `keys` — update() picks identity vs neutral per frame. */
  colors: number[];
  used: number;
}

export class ByteBar {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  tune: BarTune = { ...BAR_TUNE_DEFAULTS };
  private _slots: Slot[] = [];
  private _geo = new THREE.BoxGeometry(1, BAR_H, 1);
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  private _alpha = 0;
  private _selected = -1;
  private _hovered = -1;
  private _off = 0;
  private _filter = "all";

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.core;

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
      this._slots.push({
        ordinal: -1, bands, mats,
        measured: false, keys: [], colors: [], used: 0,
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
    s.colors.length = 0;
    const x = LEAD_X - slot * SLOT_SP;
    // Bottom just above the plane (user, 2026-08-07) — the box is centred, so lift by half height.
    const y = FLOOR_Y.gl0 + BAR_LIFT + BAR_H / 2;

    if (!spec || !spec.measured || spec.bandCount === 0) {
      // No exact read yet, or a measured tick that anchored nothing: draw NOTHING (the dashed
      // seam outline is retired, user 2026-08-07 — the per-row ordinal label already marks that
      // the tick happened; width is still never inferred from anchor count or fee).
      for (let i = 0; i < s.used; i++) { s.bands[i].visible = false; s.bands[i].scale.set(0, 0, 0); }
      s.used = 0;
      s.measured = !!spec && spec.measured;
      this._syncPickables();
      return;
    }

    s.measured = true;
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
      const identityHex =
        // The scene-color map carries EVERY drawable id incl. the unlisted gray (Engine's
        // sceneColorsFor, 2026-08-08 — the old UNLISTED_KEY→neutral branch made unlisted cyan).
        this._sceneColors[band.key] ?? this._neutral;
      s.mats[i].color.setHex(identityHex);
      mesh.userData.pick = pick;
      mesh.userData.bandKey = band.key;
      s.keys.push(band.key);
      s.colors.push(identityHex);
    }
    s.used = n;
    this._syncPickables();
  }

  setAlpha(a: number): void { this._alpha = a; }
  setSelected(slot: number): void { this._selected = slot; }
  /** The transient hover row — colored-dim preview, never demotes the active row. */
  setHovered(slot: number): void { this._hovered = slot; }
  /** Committed-or-hovered network → the other metagraphs' bands take the COLORED dim
   *  (identity hue at the ledger's `elem` strength; the unlisted band dims with them). */
  setFilter(filter: string): void { this._filter = filter || "all"; }

  /** The trail-REWIND offset (LedgerView drives it): the whole bar group slides +X so the
   *  selected row sits at the lead position; rows past the front edge fade in update(). */
  setOffset(off: number): void {
    this._off = off;
    this.group.position.x = off;
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 5);
    // Hoisted per frame (the tune hoist rule): one read for every slot's every band.
    const offMul = offNetMul("ledger");
    for (let si = 0; si < this._slots.length; si++) {
      const s = this._slots[si];
      const x = LEAD_X - si * SLOT_SP + this._off;
      // No depth fade (user, 2026-08-07 — the trail keeps one brightness; recency reads from
      // position + the per-row ordinal labels, not a gradient into the dark). What DOES apply is
      // the HORIZON (user, 2026-08-09): a terminal dissolve at the far boundary, the mirror of
      // the front one below, so no bar floats on glass that has already faded out.
      const fade = horizonAt(x);
      const hot = si === this._selected || si === 0;
      const hov = !hot && si === this._hovered;
      // Rows the rewind pushed past the front edge dissolve within one slot of travel.
      const over = (x - LEAD_X) / (SLOT_SP * 0.9);
      const front = over <= 0 ? 1 : Math.max(0, 1 - over);
      for (let i = 0; i < s.used; i++) {
        // Four tiers: the ACTIVE row (lead/pinned) full identity, the HOVERED row identity at
        // the preview fraction (a colored dim — the active never demotes for a hover), the
        // COMMITTED NETWORK's own bands at the on-net resting tier so its thread stays its own
        // colour all the way down the trail, everything else the neutral trail. A committed or
        // hovered NETWORK additionally dims the other networks' bands in their own hue.
        const offNet = this._filter !== "all" && s.keys[i] !== this._filter;
        const onNet = !hot && !hov && this._filter !== "all" && s.keys[i] === this._filter;
        const base = hot
          ? this.tune.hot
          : hov
            ? this.tune.hot * SNAP_PREVIEW
            : onNet
              ? this.tune.hot * SNAP_ONNET
              : this.tune.rest;
        const t = base * fade * front * (offNet ? offMul : 1) * this._alpha;
        s.mats[i].opacity += (t - s.mats[i].opacity) * k;
        s.mats[i].color.setHex(hot || hov || onNet ? s.colors[i] : this._neutral);
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
    }
    this._geo.dispose();
    this._slots.length = 0;
    this.pickables.length = 0;
  }
}
