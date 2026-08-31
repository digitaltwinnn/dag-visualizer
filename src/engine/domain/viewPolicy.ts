// The per-view policy table — ONE source of truth for what each `Mode` turns on.
//
// This is the allow-list from CLAUDE.md's "Per-view behaviour" made data: a new view is inert (no
// canvas, no sims, no picks, no DoF) until its row opts it in, instead of a growing pile of
// `mode === "x" || mode === "y"` guards scattered through the render loop. The Engine reads
// `VIEW_POLICIES[this.mode]` each frame and translates the flags into the scene state it already
// owned imperatively — the values here reproduce the previous hand-written gates exactly.
//
// Mostly the ENGINE's table, but not exclusively: a gate the HUD owns belongs here too when it is
// the same per-view question (`vitalsLane` below). The module is pure data with no THREE, scene or
// store-value imports, so a React component may read it as freely as the render loop does.
//
// This lives in domain/ (pure data, no THREE / no scene / no store VALUE import) so it stays
// testable and side-effect-free; it only imports the `Mode` string-union TYPE from the store.
import type { Mode } from "@/src/store/store";

export interface ViewPolicy {
  // Is the 3D canvas shown at all? false = a flat placeholder view (Blueprint schematic); the
  // globe group + background mesh hide. (Equivalent to the old `!flat`.)
  canvas: boolean;
  // Where the morph eases each frame. "toHyper" → 0, "toGeo" → 1, "frozen" keeps the current
  // value (ledger pins morph at whatever view it was entered from and flies nodes into lanes).
  morph: "toHyper" | "toGeo" | "frozen";
  // View-derived halves of the per-frame sim gates (each still ANDs with its own runtime clause):
  //  - arcs:      travelling-packet arcs step + write (Globe ANDs with `morph > 0.5`).
  //  - hubOrbits: HyperView hub orbit / spin (folds into its `frozen`; the focusId freeze is separate).
  //  - globeSpin: Globe's idle group spin (replaces the old `!this.ledger` gate on it).
  sims: { arcs: boolean; hubOrbits: boolean; globeSpin: boolean };
  // What geometry is shown:
  //  - hyperFurniture: the Hypergraph hub furniture + core participate in the morph-driven visibility
  //                    (false → root/core are force-managed: ledger keeps root as the meta-L0 row,
  //                    flat hides both).
  //  - globeSurface:   the globe group (shared nodes + earth surface) is visible.
  //  - ledger:         the ledger chamber group is visible (and it keeps the hyper root as its
  //                    metagraph-L0 row).
  // (There is no skydome/starfield — the scene's solid clear colour + fog are the whole backdrop.)
  show: { hyperFurniture: boolean; globeSurface: boolean; ledger: boolean };
  // Which mesh pools this view raycasts — resolved to `THREE.Object3D[]` by `Engine._pickablesFor`.
  // Unlisted = pick nothing. Order is immaterial (the raycaster sorts hits by distance).
  pickSources: Array<"globe" | "layers" | "ledger">;
  // May depth-of-field run here at all? (Still ANDs with a single metagraph being selected +
  // the morph window.) Only hyper.
  dofEligible: boolean;
  // Does pointer-moving over the globe SURFACE resolve the country under the cursor (the scene
  // side of the bidirectional country hover pairing)? Only geo — the drill it previews is a
  // geo-only concept.
  countryHover: boolean;
  // OrbitControls zoom floor (camera→TARGET distance) — the stock dolly clamp.
  minCamDist: number;
  // Minimum camera ALTITUDE from the world origin (null = no clamp), enforced by the Engine
  // after each controls update. Geo needs this because its orbit target is NOT the globe
  // centre (the resting target is offset, and country/node focus moves it near the surface),
  // so a target-distance floor alone is inconsistent — too tight on one side of the globe,
  // inside the surface on the other (user bug). 18 clears the land plateau (R 16 + LAND_H 1)
  // and the raised hex stacks.
  minCamAlt: number | null;
  // OrbitControls minPolarAngle (radians from +Y). The globe views keep the ~0.25 "no pole
  // crossing" clamp; the Hypergraph relaxes it so the ring layout can be viewed straight from the
  // TOP (user). Applied by the Engine on a view change.
  minPolarAngle: number;
  // Does this view publish the selection's flat node list (`store.selNodes`) for its explorer
  // card? geo (Nodes by country) + hyper (Nodes by layer); elsewhere the list empties so the
  // browsers stay quiet.
  nodeList: boolean;
  // Does the bottom VITALS BAND mount? (2026-08-30 — the vitals leave the crowded command bar
  // for a slim bottom instrument band; docs/superpowers/plans/2026-08-30-vitals-bottom-band.md.)
  // This deliberately widens the old `timeLane` (snapshots-only, 2026-08-12): the band shows each
  // 3D view's OWN vitals — the exact numbers the bar's vitals region showed for that view — so
  // the old rule's reasoning ("structure is already the subject of the view above") is answered
  // by keeping every cell view-scoped. The declicked tick bar-chart rides along as one of the
  // ledger's cells. `BottomStream` is the one reader: it mounts the band and publishes
  // `--bottom-reserve` from this flag, so presence and reserved space can never disagree. Flat
  // views stay false — numbers beside a `preview` wireframe would be the mixed signal rule 10
  // exists to prevent.
  vitalsLane: boolean;
  // Does this view anchor the SUBJECT CALLOUT (user, 2026-08-15) — the HUD-layer label the Engine
  // positions over the committed subject's projected anchor each frame? Two readers: SceneCallout
  // mounts on it, the Engine's per-frame sync gates on it — one flag, so the label and its
  // positioning can't disagree. All three 3D views carry it; the flat placeholders stay false.
  callout: boolean;
  // Per-view bloom (UnrealBloomPass strength/radius/threshold), applied by the Engine each frame.
  // Hyper/geo run CALMER than ledger on purpose: their dense, bright emitters (the core, hundreds
  // of nodes, the additive coastal walls) piled up an additive veil + a strength-driven "black
  // halo" ring + fuzzy walls, worst on OLED/HDR; ledger (thin lines, sparse emitters) keeps the
  // fuller bloom the design wants. strength is the dominant lever (the halo "vanishes with
  // strength"). All three are read live by UnrealBloomPass.render, so a per-frame set is enough.
  bloom: { strength: number; radius: number; threshold: number };
  // Multiplier on the chip materials' env-sheen intensity (NodeFabric's ENV_INT × this), applied
  // by the Engine on a view change. The ledger runs LOW: its trays hold COPLANAR flat chips, so at
  // the chamber's resting pose every chip mirrors the env's bright region at once and full sheen
  // washes the whole tray toward white (user, 2026-08-30: "the nodes are much lighter than in the
  // other views") — geo's chips sit on a curved globe at varied normals, so the same intensity
  // reads as a sweeping sheen there, not a wash. But ZERO overshot (user, same day: colors "very
  // bland", and the parked grids "completely loose their bloom" at the boundary — on paper the env
  // reflection also feeds the selective bloom layer): the ledger keeps HALF, enough liveliness to
  // match the other views without the wash, and the boundary flip becomes a half-step instead of a
  // cliff on chips that are in plain view at the staging grids.
  chipEnv: number;
}

