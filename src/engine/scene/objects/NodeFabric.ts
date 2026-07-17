// The instanced node meshes — BOTH validator (DAG core) and metagraph node pairs — and every
// per-frame write into them. Split out of js/globe.js: the two-mesh sphere/disc cross-fade setup
// (`setNodes` 182-208 / `setMetagraphs` 583-617), the patched `_makeNodeMaterial` (284-298), and
// the three per-frame loops — validator matrices (setMorph 850-930), validator glow/colour
// (update 1017-1072), and the full metagraph loop (update 1079-1159). Consumes the typed records
// (domain/records) + the pure dim context (domain/dimModel) via one `FrameCtx` struct; Globe owns
// the records, the eased dim state, and the orchestration, and hands them in here.
//
// The setMorph loop (validator MATRICES) and the update loops (glow + metagraph) are kept as
// SEPARATE calls, exactly as js/globe.js split them across setMorph/update — the matrix loop reads
// `dim` BEFORE Globe eases it each frame, the glow loop reads it after, a one-frame offset that is
// part of the original behaviour. All scratch objects are module-scope (zero per-frame allocation);
// `pickablesFor` returns a REUSED array (the plan's allocation fix).

import * as THREE from "three";
import { LEDGER } from "../../domain/ledgerLayout";
import { HEX_H } from "../../domain/geoLayout";
import { discFall, lerp, smooth } from "../../domain/nodeLayout";
import type { DimContext } from "../../domain/dimModel";
import type { MetaNodeRecord, ValidatorRecord } from "../../domain/records";
import type { ViewTransition } from "../../domain/viewTransition";
import type { PickDescriptor } from "@/src/data/types";

const Y_AXIS = new THREE.Vector3(0, 1, 0); // hex-prism axis (radial after _qRadial)
// The ONE orb fresnel-rim shader tail (view-dependent rim so emissive spheres read as lit 3D
// orbs): shared by the instanced node spheres below AND HyperView's single core/hub orbs
// (applyOrbFresnel), so the "one node language" look can't drift between the two materials.
// GLSL declares `fres`; MIX is the emissive multiplier both sites apply to their own emissive.
export const ORB_FRESNEL_GLSL =
  "float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.5);\n";
export const ORB_FRESNEL_MIX = "(0.72 + 0.9 * fres)";
// The geo hex prisms' resting opacity — slightly glassy (user: replaces the wireframe overlay,
// which never read as clean edges). Depth-write stays ON so stacks occlude normally.
const HEX_ALPHA = 0.92;
// Metagraph spheres' RESTING scale in the Hypergraph — the old 0.32-dim shrink (×0.68) baked in
// as the normal state (user, 2026-07-17: the hover-dim size IS the right size; the dim itself is
// inert in hyper now, see dimScaleMetaV). Eases back to full size over the morph, so the
// sphere→chip handoff and the hex chips' geo sizing are unchanged.
const META_REST_SCALE = 0.68;
const GATHER_SCALE = 0.22; // uniform node size at the staging grid (tidy, equal pixels)
const DIM = new THREE.Color(0x223046);
const _dummy = new THREE.Object3D(); // reused to compose per-instance matrices
const _vec = new THREE.Vector3();
const _geoVec = new THREE.Vector3(); // scratch for the morph-fly interpolation
const _gatherV = new THREE.Vector3(); // scratch: a node's world-space staging-grid position
const _qSpin = new THREE.Quaternion();   // hypergraph tumble
const _qRadial = new THREE.Quaternion(); // outward-facing (globe) orientation
const _col = new THREE.Color();          // scratch colour for dim recolouring

// A pick's optional geo country code (only l0/l1/metanode descriptors carry geo).
const geoCcOf = (pick: PickDescriptor): string | null =>
  ("geo" in pick && pick.geo ? pick.geo.cc ?? null : null);

