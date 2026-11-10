// The RIBBONS (spec §4.3): one tapering sheet per anchoring lane, leaving the lane's tiles on the
// metagraph floor and landing on that metagraph's own band in the byte bar below. The lane counts
// snapshots, the band measures bytes, and the ribbon is the relationship between the two — which is
// what replaced the old cubic anchor links.
//
// The sheet is CURVED (finetune 2026-08-06): each ribbon is subdivided into SEG vertical segments
// and its Z sweep eased (smootherstep, blended by `RIBBON_LOOK.curve`), so it falls from the lane, sweeps
// mid-run and lands vertically on its band instead of slicing diagonally across the chamber. Bands
// follow lane order (fillBarSpec), and both edges of adjacent ribbons interpolate with the SAME
// ease, so ribbons can never cross each other. A HIDDEN lane (another network is committed) draws
// NO ribbon at all — its lane laid no tiles, so a sheet from its old position would just overlap
// the committed lane's field (the caller's laneZ resolver returns null for it).
//
// Drawn on FOUR rows only (see RIBBON_ROWS), so the trail stays calm.
//
// ⚠️ Older ticks used to be described here as keeping "a hairline strut drawn by the view". They did
// not — that strut had been retired and the comment outlived it, so the trail's older rows stated no
// relation between a lane tile and the band it anchored into at all (found 2026-09-01, when the user
// asked why "the trail when filtered doesn't show any relation between global and meta snapshot").
// The THREADS below are the honest version of that sentence: see setThreads.
//
// Two meshes, both preallocated and rewritten event-time: the sheets, and the committed network's
// hairline threads.
import * as THREE from "three";
import { glowBlend, inkMix, inkPresence, isLightGround, type SceneColors } from "../../sceneColors";
import { METAGRAPHS } from "@/src/engine/config";
import { BAR_H, BAR_LIFT, FLOOR_Y, LEAD_X, TILE_LIFT } from "../../domain/ledgerLayout";
import { SLOT_SP } from "../../domain/ledgerModel";
import { ribbonQuad, type BarSpec, type RibbonQuad } from "../../domain/ledgerBands";
import { snapBright } from "../../domain/dimModel";


// THREE rows since 2026-08-07 (was 2): the LEAD row, the COMMITTED/hot row, and the HOVER
// preview row — with a snapshot pinned, a hover needs its own sheet or the preview ribbon
// simply never appears (the pinned row owns row 1).
// FOUR rows since 2026-08-16 (was 3): row 3 is the GRACE sheet — on a new tick the outgoing
// lead's ribbon follows its row back one slot and fades, instead of vanishing the frame the
// row stops being the lead (user: "the ribbon and snapshot selection effect disappear
// immediate"). LedgerView owns the handoff timing; this row is just one more sheet.
const RIBBON_ROWS = 4;
/** Trail slots a thread can be drawn for — the retained window, so every visible row can carry one. */
// 128 → 512 (review M4, 2026-11-09): the Transaction blocks seal lines are one per DAG block, per
// token block and per block-carrying tile over the 52-tick block window — about two a tick and more
// on a burst tick, so 128 cut the oldest rows' seals with no sign. 512 is ~10 a tick across the
// whole window; geometry is event-time, so the cost is buffer size alone.
const MAX_THREADS = 512;
/** Subdivisions per thread, and the LineSegments vertex count that follows (two per segment). */
const THREAD_SEG = 32;
const VERTS_PER_THREAD = THREAD_SEG * 2;
/** Vertical subdivisions per ribbon — enough for the eased sweep to read as a curve. 16 → 48
 *  (user, 2026-11-09: "the ribbon curve looks a bit blocky … add more 'steps'"): with the lining
 *  drawing the sheet's edge, each straight segment showed as a corner. Event-time geometry, a few
 *  rows of sheets: the cost is buffer size, never per-frame work. Threads follow it (12 → 32), so a
 *  thread never runs straighter than the sheet it stands in for. */
const RIBBON_SEG = 48;
const PER_ROW = METAGRAPHS.length + 1;
const VERTS_PER_RIBBON = RIBBON_SEG * 6; // two triangles per segment

