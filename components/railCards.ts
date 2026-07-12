import type { LucideIcon } from "lucide-react";
import { ABOUT_ICON, EXPLORE_ICON, iconForPick } from "@/components/icons";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The RAIL MANIFEST — ONE source of truth for "which cards does each rail host, in what order".
//
// Before this, the dock icon TRAYS (RailDock, via ExploreRail/Inspector) reconstructed the hosted
// card set with their OWN mode-conditionals — a parallel guess at what the rails actually render,
// which drifted (e.g. the Details tray always drew the Context icon even at the "all" filter where
// no Context card renders). Now the rails render FROM this manifest AND the trays derive their
// icons from it, so the two can never disagree.
//
// Each descriptor is presentation-agnostic (`{ id, kind, icon, subjectKey, present }`): the icon is
// the shared VIEW_ICONS / ABOUT / kind glyph; `subjectKey` is the SAME key that drives that card's
// EdgePulse/roll (the thing that changes when the card "updates"), so the tray's update-highlight
// can key off it per descriptor; `present` mirrors exactly whether that card renders right now.
// Hue + active-flag stay with the tray builders (per-rail presentation), not here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type RailCardKind = "about" | "tool" | "context" | "node" | "snap" | "layer";

export interface RailCard {
  /** Stable id within the rail (also the tray-icon key + the render-map key). */
  id: string;
  kind: RailCardKind;
  icon: LucideIcon;
  /** The card's EdgePulse/roll subject — changes iff the card's content is a NEW subject. */
  subjectKey: string | number | null;
  /** Whether this card currently renders POPULATED (⇔ whether its tray icon shows). */
  present: boolean;
  /** The slot's GHOST hint (user design, 2026-07-10): when the view can produce this card but
   *  nothing is selected yet, the rail renders a quiet hint-state card carrying this copy —
   *  what to interact with, and what it will uncover. `null` = the view can't produce this
   *  card (no ghost; a populated card still renders anywhere — e.g. a pinned snapshot carried
   *  into another view). The availability is an ALLOW-LIST mirroring the engine's pick
   *  registry + the card scopes, exactly like the old single pick-invite it replaces. */
  hint: string | null;
}

// The slice of the store the rails branch on. Kept as a plain object so the derivations are pure
// and unit-testable (per mode × selection state → expected card set) without a live store.
// `selNodesCount` + `filterLabel` feed the geo node ghost's honest no-locatable variant (the
// old pickHintText rule, preserved verbatim).
export interface RailManifestState {
  mode: Mode;
  filter: string;
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  layer: Extract<PickDescriptor, { kind: "layer" }> | null;
  /** How many nodes the current selection plots in geo (store.selNodes.length). */
  selNodesCount: number;
  /** The filtered network's display ticker/name (for the honest geo variant). */
  filterLabel: string | null;
}

const isNodePick = (p: PickDescriptor | null): boolean =>
  !!p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode");

// LEFT rail (Explore): the "About this view" orientation card in EVERY view, plus — only where the
// view has one — its single tool card (hyper → HyperExplore, geo → GeoExplore, ledger →
// LedgerPanel). All are STATIC
// tools: their subjectKeys are constants so they never read as "updated" (the tray stays a quiet
// legend; view switches ride the separate switch-signal, not a per-card update highlight).
export function exploreCards(s: Pick<RailManifestState, "mode">): RailCard[] {
  const hasTool = s.mode === "hyper" || s.mode === "geo" || s.mode === "ledger";
  // The tray shows the tool card's OWN head mark (the ONE standard EXPLORE_ICON) — it used to
  // show VIEW_ICONS[mode], which in ledger put a Layers glyph on the left tab that read as the
  // snapshot card's mark (user bug report); card head and tray icon must agree.
  return [
    { id: "about", kind: "about", icon: ABOUT_ICON, subjectKey: "about", present: true, hint: null },
    { id: "tool", kind: "tool", icon: EXPLORE_ICON, subjectKey: "tool", present: hasTool, hint: null },
  ];
}

// Per-slot ghost hint copy — view + slot → the invite (or null = the view can't produce the
// card). The 3D views only; the flat placeholder views pick nothing → no ghosts (same allow-list
// rule the old single pick-invite followed). The geo node hint keeps the honest no-locatable
// variant: inviting a click when the filtered network plots nothing would be a dead hint, and
// "all" with 0 nodes is just boot (no ghost rather than a false one flashing at startup).
const IN_3D = (m: Mode) => m === "hyper" || m === "geo" || m === "ledger";
function contextHint(s: RailManifestState): string | null {
  if (!IN_3D(s.mode)) return null;
  return "Pick a metagraph with the top-bar filter to inspect it.";
}
function nodeHint(s: RailManifestState): string | null {
  if (s.mode === "hyper") return "Click a hub or node in the hypergraph to inspect it.";
  if (s.mode === "geo") {
    if (s.selNodesCount === 0) {
      if (!s.filterLabel) return null; // boot — the data simply hasn't landed yet
      return `${s.filterLabel} has no locatable nodes — explore it in the Hypergraph view.`;
    }
    return "Click a node on the globe (or a row in the explorer) to inspect it.";
  }
  return null;
}
function snapHint(s: RailManifestState): string | null {
  // The LiveStrip runs in EVERY view and a bar click opens the snapshot card from anywhere
  // (jumping to Snapshots from hyper/geo) — so the invite is honest in all 3D views, and
  // closing a carried snapshot card returns to a ghost instead of vanishing (user bug).
  if (s.mode === "ledger") return "Click a snapshot block (or a bar in the strip below) to inspect it.";
  if (IN_3D(s.mode)) return "Click a bar in the strip below to inspect a snapshot.";
  return null;
}
function layerHint(s: RailManifestState): string | null {
  return s.mode === "ledger" ? "Click a floor plane (or a row in the explorer) to inspect it." : null;
}

// RIGHT rail (Details): FIXED slots in a stable order — the Context dossier, then node, snapshot,
// layer. Each slot renders its populated card when selected, else its GHOST hint when the view
// can produce it (see `hint` above) — so the rail always shows the view's full possibility space
// and a deselect returns a slot to its ghost in place (spatially stable; the old recency
// reordering made cards jump). Callers filter to `present` for the tray icons.
export function detailsCards(s: RailManifestState): RailCard[] {
  const context: RailCard = {
    id: "context",
    kind: "context",
    icon: iconForPick("meta"),
    subjectKey: s.filter,
    // Mirrors ContextCard's own null-branch: metagraphById(filter) is truthy for every non-"all"
    // filter the app sets ("dag" + real metagraph ids), null for "all".
    present: s.filter !== "all",
    hint: contextHint(s),
  };
  const node: RailCard = {
    id: "node",
    kind: "node",
    icon: iconForPick("geoLive"),
    subjectKey: hoverKeyOf(s.inspect),
    present: isNodePick(s.inspect),
    hint: nodeHint(s),
  };
  const snap: RailCard = {
    id: "snap",
    kind: "snap",
    icon: iconForPick("snapshot"),
    subjectKey: s.snap ? s.snap.data.ordinal : null,
    present: !!s.snap,
    hint: snapHint(s),
  };
  const layer: RailCard = {
    id: "layer",
    kind: "layer",
    icon: iconForPick("layer"),
    subjectKey: s.layer ? s.layer.layerId : null,
    present: !!s.layer,
    hint: layerHint(s),
  };
  return [context, node, snap, layer];
}
