// Owns the single shared set of validator nodes and morphs them between two layouts driven by
// `morph` (0 = Hypergraph shells, 1 = geographic globe):
//   - Hypergraph: fibonacci shells around the core (L0 inner, L1 outer).
//   - Geography:  each node at its real lat/lon on the globe surface.
// The SAME node objects move between the two — they never disappear/reappear. The globe surface,
// coastlines, heatmap and arcs fade in via opacity as nodes arrive, so node radii always match the
// (full-size, non-scaled) globe.
//
// This is the COORDINATOR half of the old js/globe.js: it holds the records + filter/country/hover
// state, does the geo relayout (fan-out, heatmap + arc rebuild), the spin/aim/focus logic, and the
// setMorph/update orchestration — delegating the instanced-mesh writes to NodeFabric, the density
// rings to Heatmap, the travelling packets to Arcs (+ the pure ArcSim), and the globe surface to
// buildGeoView. Its public surface is exactly the old GlobeApi (boundary.ts) so the Engine's
// call sites are unchanged.

import * as THREE from "three";
import { COLORS, METAGRAPHS, metaAnchor, DEFAULT_META_COLOR, ledgerSite, ledgerSpread, clusterRadius, LEDGER } from "../config";
import * as geoStats from "../domain/geoStats";
import { R, LAND_H, latLonToVec3 } from "../domain/geoMath";
import { GOLDEN_ANGLE, fibShellPos, nodeRoles, spreadCoLocated, type Cluster } from "../domain/nodeLayout";
import { surfFade, extrasFade } from "../domain/morph";
import { ArcSim, type ArcEndpoint } from "../domain/arcSim";
import type { DimContext } from "../domain/dimModel";
import type { MetaNodeRecord, ValidatorRecord } from "../domain/records";
import { buildGeoView, type GeoViewHost } from "./views/GeoView";
import { NodeFabric, type FrameCtx } from "./objects/NodeFabric";
import { Heatmap } from "./objects/Heatmap";
import { Arcs } from "./objects/Arcs";
import type { HyperView } from "./views/HyperView";
import type {
  CountryStat,
  DagCore,
  GeoInfo,
  GeoMap,
  NodeRow,
  PickDescriptor,
  RouteMetagraph,
  RouteNode,
} from "@/src/data/types";

const _focusMat = new THREE.Matrix4(); // scratch for reading an instance's live transform

// null = idle spin; a focus state = ease-in-out to a focus orientation (y = longitude swing, x =
// latitude tilt so high-lat nodes come into view).
interface SpinState {
  from: number;
  to: number;
  fromX: number;
  toX: number;
  t: number;
  dur: number;
}

// A metagraph augmented with the layout facts Globe computes on it in setMetagraphs.
type MetaLayout = RouteMetagraph & {
  color: number;
  _anchor: ReturnType<typeof metaAnchor>;
  _ledgerCol: number;
};

const geoOf = (pick: PickDescriptor): GeoInfo | undefined => ("geo" in pick ? pick.geo : undefined);

export class Globe implements GeoViewHost {
  group: THREE.Group;
  private nodeGroup: THREE.Group;
  private layers: HyperView | null;
  private camera: THREE.Camera | null;
  private _camN = new THREE.Vector3(); // camera direction in this group's local frame
  private _hasCam = false;

  pickables: THREE.Object3D[] = [];
  nodes: ValidatorRecord[] = [];
  geoFades: GeoViewHost["geoFades"] = []; // { mat, base } surface materials faded by morph
  morph = 0;
  private ledgerT = 0; // 0->1 ease as the reused node meshes fly from their source view into the lanes
  clock = 0;
  private spin: SpinState | null = null;
  private ledger = false;
  // View-derived sim gates, set by the Engine from VIEW_POLICIES (see setSimFlags). arcs replaces
  // the old `!this.ledger` gate on the travelling packets; globeSpin gates the idle group spin.
  private simArcs = true;
  private simSpin = true;
  countryFilter: string | null = null; // cc to drill into (combined with the network filter), or null
  private countryMix = 0;              // eased 0..1: how strongly the country dim is applied
  l0Count = 0;
  l1Count = 0;
  // The raised coastal wall rim — a fixed soft ice-blue.
  _edgeColor = new THREE.Color(0x9ccad6);
  private _edgeTarget = new THREE.Color(0x9ccad6);

