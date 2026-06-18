"use client";

import { useStore } from "@/src/store/store";
import { getAnchor, metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";

// The colour-coded pills on the snapshot card: one per listed metagraph anchored into
// this global tick (with its per-tick count), plus an "unlisted (N)" pill for the floor
// gap. When a metagraph filter is active, the other pills dim so the selection stands out.
export default function AnchoredTags({ ts, anchored }: { ts: string; anchored: number | null }) {
  const filter = useStore((s) => s.filter);
  const a = getAnchor(ts);
  if (!a || !a.metaIds.size) return null;
  const metaFilter = metagraphById(filter) != null;
  const tags: React.ReactNode[] = [];
  for (const id of a.metaIds) {
    const cfg = metagraphById(id);
    if (!cfg) continue;
    const n = a.metaCounts.get(id) || 1;
    const sel = id === filter;
    tags.push(
      <span
        key={id}
        className={"mg-tag" + (sel ? " mg-tag--sel" : metaFilter ? " mg-tag--dim" : "")}
        style={{ ["--mg" as string]: hex(cfg.color) }}
      >
        {(cfg.ticker || cfg.name) + ` (${n})`}
      </span>,
    );
  }
  if (anchored != null && anchored > a.count)
    tags.push(
      <span key="unlisted" className={"mg-tag mg-tag--other" + (metaFilter ? " mg-tag--dim" : "")}>
        unlisted ({anchored - a.count})
      </span>,
    );
  return (
    <div className="insp-mgs">
      <span className="insp-mgs-label">Metagraph snapshots anchored here</span>
      <div className="insp-mgs-tags">{tags}</div>
    </div>
  );
}
