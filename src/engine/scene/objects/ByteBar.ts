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
import { snapBright, snapFocusOf, emphasisK } from "../../domain/dimModel";
import type { TuneSchema } from "../../tune";

const BANDS_PER_SLOT = METAGRAPHS.length + 1;

/** The live-tunable bar look. `rest` is the bands' own resting OPACITY — the one number the bar
 *  still keeps of its own, because the tiles' matching `rest` is a colour multiplier and the two
 *  are different quantities. Everything above rest is the shared snapshot vocabulary
 *  (domain/dimModel.ts · snapBright): the off-filter dim, the focus boost and the dim-back are the
 *  ledger row's knobs, the same ones the node chips in the trays answer to. */
export interface BarTune {
  rest: number; // a resting band's opacity
}

// rest user-tuned via ?tune, 2026-08-07. (`hot` retired 2026-08-11 — it was exactly the ledger
// row's `boost`, and a snapshot is data, so it takes the node's focus knob instead.)
export const BAR_TUNE_DEFAULTS: BarTune = { rest: 0.05 };

/** The `?tune` knob ranges (contract: src/engine/tune.ts), colocated with the numbers they bound. */
export const BAR_TUNE_SCHEMA: TuneSchema<BarTune> = {
  rest: { min: 0, max: 1 },
};

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
  /** The SHOWN row — an explicit pin, or the row a live follow is sitting on. It keeps identity hue
   *  down the trail AND owns the focus: how it was reached is not what it is (user, 2026-08-11), so
   *  live and pinned read alike. What is NOT a focus is the bare lead with nothing selected.
   *  A SLOT, so the view re-pushes it every frame — every tick re-slots the trail under it. */
  setSelected(slot: number): void { this._selected = slot; }
  /** The transient hover row — colored-dim preview, never demotes the active row. */
  setHovered(slot: number): void { this._hovered = slot; }
  /** Committed-or-hovered network → the other metagraphs' bands take the COLORED dim (identity hue
   *  at the ledger row's `dim`, the same knob its node chips answer; unlisted dims with them). */
  setFilter(filter: string): void { this._filter = filter || "all"; }

  /** The trail-REWIND offset (LedgerView drives it): the whole bar group slides +X so the
   *  selected row sits at the lead position; rows past the front edge fade in update(). */
  setOffset(off: number): void {
    this._off = off;
    this.group.position.x = off;
  }

  private _entryFade: Float32Array | null = null;
  private _graceSlot = -1;

  /** The tick-handoff grace row (LedgerView drives): its bands keep IDENTITY hue while the
   *  grace lives, so the outgoing lead's colour fades with its ribbon instead of snapping to
   *  the neutral trail the frame it stops leading (user, 2026-08-16). */
  setGraceSlot(si: number): void {
    this._graceSlot = si;
  }

  /** VIEW-ENTRY DROP (user, 2026-08-16 — snapshots are subjects and "drop from an elevated
   *  starting position", as the scene's CLOSING beat after the transition settles): a per-slot
   *  Y lift on every band mesh plus a per-slot brightness fade the opacity loop multiplies in.
   *  Event-frequency in practice — LedgerView drives it only while its entry ramp runs and
   *  parks both at null when settled, so the steady-state frame writes nothing. */
  setEntryDrop(yBySlot: Float32Array | null, fadeBySlot: Float32Array | null): void {
    this._entryFade = fadeBySlot;
    const restY = FLOOR_Y.gl0 + BAR_LIFT + BAR_H / 2;
    for (let si = 0; si < this._slots.length; si++) {
      const lift = yBySlot ? yBySlot[si] : 0;
      const bands = this._slots[si].bands;
      for (const m of bands) m.position.y = restY + lift;
    }
  }

  /** The lead-row BAND anchor for one lane key (user, 2026-08-16 — under a filter the global
   *  callout points at the committed network's own segment of the byte bar, not the bar's
   *  centre). Chamber-local (the group's trail offset folded in); false when the slot carries
   *  no measured band for the key. */
  bandAnchor(slot: number, key: string, out: THREE.Vector3): boolean {
    const s = this._slots[slot];
    if (!s) return false;
    for (let i = 0; i < s.used; i++) {
      if (s.keys[i] !== key) continue;
      const m = s.bands[i];
      if (!m.visible) return false;
      out.copy(m.position);
      out.x += this._off;
      out.y += BAR_H / 2;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    // dimModel.emphasisK: the ONE emphasis-easing rate, shared with the node fabric and the lane
    // tiles. It replaces the local rate this bar used to ease its opacity at (slightly faster now);
    // `k` drives nothing geometric here, only `s.mats[i].opacity`.
    const k = emphasisK(dt);
    // Hoisted once per frame (the tune hoist rule, src/engine/tune.ts): the band loop below
    // reads a local, not a live-struct property per band.
    const rest = this.tune.rest;
    // A focus is a SELECTED row or a hovered one. The bare lead is neither: with nothing selected
    // the chamber is simply running, and stepping the whole trail back against a row it advanced
    // onto by itself would make `back` a second `rest` rather than a focus effect.
    const anyFocus = this._hovered >= 0 || this._selected >= 0;
    for (let si = 0; si < this._slots.length; si++) {
      const s = this._slots[si];
      const x = LEAD_X - si * SLOT_SP + this._off;
      // No depth fade (user, 2026-08-07 — the trail keeps one brightness; recency reads from
      // position + the per-row ordinal labels, not a gradient into the dark). What DOES apply is
      // the HORIZON (user, 2026-08-09): a terminal dissolve at the far boundary, the mirror of
      // the front one below, so no bar floats on glass that has already faded out.
      const fade = horizonAt(x);
      const hot = si === this._selected || si === 0 || si === this._graceSlot;
      const hov = si === this._hovered;
      // The one row that owns the focus (see `anyFocus`) — `_selected` is -1 when none does. Note
      // this is NOT `hot`, which also colours the bare lead: the lead keeps identity hue whether or
      // not it is selected, but hue is the chamber's own reading and never lifts brightness.
      const pinned = si === this._selected;
      // Rows the rewind pushed past the front edge dissolve within one slot of travel.
      const over = (x - LEAD_X) / (SLOT_SP * 0.9);
      const front = over <= 0 ? 1 : Math.max(0, 1 - over);
      for (let i = 0; i < s.used; i++) {
        // Brightness is the node vocabulary (snapBright); COLOUR is the chamber's own independent
        // reading — the shown row, a hover preview and the committed network's own bands carry
        // identity hue all the way down the trail, everything else stays the neutral trail.
        const offNet = this._filter !== "all" && s.keys[i] !== this._filter;
        const onNet = !hot && !hov && this._filter !== "all" && s.keys[i] === this._filter;
        // The BOOST answers the SELECTION, not the front position (user, 2026-08-11): the bare
        // lead is simply where the chamber is running, already named by its place at the front edge
        // and by keeping identity hue, so lifting it automatically made `boost` a second `rest` and
        // left a hover with nothing to add. A live follow's row IS selected, so it reads exactly
        // like a pin — how the selection was reached is not what it is. And the focus is the ROW's,
        // while a row holds every network's bytes: under a committed filter it reaches that
        // network's band alone (`snapFocusOf`), or the undimmed boost would lift the very bands the
        // dim is there to push behind it.
        const focus = snapFocusOf(pinned, hov, offNet);
        // `back` is the ROW's answer, so the focused row never steps back — its OFF-FILTER bands
        // included (user, 2026-08-11): they take the dim alone, the same tier the RIBBON landing on
        // this band takes, so a ribbon and its two endpoints read at one level. Compounding
        // dim × back left a band near-black under a ribbon that was only gently dimmed.
        const rowFocus = pinned || hov;
        const t = snapBright(rest, offNet, focus, anyFocus && !rowFocus)
          * fade * front * this._alpha * (this._entryFade ? this._entryFade[si] : 1);
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
