"use client";

// Object/entity → icon legend for /design, read straight from the ONE icon system
// (components/icons.tsx: VIEW_ICONS + iconForPick + the rail marks), so it can't drift from
// what the cards, view switch, and dock trays actually render. Client component because the
// icons are lucide COMPONENTS (functions can't cross the server→client boundary).
import { VIEW_ICONS, iconForPick, ABOUT_ICON, EXPLORE_ICON, METATYPE_ICONS, NET_ICONS, KIND_MARK_CLASS } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ENTITIES: { label: string; Icon: LucideIcon }[] = [
  { label: "Metagraph", Icon: iconForPick("meta") },
  { label: "Node", Icon: iconForPick("geoLive") },
  { label: "Snapshot", Icon: iconForPick("snapshot") },
  { label: "Metagraph snapshot", Icon: iconForPick("metaSnap") },
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
// The metagraph TYPES (the vitals band, 2026-08-30). "Data + currency" deliberately has no third
// metaphor — it wears the data+currency PAIR, so its row here renders both glyphs.
const METATYPES: { label: string; icons: LucideIcon[] }[] = [
  { label: "Data", icons: [METATYPE_ICONS.data] },
  { label: "Currency", icons: [METATYPE_ICONS.currency] },
  { label: "Data + currency", icons: [METATYPE_ICONS.data, METATYPE_ICONS.currency] },
  { label: "Unknown", icons: [METATYPE_ICONS.unknown] },
  { label: "Mixed set (unlisted)", icons: [METATYPE_ICONS.mixed] },
];
// The Constellation networks (the NetworkSwitch, 2026-08-30) — the dev-lifecycle family.
const NETS: { label: string; Icon: LucideIcon }[] = [
  { label: "MainNet", Icon: NET_ICONS.mainnet },
  { label: "IntegrationNet", Icon: NET_ICONS.integrationnet },
  { label: "TestNet", Icon: NET_ICONS.testnet },
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

function MultiRow({ title, items }: { title: string; items: { label: string; icons: LucideIcon[] }[] }) {
  return (
    <div>
      <div className="text-micro tracking-caps uppercase text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(({ label, icons }) => (
          <span key={label} className="ig-panel inline-flex items-center gap-2 px-3 py-2 text-body text-foreground">
            <span className="inline-flex items-center gap-0.5">
              {icons.map((Icon, i) => (
                <Icon key={i} aria-hidden className={cn(KIND_MARK_CLASS, "text-primary")} />
              ))}
            </span>
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
      <MultiRow title="Metagraph types (vitals band)" items={METATYPES} />
      <Row title="Networks (network switch)" items={NETS} />
    </div>
  );
}
