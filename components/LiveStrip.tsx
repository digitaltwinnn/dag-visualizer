"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { latestRelevant } from "@/src/data/follow";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { useBreakpoint } from "@/components/useBreakpoint";
import { getAnchor, metagraphById, filterAccent } from "@/src/data/network";
import type { GlobalSnapshot } from "@/src/data/types";
import { relativeAge } from "@/src/util/relativeAge";

// Matches VIS.maxSnapshots (the buffer cap) so the strip fills with the full retained window.
const MAX = 52;
// Phone renders fewer bars (from the same buffer) so each stays a usable width/tap-target.
const PHONE_BARS = 24;

// Slim live heartbeat (hyper + geo + ledger): a mini **anchor bar-chart** of the recent Global L0
// stream — quiet crisp-cap/faded-body bars on a faint baseline, one per snapshot. Unfiltered, each
// bar plots the tick's TOTAL anchors in cyan, scaled to the window max. When a metagraph is
// filtered, each bar instead plots THAT metagraph's own anchors on its OWN scale, in its identity
// hue — its own cadence, with empty ticks rendered as honest gaps (no cap, no body) rather than
// sub-pixel slivers. Only the live (newest) cap glows. Clicking a bar opens that snapshot in the
// Snapshots view; hovering cross-highlights the matching ledger block. Shares the feed + selection
// with the ledger view so the highlight is consistent. (Hand-rolled CSS, not Recharts: dense,
// interactive, slim.)
export default function LiveStrip() {
  const { snaps: allSnaps } = useSnapshotFeed(MAX);
  const bp = useBreakpoint();
  // Phone: slice to the most recent PHONE_BARS so each bar stays a usable width — the buffer
  // itself (MAX) is untouched, only what's rendered. Newest stays on the right (slice keeps order).
  const snaps = bp === "phone" ? allSnaps.slice(-PHONE_BARS) : allSnaps;
  const setSnap = useStore((s) => s.setSnap);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const setFollowing = useStore((s) => s.setFollowing);
  const snap = useStore((s) => s.snap);
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const activeOrd = snap?.data.ordinal ?? null;

  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag"; // a single metagraph is selected

  // Clear the hover highlight whenever a new snapshot lands, but ONLY while the cursor owns a BAR:
  // the bars shift under a stationary cursor (which doesn't fire mouseleave/enter), so a hovered bar
  // would "stick" and trail. Gated on `barHover` so a tick doesn't stomp the SnapshotCard's own
  // hover (it drives the same `hoverSnapOrd` channel — clearing it un-paired the card mid-hover).
  const barHover = useRef(false);
  const latestOrd = snaps[snaps.length - 1]?.ordinal ?? null;
  useEffect(() => {
    if (barHover.current) setHoverSnapOrd(null);
  }, [latestOrd, setHoverSnapOrd]);
  const accent = filterAccent(filter); // the selected metagraph's identity hue (incl. DAG's own), or core cyan for "all"

  // Hover tooltip — a single cursor-following element (the bars + their container both clip with
  // `overflow: hidden` + a mask, so a per-bar tooltip would be cut off; one element at the strip
  // level can't be). Content is set on bar-enter (so it re-renders only when the bar changes); the
  // cursor position is written straight to the DOM node on move, so following the cursor is free.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ ordinal: number; total: number; mine: number; ts: string; live: boolean; x: number; y: number } | null>(null);
  const moveTip = (e: React.MouseEvent) => {
    const el = tipRef.current;
    if (el) {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
    }
  };

  // Clicking a bar SELECTS that snapshot (no view switch) — its card shows in whatever view
  // you're in and carries across views, like the selected node. Following the live tip if you
  // clicked it, otherwise pinning a specific one.
  const pick = (d: GlobalSnapshot) => {
    setFollowing(latestRelevant("all")?.ordinal === d.ordinal);
    setSnap({ kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d });
  };

  // Per bar: the tick's total anchors, and (filtered) this metagraph's own anchors. The plotted
  // VALUE is `mine` when a metagraph is filtered (its own cadence on its own scale), else `total`.
  const bars = snaps.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mine = isMeta ? getAnchor(d.timestamp)?.metaCounts?.get(filter) ?? 0 : total;
    return { d, total, mine };
  });
  const scaleMax = Math.max(1, ...bars.map((b) => (isMeta ? b.mine : b.total)));

  return (
    <section
      id="livestrip"
      className={cn(
        "fixed z-10 left-4 right-4 bottom-4 h-[98px] px-[14px] flex items-center bg-transparent border-none",
        "max-[699px]:bottom-[calc(var(--phone-dock-h,56px)+8px)]",
        !live && "saturate-[.45]",
      )}
      style={{ ["--ls-accent"]: accent } as CSSProperties}
    >
      {/* Anchor bar-chart track. `before` = the ruler hairlines behind the bars (a ruler showing
          through the gaps), `after` = the crisp neutral baseline on top — the same instrument-thread
          language as the rails, rotated to a horizontal axis. Both share the strip's left-edge mask
          fade (vendor-prefixed mask-image kept as inline style — doesn't round-trip through an
          arbitrary Tailwind property cleanly, see RailThread.tsx). */}
      <div
        className={cn(
          "relative flex-1 flex items-end gap-0.5 h-20 overflow-hidden pb-[9px]",
          "before:content-[''] before:absolute before:inset-x-0 before:bottom-0 before:h-[9px] before:bg-[var(--axis-hairlines)] before:pointer-events-none",
          "after:content-[''] after:absolute after:inset-x-0 after:bottom-[9px] after:h-px after:bg-[var(--thread-line)] after:pointer-events-none",
        )}
        style={{
          maskImage: "linear-gradient(to right, transparent 0, #000 60px)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 60px)",
        }}
        onMouseLeave={() => { barHover.current = false; setTip(null); setHoverSnapOrd(null); }}
      >
        {snaps.length === 0 && <span className="text-muted-foreground text-xs self-center">Waiting for snapshots…</span>}
        {bars.map(({ d, total, mine }, i) => {
          const isLatest = i === bars.length - 1; // the newest bar (renamed: don't shadow the store `live`)
          const active = d.ordinal === activeOrd;
          const value = isMeta ? mine : total;
          const gap = value === 0;                        // honest gap (esp. filtered)
          return (
            <button
              key={d.ordinal}
              className={cn(
                // body: crisp value cap fades downward into the scene (quiet, not a glare); new bars
                // ease in from the right (`ls-bar-anim`, globals.css — the keyframe itself can't
                // round-trip through a Tailwind arbitrary value, same reasoning as the mask above).
                "relative self-end border-none cursor-pointer p-0 flex-1 min-w-[2px] rounded-t-[1px] origin-bottom ls-bar-anim",
                "transition-[height] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                // touch-target floor: extends the tap area up to the full track height without
                // touching the visual bar, so short/quiet bars stay honest-looking but stay tappable.
                "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-11",
                gap
                  ? "bg-none min-h-full" // an empty tick: no body, no cap — an honest gap on the baseline
                  : cn(
                      "bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--ls-accent)_26%,transparent),transparent)]",
                      "before:content-[''] before:absolute before:top-0 before:inset-x-0 before:h-[2px] before:rounded-[1px] before:bg-[var(--ls-accent)]",
                      "hover:before:shadow-[0_0_6px_var(--ls-accent)]",
                      (isLatest || active) && "before:shadow-[0_0_6px_var(--ls-accent)]", // live cap + selected glow permanently
                    ),
              )}
              style={{ height: gap ? "0%" : `max(6%, ${Math.round((value / scaleMax) * 100)}%)` }}
              aria-label={`snapshot ${d.ordinal}`}
              onMouseEnter={(e) => { barHover.current = true; setTip({ ordinal: d.ordinal, total, mine, ts: d.timestamp, live: isLatest, x: e.clientX, y: e.clientY }); setHoverSnapOrd(d.ordinal); }}
              onMouseMove={moveTip}
              onClick={() => pick(d)}
            />
          );
        })}
      </div>

      {tip && (
        <div
          id="ls-tip"
          ref={tipRef}
          className="fixed z-30 pointer-events-none py-2 px-[11px] bg-[rgba(8,12,26,0.92)] border border-border rounded-[8px] text-xs whitespace-nowrap -translate-x-1/2 -translate-y-[130%] flex flex-col gap-1"
          style={{ left: tip.x, top: tip.y }}
        >
          {/* Bare ordinal head — no '#'; a big mono number in a snapshot tooltip is obviously the ordinal. */}
          <div className="text-foreground font-mono font-bold tabular-nums">{tip.ordinal.toLocaleString()}</div>
          <div className="flex items-center justify-between gap-[18px]">
            {isMeta ? (
              tip.mine > 0 ? (
                <>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <span className="flex-none w-2 h-2 rounded-full" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="text-[#c7d0ea] text-[11px] tabular-nums">{tip.mine} of {tip.total} total</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <span className="flex-none w-2 h-2 rounded-full" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="text-muted-foreground text-[11px] tabular-nums">0 · none this tick ({tip.total} total)</span>
                </>
              )
            ) : (
              <>
                <span className="text-muted-foreground text-[11px]">anchored</span>
                <span className="text-[#c7d0ea] text-[11px] tabular-nums">{tip.total} metagraph snapshot{tip.total === 1 ? "" : "s"}</span>
              </>
            )}
          </div>
          {/* Recency — relative + coarse; the live bar reads 'live now'. */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
            {tip.live ? (
              <><span className="w-[7px] h-[7px] rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)]" /> live now</>
            ) : (
              <>◷ {relativeAge(Date.now() - Date.parse(tip.ts))}</>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground opacity-70 mt-1">click to open snapshot</div>
        </div>
      )}
    </section>
  );
}