/** The ribbon look. */
export interface RibbonLook {
  restOp: number;    // resting sheet opacity (× view alpha)
  brightness: number; // vertex-colour multiplier (additive blending → perceived brightness)
  curve: number;     // 0 = straight diagonal sheet, 1 = full smootherstep S-sweep
  threadAlpha: number; // the committed network's hairline thread (setThreads) — a HINT, not a sheet
  /** THE STRIPED SHEET (`setStriped`, the Data blocks register): the fill under the stripes, as a
   *  fraction of the sheet's own level — SUBTLER than the snapshot sheet (user, 2026-11-09: "keep also
   *  a subtle fill, but a bit more subtle than the fill used for the metagraph ribbon"). */
  stripeFill: number;
  /** A stripe's added level on its centre line, as a multiple of the sheet's own level. */
  stripeLine: number;
  /** The stripes' spacing across the sheet's TOP edge, in world units: a lane's sheet carries
   *  `round(width / stripeSp)` stripes (at least `STRIPES_MIN`), and they converge with the sheet. */
  stripeSp: number;
  /** THE LINED SHEET (the Metagraph snapshots register; user, 2026-11-09: "can we give it a outer
   *  lining?"): the hairline along the sheet's two long sides, its added level on its centre line as
   *  a multiple of the sheet's own — a step above the fill, so the sheet reads as a defined shape. */
  liningLine: number;
}

// User-tuned live, 2026-08-07.
export const RIBBON_LOOK: Readonly<RibbonLook> = {
  restOp: 0.21, // 0.25 → 0.21 with brightness 0.85 → 1.1 (user export, 2026-08-30): a touch less film, more vivid colour — beside the snapshots' new halo lift
  brightness: 1.1,
  curve: 1,
  // The thread's job is to say a relation EXISTS down the trail, not to compete with the four
  // sheets that show it in full. ⚠️ ITS OWN LEVEL since 2026-10-03 (user: "the line between their
  // byte bar and snapshots is too faint, in light and dark"): the material used to ride the
  // SHEETS' `restOp` (0.21) and this number multiplied it, so a "0.4" thread drew at 0.084 — a
  // hairline at 8% is not a hint, it is absent. The material takes this number directly now.
  threadAlpha: 0.5,
  // Data blocks (design round, 2026-11-09, option A): the fill at 0.6 of the sheet's level (0.126
  // against 0.21 on dark), the stripes peaking at 0.6 + 1.6 = 2.2× it — items in a stream on a
  // quieter film, so the register reads apart from the snapshots' continuous one.
  stripeFill: 0.6,
  stripeLine: 1.6,
  stripeSp: 0.22,
  // The lining peaks at 1 + 1.8 = 2.8× the sheet's level (≈0.59 on dark against the 0.21 fill):
  // a defined edge, still well under the tiles' full ink.
  liningLine: 1.8,
};

/** The fewest stripes a sheet carries — a narrow lane still reads as a stream, not a bar. */
export const STRIPES_MIN = 3;

/** The stripes, in the sheet's own fragment (`setStriped`). `vStripe` runs 0 → n across the sheet
 *  (one unit per stripe; a stripe stands at each half-integer), so a stripe follows the sheet's own
 *  eased sweep and converges with it. ANTIALIASED IN SCREEN SPACE, not by geometry: the renderer has
 *  no MSAA and the half-res bloom haloes a hard 1px step into a crawling fringe (the soft-lines
 *  lesson, `SoftLines.ts`), so a stripe's coverage falls off linearly to 0 one device pixel from its
 *  centre (`fwidth`), the same triangular profile. Where the stripes crowd closer than ~3 pixels
 *  (the sheet's narrow foot, a far row) they hand over to their own average, so nothing aliases or
 *  shimmers as the camera moves. */
//
// THE LINING (the Metagraph snapshots register) rides the same coordinate: a hairline one device pixel
// INSIDE each long edge (`vStripe.y` is n, the right edge), with the same triangular profile — kept
// off the edge itself, because the polygon's own edge is a hard, stepped one (no MSAA), and a bright
// line laid on it would light every step. Where the sheet narrows to under ~6 pixels the two linings
// would merge into a bar, so they hand over to the plain sheet there.
const STRIPE_GLSL = `{
  float st = vStripe.x;
  float w = max(fwidth(st), 1e-4);
  float d = abs(fract(st) - 0.5);
  float cov = clamp(1.0 - d / w, 0.0, 1.0);
  float crowd = smoothstep(0.2, 0.45, w);
  float line = mix(cov, min(w, 1.0), crowd);
  float e = min(st, vStripe.y - st);
  float edge = clamp(1.0 - abs(e - w) / w, 0.0, 1.0) * smoothstep(4.0, 8.0, vStripe.y / w); // n / w: the sheet's width in pixels
  float sheet = mix(1.0, uStripeFill + uStripeLine * line, uStriped) + uLined * uLiningLine * edge;
  diffuseColor.a = min(diffuseColor.a * sheet, 1.0);
}`;

