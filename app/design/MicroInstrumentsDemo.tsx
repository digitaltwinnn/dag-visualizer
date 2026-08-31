"use client";

// The vitals band's micro-instruments for /design (2026-08-30) — rendered through the REAL
// components (VitalsBand's exported Donut + MicroBars) with sample values, so the reference
// can't drift from what the bottom band actually draws. Client component: the pieces are
// interactive-tree components (store-free here — sample data in, pixels out).
import { Donut, MicroBars } from "@/components/VitalsBand";
import { RoleChips } from "@/components/inspector/parts";

const SAMPLE_COMPOSITION = { Hybrid: 141, Consensus: 39, Currency: 5, Data: 16 };

export default function MicroInstrumentsDemo() {
  return (
    <div className="ig-panel p-4 flex flex-wrap items-start gap-10">
      <span className="flex items-center gap-3">
        <Donut counts={SAMPLE_COMPOSITION} accent="var(--primary)" />
        <span className="text-muted-foreground text-xs max-w-[130px]">
          Donut — shares of one whole, stepped opacities of the ONE accent, total in the hole
        </span>
      </span>
      <span className="flex items-start gap-3">
        <span className="w-[170px]">
          <MicroBars
            accent="var(--primary)"
            labelW={34}
            rows={[
              { key: "l0", label: <RoleChips codes={["L0"]} />, count: 180 },
              { key: "cl1", label: <RoleChips codes={["cL1"]} />, count: 174 },
              { key: "dl1", label: <RoleChips codes={["dL1"]} />, count: 26 },
            ]}
          />
        </span>
        <span className="text-muted-foreground text-xs max-w-[150px]">
          MicroBars — one measure, one hue, widths on the row max, every bar named
        </span>
      </span>
    </div>
  );
}
