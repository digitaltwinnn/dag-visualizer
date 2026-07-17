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
import { metaAnchor, META_LAYERS, META_RING, DAG_L0, DAG_L1, HYPER_TILT } from "../domain/hyperLayout";
import { LEDGER, ledgerSite, ledgerSpread, clusterRadius } from "../domain/ledgerLayout";
import { gatherSlots } from "../domain/gatherLayout";
import type { ViewTransition } from "../domain/viewTransition";
import type { SceneColors } from "../sceneColors";
import * as geoStats from "../domain/geoStats";
import { R, LAND_H, CHIP_PITCH, HEX_H, VALIDATOR_HEX_R, META_HEX_R, latLonToVec3, vec3ToLatLon } from "../domain/geoLayout";
import { armillaryFrame, ringFramePos, armillaryRings, armillaryPos, nodeRoles, spreadCoLocated } from "../domain/nodeLayout";
import { surfFade, extrasFade } from "../domain/morph";
import { ArcSim, type ArcEndpoint } from "../domain/arcSim";
import type { MetaNodeRecord, ValidatorRecord } from "../domain/records";
import { buildGeoView, setCountryBorder, setCountryFillMask, HOVER_MASK_BOOST, type GeoViewHost } from "./views/GeoView";
import { FocusSpot } from "./objects/FocusSpot";
import { ccToNumeric, countryCcAt, countryLean, geometryRings, mainPolygonRings, ringsAngularRadius, ringsCentroid, type Ring } from "../domain/countryShape";
import { closeness, NODE_RAISE } from "../domain/cameraRig";
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

// View-transition staging grid: the cell pitch (world units) at the DESKTOP reference aspect.
// The Engine scales this down for narrower (e.g. phone-portrait) viewports — see setGatherCell —
// so the packed row of per-network squares (domain/gatherLayout) still fits the frustum width;
// unscaled it overflowed badly at phone aspect (verified live, Task 8).
export const GATHER_CELL = 0.55;

const _focusMat = new THREE.Matrix4(); // scratch for reading an instance's live transform
// The ledger's whole-view orientation (tilt ∘ rotY), baked into every node's ledger position so the
// nodes match the LedgerView group's transform. Scale is applied separately (uniform).
const _LEDGER_M = new THREE.Matrix4()
  .makeRotationX(LEDGER.viewTiltX)
  .multiply(new THREE.Matrix4().makeRotationY(LEDGER.viewRotY));

