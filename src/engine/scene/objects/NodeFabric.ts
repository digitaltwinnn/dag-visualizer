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
import type { PickDescriptor } from "@/src/data/types";

const Y_AXIS = new THREE.Vector3(0, 1, 0); // hex-prism axis (radial after _qRadial)
// The geo hex prisms' resting opacity — slightly glassy (user: replaces the wireframe overlay,
// which never read as clean edges). Depth-write stays ON so stacks occlude normally.
const HEX_ALPHA = 0.8;
const DIM = new THREE.Color(0x223046);
const _dummy = new THREE.Object3D(); // reused to compose per-instance matrices
const _vec = new THREE.Vector3();
const _geoVec = new THREE.Vector3(); // scratch for the morph-fly interpolation
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
  dimScaleV: number;    // Globe._dimScale() — the one morph-ramped dim strength
  clock: number;        // Globe.clock (accumulated seconds)
  camN: THREE.Vector3;  // camera direction in the group's local frame (disc falloff)
  hasCam: boolean;
  ledgerT: number;      // 0->1 lane fly-in blend
  dt: number;           // frame delta (metagraph per-record dim easing)
  flashDecay: number;   // ~0.2s glow tail after an arc hit
  group: THREE.Group;   // the (rotating) globe group — for hub world->local conversion
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
            : "#include <emissivemap_fragment>\ntotalEmissiveRadiance = vBase * vEmi;",
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
      if (c.ledger) {
        if (u.ledgerHide) {
          _dummy.scale.setScalar(0);
        } else {
          if (u.noGeo) _vec.copy(u.hyperPos);
          else _vec.copy(u.hyperDir).lerp(u.geoDir!, e).normalize().multiplyScalar(lerp(u.hyperRadius, u.geoRadius, e));
          const showL = 1 - dim * dimScaleV;
          _dummy.position.copy(_vec).lerp(u.ledgerPos, ledgerT);
          _dummy.quaternion.identity(); // standing on the floor — cylinder axis is +Y
          const sL = u.hyperSize * LEDGER.dot * showL;
          _dummy.scale.set(sL, HEX_H * showL, sL);
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
      const show = 1 - hideV * dimScaleV; // SAME ramped dim as the glow + the metagraph nodes

      // Sphere: tumbling on its own axis, cross-fading out as the node lands.
      _qSpin.setFromAxisAngle(u.spinAxis, u.spinPhase + t * u.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      _dummy.scale.setScalar(u.hyperSize * (1 - w) * (u.noGeo ? 1 - e : 1) * show);
      _dummy.updateMatrix();
      this.instSphere.setMatrixAt(u.index, _dummy.matrix);

      // HEX PRISM: standing tangent on the plateau (prism axis = radial, local +Y after _qRadial),
      // growing in as the node lands; stack level is baked into geoRadius (honeycomb cells +
      // poker-stack levels); still eases out toward the limb (discFall) so the horizon stays clean.
      const fall = hasCam ? discFall(dir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Y_AXIS, dir);
      _dummy.quaternion.copy(_qRadial);
      const gV = u.noGeo ? 0 : w * fall * show;
      _dummy.scale.set(u.geoSize * gV, HEX_H * gV, u.geoSize * gV);
      _dummy.updateMatrix();
      this.instHex.setMatrixAt(u.index, _dummy.matrix);
    }
    this.instSphere.instanceMatrix.needsUpdate = true;
    this.instHex.instanceMatrix.needsUpdate = true;
    this.instSphere.visible = w < 0.999 && !c.ledger;
    this.instHex.visible = w > 0.001 || c.ledger; // ledger's chips are hex/cylinder instances
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
    for (const u of records) {
      let d = dim * dimScaleV;
      const geoCc = geoCcOf(u.pick);
      // outside the drilled-into country? dim it on top of the network dim (geo only).
      if (cf && (!geoCc || geoCc !== cf)) d = Math.max(d, cmix);
      // SAME glow model as the metagraph nodes (user: the DAG's globe hexes must read like any
      // metagraph's — one node language): 0.42 base lifted +0.08 on the globe (base eased back
      // from 0.5 — user: nodes read too hot up close when a metagraph is selected). Steady — the
      // old twinkle shimmer was removed (user).
      const ei = 0.42 + 0.08 * m;
      const flRaw = u._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[u.index] = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
      // Hover/selection pairing: the focused machine's every layer-shell glows together, and the
      // rest dim back so it stands out (only when not already isolating a metagraph).
      if (focusId) {
        if (u.nodeId === c.hoverNodeId || u.nodeId === c.selectedNodeId || (!!u.nodeId && c.hoverCohort?.has(u.nodeId))) emi[u.index] += 1.4;
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
    const { c, clock, dt, dimScaleV, ledgerT, camN, hasCam, group, flashDecay } = ctx;
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
    for (const r of records) {
      r.dim += (r.dimTarget - r.dim) * kk;
      // effective dim = network dim (subtle in hyper via dimScaleV), raised by the country dim when
      // outside the drilled-into country (geo only). In LEDGER the dim is FULL (morph frozen).
      let dEff = r.dim * (c.ledger ? 0.82 : dimScaleV);
      const geoCc = geoCcOf(r.pick);
      if (cf && (!geoCc || geoCc !== cf)) dEff = Math.max(dEff, cmix);
      const glow = (0.42 + 0.08 * m) * (1 - dEff * 0.9); // steady, = validators' (twinkle removed, geo lift eased back — user)
      const flRaw = r._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[r.index] = Math.max(0.03, glow + fl);
      // Hover/selection pairing: the focused node's shells glow together; the rest dim back.
      if (focusId) {
        if (r.nodeId === c.hoverNodeId || r.nodeId === c.selectedNodeId || c.hoverCohort?.has(r.nodeId)) emi[r.index] += 1.4;
        else if (dimOthersOnFocus) emi[r.index] *= focusDim;
      }
      if (flRaw) r._flash = flRaw * flashDecay;

      const col = _col.copy(r.color).lerp(DIM, dEff * 0.85);
      base[r.index * 3] = col.r; base[r.index * 3 + 1] = col.g; base[r.index * 3 + 2] = col.b;

      // Snapshots (ledger) view: fly in from the source-view layout to the node's lane slot.
      if (c.ledger) {
        if (r.hubGroup) { _vec.copy(r.hubGroup.position); group.worldToLocal(_vec).add(r.offset); }
        else _vec.copy(r.hyperPos);
        _geoVec.copy(_vec).lerp(r.geoPos, e).lerp(r.ledgerPos, ledgerT);
      } else {
        // Hypergraph anchor = the hub's current orbit position, expressed in this group's local
        // frame (so it stays glued to the hub as the globe spins).
        if (r.hubGroup) {
          _vec.copy(r.hubGroup.position);
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
        const sL = r.hyperSize * LEDGER.dot * (1 - dEff);
        _dummy.scale.set(sL, HEX_H * (1 - dEff), sL);
        _dummy.updateMatrix();
        this.metaHex.setMatrixAt(r.index, _dummy.matrix);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.metaSphere.setMatrixAt(r.index, _dummy.matrix);
        continue;
      }

      // Sphere: tumbling on its own axis, cross-fading out as the node lands (see the validator
      // loop). Filtered-out metagraph nodes shrink fully (1 - dEff).
      _qSpin.setFromAxisAngle(r.spinAxis, r.spinPhase + clock * r.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      _dummy.scale.setScalar(r.hyperSize * (1 - w) * (1 - dEff));
      _dummy.updateMatrix();
      this.metaSphere.setMatrixAt(r.index, _dummy.matrix);

      // HEX PRISM standing tangent at geoPos (honeycomb cell + stack level baked in). Hide (not
      // dim) metagraph nodes outside the selection — the (1 - dEff) factor shrinks them fully out.
      const fall = hasCam ? discFall(r.geoDir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Y_AXIS, r.geoDir);
      _dummy.quaternion.copy(_qRadial);
      const gM = w * fall * (1 - dEff);
      _dummy.scale.set(r.geoSize * gM, HEX_H * gM, r.geoSize * gM);
      _dummy.updateMatrix();
      this.metaHex.setMatrixAt(r.index, _dummy.matrix);
    }
    this.metaSphere.instanceMatrix.needsUpdate = true;
    this.metaHex.instanceMatrix.needsUpdate = true;
    this.metaSphere.visible = w < 0.999 && !c.ledger;
    this.metaHex.visible = w > 0.001 || c.ledger; // ledger's chips are hex/cylinder instances
    this.metaAESphere.needsUpdate = true;
    this.metaAEHex.needsUpdate = true;
    (this.metaSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.metaHex.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