// Everything the per-frame node writes need, in one struct (see file header). Globe builds it each
// frame after easing its dim state.
export interface FrameCtx {
  c: DimContext;        // the pure dim context (morph/filter/country/hover/ledger…)
  dim: number;          // Globe's eased whole-core validator dim (ONE value for the DAG core)
  dimScaleV: number;    // Globe._dimScale() — the VALIDATOR morph-ramped dim strength
  dimScaleMetaV: number; // Globe._metaDimScale() — the METAGRAPH pool's own strength (0 in hyper)
  clock: number;        // Globe.clock (accumulated seconds)
  camN: THREE.Vector3;  // camera direction in the group's local frame (disc falloff)
  hasCam: boolean;
  ledgerT: number;      // 0->1 lane fly-in blend
  dt: number;           // frame delta (metagraph per-record dim easing)
  flashDecay: number;   // ~0.2s glow tail after an arc hit
  group: THREE.Group;   // the (rotating) globe group — for hub world->local conversion
  // View-transition inputs (persistent objects; Globe writes them each frame):
  transition: ViewTransition | null;
  gather: { origin: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; quat: THREE.Quaternion; cell: number };
}

export class NodeFabric {
  private nodeGroup: THREE.Group;

  // Validators (the DAG core) — two InstancedMeshes sharing one colour + glow buffer.
  instSphere: THREE.InstancedMesh | null = null;
  instHex: THREE.InstancedMesh | null = null;
  private baseArr: Float32Array = new Float32Array(0);
  private emiArr: Float32Array = new Float32Array(0);
  private aEmiSphere: THREE.InstancedBufferAttribute | null = null;
  private aEmiHex: THREE.InstancedBufferAttribute | null = null;
  private _sphereGeo: THREE.SphereGeometry | null = null;
  private _hexGeo: THREE.CylinderGeometry | null = null; // hex prism (6-seg cylinder)
  private _appliedDim = -1; // last validator dim baked into the colour buffer

  // Metagraph nodes — the same two-mesh cross-fade, coloured per metagraph.
  metaSphere: THREE.InstancedMesh | null = null;
  metaHex: THREE.InstancedMesh | null = null;
  private metaBaseArr: Float32Array = new Float32Array(0);
  private metaEmi: Float32Array = new Float32Array(0);
  private metaAESphere: THREE.InstancedBufferAttribute | null = null;
  private metaAEHex: THREE.InstancedBufferAttribute | null = null;

  // Reused pickables array (never re-allocated — the plan's allocation fix).
  readonly pickables: THREE.Object3D[] = [];

  constructor(nodeGroup: THREE.Group) {
    this.nodeGroup = nodeGroup;
  }

  get hasValidators(): boolean {
    return this.instSphere != null;
  }

