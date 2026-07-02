"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { latestRelevant } from "@/src/data/follow";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getAnchor, metagraphById, filterAccent } from "@/src/data/network";
import type { GlobalSnapshot } from "@/src/data/types";
import { relativeAge } from "@/src/util/relativeAge";

// Matches VIS.maxSnapshots (the buffer cap) so the strip fills with the full retained window.
const MAX = 52;

// Slim live heartbeat (hyper + geo): a mini **anchor bar-chart** of the recent Global L0 stream
// — one bar per snapshot, height = how many metagraph snapshots it anchored — with the newest
// (live) bar gently pulsing so the network always feels alive. When a metagraph is selected the
// bars become **stacked**: the full bar is still the tick's TOTAL anchors (so you keep the whole
// picture), with the selected metagraph's own share filled in at the bottom in its accent colour.
// Clicking a bar opens that snapshot in the Snapshots view. Shares the feed + selection with the
// ribbon so the highlight is consistent. (Hand-rolled CSS, not Recharts: dense, interactive, slim.)
export default function LiveStrip() {
  const { snaps } = useSnapshotFeed(MAX);
  const setSnap = useStore((s) => s.setSnap);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const setFollowing = useStore((s) => s.setFollowing);
  const snap = useStore((s) => s.snap);
  const filter = useStore((s) => s.filter);
  const activeOrd = snap?.data.ordinal ?? null;

  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag"; // a single metagraph is selected

  // Clear the hover highlight whenever a new snapshot lands: the bars shift under a stationary cursor
  // (which doesn't always fire mouseleave/enter), so without this a hovered row would "stick" and trail.
  const latestOrd = snaps[snaps.length - 1]?.ordinal ?? null;
  useEffect(() => setHoverSnapOrd(null), [latestOrd, setHoverSnapOrd]);
  const accent = filterAccent(filter); // metagraph colour, or the core cyan for all / dag

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
    <section id="livestrip" style={{ ["--ls-accent"]: accent } as CSSProperties}>
      <span className="ls-live">
        <span className="live-dot" />
        Global L0
        <span className="ls-scale">
          {isMeta ? `${cfg!.ticker || cfg!.name} anchors/tick · own scale` : "anchors/tick"}
        </span>
      </span>
      <div className="ls-bars" onMouseLeave={() => { setTip(null); setHoverSnapOrd(null); }}>
        {snaps.length === 0 && <span className="ls-empty">Waiting for snapshots…</span>}
        {bars.map(({ d, total, mine }, i) => {
          const live = i === bars.length - 1;
          const active = d.ordinal === activeOrd;
          const value = isMeta ? mine : total;
          const gap = value === 0;                        // honest gap (esp. filtered)
          const cls = "ls-bar" + (gap ? " gap" : "") + (live ? " live" : "") + (active ? " active" : "");
          return (
            <button
              key={d.ordinal}
              className={cls}
              style={{ height: gap ? "0%" : `max(6%, ${Math.round((value / scaleMax) * 100)}%)` }}
              aria-label={`snapshot ${d.ordinal}`}
              onMouseEnter={(e) => { setTip({ ordinal: d.ordinal, total, mine, ts: d.timestamp, live, x: e.clientX, y: e.clientY }); setHoverSnapOrd(d.ordinal); }}
              onMouseMove={moveTip}
              onClick={() => pick(d)}
            />
          );
        })}
      </div>

      {tip && (
        <div id="ls-tip" ref={tipRef} style={{ left: tip.x, top: tip.y }}>
          {/* Bare ordinal head — no '#'; a big mono number in a snapshot tooltip is obviously the ordinal. */}
          <div className="ls-tip-head">{tip.ordinal.toLocaleString()}</div>
          <div className="ls-tip-line">
            {isMeta ? (
              tip.mine > 0 ? (
                <>
                  <span className="ls-tip-k">
                    <span className="ls-tip-dot" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="ls-tip-v">{tip.mine} of {tip.total} total</span>
                </>
              ) : (
                <>
                  <span className="ls-tip-k">
                    <span className="ls-tip-dot" style={{ background: accent }} />
                    {cfg!.ticker || cfg!.name}
                  </span>
                  <span className="ls-tip-v ls-tip-gap">0 · none this tick ({tip.total} total)</span>
                </>
              )
            ) : (
              <>
                <span className="ls-tip-k">anchored</span>
                <span className="ls-tip-v">{tip.total} metagraph snapshot{tip.total === 1 ? "" : "s"}</span>
              </>
            )}
          </div>
          {/* Recency — relative + coarse; the live bar reads 'live now'. */}
          <div className="ls-tip-rec">
            {tip.live ? (
              <><span className="ls-tip-live" /> live now</>
            ) : (
              <>◷ {relativeAge(Date.now() - Date.parse(tip.ts))}</>
            )}
          </div>
          <div className="ls-tip-hint">click to open snapshot</div>
        </div>
      )}
    </section>
  );
}
