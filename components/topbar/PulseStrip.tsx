"use client";

import { pollHealthRows, type PollHealth } from "@/src/data/api";
import { pollStatusOf, pulseLane, pulseOrder, pulseVerdict, PULSE_AHEAD_MS, PULSE_WINDOW_MS, type PollStatus, type VerdictTone } from "@/src/data/pollStatus";
import { relativeAge } from "@/src/util/relativeAge";
import { useNowTick } from "@/components/useNowTick";
import { cn } from "@/lib/utils";
import { Timer } from "lucide-react";

// THE PULSE STRIP — the heartbeat's own row (user, 2026-08-30: clicking the ECG "should show a
// bottom section (like the filter) with relevant information about the liveliness of the app —
// when did it last poll successfully? which polls do we have?"). The filter strip's exact
// grow-downward mechanism, one LANE per FEED from the poll-health registry (src/data/api.ts).
//
// RHYTHM LANES since 2026-10-25 (design pass in the brainstorm companion — user picked "B3 with
// B4's next due"): ONE real time axis, the last two minutes with now near the right edge, a lane
// per feed, each poll a tick where it LANDED. A feed's cadence is its rhythm and a stall is a gap
// you can see; a scheduled feed draws a dashed mark where its next poll is due, so "late" is a lane
// whose last answer sits behind that mark — and the overdue stretch is drawn, amber dashes from the
// due mark (or the last good answer, when failing) to now. Lanes run fastest first, which is why
// the strip needs no group headers. One sentence above them answers "is it live?".
//
// It replaced six equal cards whose run of 24 marks drew a 4-second feed and a 5-minute feed as
// the same picture, so lateness could only be read off a number. Every decision a pixel depends on
// is pure and tested in src/data/pollStatus.ts (the order, the lane geometry, the verdict); this is
// the shell.
//
// ⚠️ A LANE NAMES THE FEED, NEVER ITS SOURCE (user, 2026-09-13: "no need to provide info to users
// about the source") — the strip says whether the numbers above it are CURRENT.

// The status inks the age READING (user, 2026-09-10: "tint the age value"): late goes advisory
// amber, failing destructive, ok the plain foreground.
const AGE_INK: Record<PollStatus, string> = {
  ok: "text-foreground",
  stale: "text-[var(--warn-soft)]",
  failing: "text-[var(--destructive)]",
  acquiring: "text-muted-foreground",
};
const DOT: Record<PollStatus, string> = {
  ok: "bg-[var(--success)]",
  stale: "bg-[var(--warn-soft)]",
  failing: "bg-[var(--destructive)]",
  acquiring: "bg-muted-foreground/50",
};
const VERDICT_DOT: Record<VerdictTone, string> = {
  ok: "bg-[var(--success)]",
  warn: "bg-[var(--warn-soft)]",
  bad: "bg-[var(--destructive)]",
  acquiring: "bg-muted-foreground/50",
};

// The cadence chip says the DURATION with the timer glyph for "scheduled" (user, 2026-09-11 —
// "can't we say 5 mins with an icon?"); a feed with no fixed cadence wears its honest trigger
// words instead ("page load", "per snapshot").
const cadenceWord = (r: PollHealth): string =>
  r.everyMs != null
    ? r.everyMs >= 60_000
      ? `${Math.round(r.everyMs / 60_000)} min`
      : `${Math.round(r.everyMs / 1000)}s`
    : (r.when ?? "—");

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;
// The axis labels, as ms before now. "now" is the cursor line's own label.
const SPAN = PULSE_WINDOW_MS + PULSE_AHEAD_MS;
const AXIS: { ago: number; label: string }[] = [
  { ago: PULSE_WINDOW_MS, label: "2 min ago" },
  { ago: 60_000, label: "1 min" },
  { ago: 30_000, label: "30s" },
  { ago: 0, label: "now" },
];