  // MeshStandardMaterial patched so each instance gets its own colour and an animated emissive
  // intensity — neither is per-instance on the stock material. aBase tints the lit diffuse;
  // emissive becomes aBase * aEmissive (js/globe.js:284-298). The hex prisms render SLIGHTLY
  // TRANSPARENT (user: replaces the tried-and-rejected wireframe overlay) — depthWrite stays on
  // so the chip stacks still occlude each other cleanly.
  // Hex prisms (flat=true) additionally get the EDGE-LIT CHIP treatment (user: the uniform
  // emissive read dull, especially dense DAG stacks): the emissive is redistributed — dimmer
  // SIDES, a bright TOP CAP (backlit-acrylic look; the prism's caps are exactly ±Y in local
  // space, so `objectNormal.y` is the cap mask), plus a view-dependent FRESNEL rim so each
  // chip's silhouette catches light and the stack gaps read as dark seams between lit chips.
  // Coefficients keep the AVERAGE energy near the old flat value so filter/hover dims and the
  // bloom threshold behave unchanged. Glintier surface (roughness .3, metalness .35) so the
  // flat-shaded facets vary under the key light. Spheres (hyper) keep the original flat
  // emissive; the ledger's standing chips are hex instances, so they share the edge-lit look.
  private _makeNodeMaterial(flat = false, alpha = 1): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: flat ? 0.3 : 0.5, metalness: flat ? 0.35 : 0.2,
      // smooth-shaded everywhere: the chips are ROUND now (flat shading was the hex prisms'
      // facet-definition trick); the edge-lit cap/fresnel treatment is shading-independent.
      transparent: alpha < 1, opacity: alpha,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aBase;\nattribute float aEmissive;\nvarying vec3 vBase;\nvarying float vEmi;\nvarying float vCap;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBase = aBase;\nvEmi = aEmissive;\nvCap = max(0.0, objectNormal.y);");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBase;\nvarying float vEmi;\nvarying float vCap;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vBase;")
        .replace(
          "#include <emissivemap_fragment>",
          flat
            ? // edge-lit chip: dim sides + bright cap + fresnel rim (`normal` is the flat-shaded
              // view-space normal here; vViewPosition normalized points fragment→camera).
              "#include <emissivemap_fragment>\n" +
              "float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n" +
              "totalEmissiveRadiance = vBase * vEmi * (0.5 + 0.95 * vCap + 1.1 * fres);"
            : // spheres (hyper nodes): a view-dependent FRESNEL rim so they read as glowing 3D orbs
              // instead of flat blobs (user). Coeffs keep the average near the old flat vEmi so the
              // dim/hover and bloom-threshold behaviour is unchanged. The rim is the shared
              // ORB_FRESNEL chunk (HyperView's core/hub orbs replay the same tail).
              "#include <emissivemap_fragment>\n" +
              ORB_FRESNEL_GLSL +
              `totalEmissiveRadiance = vBase * vEmi * ${ORB_FRESNEL_MIX};`,
        );
    };
    return mat;
  }

  // -------------------------------------------------- build the shared validator meshes
  // js/globe.js:178-208 — the two InstancedMeshes + shared aBase/aEmissive buffers, sized to the
  // records Globe has already built. Fills aBase/picks from the records; caches the base geometries.
  buildValidators(records: ValidatorRecord[]): void {
    const total = records.length;
    const baseArr = new Float32Array(total * 3);
    const emiArr = new Float32Array(total).fill(0.5);
    const picks = new Array(total);

    const sphereGeo = (this._sphereGeo ||= new THREE.SphereGeometry(0.5, 16, 12)).clone();
    // GEO node: a round CHIP (user, 2026-07-10 — was a hex prism; only the geometry changed,
    // the edge-lit cap/side treatment stays): unit radius, unit height, scaled to
    // (geoSize, HEX_H, geoSize). Identifiers keep their hex-era names.
    const hexGeo = (this._hexGeo ||= new THREE.CylinderGeometry(1, 1, 1, 32)).clone();
    const wrap = (geo: THREE.BufferGeometry): THREE.InstancedBufferAttribute => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.aEmiSphere = wrap(sphereGeo);
    this.aEmiHex = wrap(hexGeo);

    const mkMesh = (geo: THREE.BufferGeometry, side: THREE.Side, hexEdges = false): THREE.InstancedMesh => {
      const mat = this._makeNodeMaterial(hexEdges, hexEdges ? HEX_ALPHA : 1);
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false; // instances span the whole scene; base bounds would mis-cull
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.instSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.instHex = mkMesh(hexGeo, THREE.FrontSide, true); // flat-shaded, slightly transparent prism
    this.baseArr = baseArr;
    this.emiArr = emiArr;

    for (const u of records) {
      const c = u.base;
      baseArr[u.index * 3] = c.r; baseArr[u.index * 3 + 1] = c.g; baseArr[u.index * 3 + 2] = c.b;
      picks[u.index] = u.pick;
    }
    (this.instSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.instHex.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;

    this._appliedDim = -1;
    this.pickables.length = 0;
    this.pickables.push(this.instSphere);
  }

  disposeValidators(): void {
    for (const mesh of [this.instSphere, this.instHex]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.instSphere = this.instHex = null;
  }

  // -------------------------------------------------- build the metagraph meshes
  // js/globe.js:583-617 — same two-mesh cross-fade as the validators, fresh geometries (not cached),
  // sized to the metagraph records Globe built. Assigns each record's `index` + fills aBase/picks.
  buildMetaNodes(records: MetaNodeRecord[]): void {
    const total = records.length;
    if (!total) return;

    const baseArr = new Float32Array(total * 3);
    const emiArr = new Float32Array(total).fill(0.5);
    const picks = new Array(total);
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 12);
    const hexGeo = new THREE.CylinderGeometry(1, 1, 1, 32); // round chip (see the validator note)
    const wrap = (geo: THREE.BufferGeometry): THREE.InstancedBufferAttribute => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.metaAESphere = wrap(sphereGeo);
    this.metaAEHex = wrap(hexGeo);

    const mkMesh = (geo: THREE.BufferGeometry, side: THREE.Side, hexEdges = false): THREE.InstancedMesh => {
      const mat = this._makeNodeMaterial(hexEdges, hexEdges ? HEX_ALPHA : 1);
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.metaSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.metaHex = mkMesh(hexGeo, THREE.FrontSide, true); // flat-shaded, slightly transparent prism

    records.forEach((r, i) => {
      r.index = i;
      baseArr[i * 3] = r.color.r; baseArr[i * 3 + 1] = r.color.g; baseArr[i * 3 + 2] = r.color.b;
      picks[i] = r.pick;
    });
    (this.metaSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.metaHex.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;

    this.metaEmi = emiArr;
    this.metaBaseArr = baseArr;
  }

  disposeMeta(): void {
    for (const mesh of [this.metaSphere, this.metaHex]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.metaSphere = this.metaHex = null;
  }

  // -------------------------------------------------- per-view pickables (reused array)
  // js/globe.js:927-929 — the exact mesh set this frame's view raycasts.
  pickablesFor(w: number, ledger: boolean): THREE.Object3D[] {
    const arr = this.pickables;
    arr.length = 0;
    // Hyper picks the sphere instances; geo (once the landing cross-fade has mostly
    // completed) AND ledger pick the chips (ledger's nodes ARE standing chips now).
    if (this.instSphere) arr.push(!ledger && w < 0.5 ? this.instSphere : this.instHex!);
    const mp = ledger || w >= 0.5 ? this.metaHex : this.metaSphere;
    if (mp) arr.push(mp);
    return arr;
  }

  // Blend the composed pose toward the node's staging-grid slot by its staggered gather
  // weight (view-transition choreography). Runs on the already-final _dummy pose so it is
  // the LAST word on position/scale; ctx.gather's vectors are group-LOCAL (Globe converts
  // the camera-anchored plane once per frame). Uniform GATHER_SCALE reads as tidy grid dots.
  // Per-record gather weight for this frame (0 when no transition is live) — computed ONCE
  // per record at the top of each write loop and shared by the shape crossfade, the
  // visibility lifts, and _applyGather, so the choreography can't self-disagree.
  private _gatherW(ctx: FrameCtx, rank: number, count: number): number {
    const tr = ctx.transition;
    return tr && tr.active() ? tr.gatherWeight(rank, count) : 0;
  }

  private _applyGather(ctx: FrameCtx, gU: number, gV: number, gw: number, primary: boolean): void {
    if (gw <= 0) return;
    // A dynamically-invisible non-primary (e.g. a hybrid's shell record hidden in geo) already
    // wrote a zero scale — it doesn't fly, it stays zero-scaled wherever it is. Without this,
    // GATHER_SCALE/max(1e-6, scale.x) blows up into a huge multiplier that only stays inert
    // because 0×huge=0; bail explicitly instead of relying on that accident.
    if (_dummy.scale.x < 1e-4) return;
    _gatherV
      .copy(ctx.gather.origin)
      .addScaledVector(ctx.gather.right, gU * ctx.gather.cell)
      .addScaledVector(ctx.gather.up, gV * ctx.gather.cell);
    _dummy.position.lerp(_gatherV, gw);
    // Face the camera with the biggest surface (user): slerp toward the staging basis —
    // local +Y (the chip's bright top cap; the cylinder axis) aimed at the viewer, X/Z
    // pinned to the grid's right/up so the parked squares sit still (no residual tumble).
    _dummy.quaternion.slerp(ctx.gather.quat, gw);
    const s = 1 + (GATHER_SCALE / Math.max(1e-6, _dummy.scale.x) - 1) * gw;
    _dummy.scale.multiplyScalar(s);
    // Non-primary shell instances share their MACHINE's grid pixel (the squares count
    // machines) — overlapping there exactly would z-fight and read as nodes vanishing
    // (user, the SWAP case). Instead they ABSORB: shrink into the pixel as they converge,
    // re-emerging on dispersal — three chips visibly merge into one machine pixel.
    if (!primary) _dummy.scale.multiplyScalar(1 - gw);
  }

  // -------------------------------------------------- setMorph loop: validator matrices
  // js/globe.js:850-930's node block. Writes the instSphere/instHex matrices for the current
  // morph (or the ledger lane placement), sets their visibility, and returns the reused pickables.
  placeValidators(records: ValidatorRecord[], ctx: FrameCtx): THREE.Object3D[] {
    if (!this.instSphere || !this.instHex) return this.pickables;
    const { c, dim, dimScaleV, ledgerT, clock: t, camN, hasCam } = ctx;
    const m = c.morph;
    const e = smooth(m);
    // Keep the spheres full-size for the whole flight so their movement reads clearly, then
    // cross-fade them into the circles only at the last moment, once the nodes have essentially
    // arrived at the globe surface.
    const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1)); // sphere → chip squash phase
    for (const u of records) {
      // Snapshots (ledger) view: hard-place as standing CHIPS on the floor planes (the same
      // cylinder geometry as geo, HEX_H tall — user 2026-07-12: the old squashed-sphere COIN
      // was an edge-on sliver the raycaster could barely hit; the chip's top cap + sides are
      // a real target, so the ledger needs no pick assist). DAG cl1 nodes drop into the
      // DAG-L1 row.
      const gw = this._gatherW(ctx, u.gRank, u.gCount);
      const prim = u.geoPrimary !== false;
      // Effective squash: the STAGING SHAPE is the chip (the grid's "square pixel", top cap
      // to the camera) — each node crossfades sphere→chip ALONG its gather flight instead of
      // popping at the boundary's morph snap (user: no shape jump at the staging area).
      const wEff = w + (1 - w) * gw;
      if (c.ledger) {
        if (u.ledgerHide) {
          _dummy.scale.setScalar(0);
        } else {
          if (u.noGeo) _vec.copy(u.hyperPos);
          else _vec.copy(u.hyperDir).lerp(u.geoDir!, e).normalize().multiplyScalar(lerp(u.hyperRadius, u.geoRadius, e));
          let showL = 1 - dim * dimScaleV;
          showL += (1 - showL) * gw; // the square shows the WHOLE fleet — dim-hidden nodes lift in
          _dummy.position.copy(_vec).lerp(u.ledgerPos, ledgerT);
          _dummy.quaternion.identity(); // standing on the floor — cylinder axis is +Y
          const sL = u.hyperSize * LEDGER.dot * showL;
          _dummy.scale.set(sL, HEX_H * showL, sL);
          this._applyGather(ctx, u.gU, u.gV, gw, prim);
        }
        _dummy.updateMatrix();
        this.instHex.setMatrixAt(u.index, _dummy.matrix);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.instSphere.setMatrixAt(u.index, _dummy.matrix);
        continue;
      }
      // Shared position: fly from the fibonacci shell to the globe surface.
      let dir: THREE.Vector3;
      if (u.noGeo) {
        dir = u.hyperDir;
        _dummy.position.copy(u.hyperPos);
      } else {
        dir = _vec.copy(u.hyperDir).lerp(u.geoDir!, e).normalize();
        _dummy.position.copy(dir).multiplyScalar(lerp(u.hyperRadius, u.geoRadius, e));
      }

      // Off-filter nodes vanish on the hyper->globe morph but stay visible (just dimmed) in hyper —
      // the hide scales with the morph `m` (via dimScaleV). See js/globe.js:896-904.
      let hideV = dim;
      const geoCc = geoCcOf(u.pick);
      if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) hideV = Math.max(hideV, c.countryMix);
      let show = 1 - hideV * dimScaleV; // SAME ramped dim as the validator glow
      show += (1 - show) * gw; // parked squares show the whole fleet (dim re-applies on landing)

      // Sphere: tumbling on its own axis, cross-fading into the chip ALONG the gather flight
      // (wEff; noGeo nodes keep the plain morph squash — they have no geo chip to become).
      _qSpin.setFromAxisAngle(u.spinAxis, u.spinPhase + t * u.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      _dummy.scale.setScalar(u.hyperSize * (1 - (u.noGeo ? w : wEff)) * (u.noGeo ? 1 - e : 1) * show);
      this._applyGather(ctx, u.gU, u.gV, gw, prim);
      _dummy.updateMatrix();
      this.instSphere.setMatrixAt(u.index, _dummy.matrix);

      // HEX PRISM: standing tangent on the plateau (prism axis = radial, local +Y after _qRadial),
      // growing in as the node lands; stack level is baked into geoRadius (honeycomb cells +
      // poker-stack levels); still eases out toward the limb (discFall) so the horizon stays clean.
      const fall = hasCam ? discFall(dir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Y_AXIS, dir);
      _dummy.quaternion.copy(_qRadial);
      // fall lifts with gw: a far-side chip must still fill its staging pixel mid-flight.
      const gV = u.noGeo ? 0 : wEff * (fall + (1 - fall) * gw) * show;
      _dummy.scale.set(u.geoSize * gV, HEX_H * gV, u.geoSize * gV);
      this._applyGather(ctx, u.gU, u.gV, gw, prim);
      _dummy.updateMatrix();
      this.instHex.setMatrixAt(u.index, _dummy.matrix);
    }
    const trOn = !!(ctx.transition && ctx.transition.active());
    this.instSphere.instanceMatrix.needsUpdate = true;
    this.instHex.instanceMatrix.needsUpdate = true;
    this.instSphere.visible = (w < 0.999 && !c.ledger) || trOn; // transitions crossfade per node
    this.instHex.visible = w > 0.001 || c.ledger || trOn; //       (both meshes live mid-flight)
    return this.pickablesFor(w, c.ledger);
  }

  // -------------------------------------------------- update loop: validator glow + colour
  // js/globe.js:1017-1072. Reads the (already-eased) dim; writes emissive + (when a transition or a
  // country drill is in flight) the base colour; decays each node's arc flash.
  writeValidatorGlow(records: ValidatorRecord[], ctx: FrameCtx): void {
    if (!this.instSphere || !this.instHex || !this.aEmiSphere || !this.aEmiHex) return;
    const { c, dim, dimScaleV, flashDecay } = ctx;
    const m = c.morph;
    const cf = c.countryFilter, cmix = c.countryMix;
    // While a country drill-down is active, per-node dim varies, so recolour every frame; otherwise
    // only during a layer-dim transition.
    const recolour = cf != null || cmix > 0.001 ||
      Math.abs(dim - this._appliedDim) > 0.001;
    const base = this.baseArr;
    const emi = this.emiArr;
    // A hovered/selected node dims the rest so it stands out — same in both views.
    const focusId = c.hoverNodeId || c.selectedNodeId || c.hoverCohort;
    const dimOthersOnFocus = c.filter === "all" || c.filter === "dag";
    // Per-view hover/selection dim (user): how far the OTHER nodes drop when one node is the
    // focus. Softer in geo (the rest stay brighter), a notch stronger in ledger, hyper unchanged.
    const focusDim = c.ledger ? 0.55 : 0.45 + 0.20 * m; // hyper 0.45 · geo 0.65 · ledger 0.55
    // Per-view focus BOOST — halved in geo/ledger where the chips' brighter base blew out at the
    // flat 1.4 (user, 2026-07-17). Mirrors domain/dimModel.focusBoost — change BOTH.
    const focusBoost = c.ledger ? 0.7 : 1.4 - 0.7 * m; // hyper 1.4 · geo 0.7 · ledger 0.7
    for (const u of records) {
      let d = dim * dimScaleV;
      const geoCc = geoCcOf(u.pick);
      // outside the drilled-into country? dim it on top of the network dim (geo only).
      if (cf && (!geoCc || geoCc !== cf)) d = Math.max(d, cmix);
      // SAME glow model as the metagraph nodes (user: the DAG's globe hexes must read like any
      // metagraph's — one node language). Base LIFTED in hyper (nodes read too dim on the flat
      // backdrop) and eased DOWN on the globe (they read too hot against the density light pools,
      // esp. the dense DAG stacks) — user. Steady; the old twinkle shimmer was removed.
      const ei = 0.47 - 0.10 * m;
      const flRaw = u._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[u.index] = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
      // Hover/selection pairing: the focused machine's every layer-shell glows together, and the
      // rest dim back so it stands out (only when not already isolating a metagraph).
      if (focusId) {
        if (u.nodeId === c.hoverNodeId || u.nodeId === c.selectedNodeId || (!!u.nodeId && c.hoverCohort?.has(u.nodeId))) emi[u.index] += focusBoost;
        else if (dimOthersOnFocus) emi[u.index] *= focusDim;
      }
      if (flRaw) u._flash = flRaw * flashDecay;

      if (recolour) {
        const col = _col.copy(u.base).lerp(DIM, d * 0.85);
        base[u.index * 3] = col.r; base[u.index * 3 + 1] = col.g; base[u.index * 3 + 2] = col.b;
      }
    }
    // Both meshes share emiArr; flag both attributes for re-upload.
    this.aEmiSphere.needsUpdate = true;
    this.aEmiHex.needsUpdate = true;
    if (recolour) {
      (this.instSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.instHex.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
      this._appliedDim = dim;
    }
  }

  // -------------------------------------------------- update loop: metagraph nodes (full)
  // js/globe.js:1079-1159. Eases each record's own dim, writes both meshes' matrices + emissive +
  // colour, and sets their visibility. Coloured per metagraph; the hub orbit is converted into the
  // globe group's local frame each frame.
  writeMetaFrame(records: MetaNodeRecord[], ctx: FrameCtx): void {
    if (!this.metaSphere || !this.metaHex || !this.metaAESphere || !this.metaAEHex) return;
    const { c, clock, dt, dimScaleMetaV, ledgerT, camN, hasCam, group, flashDecay } = ctx;
    const m = c.morph;
    const e = smooth(m);                                              // flight progress
    const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1)); // sphere → chip squash phase
    const kk = Math.min(1, dt * 4);
    const emi = this.metaEmi;
    const base = this.metaBaseArr;
    const cf = c.countryFilter, cmix = c.countryMix;
    const focusId = c.hoverNodeId || c.selectedNodeId || c.hoverCohort;
    const dimOthersOnFocus = c.filter === "all" || c.filter === "dag";
    // Per-view hover/selection dim (user): how far the OTHER nodes drop when one node is the
    // focus. Softer in geo (the rest stay brighter), a notch stronger in ledger, hyper unchanged.
    const focusDim = c.ledger ? 0.55 : 0.45 + 0.20 * m; // hyper 0.45 · geo 0.65 · ledger 0.55
    // Per-view focus BOOST (see the validator loop's note; mirrors domain/dimModel.focusBoost).
    const focusBoost = c.ledger ? 0.7 : 1.4 - 0.7 * m; // hyper 1.4 · geo 0.7 · ledger 0.7
    for (const r of records) {
      r.dim += (r.dimTarget - r.dim) * kk;
      const gw = this._gatherW(ctx, r.gRank, r.gCount);
      const prim = r.geoPrimary !== false;
      const wEff = w + (1 - w) * gw; // staging shape = the chip (see the validator loop)
      // effective dim = network dim × the METAGRAPH strength (dimScaleMetaV — ZERO in hyper:
      // these nodes rest at the dimmed look there, so hover/commit can't move them; mirrors
      // domain/dimModel.metaNodeDim), raised by the country dim when outside the drilled-into
      // country (geo only). In LEDGER the dim is FULL (morph frozen).
      let dEff = r.dim * (c.ledger ? 0.82 : dimScaleMetaV);
      const geoCc = geoCcOf(r.pick);
      if (cf && (!geoCc || geoCc !== cf)) dEff = Math.max(dEff, cmix);
      // Base glow rests LOW in hyper (0.33 — the old 0.47 × the retired 0.32-dim suppression:
      // the dimmed look IS the resting look now, user 2026-07-17), easing UP to the unchanged
      // globe value (0.37) as the nodes land.
      const glow = (0.33 + 0.04 * m) * (1 - dEff * 0.9);
      // The COMMITTED metagraph's own nodes glow at the hub's resting level (HyperView hub base
      // 0.72) in the Hypergraph, so the picked network's nodes bloom like its hub instead of sitting
      // at the dimmer node base (user). Fades out with the hubs by morph 0.3 — there's no hub on the
      // globe. Mirrors domain/dimModel.hubMatchBoost (composed inside metaNodeEmissive's floor) —
      // change BOTH. The per-node hover/select focusBoost below still layers on top.
      const hubMatch =
        c.filter === r.metaId ? Math.max(0, 0.72 - glow) * THREE.MathUtils.clamp(1 - m / 0.3, 0, 1) : 0;
      const flRaw = r._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[r.index] = Math.max(0.03, glow + fl + hubMatch);
      // Hover/selection pairing: the focused node's shells glow together; the rest dim back.
      if (focusId) {
        if (r.nodeId === c.hoverNodeId || r.nodeId === c.selectedNodeId || c.hoverCohort?.has(r.nodeId)) emi[r.index] += focusBoost;
        else if (dimOthersOnFocus) emi[r.index] *= focusDim;
      }
      if (flRaw) r._flash = flRaw * flashDecay;

      const col = _col.copy(r.color).lerp(DIM, dEff * 0.85);
      base[r.index * 3] = col.r; base[r.index * 3 + 1] = col.g; base[r.index * 3 + 2] = col.b;

      // Snapshots (ledger) view: fly in from the source-view layout to the node's lane slot.
      if (c.ledger) {
        if (r.hubGroup) { r.hubGroup.getWorldPosition(_vec); group.worldToLocal(_vec).add(r.offset); }
        else _vec.copy(r.hyperPos);
        _geoVec.copy(_vec).lerp(r.geoPos, e).lerp(r.ledgerPos, ledgerT);
      } else {
        // Hypergraph anchor = the hub's current orbit position, expressed in this group's local
        // frame (so it stays glued to the hub as the globe spins). WORLD position, not the root-local
        // `.position`, because the hyper structure (root + this group) is tilted by HYPER_TILT.
        if (r.hubGroup) {
          r.hubGroup.getWorldPosition(_vec);
          group.worldToLocal(_vec).add(r.offset);
        } else {
          _vec.copy(r.hyperPos);
        }
        _geoVec.copy(_vec).lerp(r.geoPos, e);
      }

      _dummy.position.copy(_geoVec);
      if (c.ledger) {
        // Ledger: a standing CHIP on the floor plane (the geo cylinder, HEX_H tall — see the
        // validator loop) — same size rule as the validators (uniform dot for every cluster).
        // Filtered-out nodes shrink out (1 - dEff).
        _dummy.quaternion.identity(); // standing on the floor — cylinder axis is +Y
        const visL = (1 - dEff) + dEff * gw; // parked squares show the whole fleet
        const sL = r.hyperSize * LEDGER.dot * visL;
        _dummy.scale.set(sL, HEX_H * visL, sL);
        this._applyGather(ctx, r.gU, r.gV, gw, prim);
        _dummy.updateMatrix();
        this.metaHex.setMatrixAt(r.index, _dummy.matrix);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.metaSphere.setMatrixAt(r.index, _dummy.matrix);
        continue;
      }

      // Sphere: tumbling on its own axis, cross-fading out as the node lands (see the validator
      // loop), resting at META_REST_SCALE in hyper and easing back to full size over the flight
      // (so the sphere→chip handoff stays exactly as before). Filtered-out metagraph nodes
      // shrink fully (1 - dEff; geo only — dEff is pinned 0 in hyper).
      _qSpin.setFromAxisAngle(r.spinAxis, r.spinPhase + clock * r.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      const rest = META_REST_SCALE + (1 - META_REST_SCALE) * m;
      const visM = (1 - dEff) + dEff * gw; // parked squares show the whole fleet
      _dummy.scale.setScalar(r.hyperSize * rest * (1 - wEff) * visM);
      this._applyGather(ctx, r.gU, r.gV, gw, prim);
      _dummy.updateMatrix();
      this.metaSphere.setMatrixAt(r.index, _dummy.matrix);

      // HEX PRISM standing tangent at geoPos (honeycomb cell + stack level baked in). Hide (not
      // dim) metagraph nodes outside the selection — the (1 - dEff) factor shrinks them fully out.
      const fall = hasCam ? discFall(r.geoDir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Y_AXIS, r.geoDir);
      _dummy.quaternion.copy(_qRadial);
      const visH = (1 - dEff) + dEff * gw;
      const gM = wEff * (fall + (1 - fall) * gw) * visH; // fall lifts with gw (see validators)
      _dummy.scale.set(r.geoSize * gM, HEX_H * gM, r.geoSize * gM);
      this._applyGather(ctx, r.gU, r.gV, gw, prim);
      _dummy.updateMatrix();
      this.metaHex.setMatrixAt(r.index, _dummy.matrix);
    }
    const trOnM = !!(ctx.transition && ctx.transition.active());
    this.metaSphere.instanceMatrix.needsUpdate = true;
    this.metaHex.instanceMatrix.needsUpdate = true;
    this.metaSphere.visible = (w < 0.999 && !c.ledger) || trOnM;
    this.metaHex.visible = w > 0.001 || c.ledger || trOnM;
    this.metaAESphere.needsUpdate = true;
    this.metaAEHex.needsUpdate = true;
    (this.metaSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.metaHex.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
