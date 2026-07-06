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
import { LEDGER } from "../../config";
import { discFall, lerp, smooth } from "../../domain/nodeLayout";
import type { DimContext, DimState } from "../../domain/dimModel";
import type { MetaNodeRecord, ValidatorRecord } from "../../domain/records";
import type { PickDescriptor } from "@/src/data/types";

const Z_AXIS = new THREE.Vector3(0, 0, 1);
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
  dim: DimState;        // Globe's eased per-layer validator dims { l0, l1 }
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
  instDisc: THREE.InstancedMesh | null = null;
  private baseArr: Float32Array = new Float32Array(0);
  private emiArr: Float32Array = new Float32Array(0);
  private aEmiSphere: THREE.InstancedBufferAttribute | null = null;
  private aEmiDisc: THREE.InstancedBufferAttribute | null = null;
  private _sphereGeo: THREE.SphereGeometry | null = null;
  private _discGeo: THREE.CircleGeometry | null = null;
  private readonly _appliedDim = { l0: -1, l1: -1 }; // last dim baked into the colour buffer

  // Metagraph nodes — the same two-mesh cross-fade, coloured per metagraph.
  metaSphere: THREE.InstancedMesh | null = null;
  metaDisc: THREE.InstancedMesh | null = null;
  private metaBaseArr: Float32Array = new Float32Array(0);
  private metaEmi: Float32Array = new Float32Array(0);
  private metaAESphere: THREE.InstancedBufferAttribute | null = null;
  private metaAEDisc: THREE.InstancedBufferAttribute | null = null;

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
  // emissive becomes aBase * aEmissive (js/globe.js:284-298).
  private _makeNodeMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.5, metalness: 0.2,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aBase;\nattribute float aEmissive;\nvarying vec3 vBase;\nvarying float vEmi;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBase = aBase;\nvEmi = aEmissive;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBase;\nvarying float vEmi;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vBase;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = vBase * vEmi;");
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
    const discGeo = (this._discGeo ||= new THREE.CircleGeometry(1, 24)).clone();
    const wrap = (geo: THREE.BufferGeometry): THREE.InstancedBufferAttribute => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.aEmiSphere = wrap(sphereGeo);
    this.aEmiDisc = wrap(discGeo);

    const mkMesh = (geo: THREE.BufferGeometry, side: THREE.Side): THREE.InstancedMesh => {
      const mat = this._makeNodeMaterial();
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false; // instances span the whole scene; base bounds would mis-cull
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.instSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.instDisc = mkMesh(discGeo, THREE.DoubleSide); // visible even at the globe's limb
    this.baseArr = baseArr;
    this.emiArr = emiArr;

    for (const u of records) {
      const c = u.base;
      baseArr[u.index * 3] = c.r; baseArr[u.index * 3 + 1] = c.g; baseArr[u.index * 3 + 2] = c.b;
      picks[u.index] = u.pick;
    }
    (this.instSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.instDisc.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;

    this._appliedDim.l0 = -1; this._appliedDim.l1 = -1;
    this.pickables.length = 0;
    this.pickables.push(this.instSphere);
  }

  disposeValidators(): void {
    for (const mesh of [this.instSphere, this.instDisc]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.instSphere = this.instDisc = null;
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
    const discGeo = new THREE.CircleGeometry(1, 24);
    const wrap = (geo: THREE.BufferGeometry): THREE.InstancedBufferAttribute => {
      geo.setAttribute("aBase", new THREE.InstancedBufferAttribute(baseArr, 3));
      const aE = new THREE.InstancedBufferAttribute(emiArr, 1);
      aE.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aEmissive", aE);
      return aE;
    };
    this.metaAESphere = wrap(sphereGeo);
    this.metaAEDisc = wrap(discGeo);

    const mkMesh = (geo: THREE.BufferGeometry, side: THREE.Side): THREE.InstancedMesh => {
      const mat = this._makeNodeMaterial();
      mat.side = side;
      const mesh = new THREE.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.picks = picks;
      this.nodeGroup.add(mesh);
      return mesh;
    };
    this.metaSphere = mkMesh(sphereGeo, THREE.FrontSide);
    this.metaDisc = mkMesh(discGeo, THREE.DoubleSide); // visible even at the limb

    records.forEach((r, i) => {
      r.index = i;
      baseArr[i * 3] = r.color.r; baseArr[i * 3 + 1] = r.color.g; baseArr[i * 3 + 2] = r.color.b;
      picks[i] = r.pick;
    });
    (this.metaSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.metaDisc.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;

    this.metaEmi = emiArr;
    this.metaBaseArr = baseArr;
  }

  disposeMeta(): void {
    for (const mesh of [this.metaSphere, this.metaDisc]) {
      if (!mesh) continue;
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.metaSphere = this.metaDisc = null;
  }

  // -------------------------------------------------- per-view pickables (reused array)
  // js/globe.js:927-929 — the exact mesh set this frame's view raycasts.
  pickablesFor(w: number, ledger: boolean): THREE.Object3D[] {
    const arr = this.pickables;
    arr.length = 0;
    if (this.instSphere) arr.push(ledger || w < 0.5 ? this.instSphere : this.instDisc!);
    const mp = w < 0.5 ? this.metaSphere : this.metaDisc;
    if (mp) arr.push(mp);
    return arr;
  }

  // -------------------------------------------------- setMorph loop: validator matrices
  // js/globe.js:850-930's node block. Writes the instSphere/instDisc matrices for the current
  // morph (or the ledger lane placement), sets their visibility, and returns the reused pickables.
  placeValidators(records: ValidatorRecord[], ctx: FrameCtx): THREE.Object3D[] {
    if (!this.instSphere || !this.instDisc) return this.pickables;
    const { c, dim, dimScaleV, ledgerT, clock: t, camN, hasCam } = ctx;
    const m = c.morph;
    const e = smooth(m);
    // Keep the spheres full-size for the whole flight so their movement reads clearly, then
    // cross-fade them into the circles only at the last moment, once the nodes have essentially
    // arrived at the globe surface.
    const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1));
    const sphereVis = 1 - w, discVis = w;
    for (const u of records) {
      // Snapshots (ledger) view: hard-place. DAG cl1 nodes drop into the DAG-L1 row as tiny dots;
      // the l0 instances (= Global L0, the centred snapshot) are hidden.
      if (c.ledger) {
        if (u.ledgerHide) {
          _dummy.scale.setScalar(0);
        } else {
          if (u.noGeo) _vec.copy(u.hyperPos);
          else _vec.copy(u.hyperDir).lerp(u.geoDir!, e).normalize().multiplyScalar(lerp(u.hyperRadius, u.geoRadius, e));
          const showL = 1 - (u.layer === "l0" ? dim.l0 : dim.l1) * dimScaleV;
          _qSpin.setFromAxisAngle(u.spinAxis, u.spinPhase + t * u.spinSpeed);
          _dummy.position.copy(_vec).lerp(u.ledgerPos, ledgerT);
          _dummy.quaternion.copy(_qSpin);
          _dummy.scale.setScalar(u.hyperSize * LEDGER.dot * showL);
        }
        _dummy.updateMatrix();
        this.instSphere.setMatrixAt(u.index, _dummy.matrix);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.instDisc.setMatrixAt(u.index, _dummy.matrix);
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
      let hideV = u.layer === "l0" ? dim.l0 : dim.l1;
      const geoCc = geoCcOf(u.pick);
      if (c.countryFilter && (!geoCc || geoCc !== c.countryFilter)) hideV = Math.max(hideV, c.countryMix);
      const show = 1 - hideV * dimScaleV; // SAME ramped dim as the glow + the metagraph nodes

      // Sphere: tumbling on its own axis, shrinking out as it nears the globe.
      _qSpin.setFromAxisAngle(u.spinAxis, u.spinPhase + t * u.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      _dummy.scale.setScalar(u.hyperSize * sphereVis * (u.noGeo ? 1 - e : 1) * show);
      _dummy.updateMatrix();
      this.instSphere.setMatrixAt(u.index, _dummy.matrix);

      // Circle: a flat disc lying tangent on the surface (local +Z outward), growing in as the node
      // lands, and fading out toward the limb. No-geo nodes never get a disc.
      const fall = hasCam ? discFall(dir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Z_AXIS, dir);
      _dummy.quaternion.copy(_qRadial);
      _dummy.scale.setScalar(u.noGeo ? 0 : u.geoSize * discVis * fall * show);
      _dummy.updateMatrix();
      this.instDisc.setMatrixAt(u.index, _dummy.matrix);
    }
    this.instSphere.instanceMatrix.needsUpdate = true;
    this.instDisc.instanceMatrix.needsUpdate = true;
    this.instSphere.visible = sphereVis > 0.001 || c.ledger; // ledger hard-places the dots
    this.instDisc.visible = discVis > 0.001 && !c.ledger;
    return this.pickablesFor(w, c.ledger);
  }

  // -------------------------------------------------- update loop: validator glow + colour
  // js/globe.js:1017-1072. Reads the (already-eased) dim; writes emissive + (when a transition or a
  // country drill is in flight) the base colour; decays each node's arc flash.
  writeValidatorGlow(records: ValidatorRecord[], ctx: FrameCtx): void {
    if (!this.instSphere || !this.instDisc || !this.aEmiSphere || !this.aEmiDisc) return;
    const { c, dim, dimScaleV, clock, flashDecay } = ctx;
    const m = c.morph;
    const cf = c.countryFilter, cmix = c.countryMix;
    // While a country drill-down is active, per-node dim varies, so recolour every frame; otherwise
    // only during a layer-dim transition.
    const recolour = cf != null || cmix > 0.001 ||
      Math.abs(dim.l0 - this._appliedDim.l0) > 0.001 ||
      Math.abs(dim.l1 - this._appliedDim.l1) > 0.001;
    const base = this.baseArr;
    const emi = this.emiArr;
    // A hovered/selected node dims the rest so it stands out — same in both views.
    const focusId = c.hoverNodeId || c.selectedNodeId;
    const dimOthersOnFocus = c.filter === "all" || c.filter === "dag";
    const focusDim = 0.45;
    for (const u of records) {
      let d = (u.layer === "l0" ? dim.l0 : dim.l1) * dimScaleV;
      const geoCc = geoCcOf(u.pick);
      // outside the drilled-into country? dim it on top of the network dim (geo only).
      if (cf && (!geoCc || geoCc !== cf)) d = Math.max(d, cmix);
      // dim the glow on the globe so dense regions don't bloom into a blob; the lower Hypergraph
      // base lets the point-lights shade the sphere.
      let ei = lerp(0.5, 0.22, m);
      // Twinkle is a decorative (non-data-driven) shimmer — geo only (scaled by m).
      ei += Math.sin(clock * 2 + u.twinkle) * 0.06 * m;
      const flRaw = u._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[u.index] = Math.max(0.02, ei * (1 - d * 0.92) + fl); // suppress glow when dimmed
      // Hover/selection pairing: the focused machine's every layer-shell glows together, and the
      // rest dim back so it stands out (only when not already isolating a metagraph).
      if (focusId) {
        if (u.nodeId === c.hoverNodeId || u.nodeId === c.selectedNodeId) emi[u.index] += 1.4;
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
    this.aEmiDisc.needsUpdate = true;
    if (recolour) {
      (this.instSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.instDisc.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
      this._appliedDim.l0 = dim.l0;
      this._appliedDim.l1 = dim.l1;
    }
  }

  // -------------------------------------------------- update loop: metagraph nodes (full)
  // js/globe.js:1079-1159. Eases each record's own dim, writes both meshes' matrices + emissive +
  // colour, and sets their visibility. Coloured per metagraph; the hub orbit is converted into the
  // globe group's local frame each frame.
  writeMetaFrame(records: MetaNodeRecord[], ctx: FrameCtx): void {
    if (!this.metaSphere || !this.metaDisc || !this.metaAESphere || !this.metaAEDisc) return;
    const { c, clock, dt, dimScaleV, ledgerT, camN, hasCam, group, flashDecay } = ctx;
    const m = c.morph;
    const e = smooth(m);                                              // flight progress
    const w = smooth(THREE.MathUtils.clamp((m - 0.82) / 0.16, 0, 1)); // sphere -> disc
    const sphereVis = 1 - w, discVis = w;
    const kk = Math.min(1, dt * 4);
    const emi = this.metaEmi;
    const base = this.metaBaseArr;
    const cf = c.countryFilter, cmix = c.countryMix;
    const focusId = c.hoverNodeId || c.selectedNodeId;
    const dimOthersOnFocus = c.filter === "all" || c.filter === "dag";
    const focusDim = 0.45;
    for (const r of records) {
      r.dim += (r.dimTarget - r.dim) * kk;
      // effective dim = network dim (subtle in hyper via dimScaleV), raised by the country dim when
      // outside the drilled-into country (geo only). In LEDGER the dim is FULL (morph frozen).
      let dEff = r.dim * (c.ledger ? 0.82 : dimScaleV);
      const geoCc = geoCcOf(r.pick);
      if (cf && (!geoCc || geoCc !== cf)) dEff = Math.max(dEff, cmix);
      // Twinkle (decorative shimmer) is geo-only (scaled by m).
      const glow = (0.5 + Math.sin(clock * 2 + r.twinkle) * 0.12 * m) * (1 - dEff * 0.9);
      const flRaw = r._flash || 0; // brief flash when an arc pulse reaches this node
      const fl = flRaw * m; // arcs are a geo-only visual — their flash must not bleed into hyper
      emi[r.index] = Math.max(0.03, glow + fl);
      // Hover/selection pairing: the focused node's shells glow together; the rest dim back.
      if (focusId) {
        if (r.nodeId === c.hoverNodeId || r.nodeId === c.selectedNodeId) emi[r.index] += 1.4;
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

      // Sphere: tumbling on its own axis, shrinking out near the globe. Filtered-out metagraph
      // nodes shrink fully (1 - dEff).
      _dummy.position.copy(_geoVec);
      _qSpin.setFromAxisAngle(r.spinAxis, r.spinPhase + clock * r.spinSpeed);
      _dummy.quaternion.copy(_qSpin);
      // In ledger the dot is full (bypass sphereVis, which is 0 when arriving from geo).
      _dummy.scale.setScalar(r.hyperSize * (c.ledger ? LEDGER.dot : sphereVis) * (1 - dEff));
      _dummy.updateMatrix();
      this.metaSphere.setMatrixAt(r.index, _dummy.matrix);

      // Disc: flat on the surface (local +Z points outward), growing in and fading out toward the limb.
      const fall = hasCam ? discFall(r.geoDir.dot(camN)) : 1;
      _qRadial.setFromUnitVectors(Z_AXIS, r.geoDir);
      _dummy.quaternion.copy(_qRadial);
      // Hide (not dim) metagraph nodes outside the selection — shrink the disc fully out.
      _dummy.scale.setScalar(r.geoSize * discVis * (1 - dEff) * fall);
      _dummy.updateMatrix();
      this.metaDisc.setMatrixAt(r.index, _dummy.matrix);
    }
    this.metaSphere.instanceMatrix.needsUpdate = true;
    this.metaDisc.instanceMatrix.needsUpdate = true;
    this.metaSphere.visible = sphereVis > 0.001 || c.ledger; // ledger hard-places the dots
    this.metaDisc.visible = discVis > 0.001 && !c.ledger;
    this.metaAESphere.needsUpdate = true;
    this.metaAEDisc.needsUpdate = true;
    (this.metaSphere.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.metaDisc.geometry.getAttribute("aBase") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
