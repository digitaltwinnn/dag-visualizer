"use client";

import type { CSSProperties } from "react";
import { latestRelevant } from "@/src/data/follow";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getAnchor, metagraphById, filterAccent } from "@/src/data/network";
import type { GlobalSnapshot } from "@/src/data/types";

const MAX = 60;

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
  const setFollowing = useStore((s) => s.setFollowing);
  const snap = useStore((s) => s.snap);
  const filter = useStore((s) => s.filter);
  const activeOrd = snap?.data.ordinal ?? null;

  const cfg = metagraphById(filter);
  const isMeta = !!cfg && filter !== "all" && filter !== "dag"; // a single metagraph is selected
  const accent = filterAccent(filter); // metagraph colour, or the core cyan for all / dag

  // Clicking a bar SELECTS that snapshot (no view switch) — its card shows in whatever view
  // you're in and carries across views, like the selected node. Following the live tip if you
  // clicked it, otherwise pinning a specific one.
  const pick = (d: GlobalSnapshot) => {
    setFollowing(latestRelevant("all")?.ordinal === d.ordinal);
    setSnap({ kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d });
  };

  // Per bar: the tick's TOTAL anchors (bar height), and the selected metagraph's own share of it
  // (the filled segment). With no metagraph selected the share IS the total (a solid bar).
  const bars = snaps.map((d) => {
    const total = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
    const mine = isMeta ? getAnchor(d.timestamp)?.metaCounts?.get(filter) ?? 0 : total;
    return { d, total, mine };
  });
  const maxTotal = Math.max(1, ...bars.map((b) => b.total));

  return (
    // --ls-accent colours the FILL (the metagraph's share); --ls-outline colours the total bar's
    // outline. When a metagraph is selected the outline goes neutral/dim (the total is just
    // context behind the coloured share); unselected it's the core cyan of the whole-network bar.
    <section
      id="livestrip"
      style={
        {
          ["--ls-accent"]: accent,
          ["--ls-outline"]: isMeta ? "rgb(150, 165, 200)" : "var(--core)",
        } as CSSProperties
      }
    >
      <span className="ls-live">
        <span className="live-dot" />
        Global L0
      </span>
      <div className="ls-bars">
        {snaps.length === 0 && <span className="ls-empty">Waiting for snapshots…</span>}
        {bars.map(({ d, total, mine }, i) => {
          const live = i === bars.length - 1;
          const active = d.ordinal === activeOrd;
          const off = isMeta && mine === 0; // total bar still shows, just no accent fill
          const fillPct = total > 0 ? Math.round((mine / total) * 100) : 0;
          const cls = "ls-bar" + (off ? " off" : "") + (live ? " live" : "") + (active ? " active" : "");
          const title = isMeta
            ? `Snapshot #${d.ordinal.toLocaleString()} · ${cfg!.ticker || cfg!.name} ${mine} of ${total} anchored`
            : `Snapshot #${d.ordinal.toLocaleString()} · anchored ${total} metagraph snapshot${total === 1 ? "" : "s"}`;
          return (
            <button
              key={d.ordinal}
              className={cls}
              style={{ height: `max(8%, ${Math.round((total / maxTotal) * 100)}%)` }}
              title={title}
              onClick={() => pick(d)}
            >
              <span className="ls-bar-fill" style={{ height: `${fillPct}%` }} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
