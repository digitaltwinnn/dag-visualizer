"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { LEARN_ICON } from "@/components/icons";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { filterAccent } from "@/src/data/network";
import { useStore } from "@/src/store/store";
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
  const setLayer = useStore((s) => s.setLayer);
  const hilite = useStore((s) => s.ledgerHilite);
  const setHilite = useStore((s) => s.setLedgerHilite);
  const filter = useStore((s) => s.filter);

  const commit = (l: (typeof LAYERS)[number]) => {
    setLayer(sel === l.id ? null : { kind: "layer", layerId: l.id });
  };
  return (
    <Card asChild className="sig-right block p-0 flex-[0_1_auto] min-h-0 [--spine:var(--filter-accent,var(--primary))]">
      <aside id="ledger-view">
        <CardHead
          panel
          icon={LEARN_ICON}
          title="Understand the layered design"
          eyebrow="Snapshots · explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col px-3 pt-1.5 pb-2.5 min-h-0 overflow-y-auto cmd-list-scroll", collapsed && "hidden")}>
          <div className="flex flex-col gap-0.5" onMouseLeave={() => setHilite(null)}>
            {LAYERS.map((l, li) => {
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
                  {/* The layer's STACK-LEVEL badge — levels count UP from the base settlement
                      (Global snapshots = 1 … Metagraph L1 = 6, user decision), mirrored by the 3D
                      floor labels so panel row and plane pair at a glance. Decorative. */}
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "flex-none w-[18px] h-[18px] rounded-xs border flex items-center justify-center text-micro tabular-nums leading-none",
                        on
                          ? "border-[var(--filter-accent,var(--primary))] text-[var(--filter-accent,var(--primary))]"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {LAYERS.length - li}
                    </span>
                    <span className={cn("block text-body text-foreground", on && "font-semibold")}>{l.name}</span>
                  </span>
                  <span className="block pl-[26px] text-label text-muted-foreground leading-snug mt-0.5">{l.desc}</span>
                  {on && <SelectedRowMark className="absolute right-2 top-[13px]" />}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </Card>
  );
}
