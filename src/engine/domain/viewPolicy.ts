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
  //  - trendGround:    the trends view's GROUND GRID (scene/views/TrendsView) is visible — the one
  //                    thing that view draws in WebGL, the depth axis its DOM chart planes stand
  //                    on. A row rather than a `mode === "trend"` in the Engine, because root-group
  //                    visibility is the Engine's (rule 6) and scene modules are mode-agnostic: the
  //                    view has to be TOLD it is on, and this allow-list is where a fifth view
  //                    would answer the same question for itself (convention 7).
  // (There is no skydome/starfield — the scene's solid clear colour + fog are the whole backdrop.)
  show: { hyperFurniture: boolean; globeSurface: boolean; ledger: boolean; trendGround: boolean };
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
  // Does a pointer drag ORBIT the camera here? The stock controls everywhere but History
  // (user, 2026-09-26: "disable camera control, maybe keep zoom only, and always keep the trend
  // cards fixed in their implied 3D position — let the clicking of a background card do the
  // movement work"). Its cards are billboards hosting text: an orbit slid the deck about without
  // ever showing another side of it, and the one movement that view has a meaning for — a card
  // coming to the front — is already the focus RE-DEAL. Zoom stays (a dolly toward the front
  // card, the pose's target). A BOUNDED orbit (±35° / ±11°) was built and removed the same day.
  rotate: boolean;
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
  // WHAT the mounted band CONTAINS (2026-09-18). The band is ONE surface with a fixed height and
  // one set of edges, and `vitalsLane` above says whether it mounts and reserves space — a
  // question that stays the same. What it HOLDS is a different question, and the trends view
  // answers it differently: its bottom lane is the shared TIMELINE (the overview track, the brush
  // that is `trendRange`, the cursor that is `trendCursorMs`, the window pills), not a row of
  // read-only vitals cells. A row rather than a `mode === "trend"` inside VitalsBand, because
  // that is the deny-list shape convention 7 exists to prevent: a sixth view would inherit
  // "vitals" by silence instead of answering for itself. Both presentations (the desktop band and
  // the phone dock's Vitals sheet) read it through the ONE `ViewCells` dispatch, so a band's
  // content can never differ between them.
  bandContent: "vitals" | "timeline";
  // Does this view anchor the SUBJECT CALLOUT (user, 2026-08-15) — the HUD-layer label the Engine
  // positions over the committed subject's projected anchor each frame? Two readers: SceneCallout
  // mounts on it, the Engine's per-frame sync gates on it — one flag, so the label and its
  // positioning can't disagree. The three STRUCTURAL 3D views carry it; the flat placeholders stay
  // false, and so does History — every one of its chart planes already carries its own header
  // strip, so a floating label over a projected anchor would be a second name for the same thing.
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
  // Does the shared node population get PLACED in this view, or gathered to the staging grids
  // and faded out? The three structural views place it; the trends view is made of chart planes
  // and has nowhere honest to put a node, so it reuses the doc overlay's park+fade path
  // (NodeFabric.tickFleetFade, the DOC_ROLL clock) rather than inventing node poses.
  fleet: "placed" | "parked";
  // Which surface the RAW half of the `section` presentation axis shows. `section` is a
  // PRESENTATION axis — same subject, two presentations — so the answer is per view rather than
  // one hardcoded surface: the structural views show the records layer, and the trends view
  // shows the measured-history DOCUMENT, which is its other register (CLAUDE.md convention 12).
  rawSurface: "records" | "document";
  // Does this view mount the DOM chart-plane stack (`components/TrendStack.tsx` gates on this —
  // convention 7: gate on the view a behaviour is FOR, never `mode === "x"`)?
  chartStack: boolean;
  // Does the camera idle-ORBIT in this view (OrbitControls.autoRotate)? A row rather than the
  // `mode !== "geo"` deny-list the Engine carried until 2026-09-18 — which is exactly the shape
  // convention 7 exists to prevent, and it had already gone wrong: the fourth view inherited
  // hyper's spin by default and nobody decided it. The question a row makes each view answer is
  // "is this a thing you LOOK AT, or a thing you READ?" — an idling orbit keeps a structure alive
  // and shows its far side, and it makes a page of text slide sideways forever.
  // ⚠️ This is the view's DEFAULT, applied when the destination layout lands. A framing resolver
  // may still switch the orbit off afterwards for a subject it is aiming at (CameraDirector's
  // `focusFilter`, the geo node/cohort resolvers) — those are selection state, not view state,
  // and they are why a row can read `true` while the view's camera is in practice still.
  autoRotate: boolean;
}

