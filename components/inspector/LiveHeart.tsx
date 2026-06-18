"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";

// Heartbeat "real-time"/"go-real-time" control on the snapshot card. Keyed on ordinal
// so the one-shot beat animation replays each time a new snapshot arrives while
// following. When a metagraph is filtered, the label names it — because the card then
// follows the latest snapshot *that metagraph* anchored into (skipping global snapshots
// it isn't part of), so "Real-time" is scoped to the filter, not every tick.
export default function LiveHeart({ ordinal }: { ordinal: number }) {
  const following = useStore((s) => s.following);
  const setFollowing = useStore((s) => s.setFollowing);
  const filter = useStore((s) => s.filter);
  const mg = metagraphById(filter);
  const ticker = mg ? mg.ticker || mg.name : null;
  const label = following ? (ticker ? `Real-time · ${ticker}` : "Real-time") : "Go real-time";
  const title = following
    ? ticker
      ? `Real-time — following the latest snapshot ${ticker} anchored into. Click to pin this one.`
      : "Real-time — following the latest snapshot. Click to pin this one."
    : "Pinned. Click to go real-time.";
  return (
    <button
      key={following ? ordinal : "pinned"}
      className={"snap-pulse" + (following ? " on beat" : "")}
      title={title}
      // Following a metagraph → tint the control (text + heartbeat) its colour, tying
      // it to the filter. No filter → the default live green (.snap-pulse.on).
      style={following && mg ? { color: hex(mg.color) } : undefined}
      onClick={() => setFollowing(!following)}
    >
      <svg className="hb" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M1 12h5l2-6 3.5 13 2.5-9 1.5 4h5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