  // Highlight/dim state: each validator layer eases its own dim level (0 = bright, 1 = dimmed).
  private dim = { l0: 0, l1: 0 };
  private dimTarget = { l0: 0, l1: 0 };

  metaNodes: MetaNodeRecord[] = [];
  metaList: MetaLayout[] = [];
  ledgerGroups: Record<string, { l0: number; l1: number }> = {};
  filter = "all";
  private _hoverNodeId: string | null = null;
  private _selectedNodeId: string | null = null;
  private _hoverFilterActive = false;

  // Identity SCENE-hue map (id -> 0xRRGGBB), set by the Engine each refreshMeta before setMetagraphs.
  sceneColors?: Record<string, number>;

  // Surface handles filled by buildGeoView (sphere/atmosphere sync; land async).
  sphereMesh?: THREE.Mesh;
  atmoUniforms?: GeoViewHost["atmoUniforms"];
  landWallUniforms?: GeoViewHost["landWallUniforms"];
  landFillMat?: THREE.MeshStandardMaterial;
  landFillMesh?: THREE.Mesh;

  private fabric: NodeFabric;
  private heatmap: Heatmap;
  private arcs: Arcs;
  private arcSim = new ArcSim();

  constructor(scene: THREE.Scene, layers: HyperView | null = null, camera: THREE.Camera | null = null) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.layers = layers; // for gluing metagraph nodes to their orbiting hubs
    this.camera = camera; // for the view-dependent disc falloff at the limb

    this.nodeGroup = new THREE.Group();
    this.group.add(this.nodeGroup);

    this.fabric = new NodeFabric(this.nodeGroup);
    this.heatmap = new Heatmap(this.group);
    this.arcs = new Arcs(this.group);

