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
import { isLightGround, inkPresence, type SceneColors } from "../../sceneColors";
import type { PickDescriptor } from "@/src/data/types";
import { METAGRAPHS } from "@/src/net/current";
import { BAR_H, BAR_D, BAR_LIFT, FLOOR_Y, LEAD_X } from "../../domain/ledgerLayout";
import { type Band, type BarSpec } from "../../domain/ledgerBands";
import { SLOT_SP, SLOT_N, horizonAt, frontAt, rowOnChamber } from "../../domain/ledgerModel";
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

// rest user-tuned via ?tune, 2026-08-07; raised 0.05 → 0.12 (user, 2026-08-16): under a committed
// filter an off-filter band answered `rest × (1 − dim)` = 0.025 opacity — invisible beside the
// ribbon LANDING on it (0.85 × 0.5 additive), a 30× gap to the boosted band in the same bar. The
// base was below the range any multiplicative dim can survive; the dim knob itself is untouched.
// (`hot` retired 2026-08-11 — it was exactly the ledger
// row's `boost`, and a snapshot is data, so it takes the node's focus knob instead.)
export const BAR_TUNE_DEFAULTS: BarTune = { rest: 0.12 };

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
  /** SEED (user, 2026-08-16; widened to every unmeasured row 2026-08-18): this row has no
   *  measurement, so it draws the flush seed instead of a bar. HEIGHT is what says a measurement
   *  exists — lying in the glass the seed makes no width claim, which is what lets its footprint
   *  be nominal (ledgerBands.ts forbids inferring a width from anchor count or fee). It GROWS
   *  into the measured bands when a read lands (`grow`/`rise` ease 0→1 over the stored targets). */
  forming: boolean;
  /** MUTED (user, 2026-08-18): the LIVE EDGE is naming this tick, so the slot draws nothing at
   *  all. A tick whose read is in flight is not a row yet — it has no measurement and, under a
   *  filtered follow, no honest place in the trail either, since the rewind holds the network's
   *  own newest anchored tick at the lead. It is stated once, as the chamber's boundary with now
   *  (scene/objects/LiveEdge.ts). `forming` stays TRUE underneath, so when the read lands the row
   *  still RISES into its bands: the arrival beat is what the seed was for, and it survives. */
  mute: boolean;
  grow: number;
  /** Companion to `grow` for the seed's HEIGHT, eased 0→1 on its own so it needs no record of
   *  where `grow` started. 1 for a bar that was never a seed. */
  rise: number;
  tz: number[]; // per-band target z-centre (measured layout)
  tw: number[]; // per-band target width
}

// The SEED's fixed footprint — nominal, deliberately unrelated to any byte count (it lies flush,
// so it isn't a bar and claims no width; the tone and the beat say which absence it is).
export const SEED_W = 1.3;
// …and its height, as a fraction of the bar's (user, 2026-08-18: the seed "sits in front of the
// plane rather than within"). At full BAR_H the seed was a near-cube — 1.6 deep, 0.9 tall, 1.3
// wide — standing proud of the floor beside a trail of long flat bars, so it read as an object
// placed in front of the plane rather than as the row that is coming. Flush in the glass it reads
// as the row's own footprint, and the read landing then RISES it into the bar: the transform is
// the arrival, which is the whole point of having a seed instead of an empty slot.
const SEED_H = 0.14;
/** A seed's opacity — every DRAWN seed is a standby one now (a read genuinely in flight is stated
 *  by the live edge instead), so there is one level: above a resting band's `rest`, quiet enough
 *  to read as a row whose measurement is missing rather than as one that has it. */
const SEED_STILL_OP = 0.22;
/** The seed→bar height ramp, shared by the event-time write and the per-frame ease. */
const riseScaleY = (rise: number): number => SEED_H + (1 - SEED_H) * rise;
/** Box geometry is centred, so a bar of height `BAR_H * sy` sits on the floor at half that up. */
const riseY = (sy: number): number => FLOOR_Y.gl0 + BAR_LIFT + (BAR_H * sy) / 2;

