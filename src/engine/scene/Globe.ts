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
import { metaAnchor, META_LAYERS, META_RING, DAG_L0, DAG_L1, HYPER_TILT, applyHyperRig } from "../domain/hyperLayout";
import { LEDGER, type RailGroup } from "../domain/ledgerLayout";
import { metaTrayLayout, dagTrayLayout, containerChipPos, type ContainerSpec } from "../domain/ledgerRails";
import { LANE_IDS } from "../domain/ledgerModel";
import { gatherSlots, gatherExtent, gatherSpread, gatherRows, type GatherExtent, type GatherSlot } from "../domain/gatherLayout";
import type { ViewTransition } from "../domain/viewTransition";
import type { SceneColors } from "../sceneColors";
import * as geoStats from "../domain/geoStats";
import { R, LAND_H, CHIP_PITCH, HEX_H, VALIDATOR_HEX_R, META_HEX_R, latLonToVec3, vec3ToLatLon } from "../domain/geoLayout";
import { armillaryFrame, ringFramePos, ringNormal, armillaryRings, armillaryPos, nodeRoles, spreadCoLocated } from "../domain/nodeLayout";
import { surfFade, extrasFade } from "../domain/morph";
import { ArcSim, type ArcEndpoint } from "../domain/arcSim";
import type { MetaNodeRecord, ValidatorRecord } from "../domain/records";
import { buildGeoView, setCountryBorder, setCountryFillMask, HOVER_MASK_BOOST, type GeoViewHost } from "./views/GeoView";
import type { StageLight } from "./objects/StageLight";
import { STAGE_LIGHTS } from "../domain/stageLight";
import { ccToNumeric, countryCcAt, countryLean, geometryRings, mainPolygonRings, ringsAngularRadius, ringsCentroid, type Ring } from "../domain/countryShape";
import { makeTextLabel, disposeTextLabel } from "./objects/TextLabel";
import { closeness, NODE_RAISE } from "../domain/cameraRig";
import type { CohortSel } from "../domain/focusLadder";
import { ancestryGlow } from "../domain/dimModel";
import { NodeFabric, GATHER_SCALE, type FrameCtx } from "./objects/NodeFabric";
import { Arcs } from "./objects/Arcs";
import { makeRadialGradientTexture } from "./objects/gradientTexture";
import type { HyperView } from "./views/HyperView";
import { hoverKeyOf } from "@/src/data/hoverSubject";
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

// View-transition staging grid: THE cell pitch (world units). setGatherFit may only shrink it
// (with the chip size, by one factor) to make the packed row of per-network squares
// (domain/gatherLayout) fit the band the Engine measured against the HUD — a phone-portrait
// viewport. Wherever the pack fits, this is the size staged, in every view and both
// presentations; spare width buys columns and gutters, never size.
//
// The pitch against GATHER_SCALE is what sets the AIR between chips — the one knob for "the
// nodes need just a little bit more spacing" (user, 2026-08-13). At 0.55 the chips sat at ~0.9
// of the pitch and each square read as a solid mass of touching circles rather than a grid of
// pixels; 0.62 puts them at ~0.8 and the rows separate. The ratio is what the eye reads and the
// fit scales both by one factor, so air is fixed and this number is purely the staged SIZE.
// Raising it never widens the row where the WIDTH binds (the fit divides it straight back out) —
// it spends the same band on fewer, bigger pixels, packed deeper.
export const GATHER_CELL = 0.62;

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
};

const geoOf = (pick: PickDescriptor): GeoInfo | undefined => ("geo" in pick ? pick.geo : undefined);

export class Globe implements GeoViewHost {
  surface!: THREE.Group;
  /** The surface's effective alpha this frame (max of surf/extras fades) — the Engine reads it
   *  after setMorph to drive `surface.visible` (Engine owns visibility; Globe computes alpha). */
  surfaceAlpha = 0;
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
  private _gatherN = new THREE.Vector3(); //  scratch: the staging plane's camera-facing normal
  private _gatherZ = new THREE.Vector3(); //  scratch: the staging basis' Z (= -up)
  private _gatherM = new THREE.Matrix4(); //  scratch: the staging orientation basis
  private _gatherExtent: GatherExtent = { w: 0, h: 0, gaps: 0 }; // the packed row's size in CELLS (event-time)
  private _gatherGroups: { id: string; count: number }[] = []; // last packed set — re-solved when the band changes
  private _gatherRows = 0; // the depth that set was packed at (0 = never packed)
  private _gatherBudget = 0; // the band's width in chip pitches, from the last fit
  private _gatherMaxRows = 0; // …and its height, which is where the depth search stops
  private _gatherFitW = -1; // the band the fit below was last solved for (-1 = never / invalidated)
  private _gatherFitH = -1;
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
  private _selCohort: CohortSel | null = null;
  private _selCohortIds: Set<string> | null = null; // committed-glow membership (event-time)
  private _selGroupIds: Set<string> | null = null; // committed composition-group glow (hyper)
  // The per-role container layout of each group, from the last data rebuild — LedgerView builds
  // its container frames from this and Globe places the chips on the same specs, so the furniture
  // and the chips can never disagree about the trays.
  private _contSpecs: Record<RailGroup, ContainerSpec[]> = { meta: [], dag: [] };
  // The signers of the selected metagraph snapshot (spec §5.3) — a COMMITTED group, so it joins the
  // existing group-tier channel at the end of the precedence chain.
  private _signerIds: Set<string> | null = null;
  private _selCohortDir = new THREE.Vector3(); // resolved centroid unit dir (scratch)
  // Geo's SUBJECT-ARRIVAL beat (the Engine's begin/release contract): the density glow holds
  // dark through the view choreography and breathes in (~0.7s) once it settles.
  private _glowEntryT = 1;
  private _glowEntryHold = false;
  // FURNITURE country-name labels (user, 2026-08-15): flat, whisper-muted names on the land, for
  // HOSTING countries only — the label set states a network fact (where the network runs), not an
  // atlas; empty countries staying nameless is itself information, the same honesty as the
  // strip's empty ticks. Event-time rebuilt on node data + topology arrival; they ride geoFades,
  // so the existing surface fade covers them with zero new per-frame code.
  private _countryLabels: THREE.Mesh[] = [];
  private _selCohortOk = false;
  private _hoverCountryCc: string | null = null; // explorer row hover — border preview only
  private _hostBorderKey: string | null = null; // hosting-outline rebuild key (active set + drill)
  // The geo focus SPOTLIGHT (scene/objects/StageLight): the SHARED light, claimed per frame and
  // staged above the SELECTED node's chip stack so the zoomed-in node pick catches a light wash
  // (user). `_selNodeRec` caches the selected node's geoPrimary record — re-resolved by
  // setSelectedNode, which the rebuilds (setNodes/setMetagraphs) re-run so the cache never dangles.
  private readonly stage: StageLight;
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
  hostCountryBorder?: GeoViewHost["hostCountryBorder"];   // the persistent hosting outlines
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

