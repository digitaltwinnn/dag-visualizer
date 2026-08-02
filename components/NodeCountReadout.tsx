"use client";

import { useStore } from "@/src/store/store";
import { hex } from "@/src/util/format";
import { metagraphById } from "@/src/data/network";
import { IdentityDot } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";

// The strip's content outside ledger (spec 2026-08-01): the tick-bar chart is a time series and
// belongs to Snapshots only — here the same slim footprint carries a quiet node-count readout
// instead: the located total plus one identity-hued mark + count per network (the filter
// picker's numbers, horizontal). Honest: counts are the live `metaList` located tallies; an
// empty list is the boot/no-signal quiet state, not zeros.
//
// The hue is a RECOGNITION cue, never the only label: each entry carries its ticker in text
// (condensed away below 1100px, where ten of them stop fitting) and always names the network for
// assistive tech + on hover, so the readout doesn't encode meaning in colour alone.
export default function NodeCountReadout() {
  const metaList = useStore((s) => s.metaList);
  const live = useStore((s) => s.live);
  const total = metaList.reduce((a, m) => a + m.located, 0);
  if (metaList.length === 0)
    return <span className="flex-1 text-muted-foreground text-label">{live ? "Acquiring nodes…" : "NO SIGNAL"}</span>;
  return (
    <div className="flex-1 flex items-center gap-4 overflow-hidden">
      <span className="text-body text-foreground tabular-nums flex-none">
        {total} <span className="text-muted-foreground text-label">located nodes</span>
      </span>
      <div className="flex items-center gap-3 overflow-hidden">
        {metaList.map((m) => {
          const ticker = metagraphById(m.id)?.ticker || m.symbol || m.name;
          return (
            <span
              key={m.id}
              title={`${m.name} — ${m.located} located node${m.located === 1 ? "" : "s"}`}
              className={cn("flex items-center gap-1.5 text-label tabular-nums flex-none", m.located === 0 ? "text-muted-foreground opacity-50" : "text-foreground-dim")}
            >
              <IdentityDot hue={hex(m.color)} />
              <span className="max-[1099px]:sr-only">{ticker}</span>
              {m.located}
            </span>
          );
        })}
      </div>
    </div>
  );
}