/** The SEAM's one synthetic band (a measured tick that anchored nothing has no real band, but
 *  rides the same write path). Module-scoped so the event-time write allocates nothing. */
const _seamBand: Band = { key: "", z0: 0, z1: 0, bytes: 0 };

export class ByteBar {
  group = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  tune: BarTune = { ...BAR_TUNE_DEFAULTS };
  private _slots: Slot[] = [];
  private _geo = new THREE.BoxGeometry(1, BAR_H, 1);
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  /** GROUND, hoisted at event time — the band loop reads a boolean, never re-derives luminance. */
  private _paper: boolean;
  private _alpha = 0;
  private _selected = -1;
  private _hovered = -1;
  private _off = 0;
  private _filter = "all";

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._sceneColors = sceneColors;
    this._neutral = colors.core;
    this._paper = isLightGround(colors);

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
        forming: false, mute: false, grow: 1, rise: 1, tz: [], tw: [],
      });
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this._sceneColors = map;
  }

  /** THEME FLIP — `_neutral` is the one threaded colour this module captures at construction. It is
   *  consumed per FRAME (the trail's neutral bands, the seam's synthetic band), so re-pointing the
   *  field is the whole retint; nothing here is baked. */
  setColors(c: SceneColors): void {
    this._neutral = c.core;
    this._paper = isLightGround(c);
  }

  /** Lay out one tick's bar. Event-time only. `live` says the LIVE EDGE is naming this tick, so
   *  the slot draws nothing and offers nothing to pick — the chamber states an in-flight read once,
   *  at its boundary with now, not twice. */
  setBar(slot: number, ordinal: number, spec: BarSpec | null, pick: PickDescriptor, live = false): void {
    const s = this._slots[slot];
    if (!s) return;
    // Captured BEFORE the write, so the measured branch below can tell a first measurement from a
    // rebuild of a row it is already animating.
    const prevOrd = s.ordinal;
    const wasMeasured = s.measured;
    s.ordinal = ordinal;
    s.keys.length = 0;
    s.colors.length = 0;
    const x = LEAD_X - slot * SLOT_SP;

    if (!spec) {
      // A slot the trail has never populated — nothing happened here, so nothing is drawn.
      for (let i = 0; i < s.used; i++) { s.bands[i].visible = false; s.bands[i].scale.set(0, 0, 0); }
      s.measured = false; s.forming = false; s.mute = false;
      s.grow = 1; s.rise = 1; s.used = 0;
      this._syncPickables();
      return;
    }

    if (!spec.measured) {
      // NO MEASUREMENT — and that is an instrument state, not blank floor (user, 2026-08-18:
      // "it shows a snapshot in that view which can't be drawn … now it's just empty").
      //
      // ONE RULE: HEIGHT says whether a measurement exists, WIDTH says how big it is. The seed
      // lies flush in the glass, so it is not a bar and makes no width claim — which is what
      // lets its footprint be nominal (ledgerBands.ts forbids inferring a width from anchor
      // count or fee). When the read lands, the row RISES into its bands.
      //
      // Every seed DRAWN here is a standby one: a read that failed or was never taken, sitting
      // still, because nothing is arriving. The row stays PICKABLE, since selecting an unread tick
      // is what asks for its read. A read genuinely IN FLIGHT is `live` — the live edge is already
      // naming that tick at the chamber's boundary with now, so the slot stays MUTE rather than
      // claiming a second place for it. `forming` stays true underneath either way, so the read
      // landing still RISES the row into its bands.
      for (let i = 1; i < s.used; i++) { s.bands[i].visible = false; s.bands[i].scale.set(0, 0, 0); }
      s.measured = false;
      s.forming = true;
      s.mute = live;
      s.grow = 1;
      s.rise = 0;
      const mesh = s.bands[0];
      const sy = riseScaleY(0);
      mesh.visible = !live;
      mesh.scale.set(BAR_D, sy, SEED_W);
      mesh.position.set(x, riseY(sy), 0);
      s.mats[0].color.setHex(this._neutral);
      mesh.userData.pick = pick;
      mesh.userData.bandKey = "";
      s.used = 1;
      this._syncPickables();
      return;
    }

    const wasForming = s.forming;
    s.forming = false;
    s.mute = false;
    s.measured = true;
    // THE SEAM: a measured tick that anchored NOTHING. ledgerBands.ts specifies a minimum-width
    // bar for it — the tick provably happened and provably carried nothing, which is a fact, not
    // an absence — so it draws at full height like any measurement, in one neutral band. It rides
    // the real write path (grow/rise, dim, pick) through one synthetic band.
    const seam = spec.bandCount === 0;
    if (seam) { _seamBand.z0 = spec.z0; _seamBand.z1 = spec.z0 + spec.width; }
    const n = seam ? 1 : spec.bandCount;
    // GROW-IN (user, 2026-08-16): a bar that was forming animates from the forming footprint
    // into its measured width — the resize IS the "now it's a fact" signal. update() eases
    // `grow`/`rise` to 1 and re-derives each band from the targets stored here.
    //
    // A rebuild of a row that is ALREADY animating must not restart or truncate it (user,
    // 2026-08-18 — "it should be used to transform into the real snapshot"). `_rebuildAllSlots`
    // re-runs on every poll and exact-read arrival, so the measured write landed 2-4 more times
    // within the ~0.4s ramp, and each re-entry took the `: 1` arm and snapped the bar to full
    // width. The morph was built, fired correctly, and then was never seen. Same ordinal, still
    // mid-ramp ⇒ carry the running values through instead of re-deriving them.
    const continuing = !wasForming && wasMeasured && prevOrd === ordinal && (s.grow < 1 || s.rise < 1);
    if (wasForming) {
      s.grow = Math.min(1, Math.max(0.08, SEED_W / Math.max(0.001, spec.width)));
      s.rise = 0;
    } else if (!continuing) {
      s.grow = 1;
      s.rise = 1;
    }
    const sy = riseScaleY(s.rise);
    const y = riseY(sy);
    s.tz.length = 0;
    s.tw.length = 0;
    for (let i = 0; i < BANDS_PER_SLOT; i++) {
      const mesh = s.bands[i];
      if (i >= n) { mesh.visible = false; mesh.scale.set(0, 0, 0); continue; }
      const band = seam ? _seamBand : spec.bands[i];
      const w = Math.max(0.001, band.z1 - band.z0);
      const cz = band.z0 + w / 2;
      s.tz.push(cz);
      s.tw.push(w);
      mesh.visible = true;
      // The bar runs along Z (the lane/width field); X is time, so the box's own X is its depth.
      mesh.scale.set(BAR_D, sy, w * s.grow);
      mesh.position.set(x, y, cz * s.grow);
      const identityHex = seam
        // The seam has no contributor to be coloured by — it is the tick itself, so it takes the
        // neutral trail colour, the same tone the seed states an absent measurement in.
        ? this._neutral
        // The scene-color map carries EVERY drawable id incl. the unlisted gray (Engine's
        // sceneColorsFor, 2026-08-08 — the old UNLISTED_KEY→neutral branch made unlisted cyan).
        : (this._sceneColors[band.key] ?? this._neutral);
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
    // The offset is what carries a row over a boundary, so it is also what can change the PICK set
    // (`rowOnChamber`). Nine predicate calls per frame, and the list is only rebuilt when the span
    // actually moves — a rebuild every frame would be a per-frame allocation for a set that changes
    // once a tick.
    if (this._refreshOnSpan()) this._syncPickables();
  }

  private _onFirst = 0;
  private _onLast = SLOT_N - 1;

  /** Re-derive the span of slots still on the chamber; true when it moved. Contiguous by
   *  construction — x falls monotonically with the slot index and each boundary is one-sided — so a
   *  first/last pair describes it exactly. −1/−1 means nothing is on (the pick set empties). */
  private _refreshOnSpan(): boolean {
    let first = -1;
    let last = -1;
    for (let si = 0; si < this._slots.length; si++) {
      if (!rowOnChamber(LEAD_X - si * SLOT_SP + this._off)) continue;
      if (first < 0) first = si;
      last = si;
    }
    if (first === this._onFirst && last === this._onLast) return false;
    this._onFirst = first;
    this._onLast = last;
    return true;
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
    for (let si = 0; si < this._slots.length; si++) {
      const s = this._slots[si];
      const lift = yBySlot ? yBySlot[si] : 0;
      // Read the slot's own rest height rather than assuming a full bar: a SEED lies flush, so a
      // hardcoded full-height rest Y would lift it clear of the floor it is supposed to lie in.
      const base = riseY(riseScaleY(s.forming ? 0 : s.rise));
      for (const m of s.bands) m.position.y = base + lift;
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
      // SEED: no measurement here, so nothing in the normal band loop applies. It sits STILL,
      // because nothing is arriving — a read genuinely in flight is `mute` here and stated by the
      // live edge instead. It takes BOTH trail boundaries like any other row: a seed is a row too,
      // and skipping the front dissolve is what left forming blocks hanging off the glass under a
      // filtered follow (see `frontAt`).
      if (s.forming) {
        const fade0 = horizonAt(x) * frontAt(x) * (this._entryFade ? this._entryFade[si] : 1);
        s.mats[0].opacity = inkPresence(s.mute ? 0 : SEED_STILL_OP, this._paper) * fade0 * this._alpha;
        s.mats[0].color.setHex(this._neutral);
        continue;
      }
      // GROW-IN: ease a just-measured bar from the forming seed to its stored targets — outward
      // in Z (the width becoming a fact) and upward in Y (the seed rising out of the glass it lay
      // flush in). Both run on the same ~0.4s ramp so the bar arrives as one movement.
      if (s.grow < 1 || s.rise < 1) {
        // ~0.4s to full (user, 2026-08-16, round 2 — the bar was TRAILING its own ribbons,
        // which ease in over 0.65s: the bar now lands first, the sheets bloom onto it).
        const step = Math.min(1, dt * 4.5);
        s.grow = Math.min(1, s.grow + (1 - s.grow) * step + dt * 0.25);
        s.rise = Math.min(1, s.rise + (1 - s.rise) * step + dt * 0.25);
        const sy = riseScaleY(s.rise);
        const y = riseY(sy);
        for (let i = 0; i < s.used; i++) {
          s.bands[i].scale.y = sy;
          s.bands[i].scale.z = s.tw[i] * s.grow;
          s.bands[i].position.y = y;
          s.bands[i].position.z = s.tz[i] * s.grow;
        }
      }
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
      const front = frontAt(x);
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
        // On paper the resting opacities ARE the wash, so the EMPHASIS term is translated for the
        // ground before the dissolves multiply it (inkPresence — order-preserving, dark unchanged).
        const t = inkPresence(snapBright(rest, offNet, focus, anyFocus && !rowFocus), this._paper)
          * fade * front * this._alpha * (this._entryFade ? this._entryFade[si] : 1);
        s.mats[i].opacity += (t - s.mats[i].opacity) * k;
        s.mats[i].color.setHex(hot || hov || onNet ? s.colors[i] : this._neutral);
      }
    }
  }

  private _syncPickables(): void {
    this.pickables.length = 0;
    if (this._onFirst < 0) return; // the whole trail is off the chamber
    for (let si = this._onFirst; si <= this._onLast; si++) {
      const s = this._slots[si];
      if (!s || s.mute) continue; // invisible must mean unpickable — the raycaster ignores `visible`
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
