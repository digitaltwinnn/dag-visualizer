// Owns the single shared set of validator nodes and morphs them between two layouts driven by
// `morph` (0 = Hypergraph shells, 1 = geographic globe):
//   - Hypergraph: fibonacci shells around the core (L0 inner, L1 outer).
//   - Geography:  each node at its real lat/lon on the globe surface.
// The SAME node objects move between the two — they never disappear/reappear. The globe surface,
// coastlines and arcs fade in via opacity as nodes arrive, so node radii always match the
// (full-size, non-scaled) globe.
//
// This is the COORDINATOR half of the old js/globe.js: it holds the records + filter/country/hover
// state, does the geo relayout (honeycomb fan-out + arc rebuild), the spin/aim/focus logic, and the
// setMorph/update orchestration — delegating the instanced-mesh writes to NodeFabric, the density
// the travelling packets to Arcs (+ the pure ArcSim), and the globe surface to
// buildGeoView. Its public surface is a typed TS class imported directly by the Engine — no
// boundary/cast layer needed.

import * as THREE from "three";
import { METAGRAPHS, DEFAULT_META_COLOR } from "../config";
import { metaAnchor } from "../domain/hyperLayout";
import { LEDGER, ledgerSite, ledgerSpread, clusterRadius } from "../domain/ledgerLayout";
import type { SceneColors } from "../sceneColors";
import * as geoStats from "../domain/geoStats";
import { R, LAND_H, CHIP_PITCH, HEX_H, VALIDATOR_HEX_R, META_HEX_R, latLonToVec3, vec3ToLatLon } from "../domain/geoLayout";
import { GOLDEN_ANGLE, fibShellPos, nodeRoles, spreadCoLocated } from "../domain/nodeLayout";
import { surfFade, extrasFade } from "../domain/morph";
import { ArcSim, type ArcEndpoint } from "../domain/arcSim";
import type { MetaNodeRecord, ValidatorRecord } from "../domain/records";
import { buildGeoView, setCountryBorder, type GeoViewHost } from "./views/GeoView";
import { ccToNumeric, countryCcAt, countryLean, geometryRings, mainPolygonRings, ringsAngularRadius, ringsCentroid, type Ring } from "../domain/countryShape";
import { NodeFabric, type FrameCtx } from "./objects/NodeFabric";
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

// Geo chip helpers: a node's chip CENTRE sits half its height above the plateau (level 0),
// each stack level adds CHIP_PITCH; hexPitchDeg(r) is the angular distance between ADJACENT
// honeycomb cells. The chips are ROUND now (radius r), so neighbours touch at 2·r
// (diameter), not the hex prisms' √3·r edge-to-edge — same 4% air on top.
const HEX_BASE_R = R + LAND_H + 0.02 + HEX_H / 2;
const hexPitchDeg = (r: number) => ((2 * r * 1.04) / (R + LAND_H)) * (180 / Math.PI);

