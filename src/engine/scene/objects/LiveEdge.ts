// The LIVE EDGE — the chamber's boundary with NOW (user, 2026-08-18: "what if we don't show an
// actual snapshot for [forming], but instead a dim line in front of the snapshots with some
// relevant info about what's happening, to indicate it's forming, live, filtered").
//
// The rationale is in `domain/ledgerModel.ts` beside LIVE_X; what this adapter owns is the ink.
// Three properties make it an instrument state rather than a snapshot:
//
//  - it LIES FLUSH in the glass at seed height and runs WIDER than any bar can ever reach
//    (`PLANE_FIELD_HALF`, past `BAR_MAX_W`), so it makes no width claim — ledgerBands.ts forbids
//    inferring a width from anchor count or fee, and here there is no measurement at all yet;
//  - it is NOT PICKABLE and holds no pickables array, because there is no snapshot there to
//    select;
//  - it takes the committed network's identity HUE, which is how it says "filtered" without a
//    word — colour is identity, brightness is emphasis, the chamber's own second reading.
//
// It carries NO LABEL, and that is a measured decision rather than an omission. A `forming <ord>`
// name was built and cut the same day (2026-08-18): the strip it would occupy is ~10px tall at the
// resting pose and already holds the floor's front rim, the floor's own `GLOBAL SNAPSHOTS` name
// and the lead bar's bloom, so the words washed out against the rim. The same review that removed
// hyper's hub tickers applies — furniture labels are sparse by review, and here the line's own
// behaviour already says everything the words would: BREATHING is forming, STILL is standby, and
// the hue is the committed filter. Words about the live tick live in the HUD, which is where the
// global snapshot card already ticks its age.
import * as THREE from "three";
import { BAR_H, BAR_LIFT, FLOOR_Y, PLANE_FIELD_HALF } from "../../domain/ledgerLayout";
import { LIVE_X, type LiveEdgePhase } from "../../domain/ledgerModel";

/** The line's own thickness in X (depth). Thin enough to read as a rule rather than a slab. */
const EDGE_D = 0.13;
/** Its height off the floor — the SEED's height, because it stands for the same thing: a tick
 *  with no measurement yet. `SEED_H` is a fraction of BAR_H in ByteBar; this is that product. */
const EDGE_H = 0.14 * BAR_H;

/** Resting opacity while a read is in flight — the calm beat, as the cards' acquiring stars. */
const BREATHE_BASE = 0.3;
const BREATHE_AMP = 0.12;
const BREATHE_RATE = 2.4;
/** Standby: still and dimmer than the seed's own 0.22, because this line's area is far larger. */
const STILL_OP = 0.14;

export class LiveEdge {
  /** Mounted straight into the view root, NEVER into a group the rewind offsets: the edge marks
   *  now, and now does not slide with the trail. */
  readonly group = new THREE.Group();

  private _mat: THREE.MeshBasicMaterial;
  private _geo: THREE.BoxGeometry;

  private _phase: LiveEdgePhase = "off";
  private _alpha = 0;
  private _t = 0;

  constructor() {
    this._geo = new THREE.BoxGeometry(EDGE_D, EDGE_H, 2 * PLANE_FIELD_HALF);
    this._mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(this._geo, this._mat);
    mesh.position.set(LIVE_X, FLOOR_Y.gl0 + BAR_LIFT + EDGE_H / 2, 0);
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  /** Event-time: what the edge is saying. */
  setState(phase: LiveEdgePhase): void {
    this._phase = phase;
  }

  /** The committed network's identity hue, or the chamber's neutral core when the filter is all. */
  setHue(hex: number): void {
    this._mat.color.setHex(hex);
  }

  setAlpha(a: number): void {
    this._alpha = a;
  }

  update(dt: number): void {
    this._t += dt;
    const e =
      this._phase === "off"
        ? 0
        : this._phase === "forming"
          ? BREATHE_BASE + BREATHE_AMP * Math.sin(this._t * BREATHE_RATE)
          : STILL_OP;
    this._mat.opacity = e * this._alpha;
  }

  dispose(): void {
    this._geo.dispose();
    this._mat.dispose();
  }
}
