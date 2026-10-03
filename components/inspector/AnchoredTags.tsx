"use client";

import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { metagraphById } from "@/src/data/network";
import { identityHudCss } from "@/src/palette/identity";
import { NodeStars } from "@/components/state/StateAtoms";
import { useMinHold } from "@/components/useMinHold";
import { CONTENT_EASE } from "@/components/RollSwap";
import { Lead, SectionLabel, UnitMarks, CUT_ROW, countable, figWidth } from "@/components/inspector/parts";
import { Separator } from "@/components/ui/separator";

// The anchored block on the snapshot card: a ranked breakdown of the metagraph snapshots this
// global tick anchored — the breakdown table's `name · count · squares` rows, sorted desc, ALL of
// them (no cap; facts), unlisted as a neutral row. Bars = share of the total, so length is
// comparable across the whole list. Source = the EXACT raw-L0 read only (no polled floor); while
// it loads we show the header + "reading…".
//
// THE ROWS ARE READINGS, NOT DISCLOSURES (user, 2026-10-03: "remove the breakdown for each
// metagraph row — it will show in the child metagraph card anyway"). Each row used to be an
// accordion opening a stat line (`N snapshots, P%, KB, DAG`) for that network in this tick: a
// second, smaller card inside the card, restating what the rung below it is for. The row says who
// anchored and how many; the network's own card, one step down the ladder, says the rest. The
// network the chamber is resolved against stays highlighted in place, in its hue.
export default function AnchoredTags({
  ordinal,
  anchored,
  awaiting,
}: {
  ordinal: number;
  anchored: number | null;
  awaiting?: boolean;
}) {
  // The highlighted row is the network the chamber resolves against: the one picked INSIDE this
  // tick, else the filter (`ledgerNetwork`).
  const filter = useStore((s) => ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: ordinal }));
  const exact = useStore((s) => s.snapshotExact[ordinal]);
  const cfg = metagraphById(filter);
  const focusId = cfg?.id ?? null;

  // Rule 10: an ABSENT count is not zero. `anchored` is null whenever the polled feed carries no
  // `metagraphSnapshotCount` for this tick, and the exact read may not have landed yet — so the
  // count is a HELD SLOT (stars, reserving its width so the sentence doesn't reflow when the
  // number lands) and states nothing at all once the read has provably failed. A bold
  // "0 snapshots anchored" sitting above a block that was still resolving was exactly the
  // fabricated number the rule exists to prevent.
  const total = anchored ?? exact?.anchored ?? null;
  const channels = exact?.channels ?? null;
  // A FAILED exact read (RawSnapshotBridge records it) is this block's give-up signal: the
  // twinkling stars promise a breakdown that is no longer coming, so they terminate on an honest
  // word. The header's total stays WHEN THE POLLED FEED CARRIES ONE — that is a different (and
  // still live) source. With no polled count either, the sentence has no subject and the failure
  // word stands alone; stars there would promise an arrival that already gave up.
  const missed = useStore((s) => s.exactMiss[ordinal] != null) && !exact;

  // Hold the ACQUIRING "resolving" row for one calm cycle even if the exact read lands sooner,
  // then fade it out (concern #8) — a fast resolve shouldn't blink the node-stars away. While
  // held (or genuinely pre-exact) we stay on the acquiring branch and suppress the "from M
  // metagraphs" count (it only reads once the breakdown is actually shown).
  const resolveHold = useMinHold(!exact && !missed);
  const acquiring = !exact || resolveHold.show;

  // Header (whenever a count exists or is coming): "N snapshots anchored from M metagraphs".
  const countLost = total == null && missed && !resolveHold.show;
  // THE SKELETON'S LEAD AND SECTION LABEL (2026-10-02): the one sentence "N snapshots anchored from
  // M metagraphs" was doing two jobs. The RELATION is the lead — who anchored into this tick — and
  // the COUNT is the breakdown's own headline, on its section label, with a separator between.
  const header = countLost ? null : (
    <>
      <Lead>
        {total === 0
          ? "No metagraph anchored into this snapshot."
          : channels != null && !acquiring
            ? `Anchored by ${channels} metagraph${channels === 1 ? "" : "s"}.`
            : missed && !resolveHold.show
              ? "Which metagraphs anchored into it could not be read."
              : "Reading which metagraphs anchored into it."}
      </Lead>
      <Separator className="mb-2" />
      <SectionLabel label="Snapshots anchored" total={total != null ? total : <NodeStars count={3} />} className="mb-1.5" />
    </>
  );

  if (acquiring) {
    return (
      <div className="mt-1">
        {header}
        {missed && !resolveHold.show ? (
          // The honest terminal: the read failed, nothing is in flight. Word, not stars.
          <div className="mt-1 text-label tracking-[0.08em] uppercase text-muted-foreground">
            exact read failed
          </div>
        ) : (awaiting || resolveHold.show) && (
          <div className={cn("flex items-center gap-2 mt-1", resolveHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}>
            <NodeStars count={4} />
            <span className="text-label tracking-[0.08em] uppercase text-muted-foreground">resolving</span>
          </div>
        )}
      </div>
    );
  }

  // Rows from the exact per-metagraph breakdown: listed (named/hued, expandable) + one aggregate
  // unlisted row (neutral, not expandable).
  type Row = { id: string; label: string; hue: string | null; n: number };
  const listed: Row[] = [];
  for (const [addr, { count }] of Object.entries(exact.perMeta)) {
    const c = metagraphById(addr);
    if (c) listed.push({ id: addr, label: c.name || c.ticker, hue: identityHudCss(c.id), n: count });
  }
  listed.sort((a, b) => b.n - a.n);

  // The genuinely-unlisted metagraphs are in `perMeta` too (addresses not in config) — one neutral
  // row at the bottom. It is never the network selection, so it never gets the hue wash.
  const rows: Row[] = [...listed];
  if (exact.unlistedCount > 0) rows.push({ id: UNLISTED_ID, label: UNLISTED_ID, hue: null, n: exact.unlistedCount });

  const denom = total ?? exact.anchored;
  const pct = (n: number) => (denom > 0 ? (n / denom) * 100 : 0);
  // One square per anchored snapshot while the tick's total is countable, a share bar above that.
  const units = countable(denom);

  return (
    <div className="mt-1">
      {header}

      {/* The list EASES IN on every reveal (the no-pop rule's arrival ease): following live,
          each tick swaps this block to "resolving" and back, and the rows popped with slightly
          different members every ~4s — the container mounts fresh at each acquiring→rows flip,
          so the mount entrance is exactly per-reveal. Bar widths carry no transition: the
          remount means there is never an old width to ease from. */}
      <div className={cn("flex flex-col gap-y-1", CONTENT_EASE)} style={figWidth(rows.map((r) => r.n))}>
        {rows.map((r) => {
          const isSel = r.id === focusId;
          return (
            // THE BREAKDOWN TABLE'S ROW (`visuals.html`, user 2026-10-02): name, one square per
            // anchored snapshot, count — in the dossier's columns. Unlisted wears the CORE tone
            // (2026-08-07), the same neutral-blue it carries on the filter chip. The wash overhangs
            // the content by 6px on both sides (`w-[calc(100%+12px)]`, never `w-full` under a
            // negative margin — that stops the counts 12px short of the section's total).
            <div
              key={r.id}
              className={cn(CUT_ROW, "w-[calc(100%+12px)] -mx-1.5 px-1.5 py-[3px] rounded-sm")}
              // The network the chamber resolves against: highlighted in place by a faint
              // identity-hue wash and its name in the hue.
              style={isSel ? ({ background: `color-mix(in oklch, ${r.hue ?? "var(--primary)"} 16%, transparent)` } as const) : undefined}
            >
              <span
                className={cn("min-w-0 truncate", !r.hue ? "italic text-muted-foreground" : isSel ? "font-semibold" : "text-foreground-dim")}
                style={isSel && r.hue ? { color: r.hue } : undefined}
                title={r.label}
              >
                {r.label}
              </span>
              <UnitMarks count={r.n} color={r.hue ?? "var(--core)"} units={units} frac={pct(r.n) / 100} />
              <span className="font-mono tabular-nums text-right text-foreground">{r.n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
