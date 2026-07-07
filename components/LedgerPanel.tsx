"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { useStore } from "@/src/store/store";

// The Snapshots view's left-rail tool: the layered-design explainer. Lists the settlement stack
// top→bottom; clicking a layer highlights its plane in the 3D view (store.ledgerHilite → the engine
// → LedgerView.setHighlight). The 3D planes carry NO text now — this panel is where the names live.
// The ids match LedgerView's FLOOR_LAYERS / the "hypl0"/"hypl1" split panes.
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
  const hilite = useStore((s) => s.ledgerHilite);
  const setHilite = useStore((s) => s.setLedgerHilite);
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
          <p className="m-0 mb-2 px-1.5 text-label text-muted-foreground">
            The settlement stack, top to bottom — from where work enters to where it settles. Click a layer to highlight its plane.
          </p>
          <div className="flex flex-col gap-0.5">
            {LAYERS.map((l) => {
              const on = hilite === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setHilite(on ? null : l.id)}
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
