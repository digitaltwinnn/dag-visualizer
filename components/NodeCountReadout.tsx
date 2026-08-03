"use client";

import { useEffect, useRef, useState } from "react";
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
// The hue is a RECOGNITION cue, NEVER the only label: every entry carries its ticker in text at
// every width, and names the network for assistive tech + on hover. Narrow viewports used to
// `sr-only` the tickers below 1100px, which left ten anonymous coloured dots — meaning encoded in
// colour alone, the exact thing this rule forbids (fixed 2026-08-02). Instead the list is sorted
// located-DESC and simply CLIPS, fading out at the right edge (the LiveStrip's own mask idiom,
// mirrored): whatever fits is fully readable, the quietest networks fall off the end first, and
// the total on the left always accounts for all of them. The fade is measured, not assumed — it
// only appears when the list actually overflows, or it would dim a tail entry that fits. The
// measurement is FRACTIONAL (the last entry's own right edge vs the box's): `scrollWidth -
// clientWidth` is integer-rounded, so a real ~1.7px clip reads as 1 and a hard-cut ticker slipped
// through unfaded at tablet width.
export default function NodeCountReadout() {
  const metaList = useStore((s) => s.metaList);
  const live = useStore((s) => s.live);
  const listRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => {
      const last = el.lastElementChild;
      setClipped(!!last && last.getBoundingClientRect().right - el.getBoundingClientRect().right > 0.5);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [metaList]);
  const total = metaList.reduce((a, m) => a + m.located, 0);
  if (metaList.length === 0)
    return <span className="flex-1 text-muted-foreground text-label">{live ? "Acquiring nodes…" : "NO SIGNAL"}</span>;
  const ranked = [...metaList].sort((a, b) => b.located - a.located);
  return (
    <div className="flex-1 flex items-center gap-4 overflow-hidden">
      <span className="text-body text-foreground tabular-nums flex-none">
        {total} <span className="text-muted-foreground text-label">located nodes</span>
      </span>
      {/* The clip fade — vendor-prefixed mask-image stays an inline style (it doesn't round-trip
          through an arbitrary Tailwind property cleanly; same reasoning as LiveStrip/RailThread). */}
      <div
        ref={listRef}
        className="flex items-center gap-3 overflow-hidden"
        style={
          clipped
            ? {
                maskImage: "linear-gradient(to right, #000 calc(100% - 44px), transparent)",
                WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 44px), transparent)",
              }
            : undefined
        }
      >
        {ranked.map((m) => {
          const ticker = metagraphById(m.id)?.ticker || m.symbol || m.name;
          return (
            <span
              key={m.id}
              title={`${m.name} — ${m.located} located node${m.located === 1 ? "" : "s"}`}
              className={cn("flex items-center gap-1.5 text-label tabular-nums flex-none", m.located === 0 ? "text-muted-foreground opacity-50" : "text-foreground-dim")}
            >
              <IdentityDot hue={hex(m.color)} />
              <span>{ticker}</span>
              {m.located}
            </span>
          );
        })}
      </div>
    </div>
  );
}
