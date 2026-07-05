import {
  Orbit,
  Globe,
  Layers,
  Activity,
  ArrowLeftRight,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "@/src/store/store";
import type { PickDescriptor } from "@/src/data/types";

// ONE source of truth for the interface's VOCABULARY glyphs — each view kind → its lucide icon.
// Consumed by the top-bar view switch (TopBar), the card-head kind marks (inspector/cards.tsx),
// and the tablet/phone signal chips (Inspector → RailDock). All three surfaces MUST read this so a
// view's mark is identical wherever it appears. Monochrome by default — lucide inherits
// `currentColor`, so the accent/identity tinting rides on the parent's text colour.
export const VIEW_ICONS: Record<Mode, LucideIcon> = {
  hyper: Orbit,
  geo: Globe,
  ledger: Layers,
  status: Activity,
  transactions: ArrowLeftRight,
  staking: HandCoins,
};

// The inspector card KINDS map onto the same view vocabulary: the metagraph dossier is the
// Hypergraph subject (Orbit), a snapshot is the Snapshots subject (Layers), a node is the
// Geography subject (Globe). Keeps the card heads + the signal chips on the one glyph set.
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
