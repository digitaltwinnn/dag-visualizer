"use client";

// Object/entity → icon legend for /design, read straight from the ONE icon system
// (components/icons.tsx: VIEW_ICONS + iconForPick + the rail marks), so it can't drift from
// what the cards, view switch, and dock trays actually render. Client component because the
// icons are lucide COMPONENTS (functions can't cross the server→client boundary).
import { VIEW_ICONS, iconForPick, ABOUT_ICON, EXPLORE_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ENTITIES: { label: string; Icon: LucideIcon }[] = [
  { label: "Metagraph", Icon: iconForPick("meta") },
  { label: "Node", Icon: iconForPick("geoLive") },
  { label: "Snapshot", Icon: iconForPick("snapshot") },
  { label: "Layer", Icon: iconForPick("layer") },
];
const VIEWS: { label: string; Icon: LucideIcon }[] = [
  { label: "Hypergraph", Icon: VIEW_ICONS.hyper },
  { label: "Geography", Icon: VIEW_ICONS.geo },
  { label: "Snapshots", Icon: VIEW_ICONS.ledger },
  { label: "Network", Icon: VIEW_ICONS.status },
  { label: "Transactions", Icon: VIEW_ICONS.transactions },
  { label: "Staking", Icon: VIEW_ICONS.staking },
];
const RAIL: { label: string; Icon: LucideIcon }[] = [
  { label: "About", Icon: ABOUT_ICON },
  { label: "Explore", Icon: EXPLORE_ICON },
];

function Row({ title, items }: { title: string; items: { label: string; Icon: LucideIcon }[] }) {
  return (
    <div>
      <div className="text-micro tracking-caps uppercase text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(({ label, Icon }) => (
          <span key={label} className="ig-panel inline-flex items-center gap-2 px-3 py-2 text-body text-foreground">
            <Icon aria-hidden className={cn(KIND_MARK_CLASS, "text-primary")} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function IconLegend() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Row title="Subjects (kind marks)" items={ENTITIES} />
      <Row title="Views (top-bar switch)" items={VIEWS} />
      <Row title="Rail cards" items={RAIL} />
    </div>
  );
}
