"use client";

import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex, fmtDag } from "@/src/util/format";

// The anchored block on the snapshot card: a ranked share-of-total breakdown of the metagraph
// snapshots this global tick anchored — `dot · ticker · share-bar · count`, sorted desc, ALL of
// them (no cap; facts), unlisted as a neutral row. Bars = share of the total, so length is
// comparable across the whole list. Source = the EXACT raw-L0 read only (no polled floor); while
// it loads we show the header + "reading…". When a metagraph is filtered, it gets a focus row
// pinned at the top (regardless of rank) and the rest list under "Other metagraphs", dimmed.
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
  const cfg = metagraphById(filter);

  const total = anchored ?? exact?.anchored ?? 0;
  const channels = exact?.channels ?? null;

  // Header (always, even while acquiring): "N snapshots anchored from M metagraphs".
  const header = (
    <div className="anc-head">
      <span className="anc-head-total"><b>{total}</b> snapshot{total === 1 ? "" : "s"} anchored</span>
      {channels != null && <span className="anc-head-sub">from {channels} metagraph{channels === 1 ? "" : "s"}</span>}
    </div>
  );

  if (!exact) {
    return (
      <div className="anc">
        {header}
        {awaiting && <div className="anc-reading">reading…</div>}
      </div>
    );
  }

  // Rows from the exact per-metagraph breakdown: listed (named/hued) + one aggregate unlisted row.
  type Row = { id: string; label: string; hue: string | null; n: number };
  const listed: Row[] = [];
  for (const [addr, { count }] of Object.entries(exact.perMeta)) {
    const c = metagraphById(addr);
    if (c) listed.push({ id: addr, label: c.ticker || c.name, hue: hex(c.color), n: count });
  }
  listed.sort((a, b) => b.n - a.n);
  const rows: Row[] = [...listed];
  if (exact.unlistedCount > 0)
    rows.push({ id: "unlisted", label: "unlisted", hue: null, n: exact.unlistedCount });

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const bar = (n: number, hue: string | null) => (
    <span className="anc-bar">
      <span
        className="anc-bar-fill"
        style={{ width: `${Math.max(pct(n), n > 0 ? 4 : 0)}%`, background: hue ?? "var(--muted)" }}
      />
    </span>
  );

  const focusId = cfg?.id ?? null;
  const focus = focusId ? rows.find((r) => r.id === focusId) : undefined;
  const rest = focus ? rows.filter((r) => r.id !== focusId) : rows;

  return (
    <div className="anc">
      {header}

      {/* Filtered → the focus row pinned at the top (regardless of rank). */}
      {focus && (
        <div className="anc-focus" style={{ ["--mg" as string]: focus.hue ?? "var(--primary)" }}>
          <div className="anc-focus-top">
            <span className="anc-focus-name">
              <span className="anc-dot" style={{ background: focus.hue ?? "var(--primary)" }} />
              {focus.label}
            </span>
            <span className="anc-focus-fee">
              <b>{fmtDag(exact.perMeta[focus.id]?.fee ?? 0)}</b> DAG
              <span className="anc-sub">fees paid</span>
            </span>
          </div>
          <div className="anc-focus-bar">
            {bar(focus.n, focus.hue)}
            <span className="anc-focus-meta">{focus.n} snapshot{focus.n === 1 ? "" : "s"} · {pct(focus.n).toFixed(pct(focus.n) < 10 ? 1 : 0)}%</span>
          </div>
        </div>
      )}

      {/* The ranked list (dimmed under "Other metagraphs" when a focus row is present). */}
      {focus && rest.length > 0 && <div className="anc-other-label">Other metagraphs</div>}
      <div className={"anc-list" + (focus ? " anc-list--dim" : "")}>
        {rest.map((r) => (
          <div className={"anc-row" + (r.hue ? "" : " anc-row--unlisted")} key={r.id}>
            <span className="anc-dot" style={{ background: r.hue ?? "var(--muted)" }} />
            <span className="anc-label">{r.label}</span>
            {bar(r.n, r.hue)}
            <span className="anc-count">{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
