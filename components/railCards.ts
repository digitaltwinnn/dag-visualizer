import type { LucideIcon } from "lucide-react";
import { ABOUT_ICON, EXPLORE_ICON, iconForPick } from "@/components/icons";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import type { Mode, SelSlot } from "@/src/store/store";
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
  /** Whether this card currently renders (⇔ whether its tray icon shows). */
  present: boolean;
}

// The slice of the store the rails branch on. Kept as a plain object so the derivations are pure
// and unit-testable (per mode × selection state → expected card set) without a live store.
export interface RailManifestState {
  mode: Mode;
  filter: string;
  inspect: PickDescriptor | null;
  snap: Extract<PickDescriptor, { kind: "snapshot" }> | null;
  layer: Extract<PickDescriptor, { kind: "layer" }> | null;
  selStack: SelSlot[];
}

const isNodePick = (p: PickDescriptor | null): boolean =>
  !!p && (p.kind === "l0" || p.kind === "l1" || p.kind === "metanode");

// LEFT rail (Explore): the "About this view" orientation card in EVERY view, plus — only where the
// view has one — its single tool card (geo → GeoExplore, ledger → LedgerPanel). Both are STATIC
// tools: their subjectKeys are constants so they never read as "updated" (the tray stays a quiet
// legend; view switches ride the separate switch-signal, not a per-card update highlight).
export function exploreCards(s: Pick<RailManifestState, "mode">): RailCard[] {
  const hasTool = s.mode === "geo" || s.mode === "ledger";
  // The tray shows the tool card's OWN head mark (the ONE standard EXPLORE_ICON) — it used to
  // show VIEW_ICONS[mode], which in ledger put a Layers glyph on the left tab that read as the
  // snapshot card's mark (user bug report); card head and tray icon must agree.
  return [
    { id: "about", kind: "about", icon: ABOUT_ICON, subjectKey: "about", present: true },
    { id: "tool", kind: "tool", icon: EXPLORE_ICON, subjectKey: "tool", present: hasTool },
  ];
}

// RIGHT rail (Details): the Context dossier at the top (present iff a network is filtered — the
// "all" filter renders no Context card), then the Detail cards in recency order (`selStack`,
// most-recent first): the selected node (a 3D/geo pick) and the selected snapshot. Non-present
// slots are still returned (with `present: false`) so a consumer can reason about the full set;
// callers filter to `present` for what actually renders / shows in the tray.
export function detailsCards(s: RailManifestState): RailCard[] {
  const context: RailCard = {
    id: "context",
    kind: "context",
    icon: iconForPick("meta"),
    subjectKey: s.filter,
    // Mirrors ContextCard's own null-branch: metagraphById(filter) is truthy for every non-"all"
    // filter the app sets ("dag" + real metagraph ids), null for "all".
    present: s.filter !== "all",
  };
  const node: RailCard = {
    id: "node",
    kind: "node",
    icon: iconForPick("geoLive"),
    subjectKey: hoverKeyOf(s.inspect),
    present: isNodePick(s.inspect),
  };
  const snap: RailCard = {
    id: "snap",
    kind: "snap",
    icon: iconForPick("snapshot"),
    subjectKey: s.snap ? s.snap.data.ordinal : null,
    present: !!s.snap,
  };
  const layer: RailCard = {
    id: "layer",
    kind: "layer",
    icon: iconForPick("layer"),
    subjectKey: s.layer ? s.layer.layerId : null,
    present: !!s.layer,
  };
  const bySlot: Record<SelSlot, RailCard> = { node, snap, layer };
  // Present detail cards in the store's recency order, then any inactive slots (present: false)
  // appended so the full candidate set is always represented.
  const inStack = s.selStack.filter((slot) => bySlot[slot]);
  const rest = (Object.keys(bySlot) as SelSlot[]).filter((slot) => !inStack.includes(slot));
  return [context, ...inStack.map((slot) => bySlot[slot]), ...rest.map((slot) => bySlot[slot])];
}
