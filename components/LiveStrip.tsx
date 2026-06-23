"use client";

import { useEffect, useRef } from "react";
import { latestRelevant } from "@/src/data/follow";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import type { GlobalSnapshot } from "@/src/data/types";

const MAX = 8;

// Slim live heartbeat (hyper + geo): just enough of the Global L0 stream to feel the
// network is alive — the live dot + the last few ordinals — without the full ribbon's
// fees/anchors/bars, which belong to the ledger view. Clicking a tick still opens its
// snapshot inspector; "Snapshot DAG →" jumps to the full timeline. Shares the feed +
// selection state with the ribbon so the highlight stays consistent across views.
export default function LiveStrip() {
  const { snaps } = useSnapshotFeed(MAX);
  const trackRef = useRef<HTMLDivElement>(null);

  const setInspect = useStore((s) => s.setInspect);
  const setFollowing = useStore((s) => s.setFollowing);
  const setMode = useStore((s) => s.setMode);

  // Snapshots are a ledger concept — clicking a tick jumps to the ledger view and opens
  // it there (rather than showing a snapshot card inline in hyper/geo). Pins it unless
  // it's the live tip.
  const pick = (d: GlobalSnapshot) => {
    setMode("ledger");
    setFollowing(latestRelevant("all")?.ordinal === d.ordinal);
    setInspect({ kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d });
  };

  useEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = trackRef.current.scrollWidth;
  }, [snaps]);

  return (
    <section id="livestrip">
      <span className="ls-live">
        <span className="live-dot" />
        Global L0
      </span>
      <div className="ls-track" ref={trackRef}>
        {snaps.length === 0 && <span className="ls-empty">Waiting for snapshots…</span>}
        {snaps.map((d) => {
          const anchored =
            typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
          const cls = "ls-chip" + (anchored === 0 ? " quiet" : "");
          return (
            <button
              key={d.ordinal}
              className={cls}
              title={`Snapshot #${d.ordinal.toLocaleString()} · anchored ${anchored} metagraph snapshot${anchored === 1 ? "" : "s"}`}
              onClick={() => pick(d)}
            >
              #{d.ordinal.toLocaleString()}
            </button>
          );
        })}
      </div>
      <button className="ls-more" title="Open the full snapshot timeline" onClick={() => setMode("ledger")}>
        Snapshot DAG →
      </button>
    </section>
  );
}
