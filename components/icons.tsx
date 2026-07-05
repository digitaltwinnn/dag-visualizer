import {
  Orbit,
  Globe,
  Layers,
  Radar,
  ArrowLeftRight,
  HandCoins,
  Info,
  Compass,
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

// The left-rail TOOL cards' own mark (GeoExplore, LedgerPanel, and hyper's LearnPanel if/when it
// grows a head): a card that lets you EXPLORE the view's subject, but isn't itself a view subject
// (unlike the detail cards' Globe/Layers/Orbit marks), so it gets one dedicated glyph rather than
// reusing the view icon a second time in the same rail. Compass — the same mark the phone dock's
// Explore half already uses, so the rail tool cards and the dock agree on what "explore" looks
// like. Used in the card head only; the dock icon TRAYS keep showing each view's own VIEW_ICONS
// mark (that legend is unchanged — it's what's parked inside the sheet, not the card's own head).
export const EXPLORE_ICON: LucideIcon = Compass;

// The inspector card KINDS map onto the same view vocabulary: the metagraph dossier is the
// Hypergraph subject (Orbit), a snapshot is the Snapshots subject (Layers), a node is the
// Geography subject (Globe). Keeps the card heads + the dock icon trays on the one glyph set.
export function iconForPick(kind: PickDescriptor["kind"] | "l0" | "l1" | "metanode"): LucideIcon {
  switch (kind) {
    case "snapshot":
      return VIEW_ICONS.ledger;
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
