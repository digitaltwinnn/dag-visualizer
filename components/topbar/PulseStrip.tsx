"use client";

import { pollHealthRows, RECENT_OUTCOMES, type PollHealth } from "@/src/data/api";
import { pollStatusOf, type PollStatus } from "@/src/data/pollStatus";
import { relativeAge } from "@/src/util/relativeAge";
import { BandCard } from "@/components/vitals/bandParts";
import { useNowTick } from "@/components/useNowTick";
import { cn } from "@/lib/utils";
import { okShare } from "@/src/data/pollShare";
import { Timer } from "lucide-react";
// THE PULSE STRIP — the heartbeat's own row (user, 2026-08-30: clicking the ECG "should show a
// bottom section (like the filter) with relevant information about the liveliness of the app —
// when did it last poll successfully? which polls do we have?"). The filter strip's exact
// grow-downward mechanism, one cell per FEED from the poll-health registry (src/data/api.ts):
// last success ticking live, the feed's own cadence, ok·err counts. Read-only measured facts —
// the status MEANING lives in src/data/pollStatus.ts (rule 10 wants it testable, not buried in
// JSX), the plate is the vitals band's own BandCard (one band-card recipe app-wide), and the
// age words are relativeAge, the app's one age grammar.
//
// ⚠️ A CELL NAMES THE FEED, NEVER ITS SOURCE (user, 2026-09-13: "no need to provide info to
// users about the source"). Each cell carried a third row naming the upstream — "block
// explorer", "cluster info (via app)" — which answered a question the strip is not for: this
// row exists to say whether the numbers above it are CURRENT, and an upstream's name is
// plumbing the reader can do nothing with. The `target` field retired from the FEEDS table
// with it, so there is no unused descriptor waiting to drift.

// The status inks the READING itself (user, 2026-09-10, after the head dot retired: "tint
// the age value") — the same derived states the dot spoke, on the value they qualify: a
// stale age goes advisory amber, a failing one destructive; ok stays the plain foreground.
const AGE_INK: Record<PollStatus, string> = {
  ok: "text-foreground",
  stale: "text-[var(--warn-soft)]",
  failing: "text-[var(--destructive)]",
  acquiring: "text-muted-foreground",
};

// The cadence chip says the DURATION, the timer glyph says "scheduled" (user, 2026-09-11 —
// "can't we say 5 mins with an icon?"): a fixed-cadence feed wears the glyph + the bare
// duration. A feed with no fixed cadence wears its `when` words instead — the honest trigger
// ("page load" for the boot-loaded geo map, "each tick" for the snapshot reads), because "on demand"
// claimed a user gesture neither feed answers to (same user round).
const cadenceWord = (r: PollHealth): string =>
  r.everyMs != null
    ? r.everyMs >= 60_000
      ? `${Math.round(r.everyMs / 60_000)} min`
      : `${Math.round(r.everyMs / 1000)}s`
    : (r.when ?? "—");

