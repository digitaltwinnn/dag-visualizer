"use client";

import { useStore } from "@/src/store/store";
import Sparkline from "@/components/Sparkline";

const fmt = (v?: number | null) =>
  v == null ? "—" : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();

function Stat({
  label,
  value,
  spark,
  color,
}: {
  label: string;
  value: string | number;
  spark?: number[];
  color?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-row">
        <span className="stat-value">{value}</span>
        {spark && color && <Sparkline data={spark} color={color} />}
      </span>
    </div>
  );
}

export default function StatsHeader() {
  const live = useStore((s) => s.live);
  const nodes = useStore((s) => s.nodes);
  const metagraphs = useStore((s) => s.metagraphs);
  const activity = useStore((s) => s.activity);

  return (
    <header className="stats-header">
      <span className={`data-pill ${live ? "live" : "down"}`}>
        {live ? "● LIVE · mainnet" : "● NO DATA"}
      </span>
      <Stat label="Validators" value={`${nodes.l0} / ${nodes.l1}`} />
      <Stat label="Public metagraphs" value={metagraphs || "—"} />
      <Stat
        label="Snapshots/hr"
        value={fmt(activity?.snapsPerHour)}
        spark={activity?.cadenceSeries}
        color="#2af5ff"
      />
      <Stat
        label="Anchors/hr"
        value={fmt(activity?.anchorsPerHour)}
        spark={activity?.anchoredSeries}
        color="#6ee7b0"
      />
      <Stat
        label="Fees/hr (DAG)"
        value={fmt(activity?.feesPerHour)}
        spark={activity?.feesSeries}
        color="#7fe9c0"
      />
    </header>
  );
}