    // The geo globe surface (body, graticule, atmosphere, continents) — it sets the surface handles
    // back on `this` for the morph/fade loop and pushes its fade materials into this.geoFades.
    buildGeoView(this);
  }

  // View-derived sim gates from VIEW_POLICIES (the Engine calls this on every mode change). Only the
  // arcs + globeSpin flags concern the Globe; the rest of the sims object is ignored here.
  setSimFlags(sims: { arcs: boolean; globeSpin: boolean }): void {
    this.simArcs = sims.arcs;
    this.simSpin = sims.globeSpin;
  }

  // The wall is always the fixed ice-blue. Kept as a setter so the Engine caller doesn't change.
  setEdgeColor(_color: number | null): void {
    this._edgeTarget.set(0x9ccad6);
  }

  // -------------------------------------------------- build the shared validator nodes
  // `dagCore` = the DAG modelled as a metagraph-shaped core: one node per MACHINE, each with `roles`
  // (a hybrid runs several layers). We plot one instance per (machine, role); counts are by ROLE.
  setNodes(dagCore: DagCore | null, geoMap: GeoMap): void {
    this.fabric.disposeValidators();
    this.nodes = [];
    const machines: RouteNode[] = (dagCore && dagCore.nodes) || [];
    const l0List = machines.filter((m) => m.roles && m.roles.includes("l0"));
    const cl1List = machines.filter((m) => m.roles && m.roles.includes("cl1"));
    this.l0Count = l0List.length;
    this.l1Count = cl1List.length;

    const seen = new Set<string>();
    let idx = 0;
    const net = (dagCore && dagCore.name) || "DAG";
    const place = (list: RouteNode[], role: "l0" | "cl1", kind: "l0" | "l1", color: number, rad: number, flatten: number) => {
      const n = list.length;
      list.forEach((node, i) => {
        const ready = node.state === "Ready";
        // The first instance of a machine is its geo "primary" (the one dot on the globe).
        const primary = node.id == null || !seen.has(node.id);
        if (node.id != null) seen.add(node.id);
        const col = new THREE.Color(color);
        if (!ready) col.lerp(NODE_DIM, 0.55);

        const hyperPos = fibShellPos(i, n, rad, flatten);
        const g = geoMap[node.ip];
        const geoDir = g ? latLonToVec3(g.lat!, g.lon!, 1).normalize() : null;

        // Ledger (Snapshots) view: DAG cl1 = $DAG block producers → DAG-L1 floor; l0 = Global L0
        // validators → hypergraph-L0 floor.
        const lsp = ledgerSpread(i, n, LEDGER.dagCell);
        const ledgerPos = new THREE.Vector3(lsp.x, role === "l0" ? LEDGER.rowHypL0 : LEDGER.rowDAGL1, lsp.z);

        const pick = {
          kind, title: net, roles: nodeRoles(node, role), node, geo: g || null,
          sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
        } as unknown as PickDescriptor;
        const u: ValidatorRecord = {
          index: idx, layer: role, roles: node.roles || [role], nodeId: node.id, geoPrimary: primary, ready, base: col.clone(),
          ledgerPos, ledgerHide: role !== "cl1" && role !== "l0",
          hyperPos, hyperDir: hyperPos.clone().normalize(), hyperRadius: hyperPos.length(),
          geoDir, trueDir: geoDir ? geoDir.clone() : null, geoRadius: R + LAND_H + 0.02, noGeo: !g,
          hyperSize: 0.55 * (ready ? 1 : 0.78), geoSize: primary ? 0.06 * (ready ? 1 : 0.78) : 0,
          azimuth: Math.atan2(hyperPos.z, hyperPos.x), twinkle: Math.random() * 6.2831,
          spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
          spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
          pick,
        };
        this.nodes.push(u);
        idx++;
      });
    };
    // The DAG's own validator shells are coloured with the DAG's identity SCENE hue (sceneColors.dag),
    // falling back to the old structural colours if not populated yet.
    const dagColor = (this.sceneColors && this.sceneColors.dag) ?? COLORS.l0;
    place(l0List, "l0", "l0", dagColor, 8, 1.0);
    place(cl1List, "cl1", "l1", dagColor, 14, 0.78);

    this.fabric.buildValidators(this.nodes);
    this.pickables = this.fabric.pickables;

    // Fan out the filter-active nodes and (re)build the density rings + arcs.
    this._relayoutGeo();
    this.setMorph(this.morph); // place at current morph
  }

  // -------------------------------------------------- metagraph nodes
  // `list` is /api/metagraphs; geoMap supplies each node's location. Only metagraphs with at least
  // one locatable node are kept.
  setMetagraphs(list: RouteMetagraph[], geoMap: GeoMap): void {
    this.fabric.disposeMeta();
    this.metaNodes = [];

    const withNodes = ((list || []).filter((m) =>
      (m.nodes || []).some((n) => geoMap[n.ip]))) as MetaLayout[];
    const n = METAGRAPHS.length;
    withNodes.forEach((m) => {
      const ci = METAGRAPHS.findIndex((c) => c.id === m.id);
      const cfg = ci >= 0 ? METAGRAPHS[ci] : null;
      m.color = (this.sceneColors && this.sceneColors[m.id]) ?? (cfg ? cfg.color : DEFAULT_META_COLOR);
      m._anchor = metaAnchor(ci >= 0 ? ci : 0, n);
      m._ledgerCol = ci >= 0 ? ci : 0; // column slot in the Snapshots view (config order)
    });
    this.metaList = withNodes;

    const recs: MetaNodeRecord[] = [];
    // Each metagraph runs its own L0 + currency-L1 (cl1) + data-L1 (dl1). Concentric fibonacci
    // shells around the hub — L0 inner, data-L1 middle, currency-L1 outer.
    const SHELL: Record<"l0" | "dl1" | "cl1", number> = { l0: 2.0, dl1: 3.4, cl1: 4.6 };
    const rolesOf = (node: RouteNode) => nodeRoles(node, node.layer as string);
    const shellLayers: ("l0" | "dl1" | "cl1")[] = ["l0", "dl1", "cl1"];
    for (const m of withNodes) {
      const a = m._anchor;
      const hubGroup = this.layers?.metas?.find((x) => x.cfg.id === m.id)?.group || null;
      const located = m.nodes.filter((node) => geoMap[node.ip]);
      const seen = new Set<string>();
      for (const layer of shellLayers) {
        const nodeList = located.filter((node) => rolesOf(node).includes(layer));
        const cnt = nodeList.length;
        const rad = SHELL[layer];
        nodeList.forEach((node, i) => {
          const g = geoMap[node.ip]!;
          const primary = !seen.has(node.ip);
          seen.add(node.ip);
          const y = 1 - (i / Math.max(1, cnt - 1)) * 2;
          const rr = Math.sqrt(Math.max(0, 1 - y * y));
          const phi = i * GOLDEN_ANGLE;
          const offset = new THREE.Vector3(Math.cos(phi) * rr * rad, y * rad, Math.sin(phi) * rr * rad);
          const dir = latLonToVec3(g.lat!, g.lon!, 1).normalize(); // real location; fanned out below
          const lsite = ledgerSite(m._ledgerCol, METAGRAPHS.length);
          const lrowY = layer === "l0" ? LEDGER.rowML0 : LEDGER.rowML1;
          const lsp = ledgerSpread(i, cnt, clusterRadius(cnt) * 0.75);
          const ledgerPos = new THREE.Vector3(lsite.x + lsp.x, lrowY, lsite.z + lsp.z);
          const pick = {
            kind: "metanode", meta: m, node, geo: g, layer,
            title: m.name, roles: rolesOf(node),
            sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
          } as unknown as PickDescriptor;
          recs.push({
            metaId: m.id, layer, color: new THREE.Color(m.color), index: 0,
            hubGroup, offset, ledgerPos, geoPrimary: primary, nodeId: node.ip,
            hyperPos: new THREE.Vector3(a.x, a.y, a.z).add(offset),
            geoPos: new THREE.Vector3(),
            geoDir: dir, trueDir: dir.clone(),
            hyperSize: 0.52, geoSize: primary ? 0.0667 : 0,
            spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
            spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
            twinkle: Math.random() * 6.2831, dim: 0, dimTarget: 0,
            pick,
          });
        });
      }
    }
    if (!recs.length) return;

    this.fabric.buildMetaNodes(recs);
    this.metaNodes = recs;
    // Per-metagraph node counts per ledger floor (ML0 = l0; ML1 = cl1+dl1) — sizes the rings.
    const groups: Record<string, { l0: number; l1: number }> = {};
    for (const r of recs) {
      const g = (groups[r.metaId] ||= { l0: 0, l1: 0 });
      if (r.layer === "l0") g.l0 += 1; else g.l1 += 1;
    }
    this.ledgerGroups = groups;
    this.setFilter(this.filter);
  }

  // Isolate one network on the globe and dim the rest.
  setFilter(sel: string): void {
    this.filter = sel;
    this.countryFilter = null; // switching network clears the country drill-down
    this._applyDim(sel);
    this._relayoutGeo();
  }

  // Transient PREVIEW dim (filter-chip hover): same dim TARGETS as setFilter, but does NOT commit
  // `this.filter` or relayout geo. While previewing, the dim is forced STRONG (_hoverFilterActive).
  setHoverFilter(sel: string | null): void {
    this._hoverFilterActive = sel != null;
    this._applyDim(sel || this.filter);
  }

  // Set the dim TARGETS for a selection (the dim itself eases each frame).
  private _applyDim(sel: string): void {
    const dagLit = sel === "all" || sel === "dag";
    this.dimTarget.l0 = dagLit ? 0 : 1;
    this.dimTarget.l1 = dagLit ? 0 : 1;
    for (const r of this.metaNodes) r.dimTarget = (sel === "all" || sel === r.metaId) ? 0 : 1;
  }

  // Narrow the current network selection to a single country (cc), or null to clear.
  setCountry(cc: string | null): void {
    this.countryFilter = cc || null;
    this._relayoutGeo();
  }

  // Hover-pairing: pass the hovered node's id; the per-frame glow loops brighten every instance
  // that shares it. null clears the highlight.
  setHoverNode(id: string | null): void {
    this._hoverNodeId = id || null;
  }

  // The persistently selected node (a clicked node card) — glows every layer shell it runs.
  setSelectedNode(id: string | null): void {
    this._selectedNodeId = id || null;
  }

  // World position of a node's HYPERGRAPH point by its id — read from its live instance transform.
  hyperWorldPos(id: string | null): THREE.Vector3 | null {
    if (!id) return null;
    const u = this.nodes.find((n) => n.nodeId === id);
    if (u && this.fabric.instSphere) {
      this.fabric.instSphere.getMatrixAt(u.index, _focusMat);
      return this.group.localToWorld(new THREE.Vector3().setFromMatrixPosition(_focusMat));
    }
    const r = this.metaNodes && this.metaNodes.find((n) => n.nodeId === id);
    if (r && this.fabric.metaSphere) {
      this.fabric.metaSphere.getMatrixAt(r.index, _focusMat);
      return this.group.localToWorld(new THREE.Vector3().setFromMatrixPosition(_focusMat));
    }
    return null;
  }

  // Whether a node is part of the current network filter. `id` is the core a node belongs to.
  private _isActive(id: string): boolean {
    return this.filter === "all" || this.filter === id;
  }

  // Whether a node passes BOTH the network filter and the country drill-down.
  private _nodeActive(layerOrMetaId: string, geo: GeoInfo | undefined | null): boolean {
    return this._isActive(layerOrMetaId) &&
      (!this.countryFilter || (!!geo && geo.cc === this.countryFilter));
  }

  // Aim the globe so a unit direction `dir` swings to the front (see js/globe.js:730-737).
  private _aimAt(dir: THREE.Vector3, maxTilt: number, raise = 0): void {
    const fromY = this.group.rotation.y;
    let dy = -Math.atan2(dir.x, dir.z) - fromY;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)); // shortest way round
    const h = Math.hypot(dir.x, dir.z);
    const tilt = Math.max(-maxTilt, Math.min(maxTilt, Math.atan2(dir.y, h) - raise));
    this.spin = { from: fromY, to: fromY + dy, fromX: this.group.rotation.x, toX: tilt, t: 0, dur: 1.3 };
  }

  // Aim the globe so the densest part of the current filter's located nodes faces the camera.
  // Returns the selection's concentration R = |mean of node dirs| (0..1), or null.
  focusDensest(on: boolean): number | null {
    if (!on) { this.spin = null; return null; }
    const mean = new THREE.Vector3();
    let count = 0;
    for (const u of this.nodes) if (!u.noGeo && u.geoPrimary && this._nodeActive("dag", geoOf(u.pick))) { mean.add(u.trueDir!); count++; }
    for (const r of this.metaNodes) if ((r.geoPrimary ?? true) && this._nodeActive(r.metaId, geoOf(r.pick))) { mean.add(r.trueDir); count++; }
    if (!count || mean.lengthSq() < 1e-6) { this.spin = null; return null; }
    const conc = mean.length() / count;
    this._aimAt(mean.clone().normalize(), 0.56); // ~32° max lean for a broad selection
    return conc;
  }

  // Aim a single node's location to the centre of the view. False if no lat/lon.
  focusNode(geo: { lat?: number; lon?: number } | null | undefined): boolean {
    if (!geo || geo.lat == null || geo.lon == null) return false;
    this._aimAt(latLonToVec3(geo.lat, geo.lon, 1).normalize(), 0.70, 0.12); // ≤40° tilt, ~7° raise
    return true;
  }

  // -------------------------------------------------- per-country breakdown (geoStats wrappers)
  countryStats(filter: string = this.filter): CountryStat[] {
    return geoStats.countryStats(this.nodes, this.metaNodes, filter);
  }
  listNodes(filter: string = this.filter): NodeRow[] {
    return geoStats.listNodes(this.nodes, this.metaNodes, filter);
  }

  // Re-fan the co-located nodes and rebuild the density rings + arcs using ONLY the filter-active
  // nodes. Inactive (dimmed) nodes collapse back to their true location and drop out of the arc pool.
  private _relayoutGeo(): void {
    const clusters: Cluster[] = [];

    // Validators: active ones fan out among themselves; the rest reset to point.
    const vActive: ValidatorRecord[] = [];
    for (const u of this.nodes) {
      if (u.noGeo) continue;
      u.geoDir!.copy(u.trueDir!);
      if (u.geoPrimary && this._nodeActive("dag", geoOf(u.pick))) vActive.push(u);
    }
    if (vActive.length) clusters.push(...spreadCoLocated(vActive.map((u) => u.geoDir!)));

    // Metagraph nodes: same treatment, then re-drop each onto the globe surface.
    const mActive: MetaNodeRecord[] = [];
    for (const r of this.metaNodes) {
      r.geoDir.copy(r.trueDir);
      if (!(r.geoPrimary ?? true)) continue; // hybrid siblings: hidden on the globe
      if (this._nodeActive(r.metaId, geoOf(r.pick))) mActive.push(r);
    }
    if (mActive.length) clusters.push(...spreadCoLocated(mActive.map((r) => r.geoDir), { spacingDeg: 0.4, maxDeg: 2 }));
    for (const r of this.metaNodes) r.geoPos.copy(r.geoDir).multiplyScalar(R + LAND_H + 0.02);

    this.heatmap.rebuild(clusters);

    // Arcs only connect the filter-active nodes, drawn from their fanned-out positions. Each endpoint
    // carries a POOL-LOCAL index (not the per-mesh record index, which collides across the two
    // arrays) so the sim's flashHits map straight to `arcRecs`; the tint reads .base / .color.
    const arcPts: ArcEndpoint[] = [];
    const arcRecs: (ValidatorRecord | MetaNodeRecord)[] = [];
    for (const u of vActive) if (u.ready) {
      const i = arcPts.length;
      arcRecs.push(u);
      arcPts.push({ dir: u.geoDir!, node: { index: i, base: u.base } });
    }
    for (const r of mActive) {
      const i = arcPts.length;
      arcRecs.push(r);
      arcPts.push({ dir: r.geoDir, node: { index: i, color: r.color } });
    }
    this.arcSim.rebuild(arcPts);
    this.arcs.rebuildFrom(this.arcSim, arcRecs);
  }

  // Camera direction expressed in this group's local frame (disc facing = a plain dot product).
  private _updateCamN(): void {
    this._hasCam = !!this.camera;
    if (!this._hasCam) return;
    this._camN.copy(this.camera!.position);
    this.group.worldToLocal(this._camN).normalize();
  }

  // How strong the network/country dim is, ramped by the morph (js/globe.js:830-833).
  private _dimScale(): number {
    if (this._hoverFilterActive) return 0.85; // strong dim while previewing a filter-chip hover
    return 0.32 + 0.68 * this.morph;
  }

  // Build the one FrameCtx struct NodeFabric's per-frame writes consume.
  private _frameCtx(dt: number, flashDecay: number): FrameCtx {
    const c: DimContext = {
      morph: this.morph,
      hoverFilterActive: this._hoverFilterActive,
      ledger: this.ledger,
      countryFilter: this.countryFilter,
      countryMix: this.countryMix,
      hoverNodeId: this._hoverNodeId,
      selectedNodeId: this._selectedNodeId,
      filter: this.filter,
    };
    return {
      c, dim: this.dim, dimScaleV: this._dimScale(), clock: this.clock,
      camN: this._camN, hasCam: this._hasCam, ledgerT: this.ledgerT, dt, flashDecay, group: this.group,
    };
  }

  // -------------------------------------------------- morph between layouts
  setLedger(on: boolean): void {
    if (this.ledger === on) return;
    this.ledger = on;
    // The Snapshots view appears DIRECTLY in position — no entry animation: axis-aligned (spin
    // snapped to 0) and the nodes placed straight into their lanes (ledgerT = 1). Only the camera eases.
    if (on) {
      this.group.rotation.set(0, 0, 0);
      this.ledgerT = 1;
    }
  }

  setMorph(m: number): void {
    this.morph = m;
    this._updateCamN();
    const ctx = this._frameCtx(0, 0); // dt/flashDecay unused by the matrix loop
    this.pickables = this.fabric.placeValidators(this.nodes, ctx);

    // The globe surface fades in only once nodes are well on their way; heatmap/arcs later still. In
    // ledger the surface is hidden OUTRIGHT (not eased by morph).
    const surf = this.ledger ? 0 : surfFade(m);
    const extras = this.ledger ? 0 : extrasFade(m);
    if (this.sphereMesh) this.sphereMesh.visible = !this.ledger && m > 0.05; // out of hyper + ledger
    for (const f of this.geoFades) f.mat.opacity = f.base * surf;
    if (this.landWallUniforms) this.landWallUniforms.uOpacity.value = surf;
    if (this.landFillMesh) this.landFillMesh.visible = !this.ledger && m > 0.05; // opacity via geoFades
    if (this.atmoUniforms) this.atmoUniforms.uM.value = surf;
    this.heatmap.fade(extras);
    this.arcs.setUM(extras);
  }

  update(dt: number): void {
    this.clock += dt;
    // Ease the wall colour (held at the default cyan).
    if (this.landWallUniforms) {
      this._edgeColor.lerp(this._edgeTarget, Math.min(1, dt * 3));
      this.landWallUniforms.uColor.value.copy(this._edgeColor);
    }
    if (this.ledger) {
      // Ease the lane fly-in (ledgerT 0->1); the spin was already snapped to 0 in setLedger.
      this.ledgerT += (1 - this.ledgerT) * Math.min(1, dt * 2.2);
      this.group.rotation.set(0, 0, 0);
    } else if (this.spin) {
      // Ease-in-out to the focus orientation (longitude + tilt), then hold there.
      const s = this.spin;
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = s.t < 0.5 ? 2 * s.t * s.t : 1 - Math.pow(-2 * s.t + 2, 2) / 2;
        this.group.rotation.y = s.from + (s.to - s.from) * e;
        this.group.rotation.x = (s.fromX || 0) + ((s.toX || 0) - (s.fromX || 0)) * e;
      }
    } else if (this.simSpin) {
      this.group.rotation.y += dt * 0.03; // idle spin (gated by the view policy's globeSpin)
      // Ease any focus tilt back to level when idling.
      if (this.group.rotation.x) this.group.rotation.x += (0 - this.group.rotation.x) * Math.min(1, dt * 2.2);
    }
    const m = this.morph;
    const flashDecay = Math.max(0, 1 - dt * 5); // ~0.2s glow tail after a hit

    // Travelling packets: step the sim (a hard no-op when the gate is off — the ledger "red dots"
    // fix), then write its buffers only while the gate is on (geo view, past the morph midpoint).
    const arcEnabled = this.simArcs && m > 0.5;
    const { retargeted } = this.arcSim.step(dt, arcEnabled);
    if (arcEnabled && this.arcs.hasArcs) this.arcs.writeFrame(this.arcSim, retargeted);

    // Ease the per-layer dim levels + the country mix, then hand a fresh FrameCtx to the fabric.
    if (this.fabric.hasValidators) {
      const k = Math.min(1, dt * 4);
      this.dim.l0 += (this.dimTarget.l0 - this.dim.l0) * k;
      this.dim.l1 += (this.dimTarget.l1 - this.dim.l1) * k;
      this.countryMix += ((this.countryFilter ? 1 : 0) - this.countryMix) * k;
    }
    const ctx = this._frameCtx(dt, flashDecay);
    if (this.fabric.hasValidators) this.fabric.writeValidatorGlow(this.nodes, ctx);
    this.fabric.writeMetaFrame(this.metaNodes, ctx);
  }
}

// Off-ready validator tint — mirrors js/globe.js's module-level DIM.
const NODE_DIM = new THREE.Color(0x223046);