export default function PulseStrip() {
  const now = useNowTick(1000);
  const rows = pollHealthRows();
  return (
    // THE CARDS WRAP — NO SIDEWAYS SCROLL (user, 2026-10-03: "the network info has a horizontal
    // scrollbar; is there another way to show these cards? I don't think anywhere else we have
    // such scrollbars by design"). It was one scrolling row with touch snap (2026-09-03, two
    // rounds chasing half-visible cards) — a row that hides feeds off its end, in a strip whose
    // whole job is to show every feed at once. A grid of as many 150px-or-wider columns as fit:
    // one row on a desktop, two columns on a phone with an odd last card spanning both. The strip
    // is a layout participant (TopBar publishes its height), so growing a row costs the rails a
    // card's height and nothing else.
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-stretch gap-2 mx-2 px-2 pb-2 pt-1.5 border-t border-border/60 max-[700px]:grid-cols-2 max-[700px]:[&>*]:min-w-0 max-[700px]:[&>*:last-child:nth-child(odd)]:col-span-full">
      {rows.length === 0 && (
        <span className="text-label text-muted-foreground self-center px-1">acquiring — no polls have completed yet</span>
      )}
      {rows.map((r) => {
        const status = pollStatusOf(r, now);
        return (
          // No head mark (user, 2026-09-10: "the bullet doesn't add anything and elsewhere
          // we don't do it" — the band's cards carry bare labels). The status still reads:
          // a failing feed says the word and shows its failed count, and a stale one wears
          // the growing age beside its own cadence chip.
          <BandCard key={r.id} label={r.label} className="min-w-[150px]">
            <span className="flex flex-col gap-1 min-w-0">
              {/* The band's STACKED-LEAD grammar (user, 2026-09-10, two rounds): the bare
                  bold reading, and the CADENCE as a chip in the taxonomy-chrome recipe —
                  RoleChips' own squared pill (faint wash, hairline, muted ink; chrome, not
                  identity) — instead of plain words. No "ago": the ticking value under a
                  liveliness dot carries it. */}
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn("font-mono font-bold text-label tabular-nums leading-tight", AGE_INK[status])}>
                  {r.lastOkAt != null ? relativeAge(now - r.lastOkAt, true) : status === "failing" ? "failing" : "—"}
                </span>
                {/* A touch roomier than RoleChips' full pill (px 5→6, py 2→3) and a 12px glyph:
                    at the compact py-px the icon-bearing chip read cramped and the glyph sat
                    optically high beside the 10px text (user, 2026-09-11 — "padding … they look
                    small and text icon alignment feels a bit off"). */}
                {/* ONE CHIP PER FACT (user, 2026-10-03, on the mid-dots): registry words carrying
                    a cadence and a condition are split on their own separator into two chips. */}
                {cadenceWord(r).split(" · ").map((part, i) => (
                  <span key={part} className="inline-flex items-center gap-1 rounded-xs border border-border bg-wash-faint px-1.5 py-[3px] text-label leading-none text-muted-foreground">
                    {i === 0 && r.everyMs != null && <Timer aria-hidden className="size-3 flex-none" />}
                    {part}
                  </span>
                ))}
              </span>
              {/* THE RECENT RUN (user, 2026-10-04: "show a nice chart for each card there,
                  green=ok red=fail"): one mark per outcome, oldest left, newest right — the last
                  RECENT_OUTCOMES of them, in the two status tones. It replaces the hairline ratio
                  bar, which only appeared once something had failed and could not say WHEN: a run
                  shows a blip as a blip and an outage as a wall of red at the right end. The slots
                  a young feed has not filled stay as faint marks, so every card's run is one width.
                  Identity is never colour-alone: the share reading beside it keeps its word, and
                  the exact counts are on hover. */}
              {r.recent.length > 0 && (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    role="img"
                    aria-label={`Last ${r.recent.length} outcomes: ${r.recent.filter(Boolean).length} ok, ${r.recent.filter((x) => !x).length} failed`}
                    className="flex h-2.5 flex-none items-end gap-px"
                  >
                    {Array.from({ length: RECENT_OUTCOMES }, (_, i) => {
                      const o = r.recent[i - (RECENT_OUTCOMES - r.recent.length)];
                      return (
                        <span
                          key={i}
                          className={cn(
                            "w-[3px] rounded-[1px]",
                            o === undefined ? "h-1 bg-border/60" : o ? "h-full bg-[var(--success)] opacity-70" : "h-full bg-[var(--destructive)]",
                          )}
                        />
                      );
                    })}
                  </span>
                  {/* ONE READING, no mid-dot (user, 2026-10-03): the share that succeeded, shown
                      only when something failed — "100% ok" would restate the green run. Never
                      "100%" while anything failed; one decimal from 99 up, capped at 99.9. The bare
                      share, no word (user, 2026-10-08): beside a green-and-red run a percentage
                      can only mean the green part. It recounts every second the strip is open
                      (`useNowTick`) from the registry, so a poll that lands while it is open moves it. */}
                  {r.err > 0 && (
                    <span className="text-label tabular-nums text-muted-foreground">
                      {okShare(r.ok, r.err)}
                    </span>
                  )}
                </span>
              )}
            </span>
          </BandCard>
        );
      })}
    </div>
  );
}
