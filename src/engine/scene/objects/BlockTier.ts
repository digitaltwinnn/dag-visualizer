// THE BLOCK TIER — the Blocks register's one new storey of marks in the Snapshots chamber
// (`docs/superpowers/specs/2026-11-05-block-dag-view-design.md`, "Where a block sits").
//
// A block stands on the snapshot that accepted it: a DAG block on its global tick at the floor, a
// token block on its metagraph snapshot's tile. Links run block to block, child to each parent the
// window holds. This adapter owns the marks and nothing about WHERE they go: `LedgerView` places
// every block from layout data (the slot, the tile, the braid lane) and hands the positions in at
// event time; the per-frame body only resolves brightness, the two trail boundaries and the entry
// drop, and writes every live instance.
//
// ⚠️ THE MARKS ARE OPAQUE AND DEPTH-WRITING, like the lane tiles they stand on, so a dissolved row
// ZERO-SCALES (it must not linger as a black or ground-coloured cube — the tile rule, user
// 2026-08-11). Instances past `count` are not drawn at all, so a rebuild that holds fewer blocks
// leaves no stale slot behind.
//
// A block has ONE resting look (user, design round D5: no open tips anywhere — "don't" breathe
// them); a hovered or committed block takes the snapshots' emphasis on top of it.

import * as THREE from "three";
import { frontAt, horizonAt, SLOT_N, SLOT_SP } from "../../domain/ledgerModel";
import { LEAD_X } from "../../domain/ledgerLayout";
import { snapBright, emphasisK } from "../../domain/dimModel";
import { LINK_SAMPLES, sCurve } from "../../domain/blockBraid";
import { glowBlend, inkMix, inkPresence, isLightGround, type SceneColors } from "../../sceneColors";
import type { PickDescriptor } from "@/src/data/types";
import { joinBloom } from "../SceneContext";

/** One block, placed by the view (chamber-local, before the rewind offset). */
export interface BlockItem {
  hash: string;
  /** "dag" or the metagraph id — the lens the coloured dim reads. */
  chain: string;
  x: number;
  y: number;
  z: number;
  /** The chain's identity colour, as the tiles resolve it. */
  hue: number;
  /** The trail slot it rides — the entry drop is per slot. */
  slot: number;
  /** Edge length of the cube. */
  size: number;
  /** What a click on it commits; null leaves it drawn but not pickable. */
  pick: PickDescriptor | null;
}

/** The block mark's look: its resting brightness (a multiplier on the identity hue, the tiles'
 *  `rest` idiom), the paper ink floor, the focus swell, the links. */
export interface BlockLook {
  /** The resting block. */
  rest: number;
  /** Paper only: how far a block may thin before it stops being a mark (`TileLook.ink`'s twin). */
  ink: number;
  /** The hovered or committed block's swell. */
  grow: number;
  /** A link's resting opacity, per ground — every reference is drawn AT REST, always (user, D2:
   *  "draw it always"). Dark 0.8, paper 0.92 (user, 2026-11-07: "make the lines from block to its
   *  children more visible / stand out more" — at 0.42 / 0.7 the hairline read as a ghost beside the
   *  blocks it ties; a line is one pixel wide whatever its alpha, so alpha is the lever). */
  link: number;
  linkPaper: number;
}

export const BLOCK_LOOK: Readonly<BlockLook> = { rest: 0.6, ink: 0.35, grow: 0.35, link: 0.8, linkPaper: 0.92 };

/** THE DAG BLOCK'S GLASS (user, design round D1: "the block should match the transparent / cyan
 *  snapshot color"): the global snapshot's own material — normal-blended, translucent, no depth
 *  write, in the chamber's neutral cyan (`SceneColors.core`, the bar's `_neutral`) — at a presence
 *  per ground. Dark 0.5: a block is a SUBJECT, so it stands above the bars' resting 0.12 the way a
 *  focused band does. Paper 0.85: on the sheet the instance colour is already thinned toward the
 *  ground (`inkMix`), and at 0.55 the cubes read as pale ghosts beside the bars (seen live, D1). */
export const BLOCK_GLASS: Readonly<{ dark: number; paper: number }> = { dark: 0.5, paper: 0.85 };

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
/** Event-time scratch: one link's sampled S-curve, (LINK_SAMPLES + 1) points. */
const _curve = new Float32Array((LINK_SAMPLES + 1) * 3);

