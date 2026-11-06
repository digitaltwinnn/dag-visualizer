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
// The tips are READ, never inferred (spec "Rules"): `state` comes from `tipStateOf` over the
// chain's frontier read, and with no frontier read it is null — the resting look, never "open".
// An open tip breathes on the calm beat the live edge uses (`LiveEdge.BREATHE_RATE`); a retired
// block reads quiet.

import * as THREE from "three";
import { frontAt, horizonAt, SLOT_N, SLOT_SP } from "../../domain/ledgerModel";
import { LEAD_X } from "../../domain/ledgerLayout";
import type { TipState } from "../../domain/blockBraid";
import { snapBright, emphasisK } from "../../domain/dimModel";
import { glowBlend, inkMix, inkPresence, isLightGround, type SceneColors } from "../../sceneColors";
import type { PickDescriptor } from "@/src/data/types";
import { joinBloom } from "../SceneContext";
import { BREATHE_RATE } from "./LiveEdge";

/** One block, placed by the view (chamber-local, before the rewind offset). */
export interface BlockItem {
  hash: string;
  /** "dag" or the metagraph id — the lens the coloured dim reads. */
  chain: string;
  x: number;
  y: number;
  z: number;
  state: TipState | null;
  /** The chain's identity colour, as the tiles resolve it. */
  hue: number;
  /** The trail slot it rides — the entry drop is per slot. */
  slot: number;
  /** Edge length of the cube. */
  size: number;
  /** What a click on it commits; null leaves it drawn but not pickable. */
  pick: PickDescriptor | null;
}

/** The block mark's look: resting brightness per tip state (a multiplier on the identity hue, the
 *  tiles' `rest` idiom), the open tip's breath, the paper ink floor, the focus swell, the links. */
export interface BlockLook {
  open: number;
  retired: number;
  /** No frontier read: the resting block, between the two. */
  rest: number;
  /** The open tip's breath, as a fraction of its brightness. */
  breath: number;
  /** Paper only: how far a block may thin before it stops being a mark (`TileLook.ink`'s twin). */
  ink: number;
  /** The hovered or committed block's swell. */
  grow: number;
  /** A link's resting opacity (a relation, not a subject: under the blocks it ties). */
  link: number;
}

export const BLOCK_LOOK: Readonly<BlockLook> = { open: 0.95, retired: 0.35, rest: 0.6, breath: 0.22, ink: 0.35, grow: 0.35, link: 0.42 };

/** THE DAG BLOCK'S GLASS (user, design round D1: "the block should match the transparent / cyan
 *  snapshot color"): the global snapshot's own material — normal-blended, translucent, no depth
 *  write, in the chamber's neutral cyan (`SceneColors.core`, the bar's `_neutral`) — at a presence
 *  per ground. Dark 0.5: a block is a SUBJECT, so it stands above the bars' resting 0.12 the way a
 *  focused band does. Paper 0.85: on the sheet the instance colour is already thinned toward the
 *  ground (`inkMix`), and at 0.55 the cubes read as pale ghosts beside the bars (seen live, D1). */
export const BLOCK_GLASS: Readonly<{ dark: number; paper: number }> = { dark: 0.5, paper: 0.85 };

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();

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
  private _t = 0;
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
    this._linkPos = new THREE.Float32BufferAttribute(new Float32Array(this._maxLinks * 6), 3);
    this._linkCol = new THREE.Float32BufferAttribute(new Float32Array(this._maxLinks * 8), 4);
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

  /** EVENT-TIME: the blocks the window holds, placed, and their links (`blockBraid.linkEndpoints`,
   *  6 floats a segment) with each END's row (`linkSlots`, 2 a segment — the trail boundaries are
   *  asked at a row's x) and each segment's chain and colour (a link never crosses chains: a
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
    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < 6; k++) pos[s * 6 + k] = links[s * 6 + k];
      this._linkSlot[s * 2] = linkSlots[s * 2] ?? -1;
      this._linkSlot[s * 2 + 1] = linkSlots[s * 2 + 1] ?? -1;
      _col.setHex(linkHues[s] ?? 0xffffff);
      for (let v = 0; v < 2; v++) {
        col[s * 8 + v * 4] = _col.r;
        col[s * 8 + v * 4 + 1] = _col.g;
        col[s * 8 + v * 4 + 2] = _col.b;
        col[s * 8 + v * 4 + 3] = 0;
      }
    }
    this._linkCount = segs;
    this._linkPos.needsUpdate = true;
    this._linkCol.needsUpdate = true;
    this._linkGeo.setDrawRange(0, segs * 2);
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
    this._t += dt;
    const L = BLOCK_LOOK;
    const ek = emphasisK(dt);
    const breathe = 1 + L.breath * Math.sin(this._t * BREATHE_RATE);
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
      const base = it.state === "open" ? L.open * breathe : it.state === "retired" ? L.retired : L.rest;
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
    for (let s = 0; s < this._linkCount; s++) {
      // The off-filter chain's links take the ledger row's own dim — the ribbons' and threads' tier.
      const off = snapBright(1, dimNet !== "all" && this._linkChain[s] !== dimNet);
      for (let v = 0; v < 2; v++) {
        // Each end rides its own ROW's boundaries (the row its block stands in), and an end in a row
        // still held back by the entry drop is not there yet; neither is its link.
        const slot = this._linkSlot[s * 2 + v];
        const x = LEAD_X - slot * SLOT_SP + this._off;
        const entryF = fade != null && slot >= 0 && slot < SLOT_N ? fade[slot] : 1;
        col[s * 8 + v * 4 + 3] = L.link * off * frontAt(x) * horizonAt(x) * entryF * alpha;
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
