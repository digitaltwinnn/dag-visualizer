"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";

// The colour-coded pills on the snapshot card: one per listed metagraph anchored into this global
// tick (with its per-tick count), plus an "unlisted (N)" pill. PREFERS the EXACT breakdown from the
// raw L0 snapshot (store.snapshotExact, populated by SnapshotExactBridge) — final + complete,
// including unlisted. For the LIVE tick we wait for exact (`awaiting`) rather than show the polled
// floor; only OLD/pruned ticks fall back to the polled anchor index. When a metagraph filter is
// active, the other pills dim so the selection stands out.
export default function AnchoredTags({
  ordinal,
  anchored,
  awaiting,
}: {
  ordinal: number;
  anchored: number | null;
  awaiting?: boolean;
}) {
  const filter = useStore((s) => s.filter);
  const exact = useStore((s) => s.snapshotExact[ordinal]);

  const metaFilter = metagraphById(filter) != null;

  // Listed metagraphs (id → count) + the unlisted count, straight from the EXACT read — the only
  // source (no polled floor). Until exact lands we show just the label + total + "reading…".
  const listed: Array<{ id: string; n: number }> = [];
  let unlisted = 0;

  if (exact) {
    for (const [addr, { count }] of Object.entries(exact.perMeta)) {
      if (metagraphById(addr)) listed.push({ id: addr, n: count });
    }
    unlisted = exact.unlistedCount;
  }

  // Nothing to show and not acquiring → render nothing. (While awaiting we still show label+total.)
  if (!exact && !awaiting) return null;
  listed.sort((x, y) => y.n - x.n); // strongest anchorer first

  const tags: React.ReactNode[] = listed.map(({ id, n }) => {
    const cfg = metagraphById(id)!;
    const sel = id === filter;
    return (
      <span
        key={id}
        className={"mg-tag" + (sel ? " mg-tag--sel" : metaFilter ? " mg-tag--dim" : "")}
        style={{ ["--mg" as string]: hex(cfg.color) }}
      >
        {(cfg.ticker || cfg.name) + ` (${n})`}
      </span>
    );
  });
  if (unlisted > 0) {
    tags.push(
      <span key="unlisted" className={"mg-tag mg-tag--other" + (metaFilter ? " mg-tag--dim" : "")}>
        unlisted ({unlisted})
      </span>,
    );
  }
  if (awaiting && !exact) {
    tags.push(
      <span key="reading" className="mg-tag mg-tag--settling">
        reading…
      </span>,
    );
  }

  return (
    <div className="insp-mgs">
      <span className="insp-mgs-label">
        Metagraph snapshots anchored here
        {anchored != null && <span className="insp-mgs-count">({anchored})</span>}
      </span>
      <div className="insp-mgs-tags">{tags}</div>
    </div>
  );
}