const _focusMat = new THREE.Matrix4(); // scratch for reading an instance's live transform
// The ledger's whole-view orientation (tilt ∘ rotY), baked into every node's ledger position so the
// nodes match the LedgerView group's transform. Scale is applied separately (uniform).
const _LEDGER_M = new THREE.Matrix4()
  .makeRotationX(LEDGER.viewTiltX)
  .multiply(new THREE.Matrix4().makeRotationY(LEDGER.viewRotY));

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
  // The geo hologram is the accent (colors.core = --primary); the whole globe is one hue and stays
  // calm via low opacity/brightness, not a bespoke teal. geoColor is the stable value GeoView reads
  // for the land grid + sea graticule; _edgeColor is the (eased) coastal-wall colour. Set from the
  // CSS token in the constructor. Never identity-tinted (structural scene lane).
  geoColor = 0x000000;
  private _dagCore = 0x000000;
  _edgeColor = new THREE.Color();
  private _edgeTarget = new THREE.Color();

  // Highlight/dim state: each validator layer eases its own dim level (0 = bright, 1 = dimmed).
  // ONE whole-core dim (the old per-layer {l0,l1} pair always moved in lockstep — collapsed).
  private dim = 0;
  private dimTarget = 0;

  metaNodes: MetaNodeRecord[] = [];
  metaList: MetaLayout[] = [];
  filter = "all";
  private _hoverNodeId: string | null = null;
  private _selectedNodeId: string | null = null;
  private _hoverFilterActive = false;
  private _hoverCountryCc: string | null = null; // explorer row hover — border preview only

  // Identity SCENE-hue map (id -> 0xRRGGBB), set by the Engine each refreshMeta before setMetagraphs.
  sceneColors?: Record<string, number>;

  // Surface handles filled by buildGeoView (graticule sync; land async). The hologram globe
  // has NO opaque body sphere and no atmosphere halo — the coastal rim + land glass ARE the
  // globe; the far side shows through dimly, which is the point of the hologram look.
  landWallUniforms?: GeoViewHost["landWallUniforms"];
  landFillMat?: THREE.MeshBasicMaterial;
  landFillMesh?: THREE.Mesh;
  facingUniform?: GeoViewHost["facingUniform"]; // shared camera-facing uniform (graticule + walls)
  closeUniform?: GeoViewHost["closeUniform"];   // shared closeness uniform (wall sharpening + far-side damp)
  poleRoses?: GeoViewHost["poleRoses"];         // the polar compass roses (faded per frame here)
  countryGeoms?: GeoViewHost["countryGeoms"];   // per-country geometries (drill border + framing)
  countryBorder?: GeoViewHost["countryBorder"]; // the drill border LineSegments + its fade entry
  onCountriesReady?: GeoViewHost["onCountriesReady"];

  private fabric: NodeFabric;
  private arcs: Arcs;
  private arcSim = new ArcSim();

  // The one FrameCtx struct NodeFabric's per-frame writes consume — allocated ONCE (in the
  // constructor, after `group`/`dim`/`_camN` exist) and mutated in place each call (setMorph +
  // update both call _frameCtx every frame); `dim`/`camN`/`group` are already-persistent fields
  // referenced directly, so only the scalars + the nested DimContext get written per call (Task 15
  // allocation fix — this used to allocate a fresh FrameCtx + DimContext object twice per frame).
  private _ctx!: FrameCtx;

  constructor(scene: THREE.Scene, layers: HyperView | null, camera: THREE.Camera | null, colors: SceneColors) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.layers = layers; // for gluing metagraph nodes to their orbiting hubs
    this.camera = camera; // for the view-dependent disc falloff at the limb
    this.geoColor = colors.core;   // the geo hologram = the accent (calm via opacity); wall + grid + graticule
    this._dagCore = colors.dagCore;  // DAG validator-node fallback hue
    this._edgeColor.setHex(colors.core);
    this._edgeTarget.setHex(colors.core);

    this.nodeGroup = new THREE.Group();
    this.group.add(this.nodeGroup);

    this.fabric = new NodeFabric(this.nodeGroup);
    this.arcs = new Arcs(this.group);

    this._ctx = {
      c: {
        morph: 0, hoverFilterActive: false, ledger: false, countryFilter: null,
        countryMix: 0, hoverNodeId: null, selectedNodeId: null, filter: "all",
      },
      dim: 0, dimScaleV: 0, clock: 0, camN: this._camN, hasCam: false,
      ledgerT: 0, dt: 0, flashDecay: 0, group: this.group,
    };

    // The geo globe surface (body, graticule, atmosphere, continents) — it sets the surface handles
    // back on `this` for the morph/fade loop and pushes its fade materials into this.geoFades.
    // The countries topology arrives async: re-assert any drill/hover border made before then.
    this.onCountriesReady = () => this._updateCountryBorder();
    buildGeoView(this);
  }

  // View-derived sim gates from VIEW_POLICIES (the Engine calls this on every mode change). Only the
  // arcs + globeSpin flags concern the Globe; the rest of the sims object is ignored here.
  setSimFlags(sims: { arcs: boolean; globeSpin: boolean }): void {
    this.simArcs = sims.arcs;
    this.simSpin = sims.globeSpin;
  }

  // The wall is always the structural accent (the geo hologram hue). Kept as a setter so the Engine
  // caller doesn't change; the argument is ignored on purpose (never identity-tinted).
  setEdgeColor(_color: number | null): void {
    this._edgeTarget.setHex(this.geoColor);
  }

  // -------------------------------------------------- build the shared validator nodes
  // `dagCore` = the DAG modelled as a metagraph-shaped core: one node per MACHINE, each with `roles`
  // (a hybrid runs several layers). We plot one instance per (machine, role); counts are by ROLE.
  setNodes(dagCore: DagCore | null, geoMap: GeoMap): void {
    this.fabric.disposeValidators();
    this.nodes = [];
    this._activeCcsCache = null; // the drillable-country set follows the validator rebuild
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

        // Ledger (Snapshots) view: l0 = Global L0 validators → the central hypergraph-L0 cluster;
        // DAG cl1 = native $DAG currency (hypergraph L1) → its OWN lane, same height as hypergraph L0
        // but offset on +Z (dagLaneZ), beside the central column.
        const lsp = ledgerSpread(i, n, LEDGER.dagCell);
        const ledgerPos = (
          role === "l0"
            ? new THREE.Vector3(lsp.x, LEDGER.rowHypL0, lsp.z)
            : new THREE.Vector3(lsp.x, LEDGER.rowDAGL1, lsp.z + LEDGER.dagLaneZ)
        ).applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale); // match the LedgerView group transform

        const pick = {
          kind, title: net, roles: nodeRoles(node, role), node, geo: g || null,
          sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
        } as unknown as PickDescriptor;
        const u: ValidatorRecord = {
          index: idx, layer: role, roles: node.roles || [role], nodeId: node.id, geoPrimary: primary, ready, base: col.clone(),
          ledgerPos, ledgerHide: role !== "cl1" && role !== "l0",
          hyperPos, hyperDir: hyperPos.clone().normalize(), hyperRadius: hyperPos.length(),
          geoDir, trueDir: geoDir ? geoDir.clone() : null, geoRadius: HEX_BASE_R, noGeo: !g,
          // UNIFORM node size regardless of ready state (user: never size by status; status lives
          // in the explorer pill + node card). geoSize = hex prism CIRCUMRADIUS (world).
          hyperSize: 0.55, geoSize: primary ? VALIDATOR_HEX_R : 0,
          azimuth: Math.atan2(hyperPos.z, hyperPos.x),
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
    const dagColor = (this.sceneColors && this.sceneColors.dag) ?? this._dagCore;
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
          const lsp = ledgerSpread(i, cnt, clusterRadius(cnt) * 0.85); // slightly wider for the bigger dots
          const ledgerPos = new THREE.Vector3(lsite.x + lsp.x, lrowY, lsite.z + lsp.z)
            .applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale); // match the LedgerView group transform
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
            hyperSize: 0.52, geoSize: primary ? META_HEX_R : 0, // hex prism CIRCUMRADIUS (world)
            spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
            spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
            dim: 0, dimTarget: 0,
            pick,
          });
        });
      }
    }
    if (!recs.length) return;

    this.fabric.buildMetaNodes(recs);
    this.metaNodes = recs;
    // Re-assert the filter's dim on the fresh records — but a data REBUILD is not a filter
    // switch, so a live country drill survives it (setFilter clears the drill by design for
    // real switches; without the restore, every cluster poll wiped the drill's dim + border).
    const drill = this.countryFilter;
    this.setFilter(this.filter);
    if (drill) this.setCountry(drill);
  }

  // Isolate one network on the globe and dim the rest.
  setFilter(sel: string): void {
    this.filter = sel;
    this.countryFilter = null; // switching network clears the country drill-down
    this._activeCcsCache = null; // the drillable-country set follows the filter
    this._updateCountryBorder();
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
    this.dimTarget = dagLit ? 0 : 1;
    for (const r of this.metaNodes) r.dimTarget = (sel === "all" || sel === r.metaId) ? 0 : 1;
  }

  // Narrow the current network selection to a single country (cc), or null to clear.
  setCountry(cc: string | null): void {
    this.countryFilter = cc || null;
    this._relayoutGeo();
    this._updateCountryBorder();
  }

  // Transient border PREVIEW (explorer country-row hover): shows the country's outline at a
  // whisper level without committing the drill. The committed drill always wins.
  setHoverCountry(cc: string | null): void {
    this._hoverCountryCc = cc || null;
    this._updateCountryBorder();
  }

  // The drilled country's polygon rings ([lon,lat] degrees) from the loaded topology, or null
  // (unknown cc / topology still loading). The Engine reads this for shape-based framing too.
  countryRings(cc: string | null): Ring[] | null {
    const ccn = ccToNumeric(cc);
    const geom = ccn ? this.countryGeoms?.get(ccn) : null;
    return geom ? geometryRings(geom) : null;
  }

  // Aim the globe so the country's shape centroid faces the camera (same gentle lean cap as
  // focusDensest — the constant viewing angle comes from countryFraming's camera construction,
  // not the lean). Returns the centroid's elevation angle + the country's angular radius, or
  // null when the shape is unknown (unknown cc / topology still loading — the caller falls
  // back to the node-mean spin). Framing composes on the MAIN landmass (mainPolygonRings) —
  // the border still draws the whole country.
  focusCountryShape(cc: string | null): { latAngle: number; angularRadius: number } | null {
    const ccn = ccToNumeric(cc);
    const geom = ccn ? this.countryGeoms?.get(ccn) : null;
    const rings = geom ? mainPolygonRings(geom) : null;
    const centroid = rings?.length ? ringsCentroid(rings) : null;
    if (!rings || !centroid) return null;
    const latAngle = Math.atan2(centroid.y, Math.hypot(centroid.x, centroid.z));
    // countryLean stretches the gentle lean just enough at very high latitudes that the
    // constant-angle camera never crosses the zenith (domain + framing agree by construction).
    this._aimAt(centroid, Math.abs(countryLean(latAngle)));
    return {
      latAngle,
      angularRadius: ringsAngularRadius(rings, centroid),
    };
  }

  // Border = committed drill (full-strength hairline — brighter than the first tuning, user)
  // beats hover preview (whisper); nothing at rest. A committed drill also firms up the land
  // glass (user: "reduce the transparency a bit" while a country is selected) — the land fill's
  // resting additive base lifts while drilled; the geoFades loop applies it next frame.
  private _updateCountryBorder(): void {
    const cc = this.countryFilter ?? this._hoverCountryCc;
    const level = this.countryFilter ? 1.0 : 0.3;
    setCountryBorder(this, cc ? this.countryRings(cc) : null, cc ? level : 0);
    const landFade = this.landFillMat && this.geoFades.find((f) => f.mat === this.landFillMat);
    if (landFade) landFade.base = this.countryFilter ? 0.62 : 0.45;
  }

  // Resolve a globe-surface WORLD point to the country under it — only countries that
  // currently have filter-active nodes respond (the drillable set; open ocean and node-less
  // countries stay quiet). Drives the scene side of the bidirectional country hover pairing.
  private _hitLocal = new THREE.Vector3(); // scratch (pointer-move path)
  countryCcAtPoint(world: THREE.Vector3): string | null {
    if (!this.countryGeoms) return null;
    const local = this.group.worldToLocal(this._hitLocal.copy(world));
    const { lat, lon } = vec3ToLatLon(local);
    const active = this._activeCcs();
    return countryCcAt(lat, lon, this.countryGeoms, (cc) => active.has(cc));
  }

  // The alpha-2 codes with at least one filter-active locatable node — cached; invalidated by
  // every path that changes the active set (filter / node or metagraph rebuild).
  private _activeCcsCache: Set<string> | null = null;
  private _activeCcs(): Set<string> {
    if (this._activeCcsCache) return this._activeCcsCache;
    const s = new Set<string>();
    if (this._isActive("dag"))
      for (const u of this.nodes) {
        const g = geoOf(u.pick);
        if (!u.noGeo && g?.cc) s.add(g.cc);
      }
    for (const r of this.metaNodes) {
      const g = geoOf(r.pick);
      if (g?.cc && this._isActive(r.metaId)) s.add(g.cc);
    }
    this._activeCcsCache = s;
    return s;
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
    this._aimAt(mean.clone().normalize(), 0.32); // ≤18° lean (was 32° — a northern cluster tipped
    // the globe so far the view read as 'from the north', user; the pose looks ACROSS instead)
    return conc;
  }

  // Aim a single node's location to the centre of the view. False if no lat/lon.
  // UNCAPPED tilt (was 0.70): the cap left high-latitude nodes at a DIFFERENT residual
  // elevation than everyone else, so the fixed node camera's angle varied with latitude
  // (user: Helsinki read more horizontal). Uncapped, every node arrives at the SAME residual
  // — the 0.42 raise, matching the oblique surface-skimming angle the user approved — so the
  // pose is relative to the node's local surface at any latitude; the lean eases on deselect.
  focusNode(geo: { lat?: number; lon?: number } | null | undefined): boolean {
    if (!geo || geo.lat == null || geo.lon == null) return false;
    this._aimAt(latLonToVec3(geo.lat, geo.lon, 1).normalize(), Math.PI / 2, 0.42);
    return true;
  }

  // -------------------------------------------------- per-country breakdown (geoStats wrappers)
  countryStats(filter: string = this.filter): CountryStat[] {
    return geoStats.countryStats(this.nodes, this.metaNodes, filter);
  }
  listNodes(filter: string = this.filter): NodeRow[] {
    return geoStats.listNodes(this.nodes, this.metaNodes, filter);
  }

  // Re-fan the co-located nodes and rebuild the arcs using ONLY the filter-active nodes.
  // Inactive (dimmed) nodes collapse back to their true location and drop out of the arc pool.
  // Co-located groups come back as HEX STACKS in a honeycomb (spreadCoLocated's levels): each
  // node's stack level lifts it radially by CHIP_PITCH. (The density heatmap that used to be
  // rebuilt here was removed entirely — user decision; the honeycomb itself shows density.)
  private _relayoutGeo(): void {

    // Gather BOTH pools' active nodes, then run ONE combined fan: validators and metagraph
    // nodes at the same site must share one honeycomb + one stack chunking — fanning the pools
    // separately put each pool's first stack on the SAME centre cell (the Ashburn overlap bug).
    // Because only filter-ACTIVE nodes enter the fan, every filter change re-tiles the
    // survivors into a fresh honeycomb (inactive nodes collapse back to their true location).
    const vActive: ValidatorRecord[] = [];
    for (const u of this.nodes) {
      if (u.noGeo) continue;
      u.geoDir!.copy(u.trueDir!);
      u.geoRadius = HEX_BASE_R; // rest on the plateau until the fan assigns a level
      if (u.geoPrimary && this._nodeActive("dag", geoOf(u.pick))) vActive.push(u);
    }
    const mActive: MetaNodeRecord[] = [];
    const mLevel = new Map<MetaNodeRecord, number>();
    for (const r of this.metaNodes) {
      r.geoDir.copy(r.trueDir);
      if (!(r.geoPrimary ?? true)) continue; // hybrid siblings: hidden on the globe
      if (this._nodeActive(r.metaId, geoOf(r.pick))) mActive.push(r);
    }
    if (vActive.length + mActive.length) {
      const lv: number[] = [];
      // one pitch for the combined set, sized to the LARGER hex footprint
      spreadCoLocated(
        [...vActive.map((u) => u.geoDir!), ...mActive.map((r) => r.geoDir)],
        { spacingDeg: hexPitchDeg(Math.max(VALIDATOR_HEX_R, META_HEX_R)) },
        lv,
      );
      vActive.forEach((u, i) => { u.geoRadius = HEX_BASE_R + (lv[i] ?? 0) * CHIP_PITCH; });
      mActive.forEach((r, i) => mLevel.set(r, lv[vActive.length + i] ?? 0));
    }
    for (const r of this.metaNodes)
      r.geoPos.copy(r.geoDir).multiplyScalar(HEX_BASE_R + (mLevel.get(r) ?? 0) * CHIP_PITCH);


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

  // Write this frame's values into the persistent FrameCtx (`this._ctx`, built once in the
  // constructor) and return it — `camN`/`group` are the same persistent objects, so only the
  // scalars + the nested DimContext fields need updating (Task 15 allocation fix: this used to
  // allocate a fresh FrameCtx + DimContext object on every call). NB `dim` became a SCALAR when
  // the per-layer {l0,l1} pair was collapsed — it MUST be copied here each frame (a stale
  // captured 0 left off-filter DAG nodes visible in geo).
  private _frameCtx(dt: number, flashDecay: number): FrameCtx {
    const ctx = this._ctx;
    const c = ctx.c;
    c.morph = this.morph;
    c.hoverFilterActive = this._hoverFilterActive;
    c.ledger = this.ledger;
    c.countryFilter = this.countryFilter;
    c.countryMix = this.countryMix;
    c.hoverNodeId = this._hoverNodeId;
    c.selectedNodeId = this._selectedNodeId;
    c.filter = this.filter;
    ctx.dim = this.dim;
    ctx.dimScaleV = this._dimScale();
    ctx.clock = this.clock;
    ctx.hasCam = this._hasCam;
    ctx.ledgerT = this.ledgerT;
    ctx.dt = dt;
    ctx.flashDecay = flashDecay;
    return ctx;
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

    // The globe surface fades in only once nodes are well on their way; arcs later still. In
    // ledger the surface is hidden OUTRIGHT (not eased by morph).
    const surf = this.ledger ? 0 : surfFade(m);
    const extras = this.ledger ? 0 : extrasFade(m);
    for (const f of this.geoFades) f.mat.opacity = f.base * surf;
    // Depth cueing for the see-through hologram: the graticule + coastal walls dim their far
    // hemisphere through the shared facing uniform (camera dir in this group's local frame),
    // and each polar compass rose fades by its own pole's facing on top of the morph fade —
    // a far-side rose dims hard, so front vs back reads instantly (user).
    if (this.facingUniform && this._hasCam) this.facingUniform.value.copy(this._camN);
    // Closeness (0 = overview, 1 = country/node zoom) from the camera altitude: the walls
    // tighten to a crisp rim and the far-side see-through damps out as the camera closes in.
    if (this.closeUniform && this.camera) {
      const alt = (this.camera as THREE.Camera).position.length();
      this.closeUniform.value = THREE.MathUtils.clamp((30 - alt) / 7, 0, 1); // 1 at ≤23, 0 at ≥30
    }
    if (this.poleRoses) {
      for (const rose of this.poleRoses) {
        const t = THREE.MathUtils.clamp((rose.sign * this._camN.y + 0.15) / 0.5, 0, 1);
        const facing = 0.18 + 0.82 * t;
        for (let i = 0; i < rose.mats.length; i++) rose.mats[i].opacity = rose.bases[i] * surf * facing;
      }
    }
    if (this.landWallUniforms) this.landWallUniforms.uOpacity.value = surf;
    if (this.landFillMesh) this.landFillMesh.visible = !this.ledger && m > 0.05; // opacity via geoFades
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
      this.dim += (this.dimTarget - this.dim) * k;
      this.countryMix += ((this.countryFilter ? 1 : 0) - this.countryMix) * k;
    }
    const ctx = this._frameCtx(dt, flashDecay);
    if (this.fabric.hasValidators) this.fabric.writeValidatorGlow(this.nodes, ctx);
    this.fabric.writeMetaFrame(this.metaNodes, ctx);
  }
}

// Off-ready validator tint — mirrors js/globe.js's module-level DIM.
const NODE_DIM = new THREE.Color(0x223046);