/** THE SEAL LINE (design round D8, user: "the line that 'seals' the block … looks the same [as the
 *  block links]; we need to distinguish them much more clearly"): the Transaction blocks register's
 *  anchors — a DAG block down to its bar, a block-carrying tile down to its band — are a species of
 *  their own, not the links': the chamber's muted NEUTRAL (`SceneColors.muted`, the floor labels'
 *  tone, never the blocks' cyan; a token block's tile line keeps its network's hue) on their own material, quieter than the links
 *  (0.42 dark / 0.7 paper). WebGL draws every line one pixel wide, so "thinner" is presence: dark
 *  0.28 reads as a pale structural thread under the cyan links; paper 0.5 holds it as grey ink. */
export const SEAL_LOOK: Readonly<{ dark: number; paper: number }> = { dark: 0.28, paper: 0.5 };

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

/** One seal line of the Transaction blocks register (`setAnchorLines`): its row, its network key (the
 *  lens dims it), where it starts (x, z at height `yTop`, chamber-local before the rewind offset), and
 *  where it ends — on the floor, at the band it lands on (null: the bar's centre line under it), on
 *  the sheets' eased sweep; or, with `yBot`, STRAIGHT DOWN to that height at its own x and z (a token
 *  block's line to its tile, 2026-11-08). */
export interface AnchorLine {
  slot: number;
  key: string;
  x: number;
  z: number;
  yTop: number;
  yBot?: number;
  band: { z0: number; z1: number } | null;
  /** The line's identity colour (a token block's tile line wears its network's hue); null takes the
   *  chamber's muted neutral (a DAG block's line down to its bar). */
  hue: number | null;
}

export class Ribbons {
  group = new THREE.Group();
  private _geo = new THREE.BufferGeometry();
  private _pos: THREE.Float32BufferAttribute;
  private _col: THREE.Float32BufferAttribute;
  /** Per vertex: (the stripe coordinate across the sheet, 0 at its left edge and n at its right; n). */
  private _stripe: THREE.Float32BufferAttribute;
  private _mat: THREE.MeshBasicMaterial;
  /** The striped look's uniforms (`setStriped`), shared with the compiled program by reference. */
  private _stripeU = {
    uStriped: { value: 0 },
    uStripeFill: { value: RIBBON_LOOK.stripeFill },
    uStripeLine: { value: RIBBON_LOOK.stripeLine },
    uLined: { value: 1 },
    uLiningLine: { value: RIBBON_LOOK.liningLine },
  };
  private _mesh: THREE.Mesh;
  private _rows: RowState[] = [];
  // ── the committed network's hairline THREADS (2026-09-01) ────────────────────────────────────
  private _thGeo = new THREE.BufferGeometry();
  private _thPos: THREE.Float32BufferAttribute;
  private _thCol: THREE.Float32BufferAttribute;
  private _thMat: THREE.LineBasicMaterial;
  /** The seal lines' own material (`SEAL_LOOK`): the hairline geometry wears it while it holds
   *  anchor lines (`setAnchorLines`), the threads' while it holds threads. */
  private _sealMat: THREE.LineBasicMaterial;
  private _thLines: THREE.LineSegments;
  /** One entry per drawn thread: the slot it belongs to and its first vertex, so the per-frame
   *  fade pass can write alpha without recomputing any geometry. */
  private _thSlots: number[] = [];
  private _thStart: number[] = [];
  private _thCount = 0;
  private _thAlpha: number[] = [];
  /** Per thread, its ALPHA share of the row ramp — the paper lens dim (review M2): on paper the
   *  seal material is normal-blended ink, so a colour taken toward black read LOUDER; the dim rides
   *  alpha there, as every other paper dim in the chamber does. 1 on the dark ground. */
  private _thMul: number[] = [];
  private _sceneColors: Record<string, number>;
  private _neutral: number;
  /** Per-row brightness scale — the trail REWIND fades the live lead row's sheet while an older
   *  snapshot owns the front, and the HOVER-preview row rides below full (LedgerView drives). */
  private _rowFade = [1, 1, 1];
  private _filter = "all";
  /** THE BAND GATE (`setBandGate`): which (slot, band) pairs may carry a sheet or a thread — the
   *  Data blocks register's, so a band whose snapshots carried no data block is tied by nothing,
   *  exactly as its tiles are not drawn. Null gates nothing. Consulted at event time only. */
  private _bandGate: ((slot: number, key: string) => boolean) | null = null;
  private _c = new THREE.Color();
  /** Scratch quad for the thread pass — event-time only, never per frame. */
  private _q: RibbonQuad = { topZ0: 0, topZ1: 0, botZ0: 0, botZ1: 0 };
  /** The live palette — the sheet is normal-blended INK on paper, additive GLOW on the dark
   *  ground, and its per-row brightness has to be expressed for whichever one it lands on. */
  private _colors: SceneColors;
  /** GROUND, hoisted at event time — setAlpha runs per frame and reads a boolean. */
  private _paper: boolean;

