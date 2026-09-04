"use client";

import { pollHealthRows } from "@/src/data/api";
import { pollStatusOf, type PollStatus } from "@/src/data/pollStatus";
import { relativeAge } from "@/src/util/relativeAge";
import { BandCard } from "@/components/VitalsBand";
import { useNowTick } from "@/components/useNowTick";
import { cn } from "@/lib/utils";
import { BAR_EASE } from "@/components/RollSwap";
// THE PULSE STRIP — the heartbeat's own row (user, 2026-08-30: clicking the ECG "should show a
// bottom section (like the filter) with relevant information about the liveliness of the app —
// when did it last poll successfully? which polls do we have?"). The filter strip's exact
// grow-downward mechanism, one cell per FEED from the poll-health registry (src/data/api.ts):
// last success ticking live, the feed's own cadence, ok·err counts. Read-only measured facts —
// the status MEANING lives in src/data/pollStatus.ts (rule 10 wants it testable, not buried in
// JSX), the plate is the vitals band's own BandCard (one band-card recipe app-wide), and the
// age words are relativeAge, the app's one age grammar.

const DOT: Record<PollStatus, string> = {
  ok: "var(--success)",
  stale: "var(--warn-soft)",
  failing: "var(--destructive)",
  acquiring: "var(--muted-foreground)",
};

const everyWord = (ms: number | null): string =>
  ms == null ? "on demand" : ms >= 60_000 ? `every ${Math.round(ms / 60_000)} min` : `every ${Math.round(ms / 1000)}s`;

export default function PulseStrip() {
  const now = useNowTick(1000);
  const rows = pollHealthRows();
  return (
    // ⚠️ TOUCH SNAPS TO A CARD (user, 2026-09-03: "lock them onto a card, don't allow positions
    // that show only half cards"). Native CSS scroll-snap: mandatory on coarse pointers only —
    // momentum scrolling stays the platform's own (which is the smoothness), each fling rests
    // with a card's left edge on the strip's own padding (scroll-px matches px). A fine
    // pointer's wheel is left free: mandatory snap under a trackpad reads as the strip grabbing
    // the scroll. And on PHONE each card is HALF the strip (minus half the gap), so exactly two
    // cards tile the view and no rest position shows a fraction of a third (user, 2026-09-03:
    // "sometimes I see 2⅓ cards") — content-sized cards can never promise that, since their
    // widths are the feeds' own words.
    <div className="flex items-stretch gap-2 mx-2 px-2 pb-2 pt-1.5 border-t border-border/60 overflow-x-auto slim-scroll pointer-coarse:snap-x pointer-coarse:snap-mandatory scroll-px-2 pointer-coarse:[&>*]:snap-start max-[700px]:[&>*]:basis-[calc(50%-4px)] max-[700px]:[&>*]:grow-0 max-[700px]:[&>*]:shrink-0 max-[700px]:[&>*]:min-w-0">
      {rows.length === 0 && (
        <span className="text-label text-muted-foreground self-center px-1">acquiring — no polls have completed yet</span>
      )}
      {rows.map((r) => {
        const status = pollStatusOf(r, now);
        return (
          <BandCard
            key={r.id}
            label={r.label}
            className="min-w-[150px]"
            mark={<span aria-hidden className="size-1.5 rounded-full flex-none" style={{ background: DOT[status] }} />}
          >
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="font-mono font-bold text-caption tabular-nums text-foreground">
                  {r.lastOkAt != null ? relativeAge(now - r.lastOkAt) : status === "failing" ? "failing" : "—"}
                </span>
                <span className="text-micro text-muted-foreground">{everyWord(r.everyMs)}</span>
              </span>
              <span className="text-micro text-muted-foreground truncate">{r.target}</span>
              {/* The ok/err record as a GLANCE instrument (user, 2026-09-04 — the "219 ok ·
                  14 err" prose was hard to read): a hairline ratio bar in the two status
                  tones, exact counts beside it (identity is never colour-alone — each count
                  keeps its word). The err segment floors at 3px so one failure among
                  thousands stays a visible mark; the numbers carry the measurement. */}
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span aria-hidden className="flex h-[3px] w-12 flex-none rounded-full overflow-hidden bg-border/60">
                  <span style={{ width: `${(r.ok / Math.max(1, r.ok + r.err)) * 100}%`, background: "var(--success)" }} className={cn("opacity-70", BAR_EASE)} />
                  {r.err > 0 && (
                    <span style={{ width: `${(r.err / Math.max(1, r.ok + r.err)) * 100}%`, background: "var(--destructive)" }} className={cn("opacity-80 min-w-[3px]", BAR_EASE)} />
                  )}
                </span>
                <span className="text-micro tabular-nums text-muted-foreground">
                  {r.ok.toLocaleString()} ok{r.err > 0 ? ` · ${r.err.toLocaleString()} err` : ""}
                </span>
              </span>
            </span>
          </BandCard>
        );
      })}
    </div>
  );
}
