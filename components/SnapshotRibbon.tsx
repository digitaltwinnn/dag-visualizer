"use client";

import { useEffect, useRef, useState } from "react";
import { getNetwork, getAnchor, metagraphById } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import type { GlobalEvent, GlobalSnapshot } from "@/src/data/types";

const MAX = 16;
const fmtDag = (datum: number) => (datum / 1e8).toFixed(4);
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

// Live Global L0 snapshot ribbon — the React port of stream.js. Subscribes to
// NetworkData directly (snapshots arrive ~every 15s, so React state is fine here),
// reads the shared filter for the per-chip metagraph cue, and writes the clicked
// snapshot to the store (the inspector + heartbeat reconnect in Phase 4).
export default function SnapshotRibbon() {
  const [snaps, setSnaps] = useState<GlobalSnapshot[]>([]);
  // Bumped when the anchor index fills in, so chip fees/cues re-read getAnchor().
  const [, setAnchorTick] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const filter = useStore((s) => s.filter);
  const inspect = useStore((s) => s.inspect);
  const setInspect = useStore((s) => s.setInspect);
  const setFollowing = useStore((s) => s.setFollowing);
  const selectedOrdinal =
    inspect?.kind === "snapshot" ? inspect.data?.ordinal ?? null : null;

  // Clicking a chip pins that snapshot — stop following so the card stays put and
  // shows "Go live" (instead of being dragged back to the newest each tick).
  const pick = (d: GlobalSnapshot) => {
    setFollowing(false);
    setInspect({ kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d });
  };

  useEffect(() => {
    const net = getNetwork();
    if (!net) return;

    // Seed from the buffer (the "reset" event may have fired before we mounted).
    setSnaps(net.globalSnapshots.slice(-MAX));

    const onGlobal = (evt: GlobalEvent) => {
      if (evt.reset) setSnaps((evt.snapshots ?? []).slice(-MAX));
      else if (evt.snapshot) {
        const snap = evt.snapshot;
        setSnaps((prev) => [...prev, snap].slice(-MAX));
      }
    };
    let raf = 0;
    const onAnchor = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setAnchorTick((t) => t + 1));
    };

    net.on("global", onGlobal);
    net.on("anchor", onAnchor);
    return () => {
      net.off("global", onGlobal);
      net.off("anchor", onAnchor);
      cancelAnimationFrame(raf);
    };
  }, []);

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
