"use client";

import { useStore } from "@/src/store/store";
import type { Mode } from "@/src/store/store";

// The View-default card: "what this lens is for" — a short title + one line + a pick-invite.
// Neutral structural chrome (NOT an identity hue); its only colour is the cyan node-halo
// invite. It is the Detail slot at rest; when a detail selection exists it collapses to a slim
// view-header strip at the top of the rail (one click to re-expand). Every view has one.
const COPY: Record<string, { title: string; line: string; invite: string }> = {
  hyper: { title: "Hypergraph", line: "The network's architecture — the Global L0 core, its validator shells, and the metagraphs orbiting as hubs.", invite: "Hover a hub to preview it; click to focus." },
  geo: { title: "Node geography", line: "Every validator at its real location — density, distribution, and the country breakdown.", invite: "Click a node on the globe (or a row in the explorer) to inspect it." },
  ledger: { title: "Snapshots", line: "The settlement timeline — global snapshots and the metagraph snapshots they anchor, over time.", invite: "Click a snapshot in the bar-chart below to inspect it." },
  status: { title: "Network status", line: "A health read of the network. In development.", invite: "" },
  transactions: { title: "Transactions", line: "Money flow and $DAG economics. In development.", invite: "" },
  staking: { title: "Delegated staking", line: "Validator staking and rewards. In development.", invite: "" },
};

export default function ViewDefault({
  collapsed,
  onToggle,
  collapsible = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  collapsible?: boolean;
}) {
  const mode = useStore((s) => s.mode) as Mode;
  const c = COPY[mode] ?? COPY.hyper;

  if (collapsed) {
    return (
      <button className="rc-vd-strip" onClick={onToggle} title="What this view is for">
        <span className="rc-vd-strip-title">{c.title}</span>
        <span className="rc-vd-strip-hint">▾</span>
      </button>
    );
  }
  return (
    <aside className="panel rc-vd">
      {collapsible && (
        <button className="rc-vd-collapse" title="Collapse" onClick={onToggle}>▴</button>
      )}
      <span className="insp-eyebrow">This view</span>
      <h3 className="insp-title">{c.title}</h3>
      <p className="rc-empty-text">{c.line}</p>
      {c.invite && (
        <p className="rc-vd-invite">
          <span className="rc-vd-halo" aria-hidden /> {c.invite}
        </p>
      )}
    </aside>
  );
}