// The calm bloom the ledger view uses — the reference the design likes (thin lines, sparse
// emitters). Shared so ledger + the canvas-hidden FLAT views read identically. strength values
// across the views are the EFFECTIVE strengths (an earlier global gain was folded in so the numbers
// read at a glance — bump them here directly for more/less overall glow).
const BLOOM_CALM = { strength: 0.40, radius: 0.35, threshold: 0.13 };

// A flat placeholder view (status / transactions / staking): the canvas is hidden and the view
// is fully inert. Shared so the three rows stay identical by construction.
const FLAT: ViewPolicy = {
  canvas: false,
  morph: "toHyper",
  sims: { arcs: false, hubOrbits: false, globeSpin: false },
  show: { hyperFurniture: false, globeSurface: false, ledger: false },
  pickSources: [],
  dofEligible: false,
  countryHover: false,
  minCamDist: 12,
  minCamAlt: null,
  minPolarAngle: 0.25,
  nodeList: false,
  vitalsLane: false,
  callout: false,
  bloom: BLOOM_CALM,
  chipEnv: 1,
};

export const VIEW_POLICIES: Record<Mode, ViewPolicy> = {
  // Architecture: the core + orbiting hubs, the shared node shells, hover/click + DoF on a selection.
  // globeSpin stays on (the shells idle-spin exactly as before — the old idle gate was `!ledger`).
  hyper: {
    canvas: true,
    morph: "toHyper",
    // globeSpin OFF: the redesigned tilted rings must stay registered with the cyan hoops (drawn in
    // the unrotated frame) — an idle group spin would rotate the nodes off them. The camera
    // autoRotate provides the motion instead.
    sims: { arcs: false, hubOrbits: true, globeSpin: false },
    show: { hyperFurniture: true, globeSurface: true, ledger: false },
    pickSources: ["globe", "layers"],
    // DoF dropped (user, 2026-07-17): the bokeh read as FUZZ on the selected atom. No view is
    // DoF-eligible now; the BokehPass machinery stays wired for a future re-tune.
    dofEligible: false,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25, // standard clamp: the structure is TILTED (HYPER_TILT), not the camera —
    // so hyper shares the overview pose with the other views and never needs the pole-crossing relax
    nodeList: true,
    vitalsLane: true,
    callout: true, // first consumer of the subject callout (rolling out view by view)
    // Calmer than ledger: the core + dense node field piled up an additive bleed on OLED/HDR.
    bloom: { strength: 0.27, radius: 0.32, threshold: 0.14 },
    chipEnv: 1,
    },
  // Footprint: the holographic globe + travelling packets; picks the globe nodes only.
  geo: {
    canvas: true,
    morph: "toGeo",
    sims: { arcs: true, hubOrbits: false, globeSpin: true },
    show: { hyperFurniture: true, globeSurface: true, ledger: false },
    pickSources: ["globe"],
    dofEligible: false,
    countryHover: true, // pointer over a drillable country previews its border (pairs both ways)
    minCamDist: 12,
    minCamAlt: 18, // above the land plateau (R 16 + LAND_H 1.0) + chip stacks — no zooming inside
    minPolarAngle: 0.25,
    nodeList: true,
    vitalsLane: true,
    callout: true, // node > cohort > country anchors; the distributed network rung has none
    // The lowest bloom of the three views: strength drives the "black halo" ring the saturated
    // node/wall hues cast on the globe, and the additive coastal walls read fuzzy under bloom.
    bloom: { strength: 0.20, radius: 0.30, threshold: 0.16 },
    chipEnv: 1,
    },
  // Snapshots: the settlement chamber. Morph frozen (nodes fly into lanes); picks the centred
  // snapshot + the reused producer dots. (The ledger-specific depth-fog recency treatment was
  // removed — the shared scene fog applies everywhere.)
  ledger: {
    canvas: true,
    morph: "frozen",
    sims: { arcs: false, hubOrbits: false, globeSpin: false },
    show: { hyperFurniture: false, globeSurface: true, ledger: true },
    pickSources: ["ledger", "globe"],
    dofEligible: false,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25,
    // The Snapshots node browser (LedgerPanel's floor disclosures) reads store.selNodes.
    nodeList: true,
    vitalsLane: true,
    callout: true, // the pinned snapshot — the lane lead tile, or the global tick's bar
    bloom: BLOOM_CALM, // the reference look the design likes — unchanged
    chipEnv: 0.5, // low, not zero — coplanar trays wash at full sheen, go bland at none (field note)
  },
  status: FLAT,
  transactions: FLAT,
  staking: FLAT,
};