// Ledger honeycomb pitches, in the spread's PRE-viewScale units (the spread offsets get
// multiplied by viewScale; the chip's world footprint/height do not). Cell pitch = the chip
// diameter (hyperSize 0.55/0.52 × LEDGER.dot) + 12% air; level pitch = GEO'S EXACT stack
// pitch (CHIP_PITCH = HEX_H + clear air — user, 2026-07-12: the tighter 1.35×HEX_H read as
// fused towers; the chambers' stacks now breathe like the globe's).
const LEDGER_CELL_V = (2 * 0.55 * LEDGER.dot * 1.12) / LEDGER.viewScale;
const LEDGER_CELL_M = (2 * 0.52 * LEDGER.dot * 1.12) / LEDGER.viewScale;
const LEDGER_LVL = CHIP_PITCH / LEDGER.viewScale;

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
  private _densityGlow: THREE.Mesh[] = []; // additive light pools under dense node clusters (geo)
  private _glowTex?: THREE.Texture; // shared radial-gradient sprite for the light pools
  private _glowDim = 1; // eased 1→~0.2 while a country is drilled, so its highlight isn't overruled
  private _glowAllDim = 1; // eased ~0.62 in "all" (overlapping per-network planes stack additively)
  morph = 0;
  // The view-transition state machine (Engine-owned, set once); null = no transition support wired
  // yet at that call site. Read each frame by _frameCtx into ctx.transition for NodeFabric's gather.
  transition: ViewTransition | null = null;
  private _invM = new THREE.Matrix4(); // scratch: this.group's inverse world matrix (setGatherFrame)
  private ledgerT = 0; // 0->1 ease as the reused node meshes fly from their source view into the lanes
  clock = 0;
  private spin: SpinState | null = null;
  private ledger = false;
  // View-derived sim gates, set by the Engine from VIEW_POLICIES (see setSimFlags). arcs replaces
  // the old `!this.ledger` gate on the travelling packets; globeSpin gates the idle group spin.
  private simArcs = true;
  private simSpin = true;
  countryFilter: string | null = null; // the drilled country (a LENS: border/framing only, no node filter)
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
  private _hoverCohort: Set<string> | null = null; // cohort-row hover — the whole stack glows
  private _selectedNodeId: string | null = null;
  private _hoverCountryCc: string | null = null; // explorer row hover — border preview only
  // The geo focus SPOTLIGHT (scene/objects/FocusSpot): staged above the SELECTED node's chip stack
  // so the zoomed-in node pick catches a stage-light wash (user; hyper/ledger have their own).
  // `_selNodeRec` caches the selected node's geoPrimary record — re-resolved by setSelectedNode,
  // which the rebuilds (setNodes/setMetagraphs) re-run so the cache never dangles.
  private _spot: FocusSpot;
  private _selNodeRec: ValidatorRecord | MetaNodeRecord | null = null;
  private _spotPos = new THREE.Vector3();
  private _spotN = new THREE.Vector3();

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
  countryBorder?: GeoViewHost["countryBorder"];           // the committed drill's border
  hoverCountryBorder?: GeoViewHost["hoverCountryBorder"]; // the hover preview's border
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
    // Node-pick stage light: tight cone over one chip stack (radius ≈ 6·tan(0.36) ≈ 2.3).
    this._spot = new FocusSpot(scene, { angle: 0.36, distance: 22, intensity: 1.5 });
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
        countryMix: 0, hoverNodeId: null, hoverCohort: null, selectedNodeId: null, filter: "all",
      },
      dim: 0, dimScaleV: 0, dimScaleMetaV: 0, clock: 0, camN: this._camN, hasCam: false,
      ledgerT: 0, dt: 0, flashDecay: 0, group: this.group,
      transition: null,
      gather: { origin: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), cell: GATHER_CELL },
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
    // Spin OFF (hyper): the redesigned TILTED node rings register with the Hypergraph's cyan hoops.
    // Tilt the whole node group by HYPER_TILT so the near-flat ring layout reads top-down from the
    // SHARED overview camera (HyperView tilts root + coreGroup by the same angle, so nodes + hoops
    // stay registered). A leftover geo rotation would otherwise offset them.
    if (!this.simSpin && !this.ledger) {
      this.spin = null;
      this.group.rotation.set(HYPER_TILT, 0, 0);
    }
  }

  // Set the hyper-structure spin: the node group is tilted by HYPER_TILT and spun about its own
  // vertical axis by `y` (Euler XYZ → tilt applied AFTER the Y-spin). Driven by the Engine with the
  // SAME angle it gives HyperView, so nodes and hoops rotate in lockstep. Only meaningful in hyper.
  setHyperSpin(y: number): void {
    if (!this.simSpin && !this.ledger) this.group.rotation.set(HYPER_TILT, y, 0);
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
    const place = (list: RouteNode[], role: "l0" | "cl1", kind: "l0" | "l1", color: number, ring: { radius: number; numRings: number; tilt: number }) => {
      const n = list.length;
      list.forEach((node, i) => {
        const ready = node.state === "Ready"; // kept for the record (arc endpoints + card status pill)
        // The first instance of a machine is its geo "primary" (the one dot on the globe).
        const primary = node.id == null || !seen.has(node.id);
        if (node.id != null) seen.add(node.id);
        const col = new THREE.Color(color);
        // NB: node colour is NOT dimmed by ready state — status lives in the card/explorer, never in
        // the 3D scene (matches the uniform-size rule); off-ready nodes render at full identity colour.

        const hyperPos = armillaryPos(i, n, ring.radius, ring.numRings, ring.tilt);
        // The node's ring normal — nodes orbit ALONG their shell around this axis (see update()).
        const _rf = armillaryFrame(i % ring.numRings, ring.numRings, ring.tilt);
        const ringAxis = _rf.t.clone().cross(_rf.b).normalize();
        const g = geoMap[node.ip];
        const geoDir = g ? latLonToVec3(g.lat!, g.lon!, 1).normalize() : null;

        // Ledger (Snapshots) view: l0 = Global L0 validators → the central hypergraph-L0 cluster;
        // DAG cl1 = native $DAG currency (hypergraph L1) → its OWN lane, same height as hypergraph L0
        // but offset on +Z (dagLaneZ), beside the central column.
        // Honeycomb + stacks (units are pre-viewScale — the world chip sizes divide by it;
        // lsp.y lifts a chip per stack LEVEL once the dial's cells fill up).
        // SAME footprint rule as the metagraph clusters (one dial size in design and code,
      // user 2026-07-12) — the bigger DAG fleets simply stack higher inside it.
      const lsp = ledgerSpread(i, n, clusterRadius(n) * 0.85, LEDGER_CELL_V, LEDGER_LVL);
        const ledgerPos = (
          role === "l0"
            ? new THREE.Vector3(lsp.x, LEDGER.rowHypL0 + lsp.y, lsp.z)
            : new THREE.Vector3(lsp.x, LEDGER.rowDAGL1 + lsp.y, lsp.z + LEDGER.dagLaneZ)
        ).applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale); // match the LedgerView group transform

        const pick = {
          kind, title: net, roles: nodeRoles(node, role), node, geo: g || null,
          sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
        } as unknown as PickDescriptor;
        const u: ValidatorRecord = {
          index: idx, layer: role, roles: node.roles || [role], nodeId: node.id, geoPrimary: primary, ready, base: col.clone(),
          ledgerPos, ledgerHide: role !== "cl1" && role !== "l0",
          hyperPos, hyperDir: hyperPos.clone().normalize(), hyperRadius: hyperPos.length(), ringAxis,
          geoDir, trueDir: geoDir ? geoDir.clone() : null, geoRadius: HEX_BASE_R, noGeo: !g,
          // UNIFORM node size regardless of ready state (user: never size by status; status lives
          // in the explorer pill + node card). geoSize = hex prism CIRCUMRADIUS (world).
          hyperSize: 0.55, geoSize: primary ? VALIDATOR_HEX_R : 0,
          azimuth: Math.atan2(hyperPos.z, hyperPos.x),
          spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
          spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
          pick,
          gU: 0, gV: 0, gRank: 0, gCount: 0,
        };
        this.nodes.push(u);
        idx++;
      });
    };
    // The DAG's own validator shells are coloured with the DAG's identity SCENE hue (sceneColors.dag),
    // falling back to the old structural colours if not populated yet.
    const dagColor = (this.sceneColors && this.sceneColors.dag) ?? this._dagCore;
    // DAG core: L0 is an armillary ball (same-diameter rings at different tilts); the native $DAG
    // currency (L1 / cl1) is its OWN clearly-separated OUTER shell (bigger radius). The ring COUNT
    // per shell scales with the node count and is shared with HyperView's tilted cyan hoops.
    // Few rings (user: 2–3, not many): ~60 nodes per L0 ring capped at 3; L1 keeps 1–2.
    const l0Rings = armillaryRings(l0List.length, 60, 2, 3);
    const l1Rings = armillaryRings(cl1List.length, 12, 1, 2);
    place(l0List, "l0", "l0", dagColor, { radius: DAG_L0.radius, numRings: l0Rings, tilt: DAG_L0.tilt });
    place(cl1List, "cl1", "l1", dagColor, { radius: DAG_L1.radius, numRings: l1Rings, tilt: DAG_L1.tilt });
    // Hand the DAG core's ring shells to HyperView so it draws a tilted cyan hoop per ring.
    this.layers?.buildCoreRings(
      cl1List.length
        ? [{ radius: DAG_L0.radius, numRings: l0Rings, tilt: DAG_L0.tilt, code: "L0" }, { radius: DAG_L1.radius, numRings: l1Rings, tilt: DAG_L1.tilt, code: "L1" }]
        : [{ radius: DAG_L0.radius, numRings: l0Rings, tilt: DAG_L0.tilt, code: "L0" }],
    );

    this.fabric.buildValidators(this.nodes);
    this.pickables = this.fabric.pickables;
    this.setSelectedNode(this._selectedNodeId); // re-resolve the spotlight's record on fresh data

    // Fan out the filter-active nodes and (re)build the density rings + arcs.
    this._relayoutGeo();
    this._buildDensityGlow(); // light pools follow the validator sites too
    this._assignGatherSlots(); // a validator-only rebuild must not leave stale ranks either
    this.setMorph(this.morph); // place at current morph
  }

  // Staging-grid slots for the view-transition choreography (event-time: data rebuilds). Reads
  // BOTH record arrays as they currently stand, so it's safe to call from either setNodes or
  // setMetagraphs — whichever rebuilt, the other array's slots are recomputed too (harmless: the
  // layout is a pure function of the current counts).
  private _assignGatherSlots(): void {
    // Group by MACHINE, not shell instance: a hybrid validator/metagraph machine holds a record
    // PER LAYER it runs (e.g. an l0 record + a cl1 twin), but only one — the geoPrimary — renders
    // on the globe; in hyper all of them render. Sizing/slotting the grid by raw record count
    // double-counted hybrids (the DAG block came out ~2× too many slots) and made the fill
    // inconsistent by source view (full arriving from hyper, half-empty/moth-eaten from geo). A
    // machine gets exactly ONE staging slot, keyed by `nodeId` (the validator's `node.id` / the
    // metagraph node's `node.ip` — both already used as the machine identity elsewhere, e.g.
    // `setSelectedNode`'s lookups). Every shell record for that machine copies the slot verbatim,
    // so all its instances CONVERGE to one grid pixel during OUT (sharing the stagger rank) and
    // fan back out to their separate hyper shells during IN — the square is identical regardless
    // of which view the transition started from. Grouping by nodeId (not filtering by the
    // `geoPrimary` flag) naturally collapses every shell record of one machine into one group even
    // in an edge case where the flag were missing/duplicated.
    const dagByMachine = new Map<string, ValidatorRecord[]>();
    let dagAnonSeq = 0;
    for (const u of this.nodes) {
      const key = u.nodeId != null ? `id:${u.nodeId}` : `anon:${dagAnonSeq++}`; // no id: never shared, its own machine
      let a = dagByMachine.get(key);
      if (!a) dagByMachine.set(key, (a = []));
      a.push(u);
    }
    const groups: { id: string; count: number }[] = [{ id: "dag", count: dagByMachine.size }];

    const byMeta = new Map<string, MetaNodeRecord[]>();
    for (const r of this.metaNodes) {
      let a = byMeta.get(r.metaId);
      if (!a) byMeta.set(r.metaId, (a = []));
      a.push(r);
    }
    const metaByMachine = new Map<string, Map<string, MetaNodeRecord[]>>();
    for (const [id, arr] of byMeta) {
      const byMachine = new Map<string, MetaNodeRecord[]>();
      for (const r of arr) {
        let a = byMachine.get(r.nodeId);
        if (!a) byMachine.set(r.nodeId, (a = []));
        a.push(r);
      }
      metaByMachine.set(id, byMachine);
      groups.push({ id, count: byMachine.size });
    }

    const slots = gatherSlots(groups);
    const apply = (recs: { gU: number; gV: number; gRank: number; gCount: number }[], s: { u: number; v: number; rank: number; count: number }) =>
      recs.forEach((r) => { r.gU = s.u; r.gV = s.v; r.gRank = s.rank; r.gCount = s.count; });

    const dagSlots = slots.get("dag");
    if (dagSlots) {
      let i = 0;
      for (const arr of dagByMachine.values()) { const s = dagSlots[i++]; if (s) apply(arr, s); }
    }
    for (const [id, byMachine] of metaByMachine) {
      const ss = slots.get(id);
      if (!ss) continue;
      let i = 0;
      for (const arr of byMachine.values()) { const s = ss[i++]; if (s) apply(arr, s); }
    }
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
    // Each metagraph runs its own L0 + currency-L1 (cl1) + data-L1 (dl1). Redesign: concentric flat
    // RINGS in the hub's plane — L0 inner, data-L1 middle, currency-L1 outer — read top-down as clean
    // orbital diagrams (was scattered fibonacci shells). One even ring per layer; a small per-layer
    // phase so the layers' node seams don't align radially.
    // Each metagraph is a little "atom": its 3 layers become 3 rings of the SAME diameter at 3
    // DIFFERENT tilt angles (layer index = ring index; same primitive as the DAG core), so L0 / dL1 /
    // cL1 read as distinct tilted rings around a cyan hub. HyperView draws a matching tilted hoop.
    const rolesOf = (node: RouteNode) => nodeRoles(node, node.layer as string);
    // Which layers each metagraph actually PLOTS a node in — HyperView hides the hoop for an absent
    // layer (a data-only metagraph like DED has no cL1, so its outer ring must not draw empty).
    const hoopPresent = new Map<string, boolean[]>();
    for (const m of withNodes) {
      const a = m._anchor;
      const hubGroup = this.layers?.metas?.find((x) => x.cfg.id === m.id)?.group || null;
      const located = m.nodes.filter((node) => geoMap[node.ip]);
      const seen = new Set<string>();
      const present: boolean[] = [];
      META_LAYERS.forEach((layer, li) => {
        const nodeList = located.filter((node) => rolesOf(node).includes(layer));
        const cnt = nodeList.length;
        present[li] = cnt > 0;
        const frame = armillaryFrame(li, META_LAYERS.length, META_RING.tilt);
        const ringAxis = frame.t.clone().cross(frame.b).normalize(); // nodes orbit along this shell
        nodeList.forEach((node, i) => {
          const g = geoMap[node.ip]!;
          const primary = !seen.has(node.ip);
          seen.add(node.ip);
          const offset = ringFramePos(i, cnt, META_RING.radii[layer], frame);
          const dir = latLonToVec3(g.lat!, g.lon!, 1).normalize(); // real location; fanned out below
          const lsite = ledgerSite(m._ledgerCol, METAGRAPHS.length);
          const lrowY = layer === "l0" ? LEDGER.rowML0 : LEDGER.rowML1;
          const lsp = ledgerSpread(i, cnt, clusterRadius(cnt) * 0.85, LEDGER_CELL_M, LEDGER_LVL);
          const ledgerPos = new THREE.Vector3(lsite.x + lsp.x, lrowY + lsp.y, lsite.z + lsp.z)
            .applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale); // match the LedgerView group transform
          const pick = {
            kind: "metanode", meta: m, node, geo: g, layer,
            title: m.name, roles: rolesOf(node),
            sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
          } as unknown as PickDescriptor;
          recs.push({
            metaId: m.id, layer, color: new THREE.Color(m.color), index: 0,
            hubGroup, offset, ledgerPos, geoPrimary: primary, nodeId: node.ip, ringAxis,
            hyperPos: new THREE.Vector3(a.x, a.y, a.z).add(offset),
            geoPos: new THREE.Vector3(),
            geoDir: dir, trueDir: dir.clone(),
            hyperSize: 0.52, geoSize: primary ? META_HEX_R : 0, // hex prism CIRCUMRADIUS (world)
            spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
            spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
            dim: 0, dimTarget: 0,
            pick,
            gU: 0, gV: 0, gRank: 0, gCount: 0,
          });
        });
      });
      hoopPresent.set(m.id, present);
    }
    this.layers?.setHoopPresence(hoopPresent);
    if (recs.length) {
      this.fabric.buildMetaNodes(recs);
      this.metaNodes = recs;
      // Re-assert the filter's dim on the fresh records — but a data REBUILD is not a filter
      // switch, so a live country drill survives it (setFilter clears the drill by design for
      // real switches; without the restore, every cluster poll wiped the drill's dim + border).
      const drill = this.countryFilter;
      this.setFilter(this.filter);
      if (drill) this.setCountry(drill);
      this.setSelectedNode(this._selectedNodeId); // re-resolve the spotlight's record on fresh data
      this._buildDensityGlow();
    }
    // Staging-grid slots for the view-transition choreography (event-time: data rebuilds); this.metaNodes
    // was just reset (to `recs`, or to `[]` above if `!recs.length`), so the "dag" group's slots need
    // recomputing here too (the packed row shifts when a metagraph appears/vanishes).
    this._assignGatherSlots();
  }

  // A soft additive "light pool" under each dense node cluster on the globe — LIGHTING driven by the
  // real data (more nodes at a site → a bigger, brighter pool), so Germany / the US / Finland glow.
  // Fades with the morph (geoFades) so it's a geo-only effect. Rebuilt whenever node data changes.
  private _buildDensityGlow(): void {
    for (const m of this._densityGlow) {
      this.group.remove(m);
      m.geometry.dispose(); // each pool owns its PlaneGeometry (leaked before, ~2×/25s poll)
      (m.material as THREE.Material).dispose(); // the map is the shared _glowTex — kept alive
    }
    this._densityGlow = [];
    if (!this._glowTex) this._glowTex = makeGlowTexture();

    // Build a pool per site×network ALWAYS (all nodes, each tagged with its network + identity hue);
    // the committed filter just SHOWS/HIDES pools (setFilter → _applyGlowFilter), no recluster needed.
    const dagHex = this.sceneColors?.dag ?? this.geoColor;
    const metaHex = (id: string) => this.sceneColors?.[id] ?? this.geoColor;

    // Cluster the primary nodes by rounded direction AND network (~one pool per site×network).
    const clusters = new Map<string, { dir: THREE.Vector3; n: number; color: number; net: string }>();
    const add = (dir: THREE.Vector3 | null, color: number, net: string) => {
      if (!dir) return;
      const key = `${Math.round(dir.x * 30)},${Math.round(dir.y * 30)},${Math.round(dir.z * 30)}|${net}`;
      const c = clusters.get(key);
      if (c) { c.dir.add(dir); c.n++; } else clusters.set(key, { dir: dir.clone(), n: 1, color, net });
    };
    for (const u of this.nodes) if (!u.noGeo && u.geoPrimary && u.trueDir) add(u.trueDir, dagHex, "dag");
    for (const r of this.metaNodes) if ((r.geoPrimary ?? true) && r.trueDir) add(r.trueDir, metaHex(r.metaId), r.metaId);

    for (const c of clusters.values()) {
      const dir = c.dir.normalize();
      const size = Math.min(9, 2.2 + Math.sqrt(c.n) * 0.9); // pool grows with node count, capped
      const mat = new THREE.MeshBasicMaterial({
        map: this._glowTex, color: new THREE.Color(c.color),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.copy(dir).multiplyScalar(R + LAND_H + 0.06); // just above the plateau
      // Tangent to the sphere in GROUP-LOCAL space (plane +Z → surface normal `dir`), so it stays
      // seated as the globe spins — lookAt (world space) would bake in the current spin.
      mesh.quaternion.setFromUnitVectors(_PLANE_N, dir);
      mesh.renderOrder = 0; // over the land fill (-1), under the standing chips
      // Resting strength — brighter where denser, but capped LOW so the "all" view (huge per-site
      // counts) doesn't overpower; a metagraph selection's lower counts sit naturally below the cap.
      // Opacity is driven per-frame in setMorph (morph fade × the country-drill recede), NOT geoFades.
      mesh.userData.glowBase = Math.min(0.28, 0.1 + c.n * 0.024);
      mesh.userData.net = c.net; // which network this pool belongs to (for the filter toggle)
      this.group.add(mesh);
      this._densityGlow.push(mesh);
    }
    this._applyGlowFilter();
  }

  // Show only the pools of the committed network ("all" shows every pool) — a cheap visibility
  // toggle, so a filter change never re-clusters the light pools (just drops the other planes).
  private _applyGlowFilter(): void {
    for (const m of this._densityGlow) m.visible = this.filter === "all" || m.userData.net === this.filter;
  }

  // Isolate one network on the globe and dim the rest.
  setFilter(sel: string): void {
    this.filter = sel;
    this.countryFilter = null; // switching network clears the country drill-down
    this._activeCcsCache = null; // the drillable-country set follows the filter
    this._updateCountryBorder();
    this._applyDim(sel);
    this._relayoutGeo();
    this._applyGlowFilter(); // just show/hide the matching pools — no recluster
  }

  // Transient PREVIEW dim (filter-chip / hub hover): same dim TARGETS as setFilter, but does
  // NOT commit `this.filter` or relayout geo — and the same per-view dim STRENGTH too.
  setHoverFilter(sel: string | null): void {
    this._applyDim(sel || this.filter);
  }

  // Set the dim TARGETS for a selection (the dim itself eases each frame).
  private _applyDim(sel: string): void {
    const dagLit = sel === "all" || sel === "dag";
    this.dimTarget = dagLit ? 0 : 1;
    for (const r of this.metaNodes) r.dimTarget = (sel === "all" || sel === r.metaId) ? 0 : 1;
  }

  // Drill into a single country (cc), or null to clear. The drill is a LENS, not a filter
  // (user, 2026-07-11): it frames the country, draws its border and firms the land — the
  // OTHER nodes stay visible, pickable and fanned exactly as before, so no relayout here.
  setCountry(cc: string | null): void {
    this.countryFilter = cc || null;
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

  // Two borders: the committed drill at full strength AND the hover preview at a whisper —
  // both may show at once (user: hovering another country must still preview while a drill
  // is lit). A committed drill also firms up the land glass (user: less transparent while a
  // country is selected).
  private _updateCountryBorder(): void {
    const drillCc = this.countryFilter;
    const drillRings = drillCc ? this.countryRings(drillCc) : null;
    setCountryBorder(this, "drill", drillRings, drillCc ? 1.0 : 0);
    const hoverCc = this._hoverCountryCc && this._hoverCountryCc !== drillCc ? this._hoverCountryCc : null;
    const hoverRings = hoverCc ? this.countryRings(hoverCc) : null;
    setCountryBorder(this, "hover", hoverRings, hoverCc ? 0.3 : 0);
    // The country's INTERIOR firms up via the fill-mask shader (scoped — the old whole-globe base
    // bump is gone). The committed drill fills at full strength; a HOVER preview fills at a lower
    // boost so it reads as a preview and selecting still firms it further (user). One mask uniform,
    // so the drill wins when both are present.
    if (drillRings) setCountryFillMask(this, drillRings);
    else setCountryFillMask(this, hoverRings, HOVER_MASK_BOOST);
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

  // Cohort-row hover (explorer): glow EVERY member of the cohort's 3D stack together.
  // Event-driven allocation (one Set per hover change), never per frame.
  setHoverCohort(ids: string[] | null): void {
    this._hoverCohort = ids?.length ? new Set(ids) : null;
  }

  // The persistently selected node (a clicked node card) — glows every layer shell it runs.
  setSelectedNode(id: string | null): void {
    this._selectedNodeId = id || null;
    // Resolve the geoPrimary record once per selection change (not per frame) for the spotlight.
    // setNodes/setMetagraphs re-run this so a rebuild can't leave the cache dangling.
    this._selNodeRec = !id
      ? null
      : this.nodes.find((n) => n.nodeId === id && n.geoPrimary) ??
        this.metaNodes.find((n) => n.nodeId === id && n.geoPrimary) ??
        null;
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

  // Whether a node passes the network filter. The country drill deliberately does NOT
  // narrow this (user, 2026-07-11: the drill is a lens — border + framing — not a filter;
  // the old dim/hide of out-of-country nodes is gone). `_geo` stays for the call sites' shape.
  private _nodeActive(layerOrMetaId: string, _geo: GeoInfo | undefined | null): boolean {
    return this._isActive(layerOrMetaId);
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
  // — NODE_RAISE, the contract cameraRig.nodeFraming's pose is solved against — so the pose
  // is relative to the node's local surface at any latitude; the lean eases on deselect.
  focusNode(geo: { lat?: number; lon?: number } | null | undefined): boolean {
    if (!geo || geo.lat == null || geo.lon == null) return false;
    this._aimAt(latLonToVec3(geo.lat, geo.lon, 1).normalize(), Math.PI / 2, NODE_RAISE);
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
      // one pitch for the combined set, sized to the LARGER hex footprint. KEYS group the fan by
      // network (validators = "dag", metagraph nodes by metaId) so each metagraph's co-located
      // chips get their OWN stack/cell instead of intermixing at a shared site (user).
      spreadCoLocated(
        [...vActive.map((u) => u.geoDir!), ...mActive.map((r) => r.geoDir)],
        { spacingDeg: hexPitchDeg(Math.max(VALIDATOR_HEX_R, META_HEX_R)) },
        lv,
        [...vActive.map(() => "dag"), ...mActive.map((r) => r.metaId)],
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

  // How strong the VALIDATOR network dim is, ramped by the morph. (The hover-preview
  // forced-strong 0.85 branch is gone — user: the hub hover/click dim in hyper was far harder
  // than the regular dim; previews now dim at the committed strength.)
  private _dimScale(): number {
    return 0.32 + 0.68 * this.morph;
  }

  // The METAGRAPH pool's own dim strength — ZERO in hyper (metagraph nodes REST at the dimmed
  // look there, baked into writeMetaFrame's base size/glow; hover previews and committed
  // filters leave them at rest), full on the globe. Mirrors domain/dimModel.metaDimScale —
  // change BOTH (the tested reference spec, see dimModel's file header).
  private _metaDimScale(): number {
    return this.morph;
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
    c.hoverFilterActive = false; // the forced-strong preview dim is gone (field kept for the DimContext shape)
    c.ledger = this.ledger;
    // The drill never dims/hides nodes (lens-not-filter, user 2026-07-11) — the fabric's
    // country-dim clauses stay dormant; countryFilter lives on `this` for border/framing.
    c.countryFilter = null;
    c.countryMix = 0;
    c.hoverNodeId = this._hoverNodeId;
    c.hoverCohort = this._hoverCohort;
    c.selectedNodeId = this._selectedNodeId;
    c.filter = this.filter;
    ctx.dim = this.dim;
    ctx.dimScaleV = this._dimScale();
    ctx.dimScaleMetaV = this._metaDimScale();
    ctx.clock = this.clock;
    ctx.hasCam = this._hasCam;
    ctx.ledgerT = this.ledgerT;
    ctx.dt = dt;
    ctx.flashDecay = flashDecay;
    ctx.transition = this.transition;
    return ctx;
  }

  // The camera-anchored staging plane (view-transition choreography), converted to group-LOCAL
  // once per frame (the instanced matrices NodeFabric writes are in group space). World-space in;
  // stored on the persistent ctx.gather object NodeFabric's _applyGather reads.
  setGatherFrame(origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const g = this._ctx.gather;
    g.origin.copy(origin);
    this.group.worldToLocal(g.origin);
    this._invM.copy(this.group.matrixWorld).invert();
    g.right.copy(right).transformDirection(this._invM);
    g.up.copy(up).transformDirection(this._invM);
  }

  // Narrow (e.g. phone-portrait) viewports: the Engine scales the cell down from GATHER_CELL so
  // the packed staging row still fits the frustum width (verified live, Task 8 — unscaled, the
  // DAG's big square ran off the right edge at phone aspect).
  setGatherCell(cell: number): void {
    this._ctx.gather.cell = cell;
  }

  // -------------------------------------------------- morph between layouts
  // BOUNDARY-applied ledger layout (view-transition choreography): called by the Engine at the
  // invisible mid-transition boundary — nodes are gathered, so the snap can't be seen. ledgerT
  // stopped being an eased flight; it is now a pure layout parameter (the IN-phase flight is the
  // gather dissolve).
  applyLedgerLayout(on: boolean): void {
    this.ledger = on;
    if (on) {
      this.group.rotation.set(0, 0, 0);
      this.ledgerT = 1;
    } else {
      this.ledgerT = 0;
    }
  }

  setMorph(m: number): void {
    this.morph = m;
    this._updateCamN();
    const ctx = this._frameCtx(0, 0); // dt/flashDecay unused by the matrix loop
    this.pickables = this.fabric.placeValidators(this.nodes, ctx);

    // The globe surface fades in only once nodes are well on their way; arcs later still. In
    // ledger the surface is hidden OUTRIGHT (not eased by morph). Also rides the transition's
    // furniture alpha (view-transition choreography): the geo furniture only lights while geo is
    // the lit view (never mid-flight, per furnitureAlpha's contract).
    const vAlpha = this.transition ? this.transition.furnitureAlpha("geo") : 1;
    const surf = this.ledger ? 0 : surfFade(m) * vAlpha;
    const extras = this.ledger ? 0 : extrasFade(m) * vAlpha;
    for (const f of this.geoFades) f.mat.opacity = f.base * surf;
    // Density light pools: morph fade × the country-drill recede (so a drilled country's own
    // highlight isn't washed out by the pools).
    for (const g of this._densityGlow) {
      (g.material as THREE.MeshBasicMaterial).opacity = (g.userData.glowBase as number) * surf * this._glowDim * this._glowAllDim;
    }
    // Depth cueing for the see-through hologram: the graticule + coastal walls dim their far
    // hemisphere through the shared facing uniform (camera dir in this group's local frame),
    // and each polar compass rose fades by its own pole's facing on top of the morph fade —
    // a far-side rose dims hard, so front vs back reads instantly (user).
    if (this.facingUniform && this._hasCam) this.facingUniform.value.copy(this._camN);
    // Closeness (0 = overview, 1 = country/node zoom) from the camera altitude: the walls
    // tighten to a crisp rim and the far-side see-through damps out as the camera closes in.
    if (this.closeUniform && this.camera) {
      this.closeUniform.value = closeness((this.camera as THREE.Camera).position.length());
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
    // Node-pick SPOTLIGHT (geo only): stage a white key above the selected node's chip stack so the
    // zoomed-in pick catches a light wash (user; the same FocusSpot pattern as hyper/ledger). The
    // record's geo position is group-LOCAL — resolve through the globe's spin/lean each frame.
    const selRec = this._selNodeRec;
    const spotOn =
      selRec != null && !this.ledger && this.morph > 0.85 && ("geoPos" in selRec || !selRec.noGeo);
    this._spot.update(dt, spotOn);
    if (spotOn) {
      const rec = selRec!;
      if ("geoPos" in rec) this._spotPos.copy(rec.geoPos); // metagraph node (fanned stack position)
      else this._spotPos.copy(rec.geoDir!).multiplyScalar(rec.geoRadius); // validator
      this._spotN.copy(this._spotPos).normalize(); // surface normal ≈ radial
      this.group.localToWorld(this._spotPos);
      this._spotN.transformDirection(this.group.matrixWorld);
      this._spot.aim(this._spotPos, this._spotN, 6);
    }
    // Recede the density light pools while a country is drilled (so its highlight leads), eased.
    this._glowDim += ((this.countryFilter ? 0.2 : 1) - this._glowDim) * Math.min(1, dt * 3);
    // In "all" the per-network pools OVERLAP and stack additively — damp them so multi-network sites
    // don't blow out (a single-network filter has no overlap, so it stays full), eased on switch.
    this._glowAllDim += ((this.filter === "all" ? 0.62 : 1) - this._glowAllDim) * Math.min(1, dt * 3);
    // Ease the wall colour (held at the default cyan).
    if (this.landWallUniforms) {
      this._edgeColor.lerp(this._edgeTarget, Math.min(1, dt * 3));
      this.landWallUniforms.uColor.value.copy(this._edgeColor);
    }
    if (this.ledger) {
      // ledgerT is a pure layout parameter now (snapped to 1 at the transition boundary in
      // applyLedgerLayout) — the IN-phase gather-dissolve flight is what used to be this ease.
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

    // Ease the per-layer dim levels, then hand a fresh FrameCtx to the fabric.
    if (this.fabric.hasValidators) {
      const k = Math.min(1, dt * 4);
      this.dim += (this.dimTarget - this.dim) * k;
    }
    const ctx = this._frameCtx(dt, flashDecay);
    // Hypergraph "atom" life: each node ORBITS along its own shell — spin its position around the
    // ring normal (the hoop is a full circle, so nodes stay registered on it). Hyper only. This is
    // the per-node motion; the whole structure keeps its slow drift (Engine setHyperSpin).
    if (!this.ledger && this.morph < 0.5) {
      // Uniform ANGULAR speed for every ring (user) — all nodes advance the same angle per frame.
      // The DAG core rings are much larger, so the same angular rate sweeps a long arc and reads
      // too fast — give the core (validators) a slower angular rate than the metagraph rings (user).
      const coreAng = dt * 0.09;
      const metaAng = dt * 0.12;
      for (const r of this.nodes) { r.hyperPos.applyAxisAngle(r.ringAxis, coreAng); r.hyperDir.applyAxisAngle(r.ringAxis, coreAng); }
      for (const r of this.metaNodes) r.offset.applyAxisAngle(r.ringAxis, metaAng);
    }
    if (this.fabric.hasValidators) this.fabric.writeValidatorGlow(this.nodes, ctx);
    this.fabric.writeMetaFrame(this.metaNodes, ctx);
  }
}


const _PLANE_N = new THREE.Vector3(0, 0, 1); // PlaneGeometry's default facing (for orienting glow pools)

// A soft radial-gradient sprite (white centre → transparent edge) for the geo density light pools.
// White so the per-mesh `color` tints it; additive blending turns overlaps into brighter light.
function makeGlowTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1.0)");
  g.addColorStop(0.32, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
