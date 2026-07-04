"use client";

import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex, fmtDag } from "@/src/util/format";
import { NodeStars } from "@/components/state/StateAtoms";
import { useMinHold } from "@/components/useMinHold";

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

  // Hold the ACQUIRING "resolving" row for one calm cycle even if the exact read lands sooner,
  // then fade it out (concern #8) — a fast resolve shouldn't blink the node-stars away. While
  // held (or genuinely pre-exact) we stay on the acquiring branch and suppress the "from M
  // metagraphs" count (it only reads once the breakdown is actually shown).
  const resolveHold = useMinHold(!exact);
  const acquiring = !exact || resolveHold.show;

  // Header (always, even while acquiring): "N snapshots anchored from M metagraphs".
  const header = (
    <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
      <span className="text-[13px] text-foreground"><b className="font-bold">{total}</b> snapshot{total === 1 ? "" : "s"} anchored</span>
      {channels != null && !acquiring && <span className="text-[12px] text-muted-foreground">from {channels} metagraph{channels === 1 ? "" : "s"}</span>}
    </div>
  );

  if (acquiring) {
    return (
      <div className="mt-1">
        {header}
        {(awaiting || resolveHold.show) && (
          <div className={cn("flex items-center gap-2 mt-1", resolveHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}>
            <NodeStars count={4} />
            <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground">resolving</span>
          </div>
        )}
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
  const bar = (n: number, hue: string | null, extraClass?: string) => (
    <span className={cn("block h-1.5 rounded-[3px] bg-white/[0.06] overflow-hidden", extraClass)}>
      <span
        className="block h-full rounded-[3px] min-w-[2px]"
        style={{ width: `${Math.max(pct(n), n > 0 ? 4 : 0)}%`, background: hue ?? "var(--muted)" }}
      />
    </span>
  );

  const focusId = cfg?.id ?? null;
  const focus = focusId ? rows.find((r) => r.id === focusId) : undefined;
  const rest = focus ? rows.filter((r) => r.id !== focusId) : rows;

  return (
    <div className="mt-1">
      {header}

      {/* Filtered → the focus row pinned at the top (regardless of rank). Marked by a THIN left
          hue accent only (no tinted box), compact, consistent with the neutral node/dossier cards. */}
      {focus && (
        <div className="pt-0.5 pb-1.5 pl-2.5 mb-2" style={{ boxShadow: `inset 2px 0 0 ${focus.hue ?? "var(--primary)"}` }}>
          <div className="flex items-start justify-between gap-2.5">
            <span className="inline-flex items-center gap-[7px] text-[13px] text-foreground">
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: focus.hue ?? "var(--primary)" }} />
              {focus.label}
            </span>
            <span className="flex flex-col items-end text-[13px] text-foreground">
              <span className="whitespace-nowrap"><b className="font-bold">{fmtDag(exact.perMeta[focus.id]?.fee ?? 0)}</b> DAG</span>
              <span className="text-[10px] tracking-[0.08em] uppercase text-muted-foreground">fees paid</span>
            </span>
          </div>
          <div className="flex items-center gap-2 mt-[5px]">
            {bar(focus.n, focus.hue, "flex-1")}
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{focus.n} snapshot{focus.n === 1 ? "" : "s"} · {pct(focus.n).toFixed(pct(focus.n) < 10 ? 1 : 0)}%</span>
          </div>
        </div>
      )}

      {/* The ranked list (dimmed under "Other metagraphs" when a focus row is present). ONE shared
          grid for the whole list (rows are `contents`) so the columns line up ACROSS rows — every
          bar starts at the same x, after the widest label. */}
      {focus && rest.length > 0 && <div className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground mt-1 mb-1.5">Other metagraphs</div>}
      <div className={cn("grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2 gap-y-1.5", focus && "opacity-60")}>
        {rest.map((r) => (
          <div className="contents" key={r.id}>
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: r.hue ?? "var(--muted)" }} />
            <span className={cn("text-[12.5px] text-foreground", !r.hue && "italic text-muted-foreground")}>{r.label}</span>
            {bar(r.n, r.hue)}
            <span className="text-[12.5px] text-foreground tabular-nums min-w-[2em] text-right">{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