// The calm bloom the ledger view uses — the reference the design likes (thin lines, sparse
// emitters). Shared so ledger + the canvas-hidden FLAT views read identically. strength values
// across the views are the EFFECTIVE strengths (an earlier global gain was folded in so the numbers
// read at a glance — bump them here directly for more/less overall glow).
const BLOOM_CALM = { strength: 0.40, radius: 0.35, threshold: 0.13 };

// THE flat placeholder view ("soon" — one consolidated mode): the canvas is hidden and the view
// is fully inert. Shared so the three rows stay identical by construction.
const FLAT: ViewPolicy = {
  canvas: false,
  morph: "toHyper",
  sims: { arcs: false, hubOrbits: false, globeSpin: false },
  show: { hyperFurniture: false, globeSurface: false, ledger: false, trendGround: false },
  pickSources: [],
  dofEligible: false,
  countryHover: false,
  minCamDist: 12,
  minCamAlt: null,
  minPolarAngle: 0.25,
  rotate: true,
  nodeList: false,
  vitalsLane: false,
  bandContent: "vitals",
  callout: false,
  bloom: BLOOM_CALM,
  chipEnv: 1,
  fleet: "placed",
  rawSurface: "records",
  chartStack: false,
  // Never read today — a flat view PARKS the fleet and applies no destination layout, so it is
  // the only row nothing consults. It keeps the value the old `mode !== "geo"` line would have
  // given it, so wiring one up later changes nothing by accident.
  autoRotate: true,
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
    show: { hyperFurniture: true, globeSurface: true, ledger: false, trendGround: false },
    pickSources: ["globe", "layers"],
    // ⚠️ DoF IS BACK (user, 2026-09-13: "add background blur effect again to hyper when a
    // metagraph is selected"). It was dropped on 2026-07-17 because "the bokeh read as FUZZ on
    // the selected atom" — and the two things that caused that have both since been fixed
    // elsewhere, which is why the re-tune the old note anticipated turns out to be a flag:
    //   · the SHARP ZONE was widened for exactly this complaint (SceneContext's dofParams: a low
    //     0.00028 aperture, so the selected hub's own shells — a few units of depth either side
    //     of the focal plane — stay inside it while the core and the far hubs saturate);
    //   · the fuzziness on the selected hub itself traced to OVER-STRONG BLOOM, not to the
    //     bokeh (see the UnrealBloomPass note), and hyper's strength has come down to 0.27 since.
    // Still ANDed in the Engine with a single metagraph committed and the morph window, so it
    // says exactly what the user asked for: blur the background when a network is the subject.
    dofEligible: true,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25, // standard clamp: the structure is TILTED (HYPER_TILT), not the camera —
    // so hyper shares the overview pose with the other views and never needs the pole-crossing relax
    rotate: true,
    nodeList: true,
    vitalsLane: true,
    bandContent: "vitals",
    callout: true, // first consumer of the subject callout (rolling out view by view)
    // Calmer than ledger: the core + dense node field piled up an additive bleed on OLED/HDR.
    bloom: { strength: 0.27, radius: 0.32, threshold: 0.14 },
    chipEnv: 1,
    fleet: "placed",
    rawSurface: "records",
    chartStack: false,
    // TRUE, which is what the old `mode !== "geo"` line gave it — and it stays the row's answer
    // even though hyper's camera does not in fact idle-orbit today: `CameraDirector.focusFilter`
    // switches it off for EVERY filter, "all" included, because the structure spins itself
    // (setHyperSpin) and two rotations over one subject read as neither. The view's default and
    // the framing's override are different facts and they live in different places.
    autoRotate: true,
    },
  // Footprint: the holographic globe + travelling packets; picks the globe nodes only.
  geo: {
    canvas: true,
    morph: "toGeo",
    sims: { arcs: true, hubOrbits: false, globeSpin: true },
    show: { hyperFurniture: true, globeSurface: true, ledger: false, trendGround: false },
    pickSources: ["globe"],
    dofEligible: false,
    countryHover: true, // pointer over a drillable country previews its border (pairs both ways)
    minCamDist: 12,
    minCamAlt: 18, // above the land plateau (R 16 + LAND_H 1.0) + chip stacks — no zooming inside
    minPolarAngle: 0.25,
    rotate: true,
    nodeList: true,
    vitalsLane: true,
    bandContent: "vitals",
    callout: true, // node > cohort > country anchors; the distributed network rung has none
    // The lowest bloom of the three views: strength drives the "black halo" ring the saturated
    // node/wall hues cast on the globe, and the additive coastal walls read fuzzy under bloom.
    bloom: { strength: 0.20, radius: 0.30, threshold: 0.16 },
    chipEnv: 1,
    fleet: "placed",
    rawSurface: "records",
    chartStack: false,
    // OFF: the globe does its own spinning (sims.globeSpin) and it turns to face a selection —
    // a camera orbiting a spinning globe is two rotations fighting over one subject.
    autoRotate: false,
    },
  // Snapshots: the settlement chamber. Morph frozen (nodes fly into lanes); picks the centred
  // snapshot + the reused producer dots. (The ledger-specific depth-fog recency treatment was
  // removed — the shared scene fog applies everywhere.)
  ledger: {
    canvas: true,
    morph: "frozen",
    sims: { arcs: false, hubOrbits: false, globeSpin: false },
    show: { hyperFurniture: false, globeSurface: true, ledger: true, trendGround: false },
    pickSources: ["ledger", "globe"],
    dofEligible: false,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25,
    rotate: true,
    // The Snapshots node browser (LedgerPanel's floor disclosures) reads store.selNodes.
    nodeList: true,
    vitalsLane: true,
    bandContent: "vitals",
    callout: true, // the pinned snapshot — the lane lead tile, or the global tick's bar
    bloom: BLOOM_CALM, // the reference look the design likes — unchanged
    chipEnv: 0.5, // low, not zero — coplanar trays wash at full sheen, go bland at none (field note)
    fleet: "placed",
    rawSurface: "records",
    chartStack: false,
    // OFF, and it always was: the chamber's branch in `_applyDestLayout` returns before the
    // generic line, so `mode !== "geo"` never reached it. The trail reads as a TIME axis running
    // away from the reader, and an orbit turns that axis into a shape being inspected.
    autoRotate: false,
  },
  // MEASURED HISTORY (2026-09-18) — the charts ARE the scene: DOM planes driven by
  // TrendStackSync, so almost every engine-side switch here is OFF. The canvas stays on because
  // TrendsView still owns real WebGL (the shared time cursor and the ground); nothing shared is
  // shown, nothing is raycast (the planes take DOM clicks and route them through pickActions),
  // and the fleet parks. No stage light: StagedView is an explicit Extract of the other three,
  // so claiming one here is a compile error rather than a silent no-op.
  trend: {
    canvas: true,
    morph: "frozen",
    sims: { arcs: false, hubOrbits: false, globeSpin: false },
    // The ONE thing shown: the ground grid TrendsView draws, so the DOM chart planes recede over
    // a visible depth axis instead of floating in a void. Nothing SHARED is shown — no nodes, no
    // hubs, no chamber.
    show: { hyperFurniture: false, globeSurface: false, ledger: false, trendGround: true },
    pickSources: [],
    dofEligible: false,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    minPolarAngle: 0.25,
    rotate: false,
    nodeList: false,
    // The band is MOUNTED but its content is this view's TIMELINE, not the vitals cells — the
    // reserve it publishes is the same either way, which is why the two are separate rows.
    vitalsLane: true,
    bandContent: "timeline",
    // The planes carry their own headers, so a floating label over a projected anchor would be
    // a second name for the same thing.
    callout: false,
    bloom: BLOOM_CALM,
    chipEnv: 1,
    fleet: "parked",
    rawSurface: "document",
    chartStack: true,
    // ⚠️ OFF, and this row is why the field exists (2026-09-18). The planes are TEXT — a chart you
    // are reading has to hold still, and an idle orbit slid the whole stack sideways forever. It
    // also defeats `TrendStackSync`'s idle skip outright: a camera that never stops moving means
    // five DOM style writes every frame, in the one view that already runs five composited layers.
    autoRotate: false,
  },
  soon: FLAT,
};
