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
  // Does this view publish the selection's flat node list (`store.selNodes`) for its explorer
  // card? geo (Nodes by country) + hyper (Nodes by layer); elsewhere the list empties so the
  // browsers stay quiet.
  nodeList: boolean;
  // Proximity pick assist radius (world units, null = off): when the ray hits no geometry,
  // the nearest live node instance within this distance of the ray still picks. Ledger only —
  // its coins are edge-on slivers from the chamber camera, so a raw raycast needs
  // pixel-perfect aim (user, 2026-07-12: nodes must be hover/clickable in the chamber too).
  nodePickAssist: number | null;
}

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
  nodeList: false,
  nodePickAssist: null,
};

export const VIEW_POLICIES: Record<Mode, ViewPolicy> = {
  // Architecture: the core + orbiting hubs, the shared node shells, hover/click + DoF on a selection.
  // globeSpin stays on (the shells idle-spin exactly as before — the old idle gate was `!ledger`).
  hyper: {
    canvas: true,
    morph: "toHyper",
    sims: { arcs: false, hubOrbits: true, globeSpin: true },
    show: { hyperFurniture: true, globeSurface: true, ledger: false },
    pickSources: ["globe", "layers"],
    dofEligible: true,
    countryHover: false,
    minCamDist: 12,
    minCamAlt: null,
    nodeList: true,
    nodePickAssist: null,
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
    nodeList: true,
    nodePickAssist: null,
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
    nodeList: false,
    nodePickAssist: 2.5, // forgiving but local (chamber units are small on screen) — the dial area picks coins, open pane still picks the layer
  },
  status: FLAT,
  transactions: FLAT,
  staking: FLAT,
};
