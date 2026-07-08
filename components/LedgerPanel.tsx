"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { useStore } from "@/src/store/store";

// The Snapshots view's left-rail tool: the layered-design explainer. Lists the settlement stack
// top→bottom; HOVERING a layer previews its plane highlight in the 3D view (store.ledgerHilite, the
// transient channel), CLICKING commits the selection (store.layer — opens the layer card on the
// right facts rail AND keeps the plane highlighted; click again to clear). The engine resolves
// `ledgerHilite ?? layer?.layerId` — the same preview-vs-commit split as hoverFilter vs filter.
// The 3D planes carry NO text — this panel is where the names live. Ids match LedgerView's
// FLOOR_LAYERS / the "hypl0"/"hypl1" split panes.
const LAYERS: { id: string; name: string; desc: string }[] = [
  { id: "ml1", name: "Metagraph L1", desc: "Currency-L1 (wallet transactions) and data-L1 (producer updates) validate incoming work into blocks." },
  { id: "ml0", name: "Metagraph L0", desc: "Collects those L1 blocks into the metagraph's snapshot." },
  { id: "msnap", name: "Metagraph snapshots", desc: "Each metagraph's ledger output — they anchor into a global snapshot." },
  { id: "hypl0", name: "Hypergraph L0", desc: "The Global L0 validators that produce the global snapshot." },
  { id: "hypl1", name: "Hypergraph L1", desc: "The native $DAG currency — its own lane beside L0." },
  { id: "gl0", name: "Global snapshots", desc: "The base settlement: where every metagraph snapshot anchors." },
];

export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  // The COMMITTED selection lives in the store (store.layer — it's the layer card's pick, cleared
  // by the card's × too); hover writes the transient preview channel, leave clears it (the engine
  // falls back to the committed layer).
  const sel = useStore((s) => s.layer?.layerId ?? null);
  const setLayer = useStore((s) => s.setLayer);
  const setHilite = useStore((s) => s.setLedgerHilite);
  const commit = (l: (typeof LAYERS)[number]) => {
    setLayer(sel === l.id ? null : { kind: "layer", layerId: l.id, name: l.name, desc: l.desc });
  };
  return (
    <Card asChild className="sig-right block p-0 flex-[0_1_auto] min-h-0 [--spine:var(--filter-accent,var(--primary))]">
      <aside id="ledger-view">
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title="Understand the layered design"
          eyebrow="Snapshots · explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col px-3 pt-1.5 pb-2.5 min-h-0 overflow-y-auto cmd-list-scroll", collapsed && "hidden")}>
          <div className="flex flex-col gap-0.5" onMouseLeave={() => setHilite(null)}>
            {LAYERS.map((l) => {
              const on = sel === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => commit(l)}
                  onMouseEnter={() => setHilite(l.id)}
                  onMouseLeave={() => setHilite(null)}
                  onFocus={() => setHilite(l.id)}
                  onBlur={() => setHilite(null)}
                  aria-pressed={on}
                  className={cn(
                    "text-left border-none cursor-pointer rounded-sm px-1.5 py-1.5 transition-[background] duration-150",
                    on ? "bg-[var(--sel-bg)] shadow-[inset_2px_0_0_var(--primary)]" : "bg-transparent hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                  )}
                >
                  <span className={cn("block text-body text-foreground", on && "font-semibold")}>{l.name}</span>
                  <span className="block text-label text-muted-foreground leading-snug mt-0.5">{l.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </Card>
  );
}