export default function PulseStrip() {
  const now = useNowTick(1000);
  const rows = pulseOrder(pollHealthRows());
  const verdict = pulseVerdict(rows, now);
  return (
    <div className="mx-2 px-2 pb-2 pt-1.5 border-t border-border/60">
      {/* THE VERDICT — the strip's one sentence, on the band's plate so it reads as the answer
          the lanes below evidence. */}
      <div role="status" className="flex items-baseline gap-2 flex-wrap rounded-md bg-[var(--panel-plate)] px-2.5 py-1.5 mb-1.5">
        <span aria-hidden className={cn("size-2 rounded-full self-center flex-none", VERDICT_DOT[verdict.tone])} />
        <span className="text-body font-semibold text-foreground">{verdict.title}</span>
        <span className="text-label text-muted-foreground">{verdict.detail}</span>
      </div>
      {rows.length > 0 && (
        <div
          className={cn(
            // name · lane · age. The name column holds the longest label and its chip; the phone
            // drops the chip (the lane's rhythm already says the tempo) and narrows the column.
            "grid grid-cols-[minmax(0,15.5rem)_minmax(0,1fr)_5rem] items-center",
            "max-[700px]:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.25rem]",
          )}
        >
          {rows.map((r) => {
            const status = pollStatusOf(r, now);
            const lane = pulseLane(r, now);
            const okN = lane.beats.filter((b) => b.ok).length;
            const errN = lane.beats.length - okN;
            return (
              <div key={r.id} className="contents">
                <span className="flex items-center gap-2 min-w-0 h-[22px] pl-1 text-label text-foreground-dim">
                  <span aria-hidden className={cn("size-1.5 rounded-full flex-none", DOT[status])} />
                  <span className="truncate">{r.label}</span>
                  {cadenceWord(r).split(" · ").map((part, i) => (
                    <span
                      key={part}
                      // RIGHT-ALIGNED against the lane (user, 2026-10-25): the pills form one column
                      // at the name cell's end, so the tempos read down the strip as a list.
                      className="ml-auto mr-3 last:mr-3 inline-flex flex-none items-center gap-1 rounded-xs border border-border bg-wash-faint px-1.5 py-[2px] text-label leading-none text-muted-foreground max-[700px]:hidden"
                    >
                      {i === 0 && r.everyMs != null && <Timer aria-hidden className="size-3 flex-none" />}
                      {part}
                    </span>
                  ))}
                </span>
                {/* THE LANE. Ticks are spans placed by percentage — no measurement, so the lane
                    rides any width. A once-per-visit or slow feed's tick is taller: it is the only
                    mark its lane will show for minutes. */}
                <span
                  role="img"
                  aria-label={`${r.label}: ${okN} answered${errN ? `, ${errN} failed` : ""} in the last 2 minutes`}
                  className="relative block h-[22px] border-b border-dashed border-border/40"
                >
                  {lane.lateX != null && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 -translate-y-1/2 h-[2px] [background:repeating-linear-gradient(90deg,var(--warn-soft)_0_4px,transparent_4px_7px)]"
                      style={{ left: pct(lane.lateX), width: pct(Math.max(0, lane.nowX - lane.lateX)) }}
                    />
                  )}
                  {lane.beats.map((b, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        "absolute -translate-x-1/2 rounded-[1px]",
                        // Widths 3 / 4 / 5px (user, 2026-10-25: "make the bars a bit wider" — they
                        // were 2 / 3 / 3): an ok poll, a failed one, and the lone tick of a slow feed.
                        b.ok ? "bg-[var(--success)] opacity-80" : "bg-[var(--destructive)] w-[4px]",
                        b.ok && "w-[3px]",
                        (r.tempoMs == null || r.tempoMs >= 60_000) ? "top-[3px] bottom-[3px] w-[5px]" : "top-[6px] bottom-[6px]",
                      )}
                      style={{ left: pct(b.x) }}
                    />
                  ))}
                  {lane.dueX != null && (
                    <span aria-hidden className="absolute top-1 bottom-1 border-l border-dashed border-muted-foreground/60" style={{ left: pct(lane.dueX) }} />
                  )}
                  <span aria-hidden className="absolute top-0 bottom-0 w-px bg-primary/70" style={{ left: pct(lane.nowX) }} />
                </span>
                <span className={cn("text-right font-mono text-label tabular-nums pr-1", AGE_INK[status])}>
                  {/* "1m ago", not the bare "1m" (user, 2026-10-25: "its not clear what it
                      represents") — the age of the feed's last good answer. */}
                  {r.lastOkAt != null ? relativeAge(now - r.lastOkAt) : status === "failing" ? "failing" : "—"}
                </span>
              </div>
            );
          })}
          <span />
          <span aria-hidden className="relative block h-5 text-label text-muted-foreground">
            {AXIS.map((a) => {
              const x = (PULSE_WINDOW_MS - a.ago) / SPAN;
              return (
                // The phone's lane is ~130px: only the two ends of the axis keep their words.
                <span key={a.label} className={cn("absolute top-1 whitespace-nowrap", a.ago === PULSE_WINDOW_MS ? "" : "-translate-x-1/2", a.ago !== 0 && a.ago !== PULSE_WINDOW_MS && "max-[700px]:hidden")} style={{ left: pct(x) }}>
                  {a.label}
                </span>
              );
            })}
          </span>
          <span />
        </div>
      )}
    </div>
  );
}
