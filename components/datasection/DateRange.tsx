"use client";

import { useState } from "react";
import type { DateRange as RDPRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { civilDate, civilString } from "@/src/data/chainSeek";
import { cn } from "@/lib/utils";

// THE AGE COLUMN'S CONTROL — one trigger stating the range in words, opening a range calendar.
//
// It replaced a pair of native `type="date"` fields for a measured reason, recorded at the call
// site: two of them cannot render `mm/dd/yyyy` inside this table's ~165px AGE column. A portalled
// popover has no such ceiling, so the picking moved there and the column kept one line.
//
// ⚠️ THE FROM BOUND IS THE DESTINATION. `to` never steers the walk — it only bounds which rows the
// landing marks as in-range. So the trigger names the from-date first and a from-only range is a
// complete, submittable state, while a to-only one is not: `seekAge` refuses it ("pick a
// from-date"). Stated in that order because a chain is walked from a point, not filtered to a slice.

/** ⚠️ THE YEAR IS SHOWN ONLY WHEN IT IS NOT THIS ONE. The AGE column is ~108px, and
 *  `Sep 1, 2026 – Sep 3, 2026` truncates there while `Sep 1 – Sep 3` fits — and the year is the
 *  half a reader can infer. It comes straight back for the case it actually carries information:
 *  a range reaching into the chain's older years, which is most of what this control is for. */
const fmt = (day: string) => {
  const d = civilDate(day);
  if (!d) return day;
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year });
};

/** The unabbreviated form, for the trigger's title — the tooltip never has to fit a column. */
const fmtFull = (day: string) => {
  const d = civilDate(day);
  return d ? d.toLocaleDateString(undefined, { dateStyle: "long" }) : day;
};

export default function DateRange({
  from,
  to,
  onFrom,
  onTo,
  onSubmit,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected: RDPRange | undefined = from || to
    ? { from: civilDate(from), to: civilDate(to) }
    : undefined;

  // The trigger's WORDS are the state — a control that reads "any date" is honestly saying the
  // column is unfiltered, which an empty field cannot say without a label beside it.
  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : from ? `from ${fmt(from)}` : to ? `to ${fmt(to)}` : "any date";
  const title = from && to ? `${fmtFull(from)} to ${fmtFull(to)}` : from ? `from ${fmtFull(from)}` : to ? `up to ${fmtFull(to)}` : "no date range — pick one to jump into the chain";
  const armed = !!(from || to);

  const clear = () => { onFrom(""); onTo(""); };

  return (
    // The spinner slot this span used to lead with is CULLED (2026-09-02): it was the AGE
    // column's in-flight signal, and since the bar became this control's one home the SEARCH
    // button carries the spinner — the dead w-3 slot only pushed this trigger 16px off the
    // shared left edge the phone rows align on.
    <span className="inline-flex min-w-0 items-center max-[700px]:flex-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          // SPINELESS AT REST, like every control in this row and every card in this app: a
          // placeholder on a hairline, taking the plate and the ring only once it is being used.
          // ⚠️ A BOXED FIELD, matching its two siblings exactly (user, 2026-09-01: "the input for
          // metagraphs selection is higher than the other inputs; standardize"). It wore an
          // underline at `h-5` from when it lived in a table cell, where a spineless control was
          // right; in the search bar it stands beside two boxed inputs, so it takes their box and
          // their 24px height. One recipe, three controls, one line.
          className={cn(
            // pointer-coarse — the whole bar rises to 40px together on touch (LogSearchBar's note).
            "flex h-6 pointer-coarse:h-10 min-w-0 max-[700px]:flex-1 items-center gap-1.5 rounded-xs border border-border/50 bg-[var(--panel-plate)] px-1.5 py-0",
            "text-body font-sans transition-colors hover:border-border",
            "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
            "data-[state=open]:border-transparent",
            armed ? "text-foreground" : "text-muted-foreground",
          )}
          title={title}
          aria-label={`Date range: ${title}`}
        >
          <CalendarDays aria-hidden className="size-3 flex-none text-muted-foreground" />
          <span className="truncate whitespace-nowrap">{label}</span>
        </PopoverTrigger>
        {/* `w-auto` — the adopted PopoverContent is `w-72` by default, which would leave the grid
            floating in a box wider than itself. It sizes to the calendar. */}
        <PopoverContent align="end" className="w-auto rounded-btn p-3">
          <Calendar
            mode="range"
            autoFocus
            defaultMonth={civilDate(from) ?? civilDate(to)}
            selected={selected}
            onSelect={(r) => {
              // ⚠️ react-day-picker reports the WHOLE range on every click, so both bounds are
              // written every time — writing only the one that changed would strand the other when
              // a second click restarts the range from a new from-date.
              onFrom(r?.from ? civilString(r.from) : "");
              onTo(r?.to ? civilString(r.to) : "");
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/50 pt-2">
            <button
              type="button"
              onClick={clear}
              disabled={!armed}
              className="inline-flex items-center gap-1 text-micro uppercase tracking-caps text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              <X aria-hidden className="size-3" /> clear
            </button>
            {/* The search is a DELIBERATE gesture, not a side effect of picking a day: a walk costs
                several requests, and running one on the first click would spend them on a range the
                reader is still half way through choosing. */}
            <button
              type="button"
              onClick={() => { setOpen(false); onSubmit(); }}
              disabled={!from}
              className="text-micro uppercase tracking-caps text-[var(--primary)] transition-opacity hover:opacity-80 disabled:opacity-30"
            >
              go to date →
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
