import {
  Orbit,
  Globe,
  Layers,
  Layers2,
  Radar,
  ArrowLeftRight,
  HandCoins,
  Info,
  Telescope,
  Box,
  Boxes,
  MapPin,
  Server,
  Component,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";

// ONE source of truth for the interface's VOCABULARY glyphs — each view kind → its lucide icon.
// Consumed by the top-bar view switch (TopBar), the card-head kind marks (inspector/cards.tsx),
// and the tablet/phone dock icon trays (ExploreRail/Inspector → RailDock). All three surfaces
// MUST read this so a view's mark is identical wherever it appears. Monochrome by default —
// lucide inherits `currentColor`, so the accent/identity tinting rides on the parent's text
// colour.
export const VIEW_ICONS: Record<Mode, LucideIcon> = {
  hyper: Orbit,
  geo: Globe,
  ledger: Layers,
  // Radar (not Activity — user refinement): instrument character for the Network status view;
  // Activity's ECG zigzag also echoed the brand EcgMark sitting two regions left in the same bar.
  status: Radar,
  transactions: ArrowLeftRight,
  staking: HandCoins,
};

// The view explainer ("About") card's own mark (user-confirmed): it is not a view SUBJECT, so it
// gets a dedicated icon rather than borrowing a view's. Info (not BookOpen — at the tray's 14px
// the open book reads as noise; the circled i is the universal "about" mark and stays crisp).
// Used in the left dock tray and anywhere the About card kind needs an icon.
export const ABOUT_ICON: LucideIcon = Info;

// The left-rail TOOL cards' ONE mark (GeoExplore, LedgerPanel — user decision: the SAME standard
// icon in every view; an earlier per-view icon split read as neither exploring nor
// learning). Telescope: an INSTRUMENT that says explore/investigate — same reasoning as the
// status view's Radar. A tool card isn't itself a view subject (unlike the detail cards'
// Globe/Box/Orbit marks), so it doesn't reuse a view icon. Used in the card head, the dock icon
// trays (railCards.ts), and the phone dock's Explore half — head, tray, and dock must agree.
export const EXPLORE_ICON: LucideIcon = Telescope;

// A SNAPSHOT's mark (the snapshot detail card + dock tray): a snapshot renders as a solid BLOCK
// in the settlement chamber, so it wears the cube — deliberately distinct from VIEW_ICONS.ledger
// (the whole stacked view) and LAYER_ICON (one stratum), which previously made the snapshot and
// layer cards near-identical at a glance (user feedback).
export const SNAPSHOT_ICON: LucideIcon = Box;

// A settlement-stack LAYER's mark (the Snapshots·Explore panel's click subject). NOT a view icon —
// distinct from VIEW_ICONS.ledger (the whole stack) and SNAPSHOT_ICON (the block): a two-plane
// glyph from the Layers family reads "one stratum of the stack". Named like ABOUT_ICON/
// EXPLORE_ICON: dedicated non-view marks get a constant here, view subjects borrow VIEW_ICONS.
export const LAYER_ICON: LucideIcon = Layers2;

// A metagraph SNAPSHOT's mark (spec 2026-08-04 — a tile on the ledger's upper floor, its own card
// slot): a metagraph snapshot is one of the many sealed states a single global tick carries, so it
// wears the plural cube — distinct from SNAPSHOT_ICON (the ONE global block it anchors into).
export const METASNAP_ICON: LucideIcon = Boxes;

// The COUNTRY drill's mark (the geo focus ladder's country rung — card head, ghost, dock tray):
// a place pin — distinct from VIEW_ICONS.geo (the whole globe) and the node's Globe mark.
export const COUNTRY_ICON: LucideIcon = MapPin;

// The PROVIDER (internal id: cohort — city × hosting-provider rung) mark: a server rack, reading
// as "hosting infrastructure" — distinct from the country pin and the node's Globe mark.
export const PROVIDER_ICON: LucideIcon = Server;

// The COMPOSITION group's mark (hyper's make-up rung — the machines in a network that run the
// same set of layers). Component: a shape assembled from smaller ones, reading as "made up of" —
// distinct from LAYER_ICON (one stratum of the ledger stack), which it would otherwise be
// confused with, since both talk about layers.
export const COMPOSITION_ICON: LucideIcon = Component;

// The ONE size every card-head/title KIND MARK renders at — About's Info, the tool cards'
// Telescope, the node card's Globe, the snapshot card's Box (CardHead's panel `icon` + the inspector
// titles in inspector/cards.tsx). 16px (`size-4`): the old 14px read timid next to the 15px
// text-title headline (user follow-up on Task 23). Single-sourced here so the heads can't drift;
// the dock TRAYS and the top-bar view switch deliberately keep their own sizes (this constant is
// only the head/title mark).
export const KIND_MARK_CLASS = "flex-none size-4";

// The inspector card KINDS map onto one glyph set shared with the dock icon trays: the metagraph
// dossier is the Hypergraph subject (Orbit), a node is the Geography subject (Globe), a snapshot
// is the BLOCK (SNAPSHOT_ICON), a layer is one stratum (LAYER_ICON).
export function iconForPick(
  kind: PickDescriptor["kind"] | "l0" | "l1" | "metanode" | "country" | "cohort" | "composition",
): LucideIcon {
  switch (kind) {
    case "snapshot":
      return SNAPSHOT_ICON; // the block, not the whole-stack view mark (see its constant above)
    case "metaSnap":
      return METASNAP_ICON; // a metagraph snapshot tile (see its constant above)
    case "layer":
      return LAYER_ICON; // dedicated mark (see its constant above) — not a view subject
    case "country":
      return COUNTRY_ICON; // the geo drill rung (see its constant above)
    case "cohort":
      return PROVIDER_ICON; // the geo city×provider rung (see its constant above); user copy "provider"
    case "composition":
      return COMPOSITION_ICON; // hyper's make-up rung (see its constant above)

    case "geoLive":
    case "l0":
    case "l1":
    case "metanode":
      return VIEW_ICONS.geo;
    case "meta":
    default:
      return VIEW_ICONS.hyper;
  }
}