  constructor(colors: SceneColors, sceneColors: Record<string, number>) {
    this._colors = colors;
    this._paper = isLightGround(colors);
    this._sceneColors = sceneColors;
    this._neutral = colors.core;
    const verts = RIBBON_ROWS * PER_ROW * VERTS_PER_RIBBON;
    this._pos = new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3);
    // itemSize 4: the 4th component is PER-VERTEX ALPHA (three's USE_COLOR_ALPHA path). It
    // exists for the paper ground alone — on paper BOTH the trail's front/horizon fade and the
    // emphasis dim ride ALPHA there, because a colour faded toward the paper at full material
    // opacity is still a milky sheet hanging over the chamber (user, 2026-08-28: "a transparent
    // ribbon sitting in front of my snapshot panels", then "should we focus more on transparency
    // as opposed to making the colors look washed out"). On dark it stays 1 everywhere and the
    // colour multiply does the fading, exactly as before — byte-identical.
    this._col = new THREE.Float32BufferAttribute(new Float32Array(verts * 4), 4);
    this._stripe = new THREE.Float32BufferAttribute(new Float32Array(verts * 2), 2);
    this._pos.setUsage(THREE.DynamicDrawUsage);
    this._col.setUsage(THREE.DynamicDrawUsage);
    this._stripe.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute("position", this._pos);
    this._geo.setAttribute("color", this._col);
    this._geo.setAttribute("aStripe", this._stripe);
    this._geo.setDrawRange(0, 0);
    this._mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: glowBlend(colors),
    });
    // The stripe term rides the stock material (its blend, vertex colour and alpha paths unchanged):
    // with `uStriped` 0 and `uLined` 0 the expression is the sheet's own alpha.
    const u = this._stripeU;
    this._mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "attribute vec2 aStripe;\nvarying vec2 vStripe;\n#include <common>")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStripe = aStripe;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "uniform float uStriped;\nuniform float uStripeFill;\nuniform float uStripeLine;\nuniform float uLined;\nuniform float uLiningLine;\nvarying vec2 vStripe;\n#include <common>")
        .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\n${STRIPE_GLSL}`);
    };
    this._mat.customProgramCacheKey = () => "ribbon-striped";
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.frustumCulled = false;
    this.group.add(this._mesh);

    // The threads: one polyline per trail slot, subdivided along the SAME eased sweep the sheets
    // use (see setThreads). Sized for every slot the trail can hold.
    const thVerts = MAX_THREADS * VERTS_PER_THREAD;
    this._thPos = new THREE.Float32BufferAttribute(new Float32Array(thVerts * 3), 3);
    this._thCol = new THREE.Float32BufferAttribute(new Float32Array(thVerts * 4), 4);
    this._thPos.setUsage(THREE.DynamicDrawUsage);
    this._thCol.setUsage(THREE.DynamicDrawUsage);
    this._thGeo.setAttribute("position", this._thPos);
    this._thGeo.setAttribute("color", this._thCol);
    this._thGeo.setDrawRange(0, 0);
    // A LINE, not a thin sheet: the whole point is that it states the relation without adding
    // area to a chamber that is already full of glass. Same blend and depth rules as the sheets,
    // and out of the bloom layer for the same reason they are.
    this._thMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      depthWrite: false, blending: glowBlend(colors),
    });
    this._sealMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      depthWrite: false, blending: glowBlend(colors),
    });
    this._thLines = new THREE.LineSegments(this._thGeo, this._thMat);
    this._thLines.frustumCulled = false;
    this.group.add(this._thLines);

    for (let r = 0; r < RIBBON_ROWS; r++) {
      const quads: RibbonQuad[] = [];
      for (let i = 0; i < PER_ROW; i++) quads.push({ topZ0: 0, topZ1: 0, botZ0: 0, botZ1: 0 });
      this._rows.push({ slot: -1, count: 0, keys: [], quads });
    }
  }

  setSceneColors(map: Record<string, number>): void {
    this._sceneColors = map;
    this._writeGeometry(); // event-time: the sheet's colours are BAKED into vertex colours
  }

  /** THEME FLIP — the neutral trail colour is baked into the vertex colours alongside the identity
   *  hues, so a retint is the same rewrite a filter commit runs. Event-time, like `setFilter`. */
  setColors(c: SceneColors): void {
    this._colors = c;
    this._paper = isLightGround(c);
    this._neutral = c.core;
    // The GROUND changed, so the sheet's blend mode changes with it (see glowBlend): additive glow
    // on the dark ground is a no-op on paper — the ribbons vanished outright before this line.
    this._mat.blending = glowBlend(c);
    this._mat.needsUpdate = true; // three caches the program per blending mode
    this._thMat.blending = glowBlend(c);
    this._thMat.needsUpdate = true;
    this._sealMat.blending = glowBlend(c);
    this._sealMat.needsUpdate = true;
    this._writeGeometry(); // event-time: a theme flip, not a frame
  }

  /** `laneZ` returns the lane centre for a band key — null when the lane is HIDDEN (another
   *  network committed): a hidden lane laid no tiles, so it gets no ribbon either. The unlisted
   *  channels have a real lane of their own now (the "unknown" lane at the screen-left end,
   *  2026-08-07), so every band resolves the same way — the old mid-air start is retired. */
  /** `topHalf` resolves a lane's top-edge HALF-WIDTH for this row — the tile grid's own measured
   *  z-extent (user, 2026-08-30: the sheet used to span the whole plane while "the metagraph
   *  snapshots are smaller"), the same honesty the bottom edge always had from the band's z0/z1.
   *  The caller answers RIBBON_LANE_HALF where no tiles are knowable, which is the old look. */
  /** The band gate (see `_bandGate`). The caller rebuilds the rows and threads after setting it. */
  setBandGate(fn: ((slot: number, key: string) => boolean) | null): void {
    this._bandGate = fn;
  }

  /** THE REGISTER'S SHEET (`REGISTER_CARGO.anchors`): the Data blocks register's STRIPED one, else the
   *  Metagraph snapshots register's LINED one — two registers, two distinct sheets (the stripes already
   *  draw the data sheet's shape). Uniforms, so the switch costs no rewrite and no recompile. The
   *  look's numbers are read here too, so the constant stays the one home. */
  setStriped(on: boolean): void {
    const u = this._stripeU;
    u.uStriped.value = on ? 1 : 0;
    u.uLined.value = on ? 0 : 1;
    u.uStripeFill.value = RIBBON_LOOK.stripeFill;
    u.uStripeLine.value = RIBBON_LOOK.stripeLine;
    u.uLiningLine.value = RIBBON_LOOK.liningLine;
  }

  setRow(row: 0 | 1 | 2 | 3, slot: number, spec: BarSpec | null, laneZ: (key: string) => number | null, topHalf: (key: string) => number): void {
    const st = this._rows[row];
    st.slot = slot;
    st.keys.length = 0;
    st.count = 0;
    if (!spec || !spec.measured) { this._writeGeometry(); return; }

    for (let i = 0; i < spec.bandCount; i++) {
      const band = spec.bands[i];
      if (band.bytes <= 0) continue;
      if (this._bandGate && !this._bandGate(slot, band.key)) continue; // the register ties no sheet to it
      const z = laneZ(band.key);
      if (z == null) continue; // hidden lane → no sheet
      ribbonQuad(z, topHalf(band.key), band, st.quads[st.count]);
      st.keys.push(band.key);
      st.count++;
    }
    this._writeGeometry();
  }

  /** THE COMMITTED NETWORK'S HAIRLINE THREADS — one per trail slot that actually anchored it.
   *
   *  Under a commit the chamber's two readings both run the length of the trail (the lane's tiles
   *  above, its bands below) with nothing joining them: the sheets stop after four rows, because
   *  N networks × every row is a wall of glass. That cap answers the UNFILTERED chamber. Commit a
   *  network and there is at most ONE line per row — a twelfth of the load the cap was protecting
   *  against — so the cap should not be inherited, and it isn't.
   *
   *  Three rules hold it honest and quiet:
   *   · ONLY under a commit, and only for the committed key. Unfiltered, nothing is drawn and the
   *     chamber is byte-identical to before.
   *   · ONLY where the anchor exists (rule 10). A tick this network did not anchor into draws no
   *     line — the gap IS the fact, exactly as the byte bar draws no body for a zero.
   *   · It follows the SHEETS' OWN eased sweep, never a straight segment. The ribbon design falls
   *     from the lane, sweeps mid-run and lands vertically precisely so nothing slices diagonally
   *     across the chamber; a straight thread would reintroduce the diagonal that was designed out.
   *     Sharing `sweep()` with the sheets is also what keeps a thread from drifting off the ribbon
   *     it stands in for.
   *
   *  Geometry is event-time (the caller rebuilds when the trail or the filter changes); the
   *  per-frame half is `setThreadFades`, which writes alpha alone. */
  setThreads(
    slots: { slot: number; spec: BarSpec | null }[],
    laneZ: (key: string) => number | null,
    topHalf: (key: string) => number,
  ): void {
    this._clearThreads();
    this._thLines.material = this._thMat;
    const key = this._filter;
    if (key === "all") { this._thGeo.setDrawRange(0, 0); return; }
    this._c.setHex(this._sceneColors[key] ?? this._neutral);
    const z = laneZ(key);
    let v = 0;
    if (z != null) {
      for (const { slot, spec } of slots) {
        if (!spec || this._thCount >= MAX_THREADS) continue;
        if (this._bandGate && !this._bandGate(slot, key)) continue; // the register ties no thread to it
        let band: BarSpec["bands"][number] | null = null;
        for (let i = 0; i < spec.bandCount; i++) if (spec.bands[i].key === key) { band = spec.bands[i]; break; }
        if (!band) continue; // this tick carried nothing for the committed network — no line
        ribbonQuad(z, topHalf(key), band, this._q);
        v = this._pushThread(v, slot, 0, FLOOR_Y.msnap + TILE_LIFT);
      }
    }
    this._thPos.needsUpdate = true;
    this._thCol.needsUpdate = true;
    this._thGeo.setDrawRange(0, v);
  }

  /** THE TRANSACTION BLOCKS REGISTER'S SEAL LINES — the threads' hairline geometry on the SEAL
   *  material (`SEAL_LOOK`, rounds D1, D2, D8): one per DAG block, from the block down to the centre
   *  of its tick's bar, and one per block-carrying tile, from the tile down to its network's band (the
   *  bar's centre while the tick's exact read has not landed), all on the sheets' eased sweep, the tile lines in their network's hue and the bar lines in
   *  the chamber's muted neutral. Off the lens a line takes the ledger row's dim. Geometry is
   *  event-time; `setThreadFades` writes the per-frame alpha as for the threads. */
  setAnchorLines(lines: readonly AnchorLine[]): void {
    this._clearThreads();
    // The SEAL species (`SEAL_LOOK`): the vertex carries the colour (a token tile line its network hue, a DAG block line the muted neutral) and the lens.
    this._thLines.material = this._sealMat;
    let v = 0;
    for (const l of lines) {
      if (this._thCount >= MAX_THREADS) break;
      this._c.setHex(l.hue ?? this._colors.muted);
      const off = this._filter !== "all" && l.key !== this._filter;
      // Dark: additive glow, so a darker colour IS a dimmer line. Paper: the dim rides alpha.
      if (off && !this._paper) this._c.multiplyScalar(snapBright(1, true));
      this._thMulNext = off && this._paper ? snapBright(1, true) : 1;
      this._q.topZ0 = l.z;
      this._q.topZ1 = l.z;
      this._q.botZ0 = l.yBot != null ? l.z : l.band ? l.band.z0 : 0;
      this._q.botZ1 = l.yBot != null ? l.z : l.band ? l.band.z1 : 0;
      v = this._pushThread(v, l.slot, l.x - (LEAD_X - l.slot * SLOT_SP), l.yTop, l.yBot);
    }
    this._thPos.needsUpdate = true;
    this._thCol.needsUpdate = true;
    this._thGeo.setDrawRange(0, v);
  }

  private _clearThreads(): void {
    this._thCount = 0;
    this._thSlots.length = 0;
    this._thStart.length = 0;
    this._thAlpha.length = 0;
    this._thMul.length = 0;
    this._thMulNext = 1;
  }
  /** The alpha share the next `_pushThread` records (event-time scratch). */
  private _thMulNext = 1;

  /** One hairline down `_q`'s centre line on the sheets' own eased sweep, in `_c`, from vertex `v`
   *  and height `yTop` down to the bars' top face — or, given `yBot`, to that height, keeping its x
   *  (a line that ends above the floor is a block's to its tile, and stands straight);
   *  `dxTop` is the top end's offset along the trail (a tile in a grid), eased out on the same sweep
   *  so a floor-bound line still lands vertically on its row. Returns the next free vertex. Event-time. */
  private _pushThread(v: number, slot: number, dxTop: number, yTop: number, yBotAt?: number): number {
    const p = this._thPos.array as Float32Array;
    const c = this._thCol.array as Float32Array;
    const yBot = yBotAt ?? (FLOOR_Y.gl0 + BAR_LIFT + BAR_H);
    const dxBot = yBotAt == null ? 0 : dxTop;
    const curve = RIBBON_LOOK.curve;
    const x = LEAD_X - slot * SLOT_SP;
    this._thSlots.push(slot);
    this._thStart.push(v);
    this._thAlpha.push(0);
    this._thMul.push(this._thMulNext);
    this._thCount++;
    // The thread is the quad's CENTRE line, so it stands exactly where the sheet's own middle
    // would be if this row had one.
    const mid = (a: number) => {
      const l = this._q.topZ0 + (this._q.botZ0 - this._q.topZ0) * a;
      const r = this._q.topZ1 + (this._q.botZ1 - this._q.topZ1) * a;
      return (l + r) / 2;
    };
    for (let j = 0; j < THREAD_SEG; j++) {
      const t0 = j / THREAD_SEG, t1 = (j + 1) / THREAD_SEG;
      const s0 = sweep(t0, curve), s1 = sweep(t1, curve);
      const y0 = yTop + (yBot - yTop) * t0, y1 = yTop + (yBot - yTop) * t1;
      p[v * 3] = x + dxTop + (dxBot - dxTop) * s0; p[v * 3 + 1] = y0; p[v * 3 + 2] = mid(s0);
      c[v * 4] = this._c.r; c[v * 4 + 1] = this._c.g; c[v * 4 + 2] = this._c.b; c[v * 4 + 3] = 0;
      v++;
      p[v * 3] = x + dxTop + (dxBot - dxTop) * s1; p[v * 3 + 1] = y1; p[v * 3 + 2] = mid(s1);
      c[v * 4] = this._c.r; c[v * 4 + 1] = this._c.g; c[v * 4 + 2] = this._c.b; c[v * 4 + 3] = 0;
      v++;
    }
    return v;
  }

  /** The per-frame half: `fadeOf(slot)` is the trail's own front/horizon ramp, so a thread leaves
   *  the chamber on exactly the boundary its band and its tile leave on. Writes ALPHA only — no
   *  geometry, no allocation (rule 5). */
  setThreadFades(fadeOf: (slot: number) => number): void {
    if (this._thCount === 0) return;
    const c = this._thCol.array as Float32Array;
    let dirty = false;
    for (let i = 0; i < this._thCount; i++) {
      const a = fadeOf(this._thSlots[i]) * this._thMul[i]; // the row's own ramp × its lens share; the LEVEL is the material's (setAlpha)
      if (Math.abs(a - this._thAlpha[i]) < 0.004) continue;
      this._thAlpha[i] = a;
      dirty = true;
      const start = this._thStart[i];
      for (let v = start; v < start + VERTS_PER_THREAD; v++) c[v * 4 + 3] = a;
    }
    if (dirty) this._thCol.needsUpdate = true;
  }

  clearRow(row: 0 | 1 | 2 | 3): void {
    this._rows[row].count = 0;
    this._rows[row].keys.length = 0;
    this._writeGeometry();
  }

  /** Set a row's brightness scale (0..1). Rewrites the sheet only on real change — called per
   *  frame during the trail-rewind ease, but the rewrite fires ~a handful of times per ease. */
  setRowFade(row: 0 | 1 | 2 | 3, f: number): void {
    if (Math.abs(this._rowFade[row] - f) < 0.012) return;
    this._rowFade[row] = f;
    this._writeGeometry();
  }

  /** The view fade, applied DIRECTLY (the Engine calls this every frame, so the opacity IS the
   *  state and there is no `_alpha` to hold). It used to be eased toward at `dt * 5` — a fade of a
   *  fade: `a` is already the transition's own curve, and every sibling in the chamber (the floors,
   *  the bar, the tiles, the labels) multiplies by it as given, so the ease alone left the sheet
   *  visibly trailing them out of the view by ~half a second. `restOp` is read per frame here. */
  setAlpha(a: number): void {
    // The threads ride the same view alpha as the sheets — one fade for the whole relation layer.
    // `restOp` is the level of an ADDITIVE sheet over black, where the bloom lifts it clear; the same
    // number as normal-blended ink on paper composites the (already ink-mixed) vertex colour at a
    // quarter strength, which is precisely how the ribbons read as white ghosts on the light ground.
    // Presence, so it asks the ground — see inkPresence.
    this._mat.opacity = inkPresence(RIBBON_LOOK.restOp, this._paper) * a;
    this._thMat.opacity = inkPresence(RIBBON_LOOK.threadAlpha, this._paper) * a;
    this._sealMat.opacity = (this._paper ? SEAL_LOOK.paper : SEAL_LOOK.dark) * a;
  }

  /** COMMITTED filter → the other metagraphs' sheets take the COLORED dim (identity hue at the
   *  ledger row's `dim` — a ribbon states which bytes came from where, so it is DATA and answers
   *  the same knob its snapshots do). Baked into vertex colours, so a change rewrites the sheet
   *  (event-time). */
  setFilter(filter: string): void {
    const next = filter || "all";
    if (next === this._filter) return;
    this._filter = next;
    this._writeGeometry(); // event-time: a filter commit, not a frame
  }

  /** event-time: the whole sheet is rewritten when a row changes. */
  private _writeGeometry(): void {
    const p = this._pos.array as Float32Array;
    const c = this._col.array as Float32Array;
    const sa = this._stripe.array as Float32Array;
    const { curve, brightness, stripeSp } = RIBBON_LOOK;
    let v = 0;
    let nn = 0; // the current sheet's stripe count, carried on every vertex (the lining's right edge)
    const push = (x: number, z: number, y: number, r: number, g: number, b: number, a: number, st: number) => {
      p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
      c[v * 4] = r; c[v * 4 + 1] = g; c[v * 4 + 2] = b; c[v * 4 + 3] = a;
      sa[v * 2] = st; sa[v * 2 + 1] = nn;
      v++;
    };
    for (let r = 0; r < RIBBON_ROWS; r++) {
      const st = this._rows[r];
      const rowFade = this._rowFade[r];
      const x = LEAD_X - st.slot * SLOT_SP;
      // Tile-bottom → bar-top (the snapshots sit ON their planes now, 2026-08-07).
      const yTop = FLOOR_Y.msnap + TILE_LIFT;
      const yBot = FLOOR_Y.gl0 + BAR_LIFT + BAR_H;
      for (let i = 0; i < st.count; i++) {
        const q = st.quads[i];
        const key = st.keys[i];
        // Map-first — the Engine's scene-color map carries the unlisted gray too (2026-08-08).
        const hex = this._sceneColors[key] ?? this._neutral;
        this._c.setHex(hex);
        const off = this._filter !== "all" && key !== this._filter;
        // The EMPHASIS term alone asks the ground; `rowFade` is the trail's front/horizon boundary
        // ramp — geometry, not weight — so it multiplies in afterwards ungamma'd (inkPresence's own
        // rule). Factoring it out of `snapBright` is exact: with no focus the resolver is purely
        // multiplicative in `base`, so dark is byte-identical. `brightness` is also the curve's
        // REFERENCE — a ribbon rests at 0.85, so without it the paper gamma read an off-filter
        // sheet at 95% of a resting one and the filter's whole answer vanished.
        const emph = inkPresence(snapBright(brightness, off), this._paper, brightness);
        // ON PAPER, DE-EMPHASIS RIDES OPACITY (user, 2026-08-28: "should we focus more on
        // transparency as opposed to making the colors look washed out"). c9b3ffc moved the
        // GEOMETRIC fade onto alpha for exactly this reason; the EMPHASIS term now follows it.
        // A colour lerped toward the paper still paints an OPAQUE milky sheet — over the glass
        // planes and over everything behind them — so an off-filter ribbon read as bleached
        // rather than as itself, fainter. Ink keeps its full hue and saturation; presence and
        // the boundary ramp both ride the vertex ALPHA. On dark both stay in the colour multiply
        // (toward black = invisible under additive), byte-identical.
        if (!this._paper) inkMix(this._c, emph * rowFade, this._colors);
        const cr = this._c.r, cg = this._c.g, cb = this._c.b;
        const ca = this._paper ? emph * rowFade : 1;
        // The stripe coordinate: 0 on the sheet's left edge, n on its right, n from its top width.
        const n = Math.max(STRIPES_MIN, Math.round(Math.abs(q.topZ1 - q.topZ0) / stripeSp));
        nn = n;
        for (let j = 0; j < RIBBON_SEG; j++) {
          const t0 = j / RIBBON_SEG, t1 = (j + 1) / RIBBON_SEG;
          const s0 = sweep(t0, curve), s1 = sweep(t1, curve);
          const y0 = yTop + (yBot - yTop) * t0, y1 = yTop + (yBot - yTop) * t1;
          const l0 = q.topZ0 + (q.botZ0 - q.topZ0) * s0, r0 = q.topZ1 + (q.botZ1 - q.topZ1) * s0;
          const l1 = q.topZ0 + (q.botZ0 - q.topZ0) * s1, r1 = q.topZ1 + (q.botZ1 - q.topZ1) * s1;
          push(x, l0, y0, cr, cg, cb, ca, 0); push(x, r0, y0, cr, cg, cb, ca, n); push(x, r1, y1, cr, cg, cb, ca, n);
          push(x, l0, y0, cr, cg, cb, ca, 0); push(x, r1, y1, cr, cg, cb, ca, n); push(x, l1, y1, cr, cg, cb, ca, 0);
        }
      }
    }
    this._geo.setDrawRange(0, v);
    this._pos.needsUpdate = true;
    this._col.needsUpdate = true;
    this._stripe.needsUpdate = true;
  }

  dispose(): void {
    this._thGeo.dispose();
    this._thMat.dispose();
    this._sealMat.dispose();
    this._geo.dispose();
    this._mat.dispose();
    this._rows.length = 0;
  }
}
