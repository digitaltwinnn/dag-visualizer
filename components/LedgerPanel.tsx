"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { filterAccent } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { layerToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { LEDGER_LAYERS } from "@/src/data/ledgerLayers";

// The Snapshots view's left-rail tool: the layered-design explainer. Lists the settlement stack
// top→bottom; HOVERING a layer previews its plane highlight in the 3D view (store.ledgerHilite, the
// transient channel), CLICKING commits the selection (store.layer — opens the layer card on the
// right facts rail AND keeps the plane highlighted; click again to clear). The engine resolves
// `ledgerHilite ?? layer?.layerId` — the same preview-vs-commit split as hoverFilter vs filter.
// Hovering/clicking the 3D planes themselves does the SAME (the engine raycasts them as fallback
// picks), so panel rows and planes are one interaction. Display copy comes from the shared
// src/data/ledgerLayers.ts table; the geometry twin (heights/lanes) is domain/ledgerLayout.ts.
const LAYERS = LEDGER_LAYERS;

export default function LedgerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  // The COMMITTED selection lives in the store (store.layer — it's the layer card's pick, cleared
  // by the card's × too); hover writes the transient preview channel, leave clears it (the engine
  // falls back to the committed layer).
  const sel = useStore((s) => s.layer?.layerId ?? null);
  const hilite = useStore((s) => s.ledgerHilite);
  const setHilite = useStore((s) => s.setLedgerHilite);
  const filter = useStore((s) => s.filter);

  // Rows run the SAME tested toggle as the scene's floor-plane click, through the shared
  // executor — the panel and the 3D planes can't drift (see domain/pickActions).
  const commit = (l: (typeof LAYERS)[number]) =>
    applyClickActions(layerToggleActions({ kind: "layer", layerId: l.id }, sel));
  return (
    // flex-none + no inner overflow (same treatment as GeoExplore, user: consistent rail
    // behaviour): the card grows with its content and the RAIL scrolls/fades into the chart
    // band — the old shrink-to-fit + inner scrollbox kept the rail from ever overflowing, so
    // the bottom fade never engaged in this view.
    <Card asChild className="sig-right block p-0 flex-none [--spine:var(--filter-accent,var(--primary))]">
      <aside id="ledger-view">
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title="Settlement layers"
          eyebrow="Explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col px-3 pt-1.5 pb-2.5", collapsed && "hidden")}>
          <div className="flex flex-col gap-0.5" onMouseLeave={() => setHilite(null)}>
            {LAYERS.map((l) => {
              const on = sel === l.id;
              // The SAME scene↔HUD hover pairing as GeoExplore's node rows: hovering the row
              // previews the plane highlight, hovering the 3D plane pairs this row back — wearing
              // the active filter's identity hue (`filterAccent`, cyan on "all"), via the shared
              // `.nb-row.subject-paired` row-wash recipe.
              const pair = subjectPairing<string>(hilite, l.id, setHilite, filterAccent(filter));
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => commit(l)}
                  onMouseEnter={pair.onMouseEnter}
                  onMouseLeave={pair.onMouseLeave}
                  onFocus={pair.onMouseEnter}
                  onBlur={pair.onMouseLeave}
                  aria-pressed={on}
                  className={cn(
                    // `relative pr-7` reserves the shared trailing ✓ slot so the text never shifts
                    // when a layer is selected — the SAME committed-selection language as the filter
                    // picker's row (SELECTED_ROW: wash + inset ring as one box-shadow + Check mark).
                    // `nb-row border border-transparent` hosts the pairing wash (box-shadow-based
                    // SELECTED_ROW composes under it, same as the geo node rows).
                    "nb-row relative text-left border border-transparent cursor-pointer rounded-sm pl-1.5 pr-7 py-1.5 bg-transparent transition-[background] duration-150",
                    "hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    on && SELECTED_ROW,
                    pair.paired && pair.className,
                  )}
                  style={pair.style}
                >
                  {/* The layer's STACK-LEVEL badge (LEDGER_LAYERS.level — up from the base:
                      Global snapshots = 1, the split hypergraph plane = sub-levels 2.1/2.2),
                      mirrored by the 3D floor labels so panel row and plane pair at a glance. */}
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "flex-none min-w-[18px] h-[18px] px-1 rounded-xs border flex items-center justify-center text-micro tabular-nums leading-none",
                        on
                          ? "border-[var(--filter-accent,var(--primary))] text-[var(--filter-accent,var(--primary))]"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {l.level}
                    </span>
                    <span className={cn("block text-body text-foreground", on && "font-semibold")}>{l.name}</span>
                  </span>
                  <span className="block pl-[26px] text-label text-muted-foreground leading-snug mt-0.5">{l.desc}</span>
                  {/* top-[8px] centres the 14px check on the SAME line as the 18px level badge
                      (row pad 6 + 18/2 = 15px centre; 8 + 14/2 = 15). */}
                  {on && <SelectedRowMark className="absolute right-2 top-[8px]" />}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </Card>
  );
}