export class BlockTier {
  /** Rides the trail rewind: the view writes its offset once per frame (`setOffset`). */
  readonly group = new THREE.Group();
  /** The block mesh — the view lists it among its pickables in the Blocks register only. */
  readonly mesh: THREE.InstancedMesh;

  private readonly _max: number;
  private _items: BlockItem[] = [];
  private readonly _picks: (PickDescriptor | null)[];
  /** Eased brightness per instance, carried across a rebuild by hash (a rebuild reorders). */
  private readonly _bright: Float32Array;
  private _index = new Map<string, number>();
  private _hov = -1;
  private _sel = -1;
  private _hovHash: string | null = null;
  private _selHash: string | null = null;
  private _dimNet = "all";
  private _off = 0;
  private _colors: SceneColors;
  private _paper: boolean;
  private _entryDrop: Float32Array | null = null;
  private _entryFade: Float32Array | null = null;

  // ── links: one LineSegments, positions written at event time, alpha per frame (the threads' idiom)
  private readonly _maxLinks: number;
  private readonly _linkGeo = new THREE.BufferGeometry();
  private readonly _linkPos: THREE.Float32BufferAttribute;
  private readonly _linkCol: THREE.Float32BufferAttribute;
  private readonly _linkMat: THREE.LineBasicMaterial;
  private _linkChain: string[] = [];
  /** Each link end's ROW (the slot of the block it ends on), resolved at event time. */
  private readonly _linkSlot: Int16Array;
  private _linkCount = 0;

  /** The DAG's tier wears the snapshot glass (`BLOCK_GLASS`); a token tier is opaque, like its tile. */
  private readonly _glass: boolean;
  private readonly _mat: THREE.MeshBasicMaterial;

