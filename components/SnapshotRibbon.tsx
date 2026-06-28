"use client";

import { useEffect, useRef } from "react";
import { getAnchor, metagraphById } from "@/src/data/network";
import { latestRelevant } from "@/src/data/follow";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { fmtDag, hex } from "@/src/util/format";
import type { GlobalSnapshot } from "@/src/data/types";

const MAX = 16;

// Live Global L0 snapshot ribbon — the React port of stream.js, and the macro band
// of the ledger view (it shows only there now; hyper/geo get the slim LiveStrip).
// Reads the shared feed + filter for the per-chip metagraph cue, and writes the
// clicked snapshot to the store (driving the inspector + heartbeat).
export default function SnapshotRibbon() {
  const { snaps } = useSnapshotFeed(MAX);
  const trackRef = useRef<HTMLDivElement>(null);

  const filter = useStore((s) => s.filter);
  const snap = useStore((s) => s.snap);
  const setSnap = useStore((s) => s.setSnap);
  const setFollowing = useStore((s) => s.setFollowing);
  const selectedOrdinal = snap?.data?.ordinal ?? null;

  // Clicking a chip pins it (stop following) UNLESS it's the latest relevant snapshot
  // for the current filter — clicking the tip resumes real-time.
  const pick = (d: GlobalSnapshot) => {
    setFollowing(latestRelevant(filter)?.ordinal === d.ordinal);
    setSnap({ kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d });
  };

  // Keep the newest chip in view.
  useEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = trackRef.current.scrollWidth;
  }, [snaps]);

  const mg = filter ? metagraphById(filter) : null; // a metagraph filter (not all/l0/l1)?

  return (
    <section id="stream">
      <div className="stream-head">
        <span className="stream-title">
          <span className="live-dot" />
          Global L0 snapshots — the settlement layer
        </span>
        <span className="stream-caption">newest →</span>
      </div>
      <div className="stream-track" ref={trackRef}>
        {snaps.length === 0 && <div className="stream-empty">Waiting for snapshots…</div>}
        {snaps.map((d, i) => {
          const anchored =
            typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : 0;
          const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0;
          const a = getAnchor(d.timestamp);

          // Fee line: floor (≥) until every anchored snapshot is identified.
          let fee = "settling…";
          let feeSettling = true;
          if (a && a.fee > 0) {
            const full = a.count >= anchored;
            fee = `${full ? "" : "≥"}${fmtDag(a.fee)} DAG`;
            feeSettling = false;
          }

          // Metagraph cue: dim chips this metagraph didn't anchor into; tint the rest.
          let cue = "";
          const cueStyle: React.CSSProperties = {};
          if (mg) {
            if (a && a.metaIds.has(mg.id)) {
              cue = " mg-anchored";
              (cueStyle as Record<string, string>)["--mg"] = hex(mg.color);
            } else {
              cue = " mg-dim";
            }
          }

          const cls =
            "chip" +
            (anchored === 0 ? " quiet" : "") +
            (selectedOrdinal === d.ordinal ? " active" : "") +
            cue;

          return (
            <div className="stream-item" key={d.ordinal}>
              {i > 0 && <div className="connector" />}
              <button
                className={cls}
                style={cueStyle}
                title={`Snapshot #${d.ordinal.toLocaleString()} · anchored ${anchored} metagraph snapshot${anchored === 1 ? "" : "s"} · ${blocks} block${blocks === 1 ? "" : "s"}`}
                onClick={() => pick(d)}
              >
                <span className="chip-ord">#{d.ordinal.toLocaleString()}</span>
                <span className="chip-meta">
                  {anchored > 0 ? `${anchored} anchored` : "idle"}
                  {blocks > 0 && <span className="chip-blk">+{blocks} blk</span>}
                </span>
                <span className="chip-bar">
                  <span style={{ width: `${Math.min(100, anchored * 5 + 8)}%` }} />
                </span>
                <span className={"chip-fee" + (feeSettling ? " settling" : "")}>{fee}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
