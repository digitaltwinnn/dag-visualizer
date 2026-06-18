"use client";

import { useStore } from "@/src/store/store";

const fmt = (v?: number | null) =>
  v == null ? "—" : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

// First store consumer — proves the NetworkData → store → React path. Sparklines and
// the full header styling come as the rest of the UI is ported.
export default function StatsHeader() {
  const live = useStore((s) => s.live);
  const nodes = useStore((s) => s.nodes);
  const metagraphs = useStore((s) => s.metagraphs);
  const activity = useStore((s) => s.activity);
  const priceUsd = useStore((s) => s.priceUsd);
  const latestOrdinal = useStore((s) => s.latestOrdinal);

  return (
    <header className="stats-header">
      <span className={`data-pill ${live ? "live" : "sim"}`}>
        {live ? "● LIVE · mainnet" : "SIMULATED"}
      </span>
      <Stat label="Validators" value={`${nodes.l0} / ${nodes.l1}`} />
      <Stat label="Public metagraphs" value={metagraphs || "—"} />
      <Stat label="Snapshots/hr" value={fmt(activity?.snapsPerHour)} />
      <Stat label="Anchors/hr" value={fmt(activity?.anchorsPerHour)} />
      <Stat label="Fees/hr (DAG)" value={fmt(activity?.feesPerHour)} />
      <Stat
        label="Latest"
        value={latestOrdinal ? `#${latestOrdinal.toLocaleString()}` : "—"}
      />
      {priceUsd != null && <Stat label="$DAG" value={`$${priceUsd.toFixed(4)}`} />}
    </header>
  );
}