  constructor(scene: THREE.Scene, layers: HyperView | null, camera: THREE.Camera | null, colors: SceneColors, stage: StageLight) {
    this.group = new THREE.Group();
    scene.add(this.group);
    // Node-pick stage light: tight cone over one chip stack (radius ≈ 6·tan(0.36) ≈ 2.3), claimed
    // per frame in update().
    this.stage = stage;
    this.layers = layers; // for gluing metagraph nodes to their orbiting hubs
    this.camera = camera; // for the view-dependent disc falloff at the limb
    this.geoColor = colors.core;   // the geo hologram = the accent (calm via opacity); wall + grid + graticule
    this._dagCore = colors.dagCore;  // DAG validator-node fallback hue
    this._edgeColor.setHex(colors.core);
    this._edgeTarget.setHex(colors.core);

    this.nodeGroup = new THREE.Group();
    this.group.add(this.nodeGroup);
    // The geo SURFACE subtree (see GeoViewHost.surface): furniture only, hard-hidden as one unit
    // by the Engine wherever the surface is off — the chips in nodeGroup stay visible everywhere.
    this.surface = new THREE.Group();
    this.group.add(this.surface);

    this.fabric = new NodeFabric(this.nodeGroup);
    this.arcs = new Arcs(this.group);

    this._ctx = {
      c: {
        morph: 0, hoverFilterActive: false, ledger: false, countryFilter: null,
        countryMix: 0, hoverNodeId: null, hoverCohort: null, selectedNodeId: null, filter: "all",
      },
      dim: 0, clock: 0, camN: this._camN, hasCam: false,
      ledgerT: 0, dt: 0, flashDecay: 0, group: this.group,
      transition: null,
      gather: { origin: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), quat: new THREE.Quaternion(), cell: GATHER_CELL, scale: GATHER_SCALE, spread: 0 },
    };

