// The per-view policy table — ONE source of truth for what each `Mode` turns on in the 3D engine.
//
// This is the allow-list from CLAUDE.md's "Per-view behaviour" made data: a new view is inert (no
// canvas, no sims, no picks, no DoF) until its row opts it in, instead of a growing pile of
// `mode === "x" || mode === "y"` guards scattered through the render loop. The Engine reads
// `VIEW_POLICIES[this.mode]` each frame and translates the flags into the scene state it already
// owned imperatively — the values here reproduce the previous hand-written gates exactly.
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
  //  - twinkle:   the geo starfield twinkle (descriptive — the shader's uTime advances unconditionally;
  //               visible stars are gated by `show.starfield` feeding the morph into the backdrop).
  sims: { arcs: boolean; hubOrbits: boolean; globeSpin: boolean; twinkle: boolean };
  // What geometry is shown:
  //  - hyperFurniture: the Hypergraph hub furniture + core participate in the morph-driven visibility
  //                    (false → root/core are force-managed: ledger keeps root as the meta-L0 row,
  //                    flat hides both).
  //  - globeSurface:   the globe group (shared nodes + earth surface) is visible.
  //  - starfield:      the backdrop receives the live morph (stars fade with it) rather than a forced 0.
  //  - ledger:         the ledger chamber group is visible (and it keeps the hyper root as its
  //                    metagraph-L0 row).
  show: { hyperFurniture: boolean; globeSurface: boolean; starfield: boolean; ledger: boolean };
  // Which mesh pools this view raycasts — resolved to `THREE.Object3D[]` by `Engine._pickablesFor`.
  // Unlisted = pick nothing. Order is immaterial (the raycaster sorts hits by distance).
  pickSources: Array<"globe" | "layers" | "ledger">;
  // May depth-of-field run here at all? (Still ANDs with a single metagraph being selected +
  // the morph window.) Only hyper.
  dofEligible: boolean;
  // Scene fog: "base" = the shared FogExp2; "ledgerLinear" = the stronger linear depth fog that
  // fades the trailing chain into the background.
  fog: "base" | "ledgerLinear";
}

// A flat placeholder view (status / transactions / staking): the canvas is hidden and the view
// is fully inert. Shared so the three rows stay identical by construction.
const FLAT: ViewPolicy = {
  canvas: false,
  morph: "toHyper",
  sims: { arcs: false, hubOrbits: false, globeSpin: false, twinkle: false },
  show: { hyperFurniture: false, globeSurface: false, starfield: false, ledger: false },
  pickSources: [],
  dofEligible: false,
  fog: "base",
};

export const VIEW_POLICIES: Record<Mode, ViewPolicy> = {
  // Architecture: the core + orbiting hubs, the shared node shells, hover/click + DoF on a selection.
  // globeSpin stays on (the shells idle-spin exactly as before — the old idle gate was `!ledger`).
  hyper: {
    canvas: true,
    morph: "toHyper",
    // starfield:true here just passes the (0) morph through to the backdrop — no stars are
    // actually visible at morph=0; twinkle is the node shimmer and is geo-only.
    sims: { arcs: false, hubOrbits: true, globeSpin: true, twinkle: false },
    show: { hyperFurniture: true, globeSurface: true, starfield: true, ledger: false },
    pickSources: ["globe", "layers"],
    dofEligible: true,
    fog: "base",
  },
  // Footprint: the globe, travelling packets, starfield twinkle; picks the globe nodes only.
  geo: {
    canvas: true,
    morph: "toGeo",
    sims: { arcs: true, hubOrbits: false, globeSpin: true, twinkle: true },
    show: { hyperFurniture: true, globeSurface: true, starfield: true, ledger: false },
    pickSources: ["globe"],
    dofEligible: false,
    fog: "base",
  },
  // Snapshots: the settlement chamber. Morph frozen (nodes fly into lanes), starfield off, linear
  // depth fog fades the trail; picks the centred snapshot + the reused producer dots.
  ledger: {
    canvas: true,
    morph: "frozen",
    sims: { arcs: false, hubOrbits: false, globeSpin: false, twinkle: false },
    show: { hyperFurniture: false, globeSurface: true, starfield: false, ledger: true },
    pickSources: ["ledger", "globe"],
    dofEligible: false,
    fog: "ledgerLinear",
  },
  status: FLAT,
  transactions: FLAT,
  staking: FLAT,
};