  constructor(colors: SceneColors, opts: { glass?: boolean; maxBlocks?: number } = {}) {
    const maxBlocks = opts.maxBlocks ?? 600;
    this._glass = opts.glass ?? false;
    this._max = maxBlocks;
    this._colors = colors;
    this._paper = isLightGround(colors);
    this._picks = new Array(maxBlocks).fill(null);
    this._bright = new Float32Array(maxBlocks);

    this._mat = this._glass
      ? new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: this._glassOp() })
      : new THREE.MeshBasicMaterial({});
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this._mat, maxBlocks);
    // Bounds three cannot reject with: the blocks ride the rewind and are pickable (NodeFabric.openBounds).
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < maxBlocks; i++) this.mesh.setColorAt(i, _col.set(0xffffff));
    this.mesh.count = 0;
    this.mesh.userData.picks = this._picks;
    joinBloom(this.mesh); // identity marks, like the lane tiles they stand on
    this.group.add(this.mesh);

    // Two parents per block: a link budget of twice the blocks.
    this._maxLinks = maxBlocks * 2;
    this._linkSlot = new Int16Array(this._maxLinks * 2);
    // Each link is an S-curve of LINK_SAMPLES segments (`blockBraid.sCurve`): 2 vertices a segment.
    this._linkPos = new THREE.Float32BufferAttribute(new Float32Array(this._maxLinks * LINK_SAMPLES * 6), 3);
    this._linkCol = new THREE.Float32BufferAttribute(new Float32Array(this._maxLinks * LINK_SAMPLES * 8), 4);
    this._linkPos.setUsage(THREE.DynamicDrawUsage);
    this._linkCol.setUsage(THREE.DynamicDrawUsage);
    this._linkGeo.setAttribute("position", this._linkPos);
    this._linkGeo.setAttribute("color", this._linkCol);
    this._linkGeo.setDrawRange(0, 0);
    // A line, and out of the bloom layer: a relation between two marks, never a mark of its own.
    this._linkMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: glowBlend(colors),
    });
    const lines = new THREE.LineSegments(this._linkGeo, this._linkMat);
    lines.frustumCulled = false;
    this.group.add(lines);
  }

  /** How many blocks are drawn — 0 is the cleared tier. */
  get count(): number {
    return this.mesh.count;
  }

  /** EVENT-TIME: the blocks the window holds, placed, and their links (`blockBraid.referenceSegments`,
   *  6 floats a segment) with each END's row (`linkSlots`, 2 a segment — the trail boundaries are
   *  asked at a row's x; −1 is a STUB's far end, off the trail, which fades out to nothing) and each segment's chain and colour (a link never crosses chains: a
   *  block's parents are its own chain's). */
  rebuild(items: BlockItem[], links: Float32Array, linkSlots: readonly number[], linkChains: readonly string[], linkHues: readonly number[]): void {
    const prev = new Map<string, number>(); // event-time
    for (const [h, i] of this._index) prev.set(h, this._bright[i]);
    const n = Math.min(items.length, this._max);
    this._items = items.slice(0, n); // event-time
    this._index = new Map(); // event-time
    for (let i = 0; i < n; i++) {
      const it = this._items[i];
      this._index.set(it.hash, i);
      this._picks[i] = it.pick;
      this._bright[i] = prev.get(it.hash) ?? 0;
    }
    for (let i = n; i < this._max; i++) this._picks[i] = null;
    this.mesh.count = n;

    const segs = Math.min(links.length / 6, this._maxLinks, linkChains.length);
    const pos = this._linkPos.array as Float32Array;
    const col = this._linkCol.array as Float32Array;
    this._linkChain = linkChains.slice(0, segs); // event-time
    const N = LINK_SAMPLES;
    for (let s = 0; s < segs; s++) {
      // The link's polyline: its S-curve sampled, laid out as N segments (each vertex twice inside).
      sCurve([links[s * 6], links[s * 6 + 1], links[s * 6 + 2]], [links[s * 6 + 3], links[s * 6 + 4], links[s * 6 + 5]], N, _curve);
      const base = s * N * 2;
      for (let j = 0; j < N; j++) {
        for (let e = 0; e < 2; e++) {
          const p = (j + e) * 3;
          const v = (base + j * 2 + e) * 3;
          pos[v] = _curve[p];
          pos[v + 1] = _curve[p + 1];
          pos[v + 2] = _curve[p + 2];
        }
      }
      this._linkSlot[s * 2] = linkSlots[s * 2] ?? -1;
      this._linkSlot[s * 2 + 1] = linkSlots[s * 2 + 1] ?? -1;
      _col.setHex(linkHues[s] ?? 0xffffff);
      for (let v = base; v < base + N * 2; v++) {
        col[v * 4] = _col.r;
        col[v * 4 + 1] = _col.g;
        col[v * 4 + 2] = _col.b;
        col[v * 4 + 3] = 0;
      }
    }
    this._linkCount = segs;
    this._linkPos.needsUpdate = true;
    this._linkCol.needsUpdate = true;
    this._linkGeo.setDrawRange(0, segs * N * 2);
    this._resolveEmphasis();
  }

  /** Nothing drawn, nothing pickable — the Snapshots register, or no window yet. */
  clear(): void {
    this.rebuild([], new Float32Array(0), [], [], []); // event-time
  }

  /** The hovered and the committed block, by hash (convention 9: the hover previews). */
  setEmphasis(hovered: string | null, selected: string | null): void {
    this._hovHash = hovered;
    this._selHash = selected;
    this._resolveEmphasis();
  }

  private _resolveEmphasis(): void {
    this._hov = this._hovHash != null ? this._index.get(this._hovHash) ?? -1 : -1;
    this._sel = this._selHash != null ? this._index.get(this._selHash) ?? -1 : -1;
  }

  /** The network the coloured dim resolves against (the view's own lens: hover, else the filter). */
  setDim(netKey: string): void {
    this._dimNet = netKey;
  }

  /** THE BLOCK CALLOUT'S ANCHOR (D3): the top of block `hash` where it stands this frame, in the
   *  CHAMBER's frame — its placed position (layout data, `rebuild`'s items) plus the rewind offset the
   *  view wrote (`setOffset`, the one source of trail motion). False when the tier draws no such block,
   *  or its row is past the trail's front or horizon (the instance is zero-scaled there). */
  anchorOf(hash: string, out: { set(x: number, y: number, z: number): unknown }): boolean {
    const i = this._index.get(hash);
    if (i == null || i >= this.mesh.count) return false;
    const it = this._items[i];
    const wx = LEAD_X - it.slot * SLOT_SP + this._off;
    if (frontAt(wx) * horizonAt(wx) <= 0) return false;
    out.set(it.x + this._off, it.y + it.size / 2, it.z);
    return true;
  }

  /** The trail rewind's offset — the one source of trail motion. */
  setOffset(x: number): void {
    this._off = x;
    this.group.position.x = x;
  }

  /** The view-entry drop, per slot (null once settled) — the blocks land with their row. */
  setEntryDrop(drop: Float32Array | null, fade: Float32Array | null): void {
    this._entryDrop = drop;
    this._entryFade = fade;
  }

  private _glassOp(): number {
    return this._paper ? BLOCK_GLASS.paper : BLOCK_GLASS.dark;
  }

  setColors(c: SceneColors): void {
    this._colors = c;
    this._paper = isLightGround(c);
    if (this._glass) this._mat.opacity = this._glassOp();
    this._linkMat.blending = glowBlend(c);
    this._linkMat.needsUpdate = true; // three caches the program per blending mode
  }

  /** Per frame: every live instance written or zero-scaled; link alpha per vertex. No allocation. */
  update(dt: number, alpha: number): void {
    const L = BLOCK_LOOK;
    const ek = emphasisK(dt);
    const dimNet = this._dimNet;
    const anyFocus = this._hov >= 0 || this._sel >= 0;
    const paper = this._paper;
    const drop = this._entryDrop;
    const fade = this._entryFade;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const it = this._items[i];
      // A ROW IS ONE OBJECT: the boundaries are asked at the ROW's x (its slot), exactly as the tile
      // under the block asks them — a block offset along its tile grid must not fade apart from it.
      const wx = LEAD_X - it.slot * SLOT_SP + this._off;
      const edge = frontAt(wx) * horizonAt(wx);
      const inEntry = fade != null && it.slot >= 0 && it.slot < SLOT_N;
      const entryF = inEntry ? fade[it.slot] : 1;
      if (edge <= 0 || entryF <= 0 || alpha <= 0) {
        _dummy.position.set(0, 0, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        this._bright[i] = 0;
        continue;
      }
      const focus = i === this._sel || i === this._hov ? 1 : 0;
      const base = L.rest;
      const offNet = dimNet !== "all" && it.chain !== dimNet;
      const mine = dimNet !== "all" && !offNet;
      const emph = inkPresence(snapBright(base, offNet, focus, anyFocus && focus === 0, mine), paper, base);
      const target = (paper ? L.ink + (1 - L.ink) * emph : emph) * edge * alpha * entryF;
      const bright = (this._bright[i] += (target - this._bright[i]) * ek);
      const dropY = inEntry && drop ? drop[it.slot] : 0;
      _dummy.position.set(it.x, it.y + dropY, it.z);
      _dummy.scale.setScalar(it.size * (1 + L.grow * focus));
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, inkMix(_col.setHex(it.hue), bright, this._colors));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    if (this._linkCount === 0) return;
    const col = this._linkCol.array as Float32Array;
    const linkRest = paper ? L.linkPaper : L.link;
    const N = LINK_SAMPLES;
    for (let s = 0; s < this._linkCount; s++) {
      // The off-filter chain's links take the ledger row's own dim — the ribbons' and threads' tier.
      const off = snapBright(1, dimNet !== "all" && this._linkChain[s] !== dimNet);
      // Each END rides its own ROW's boundaries (the row its block stands in), and an end in a row
      // still held back by the entry drop is not there yet; the curve between eases from one end's
      // weight to the other's. A stub's far end (row −1) is the reference leaving the trail: 0.
      let a0 = 0;
      let a1 = 0;
      for (let e = 0; e < 2; e++) {
        const slot = this._linkSlot[s * 2 + e];
        let a = 0;
        if (slot >= 0) {
          const x = LEAD_X - slot * SLOT_SP + this._off;
          const entryF = fade != null && slot < SLOT_N ? fade[slot] : 1;
          a = linkRest * off * frontAt(x) * horizonAt(x) * entryF * alpha;
        }
        if (e === 0) a0 = a;
        else a1 = a;
      }
      const base = s * N * 2;
      for (let j = 0; j < N; j++) {
        col[(base + j * 2) * 4 + 3] = a0 + (a1 - a0) * (j / N);
        col[(base + j * 2 + 1) * 4 + 3] = a0 + (a1 - a0) * ((j + 1) / N);
      }
    }
    this._linkCol.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this._linkGeo.dispose();
    this._linkMat.dispose();
  }
}