    // The geo globe surface (body, graticule, atmosphere, continents) — it sets the surface handles
    // back on `this` for the morph/fade loop and pushes its fade materials into this.geoFades.
    // The countries topology arrives async: re-assert any drill/hover border made before then.
    this.onCountriesReady = () => {
      // The host-outline key must not survive the topology's arrival (review find, 2026-08-16):
      // a node build BEFORE the topojson sets the key while every countryRings() answers null,
      // and an unchanged key would skip the re-assert below — no outlines until the next
      // filter/data change. The race runs the other way on most loads, which is why it passed
      // live checks.
      this._hostBorderKey = null;
      this._updateCountryBorder();
      this._rebuildCountryLabels(); // topology may land after the first node build
    };
    buildGeoView(this);
    // The arcs share the surface's camera-FACING + closeness uniforms (created by buildGeoView,
    // hence after it): the hologram has no opaque body sphere, so nothing depth-occludes a comet
    // flying over the far hemisphere — it has to fade itself, exactly like the walls and the
    // graticule do (user, 2026-08-01: "arcs are visible through the globe").
    this.arcs.setFacing(this.facingUniform, this.closeUniform);
  }

  // View-derived sim gates from VIEW_POLICIES (the Engine calls this on every mode change). Only the
  // arcs + globeSpin flags concern the Globe; the rest of the sims object is ignored here.
  setSimFlags(sims: { arcs: boolean; globeSpin: boolean }): void {
    this.simArcs = sims.arcs;
    this.simSpin = sims.globeSpin;
    // ⚠️ THE GATES FLIP HERE, THE ORIENTATION DOES NOT (user, 2026-08-12 — "when we switch from geo
    // to another view, the globe rotation changes before it fades"). This used to hard-write hyper's
    // Euler rig the moment `globeSpin` dropped, and the Engine calls it at switch time, one phase
    // BEFORE the choreography's boundary — so leaving geo for ANY view (hyper, ledger, or a flat
    // one, since all three drop the flag and `this.ledger` is still false until the boundary applies
    // that layout) re-posed the globe on the first frame of the still-visible OUT phase.
    // The rig belongs where the destination's other frame state already lands: `setHyperSpin` below,
    // which _applyBoundary calls with the nodes gathered and both furnitures dark, and which the
    // Engine then re-asserts every hyper frame. Ledger zeroes its own rotation in updateRotation,
    // and a flat view draws nothing to orient. Same rule as the camera hold (viewTransition
    // .holdCamera) and the _integrateMotion guard that fixed this bug's sibling half.
  }

  // Set the hyper-structure spin: the node group is tilted by HYPER_TILT and spun about its own
  // vertical axis by `y` (Euler XYZ → tilt applied AFTER the Y-spin). Driven by the Engine with the
  // SAME angle it gives HyperView, so nodes and hoops rotate in lockstep. Only meaningful in hyper.
  setHyperSpin(y: number, tiltX: number = HYPER_TILT): void {
    // `tiltX` is the Engine-eased shared structure tilt: HYPER_TILT at rest, easing to
    // HYPER_TILT_FOCUS while a metagraph is committed (discs read horizontal from the side).
    if (this.simSpin || this.ledger) return;
    // The rig OWNS the group's orientation while it applies, so a geo focus tween is dropped as it
    // takes over — `updateRotation`'s `else if (this.spin)` branch runs ahead of nothing here and
    // would overwrite the rig with the drill's own longitude on the very next frame. Dropping it at
    // the handover (rather than at switch time) is what lets the drill keep easing through the fade.
    this.spin = null;
    applyHyperRig(this.group, y, tiltX);
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

    // LEDGER PRE-PASS (single tray, 2026-08-07): ONE full-width tray of validators under the gl0
    // floor — each MACHINE once, roles ignored (other views dissect roles; user).
    // event-time: runs on a data rebuild, never per frame.
    let dagMachines = 0;
    {
      // ⚠️ SAME machine key as `place()`'s `primary` below (first record per node.id; a null id
      // is always its own machine) — the tray FRAME is sized from this count while the CHIP
      // slots are assigned per primary record, so the two rules must never drift.
      const s = new Set<string>();
      for (const node of [...l0List, ...cl1List]) {
        if (node.id == null || !s.has(node.id)) dagMachines++;
        if (node.id != null) s.add(node.id);
      }
    }
    const dagSpecs = dagTrayLayout(dagMachines);
    this._contSpecs.dag = dagSpecs;
    let dagContSlot = 0; // next free chip slot in the one tray

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
        const ringAxis = ringNormal(_rf, new THREE.Vector3()); // event-time
        const g = geoMap[node.ip];
        const geoDir = g ? latLonToVec3(g.lat!, g.lon!, 1).normalize() : null;

        // LEDGER: one chip per MACHINE in the single validator tray (2026-08-07) — the machine's
        // geo-primary record carries the chip, its other role instances hide.
        const contSpec = dagSpecs[0];
        const ledgerHide = !primary || !contSpec;
        const ledgerPos = new THREE.Vector3(); // event-time: one per node record, on data rebuild
        if (!ledgerHide) containerChipPos(contSpec, dagContSlot++, ledgerPos);
        ledgerPos.applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale);

        const pick = {
          kind, title: net, roles: nodeRoles(node, role), node, geo: g || null,
          sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
        } as unknown as PickDescriptor;
        const u: ValidatorRecord = {
          index: idx, layer: role, roles: node.roles || [role], nodeId: node.id, geoPrimary: primary, ready, base: col.clone(),
          ledgerPos, ledgerHide,
          hyperPos, hyperDir: hyperPos.clone().normalize(), hyperRadius: hyperPos.length(), ringAxis,
          geoDir, trueDir: geoDir ? geoDir.clone() : null, geoRadius: HEX_BASE_R, noGeo: !g,
          // UNIFORM node size regardless of ready state (user: never size by status; status lives
          // in the explorer pill + node card). geoSize = hex prism CIRCUMRADIUS (world).
          hyperSize: 0.55, geoSize: primary ? VALIDATOR_HEX_R : 0,
          azimuth: Math.atan2(hyperPos.z, hyperPos.x),
          spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
          spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
          pick,
          gU: 0, gV: 0, gRank: 0, gCount: 0, gS: 0,
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
    this.setSelectedCohort(this._selCohort); // re-resolve the cohort membership/centroid too

    // Fan out the filter-active nodes and (re)build the density rings + arcs.
    this._relayoutGeo();
    this._buildDensityGlow(); // light pools follow the validator sites too
    this._assignGatherSlots(); // a validator-only rebuild must not leave stale ranks either
    this._rebuildCountryLabels();
    this._updateCountryBorder(); // the hosting outlines follow the fresh active set
    this.setMorph(this.morph); // place at current morph
  }

  // Staging-grid slots for the view-transition choreography. Event-time: data rebuilds, plus the
  // one frame in a transition where the band's solved DEPTH changes (setGatherFit calls back in).
  // Reads BOTH record arrays as they currently stand, so it's safe to call from either setNodes or
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

    // How deep the blocks may go, from the band the last fit measured: the pack is width-first, so
    // the depth is solved and the columns follow (domain/gatherLayout). Before any transition frame
    // the budget is 0 and gatherRows answers the near-square — setGatherFit re-packs on the first
    // frame it draws, which is why a stale depth here can never be seen.
    const rows = gatherRows(groups, this._gatherBudget, this._gatherMaxRows);
    const slots = gatherSlots(groups, rows);
    this._gatherExtent = gatherExtent(groups, rows);
    this._gatherGroups = groups;
    this._gatherRows = rows;
    this._gatherFitW = -1; // the pack changed, so the fit memo below has to re-solve against it
    const apply = (recs: { gU: number; gV: number; gRank: number; gCount: number; gS: number }[], s: GatherSlot) =>
      recs.forEach((r) => { r.gU = s.u; r.gV = s.v; r.gRank = s.rank; r.gCount = s.count; r.gS = s.gs; });

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
    });
    this.metaList = withNodes;

    const recs: MetaNodeRecord[] = [];
    // Each metagraph runs its own L0 + currency-L1 (cl1) + data-L1 (dl1), and its nodes are laid out
    // as a little "atom" — one ARMILLARY ring per layer around the hub, the same primitive the DAG
    // core uses. The rings differ in BOTH axes: radius (`META_RING.radii`, l0 inner → dl1 → cl1
    // outer) and plane (`armillaryFrame` turns ring k by k/n·π about Y after the shared X tilt), so
    // L0 / dL1 / cL1 read as three distinct tilted hoops. HyperView draws a matching hoop per ring.
    //
    // ⚠️ A BEAD IS A LAYER, NEVER A MACHINE, and its ring position says nothing about its siblings'
    // (user, 2026-08-12). A hybrid runs several layers and so gets one bead per ring, but each ring
    // places its members by index within THAT layer's own list — `ringFramePos(i, cnt, …)` below,
    // where both `i` and `cnt` are per layer. A 3-hybrid metagraph's three lists coincide, so the
    // parameters match by accident; DOR's do not (3 on L0, 22 on dL1). Radial correspondence isn't
    // reachable here anyway: equal ring parameters on differently-tilted rings land in different
    // planes, so a true spoke would cost the tilt AND even spacing on the busy ring. It is not
    // wanted — the layer IS the subject in this view, and `setSelectedNode` already lights every
    // bead a machine runs (they share `nodeId`), so the host is legible on demand.
    const rolesOf = (node: RouteNode) => nodeRoles(node, node.layer as string);
    // LEDGER PRE-PASS (per-metagraph trays, 2026-08-07): each metagraph's OWN plane carries its
    // OWN tray of machines — deduped by IP (a hybrid appears once; roles belong to other views).
    // `located` is computed once here and reused by the main build loop below (same filter, one
    // pass). event-time: runs on a data rebuild, never per frame.
    const locatedByMeta = new Map<string, RouteNode[]>();
    const metaMachineCounts = new Map<string, number>();
    for (const m of withNodes) {
      const located = m.nodes.filter((node) => geoMap[node.ip]);
      locatedByMeta.set(m.id, located);
      const machines = new Set(located.map((node) => node.ip)).size;
      if (machines) metaMachineCounts.set(m.id, machines);
    }
    const metaSpecs = metaTrayLayout(metaMachineCounts, LANE_IDS);
    this._contSpecs.meta = [...metaSpecs.values()];
    const metaContSlot = new Map<string, number>(); // next free chip slot per metagraph tray
    // Which layers each metagraph actually PLOTS a node in — HyperView hides the hoop for an absent
    // layer (a data-only metagraph like DED has no cL1, so its outer ring must not draw empty).
    const hoopPresent = new Map<string, boolean[]>();
    for (const m of withNodes) {
      const a = m._anchor;
      const hubGroup = this.layers?.metas?.find((x) => x.cfg.id === m.id)?.group || null;
      const located = locatedByMeta.get(m.id)!;
      const seen = new Set<string>();
      const present: boolean[] = [];
      META_LAYERS.forEach((layer, li) => {
        const nodeList = located.filter((node) => rolesOf(node).includes(layer));
        const cnt = nodeList.length;
        present[li] = cnt > 0;
        const frame = armillaryFrame(li, META_LAYERS.length, META_RING.tilt);
        const ringAxis = ringNormal(frame, new THREE.Vector3()); // event-time — nodes orbit along this shell
        nodeList.forEach((node, i) => {
          const g = geoMap[node.ip]!;
          const primary = !seen.has(node.ip);
          seen.add(node.ip);
          const offset = ringFramePos(i, cnt, META_RING.radii[layer], frame);
          const dir = latLonToVec3(g.lat!, g.lon!, 1).normalize(); // real location; fanned out below
          // LEDGER: one chip per MACHINE in this metagraph's own tray (2026-08-07) — the
          // machine's primary record carries the chip, its other layer instances hide.
          const contSpec = metaSpecs.get(m.id);
          const ledgerHide = !primary || !contSpec;
          const ledgerPos = new THREE.Vector3(); // event-time: one per node record, on data rebuild
          if (!ledgerHide && contSpec) {
            const slot = metaContSlot.get(m.id) ?? 0;
            metaContSlot.set(m.id, slot + 1);
            containerChipPos(contSpec, slot, ledgerPos);
          }
          ledgerPos.applyMatrix4(_LEDGER_M).multiplyScalar(LEDGER.viewScale); // match the LedgerView group transform
          const pick = {
            kind: "metanode", meta: m, node, geo: g, layer,
            title: m.name, roles: rolesOf(node),
            sub: g ? `${g.city ? g.city + ", " : ""}${g.country}` : (node.ip ? `${node.state} · ${node.ip}` : ""),
          } as unknown as PickDescriptor;
          recs.push({
            metaId: m.id, layer, color: new THREE.Color(m.color), index: 0,
            hubGroup, offset, ledgerPos, ledgerHide, geoPrimary: primary, nodeId: node.ip, ringAxis,
            hyperPos: new THREE.Vector3(a.x, a.y, a.z).add(offset),
            geoPos: new THREE.Vector3(),
            geoDir: dir, trueDir: dir.clone(),
            hyperSize: 0.52, geoSize: primary ? META_HEX_R : 0, // hex prism CIRCUMRADIUS (world)
            spinAxis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
            spinSpeed: 0.3 + Math.random() * 0.5, spinPhase: Math.random() * 6.2831,
            dim: 0, dimTarget: 0,
            pick,
            gU: 0, gV: 0, gRank: 0, gCount: 0, gS: 0,
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
      // ⚠️ …and the dim must be SNAPPED, not eased (user, 2026-08-18: "objects very briefly appear
      // and hide again" after a long session). Every record above is brand new and born at `dim: 0`
      // — lit — while `_applyDim` writes only the TARGET, so the per-frame ease (dt*4, ~1s) played
      // an off-filter node's whole mute from scratch on every 5-minute re-pull. In geo that ease is
      // also its SIZE (hide reads the same raw ramp), so the muted fleet POPPED IN at full size and
      // full brightness before shrinking away again. Same argument as the drill restore above: a
      // rebuild has no prior state to ease FROM, so there is nothing to animate. Snapping every
      // record is safe precisely because none of them existed a moment ago — a genuine filter
      // switch still eases, since it runs against records that do. Measured with a temporary probe
      // 150ms after each rebuild, DOR committed: 43 off-filter records at dim 0.20–0.36 (so 64–80%
      // of full size and brightness, on screen) without this line, 1.000 with it.
      for (const r of recs) r.dim = r.dimTarget;
      this.setSelectedNode(this._selectedNodeId); // re-resolve the spotlight's record on fresh data
      this.setSelectedCohort(this._selCohort); // re-resolve the cohort membership/centroid too
      this._buildDensityGlow();
    }
    // Staging-grid slots for the view-transition choreography (event-time: data rebuilds); this.metaNodes
    // was just reset (to `recs`, or to `[]` above if `!recs.length`), so the "dag" group's slots need
    // recomputing here too (the packed row shifts when a metagraph appears/vanishes).
    this._assignGatherSlots();
    this._rebuildCountryLabels();
  }

  // A soft additive "light pool" under each dense node cluster on the globe — LIGHTING driven by the
  // real data (more nodes at a site → a bigger, brighter pool), so Germany / the US / Finland glow.
  // Fades with the morph (geoFades) so it's a geo-only effect. Rebuilt whenever node data changes.
  private _buildDensityGlow(): void {
    for (const m of this._densityGlow) {
      this.surface.remove(m);
      m.geometry.dispose(); // each pool owns its PlaneGeometry (leaked before, ~2×/25s poll)
      (m.material as THREE.Material).dispose(); // the map is the shared _glowTex — kept alive
    }
    this._densityGlow = [];
    // A soft radial-gradient sprite (white centre → transparent edge) for the geo density light
    // pools. White so the per-mesh `color` tints it; additive blending turns overlaps into
    // brighter light.
    if (!this._glowTex) {
      this._glowTex = makeRadialGradientTexture([
        [0, "rgba(255,255,255,1.0)"],
        [0.32, "rgba(255,255,255,0.5)"],
        [1, "rgba(255,255,255,0)"],
      ]);
    }

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
      this.surface.add(mesh);
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

  /** Arm geo's subject-arrival beat — the glow holds dark until releaseEntry. */
  beginEntry(): void {
    this._glowEntryT = 0;
    this._glowEntryHold = true;
  }

  /** The choreography settled — the glow breathes in as the closing beat. */
  releaseEntry(): void {
    this._glowEntryHold = false;
  }

  /** The committed provider cohort's anchor: the members' centroid as a unit, globe-LOCAL
   *  direction — event-time resolved by setSelectedCohort, so this is a cheap read. Null while
   *  no cohort is resolvable. Read by the Engine's subject callout, which lifts it to the
   *  surface and into world space through the rotating group. */
  get cohortAnchorDir(): THREE.Vector3 | null {
    return this._selCohortOk ? this._selCohortDir : null;
  }

  /** Rebuild the hosting-country name labels (see the field note): one flat, whisper-muted
   *  name at each hosting country's main-landmass centroid, tangent to the surface, north-up.
   *  Event-time (node data + topology arrival). Labels join `geoFades`, so the surface fade
   *  drives their opacity with no per-frame code of their own. */
  private _rebuildCountryLabels(): void {
    for (const m of this._countryLabels) {
      this.surface.remove(m);
      const mat = m.material as THREE.MeshBasicMaterial;
      const fi = this.geoFades.findIndex((f) => f.mat === mat);
      if (fi >= 0) this.geoFades.splice(fi, 1);
      disposeTextLabel(m);
    }
    this._countryLabels = [];
    if (!this.countryGeoms) return; // topology not loaded yet — onCountriesReady re-runs this
    const names = new Map<string, string>();
    const addFrom = (pick: PickDescriptor) => {
      const g = geoOf(pick);
      if (g?.cc && g.country && !names.has(g.cc)) names.set(g.cc, g.country);
    };
    for (const u of this.nodes) if (!u.noGeo) addFrom(u.pick);
    for (const r of this.metaNodes) addFrom(r.pick);
    const cc = new THREE.Color(this.geoColor);
    const tone = `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},0.62)`;
    const up = new THREE.Vector3(0, 1, 0);
    for (const [code, name] of names) {
      const ccn = ccToNumeric(code);
      const geom = ccn ? this.countryGeoms.get(ccn) : null;
      const rings = geom ? mainPolygonRings(geom) : null;
      const centroid = rings?.length ? ringsCentroid(rings) : null;
      if (!centroid) continue;
      const normal = centroid.clone().normalize();
      const east = new THREE.Vector3().crossVectors(up, normal);
      if (east.lengthSq() < 1e-6) continue; // polar degenerate — no hosting country lives there
      east.normalize();
      const north = new THREE.Vector3().crossVectors(normal, east);
      const mesh = makeTextLabel(tone, name, 0.7);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal));
      mesh.position.copy(normal).multiplyScalar(R + LAND_H + 0.12);
      this.surface.add(mesh);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0; // geoFades drives it from the next frame
      this.geoFades.push({ mat, base: 0.5 });
      this._countryLabels.push(mesh);
    }
  }

  /** The drilled country's main-landmass centroid as a unit, globe-LOCAL direction, written
   *  into `out`. Ring extraction is event-frequency work — callers cache per cc (the Engine's
   *  callout does). False when the shape is unknown (unknown cc / topology still loading). */
  countryAnchorDir(cc: string, out: THREE.Vector3): boolean {
    const ccn = ccToNumeric(cc);
    const geom = ccn ? this.countryGeoms?.get(ccn) : null;
    const rings = geom ? mainPolygonRings(geom) : null;
    const centroid = rings?.length ? ringsCentroid(rings) : null;
    if (!centroid) return false;
    out.copy(centroid);
    return true;
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
    // PERSISTENT HOSTING OUTLINES (user, 2026-08-16 — "always have the country outline for
    // those that have any nodes; hover adds the fill"): every country with a filter-active
    // node keeps its outline at a resting whisper, ONE LineSegments concatenating all their
    // rings. Rebuilt only when the hosting set or the drill changes — this method also runs on
    // every hover move, and re-concatenating ~30 countries' rings there would be waste. The
    // drilled country is excluded (its own border draws at full strength above); a hovered one
    // keeps its host line — the 0.3 preview draws over it additively, which only firms it.
    const hostKey = [...this._activeCcs()].sort().join(",") + "|" + (drillCc ?? "");
    if (hostKey !== this._hostBorderKey) {
      this._hostBorderKey = hostKey;
      const hostRings: Ring[] = [];
      for (const cc of this._activeCcs()) {
        if (cc === drillCc) continue;
        const r = this.countryRings(cc);
        if (r) hostRings.push(...r);
      }
      setCountryBorder(this, "host", hostRings.length ? hostRings : null, 0.08); // a true whisper (user, 2026-08-16: 0.15 read too present at rest)
    }
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

  // The committed composition GROUP (hyper's middle rung — the explorer's make-up group), held
  // at the same steady group-tier glow a committed cohort gets in geo. Membership is resolved
  // Engine-side from the live node list (one id per machine), so this adapter only holds the set.
  setSelectedGroup(ids: string[] | null): void {
    this._selGroupIds = ids?.length ? new Set(ids) : null; // event-time
  }

  /** The per-role container layout of a group (LedgerView draws its frames from this). */
  containerSpecs(group: RailGroup): ContainerSpec[] {
    return this._contSpecs[group];
  }

  // The selected metagraph snapshot's SIGNERS. `proofs[].id` are node ids, so the chips that sealed
  // the snapshot light on the ml0 rail and hovering one pairs back to the card (spec §5.3) — the
  // same group-tier glow a committed cohort or composition group gets, no new mechanism.
  setSignerIds(ids: readonly string[] | null): void {
    this._signerIds = ids?.length ? new Set(ids) : null; // event-time
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

  /** The SELECTED node's own chip position in globe-LOCAL coordinates — the same resolution
   *  the node-pick spotlight aims at (the fanned stack position for a metagraph node, the
   *  stacked radius for a validator), so the subject callout points at THE chip rather than
   *  the stack's base (user, 2026-08-15). False when nothing is selected or the record has no
   *  place on the globe. */
  selectedNodeAnchor(out: THREE.Vector3): boolean {
    const rec = this._selNodeRec;
    if (!rec) return false;
    if ("geoPos" in rec) {
      if (rec.geoPos.lengthSq() < 1) return false; // unplaced — never anchor at the globe centre
      out.copy(rec.geoPos);
      return true;
    }
    if (rec.noGeo || !rec.geoDir) return false;
    out.copy(rec.geoDir).multiplyScalar(rec.geoRadius);
    return true;
  }

  /** The SELECTED node's HYPER position in globe-LOCAL coordinates — the same anchor the
   *  instance write uses (hub-glued world→local + offset for a metagraph node, the spun shell
   *  position for a validator), so the hyper callout can point at the committed node's own
   *  bead (user, 2026-08-15: "the node does not have its callout"). */
  selectedNodeHyperAnchor(out: THREE.Vector3): boolean {
    const rec = this._selNodeRec;
    if (!rec) return false;
    if ("hubGroup" in rec && rec.hubGroup) {
      rec.hubGroup.getWorldPosition(out);
      this.group.worldToLocal(out).add(rec.offset);
      return true;
    }
    out.copy(rec.hyperPos);
    return true;
  }

  /** The SELECTED node's LEDGER tray-chip position in globe-LOCAL coordinates — the same
   *  `ledgerPos` the instance write lerps to, so the chamber callout can point at the machine's
   *  own chip in its tray (user, 2026-08-16). False when nothing is selected or the chip is
   *  hidden with its lane. */
  selectedNodeLedgerAnchor(out: THREE.Vector3): boolean {
    const rec = this._selNodeRec;
    if (!rec || rec.ledgerHide) return false;
    out.copy(rec.ledgerPos);
    return true;
  }

  // Commit/clear the cohort selection: resolve member ids + the representative direction from
  // the CURRENT node records by cc+city+isp match (event-time — re-run by the data-rebuild
  // sites exactly like setSelectedNode's re-resolve). Membership matching mirrors
  // GeoExplore.cohortsOf: geoPrimary rows only, keyed on geo.cc/city/isp.
  setSelectedCohort(sel: CohortSel | null): void {
    this._selCohort = sel;
    this._selCohortIds = null;
    this._selCohortOk = false;
    if (!sel) return;
    const ids = new Set<string>(); // event-time
    let lat = 0, lon = 0, n = 0;
    // The data layer normalizes an unresolved city/isp to "" (geoResolve), and the falsy
    // normalization ("" -> null) is the UI-wide keying convention (GeoExplore.cohortsOf,
    // ProviderCard/ProviderPane both use `r.city || null`); `?? null` only catches
    // null/undefined, so an unlocated-city cohort ("" !== null) matched ZERO members here and
    // the 3D glow never lit even though the card showed real counts. Match falsy-normalized.
    const match = (g: GeoInfo | undefined) =>
      !!g && g.cc === sel.cc && (g.city || null) === sel.city && (g.isp || null) === sel.isp;
    const add = (key: string | null, g: GeoInfo) => {
      if (key) ids.add(key);
      lat += g.lat ?? 0;
      lon += g.lon ?? 0;
      n++;
    };
    for (const u of this.nodes) {
      if (u.noGeo || !u.geoPrimary) continue;
      const g = geoOf(u.pick);
      if (match(g)) add(hoverKeyOf(u.pick), g!);
    }
    for (const r of this.metaNodes) {
      if (!(r.geoPrimary ?? true)) continue;
      const g = geoOf(r.pick);
      if (match(g)) add(hoverKeyOf(r.pick), g!);
    }
    if (n === 0) return;
    this._selCohortIds = ids;
    this._selCohortDir.copy(latLonToVec3(lat / n, lon / n, 1)).normalize(); // event-time
    this._selCohortOk = true;
  }

  // ---- per-node world positions: RETIRED (2026-08-13) ----
  // `hyperWorldPos` and `ledgerWorldPos` existed for one purpose each: a camera framing on a
  // single node. Both of those poses are gone — the ledger's on 2026-08-09 (three bespoke ledger
  // framings retired, one commit tilt kept), hyper's today, because hyper's node rung frames the
  // node's NETWORK (see the retirement note in domain/cameraRig.ts). Nothing else ever asked a
  // node where it is in world space, and nothing should: framing math consumes LAYOUT data
  // (rule 6), which is what these two read on the way out.


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

  // Aim the committed cohort's centroid to the front — the same lean contract as focusNode
  // (NODE_RAISE), so cohortFraming can be one fixed pose. false = nothing resolved (caller
  // falls down the ladder).
  focusCohort(): boolean {
    if (!this._selCohortOk) return false;
    this._aimAt(this._selCohortDir, Math.PI / 2, NODE_RAISE);
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
    // Group-tier glow, one channel, four sources in precedence order: a LIVE hover wins (a group
    // row previews exactly what clicking it would commit), then geo's committed cohort, then
    // hyper's committed composition group, then ledger's signer set (spec §5.3) — the three
    // committed kinds are each view/subject-scoped, so at most one is ever set. The two committed
    // ANCESTRY kinds are the ones gated by dimModel.ancestryGlow (that function is the rule); the
    // signer set sits OUTSIDE the gate because it is not ancestry — it is a relation from a
    // different subject, the selected metagraph snapshot — so it never yields to a node.
    // The gate's node subject is the committed node OR the hovered one: a hover previews the
    // commit, and committing a node collapses the borrowed glow (user, 2026-08-12).
    c.hoverCohort =
      this._hoverCohort ??
      ancestryGlow(
        this._selCohortIds ?? this._selGroupIds,
        this._selectedNodeId ?? this._hoverNodeId,
      ) ??
      this._signerIds;
    c.selectedNodeId = this._selectedNodeId;
    c.filter = this.filter;
    ctx.dim = this.dim;
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
    // Force a FRESH world matrix before converting: group.matrixWorld is otherwise only
    // recomputed at render time, so a rotation applied earlier THIS frame (the boundary's
    // destination spin/lean snap, the per-frame spin ease) would leave the conversion one
    // frame stale — every staged node visibly jumped a few pixels and snapped back on the
    // hyper→geo boundary (user, 2026-07-17). One matrix chain per transition frame.
    this.group.updateWorldMatrix(true, false);
    const g = this._ctx.gather;
    g.origin.copy(origin);
    this.group.worldToLocal(g.origin);
    this._invM.copy(this.group.matrixWorld).invert();
    g.right.copy(right).transformDirection(this._invM);
    g.up.copy(up).transformDirection(this._invM);
    // The staging ORIENTATION (group-local): chips face the camera with their top cap —
    // local +Y (the cylinder axis / biggest surface) aims at the viewer (right × up = the
    // plane's camera-facing normal), local X pinned to grid-right and Z = X × Y = -up, so
    // the parked squares hold still with no residual tumble. Scratch fields, zero-alloc.
    this._gatherN.crossVectors(g.right, g.up).normalize();
    this._gatherZ.copy(g.up).negate();
    this._gatherM.makeBasis(g.right, this._gatherN, this._gatherZ);
    g.quat.setFromRotationMatrix(this._gatherM);
  }

  // Fit the packed staging row into the band the Engine measured (world units on the staging
  // plane). ONE factor drives BOTH the cell pitch and the chip scale: growing the cell alone
  // would spread same-size chips into a sparse scatter, and a block only reads as one shape
  // because the nodes ARE its pixels.
  //
  // ⚠️ THE FACTOR ONLY EVER SHRINKS (user, 2026-08-13 — "again the nodes have become very large in
  // scene mode; you fixed it once but broke it again; find a structural fix that does not
  // reappear"). It used to start at a growth cap and take whichever the band allowed, which made
  // chip size a function of the band: the two presentations matched only while the cap bound in
  // both, and a viewport that moved one of them off it staged the same nodes larger with the
  // rails away — twice, because the cap had twice been re-tuned to whatever filled scene mode's
  // band, which is a free fit in disguise. Starting at 1 severs that path by construction:
  // GATHER_CELL is THE staged chip pitch, spare width can only buy columns and then gutters, and
  // shrinking stays unbounded because a phone that cannot fit the pack has to fit it anyway.
  //
  // So the band decides the pack's SHAPE, not its size (user, 2026-08-13 — "use the screen width
  // optimally before adding rows … vertical only when horizontal runs out"): its width in real
  // pitches is the depth solve's budget, and its HEIGHT in real pitches is where that search
  // stops, which is what spends the vertical room on rows before any shrink.
  //
  // Called every frame of the transition, and the band is CONSTANT across those frames — it moves
  // only on a resize or a rails toggle. So the whole solve sits behind a memo on the band itself,
  // which is what makes the sentence above ("one pass per presentation toggle, not one per frame")
  // true of the guard as well as of the re-pack it guards: `gatherRows` walks and allocates, and
  // without this it did so ~230 times per transition to answer the same number. A data rebuild
  // invalidates the memo from `_assignGatherSlots`, because the extent it re-solves is what the
  // scale below is fitted against.
  setGatherFit(availW: number, availH: number): void {
    if (availW === this._gatherFitW && availH === this._gatherFitH) return;
    this._gatherBudget = availW / GATHER_CELL;
    this._gatherMaxRows = availH / GATHER_CELL;
    if (gatherRows(this._gatherGroups, this._gatherBudget, this._gatherMaxRows) !== this._gatherRows) this._assignGatherSlots();
    const e = this._gatherExtent;
    const g = this._ctx.gather;
    let s = 1;
    if (e.w > 0) s = Math.min(s, availW / (e.w * GATHER_CELL));
    if (e.h > 0) s = Math.min(s, availH / (e.h * GATHER_CELL));
    if (!Number.isFinite(s) || s <= 0) s = 1;
    g.cell = GATHER_CELL * s;
    g.scale = GATHER_SCALE * s;
    // In CELLS at the fitted pitch, then back to world units — one multiply so NodeFabric adds a
    // ready offset per node rather than re-deriving the pitch.
    g.spread = gatherSpread(availW / g.cell, e) * g.cell;
    // Last, because _assignGatherSlots above invalidates this.
    this._gatherFitW = availW;
    this._gatherFitH = availH;
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
    this.surfaceAlpha = Math.max(surf, extras);
    for (const f of this.geoFades) f.mat.opacity = f.base * surf;
    // Density light pools: morph fade × the country-drill recede (so a drilled country's own
    // highlight isn't washed out by the pools).
    // The pools belong to the SUBJECTS, not the furniture (user, 2026-08-16): they are geo's
    // SUBJECT-ARRIVAL beat — held dark through the choreography and breathing in under the
    // settled stacks on release (the Engine's begin/release contract, shared with the ledger's
    // drop and hyper's tether sweep). Data rebuilds outside transitions don't blink them
    // (_glowEntryT parks at 1).
    const ge = this._glowEntryT * this._glowEntryT * (3 - 2 * this._glowEntryT);
    for (const g of this._densityGlow) {
      (g.material as THREE.MeshBasicMaterial).opacity =
        (g.userData.glowBase as number) * surf * ge * this._glowDim * this._glowAllDim;
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
    // (No per-mesh visibility gates any more — the Engine hides the whole `surface` subtree
    // from `surfaceAlpha`, which covers the old ad-hoc landFill gate and every sibling.)
    this.arcs.setUM(extras);
  }

  // The globe group's ROTATION integration (spin tween / idle spin / ledger hold), split out
  // of update() so the Engine can run it BEFORE deriving the camera-anchored staging plane.
  // With the easing inside update() (after the plane conversion), the geo destination's fast
  // focusDensest tween made every staged node lag the globe by one frame of angular velocity —
  // the hyper→geo "few pixels up and back" snap (user, 2026-07-17); the other direction never
  // showed it because hyper's 0.06 rad/s drift is sub-pixel per frame.
  updateRotation(dt: number): void {
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
  }

  update(dt: number): void {
    // Advance the arrival beat (see beginEntry) — parked at 1 in steady state.
    if (!this._glowEntryHold && this._glowEntryT < 1) this._glowEntryT = Math.min(1, this._glowEntryT + dt / 0.7);
    this.clock += dt;
    // Node-pick SPOTLIGHT (geo only): claim the shared stage light above the selected node's chip
    // stack so the zoomed-in pick catches a light wash (user). The record's geo position is
    // group-LOCAL — resolve through the globe's spin/lean each frame.
    const selRec = this._selNodeRec;
    if (selRec != null && !this.ledger && this.morph > 0.85 && ("geoPos" in selRec || !selRec.noGeo)) {
      const rec = selRec;
      if ("geoPos" in rec) this._spotPos.copy(rec.geoPos); // metagraph node (fanned stack position)
      else this._spotPos.copy(rec.geoDir!).multiplyScalar(rec.geoRadius); // validator
      this._spotN.copy(this._spotPos).normalize(); // surface normal ≈ radial
      this.group.localToWorld(this._spotPos);
      this._spotN.transformDirection(this.group.matrixWorld);
      // No fade of its own: the light rides this view's PRESENCE, so it builds with the furniture
      // instead of popping to full the instant the morph crosses 0.85.
      this.stage.claim("geo", this._spotPos, this._spotN, STAGE_LIGHTS.geo.height);
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
