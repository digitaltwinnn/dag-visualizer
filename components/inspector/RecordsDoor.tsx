"use client";

import { ArrowUpRight, Table2 } from "lucide-react";

import { openRecords, type RecordSpan } from "@/components/trendDoors";
import { cn } from "@/lib/utils";

/** HISTORY'S ONE EXIT, as a card's foot control (design 2026-09-26, `moment-door.html` A): the
 *  anchor log over a span, through `components/trendDoors.ts` — the shared home the RAW toggle
 *  calls too, so the records door's ordered steps are written once. One control for both History
 *  cards (the Range and the Moment under it, 2026-10-07): the span is what each card states.
 *
 *  It is a full-bleed control on the wash ladder every other control wears (user: the bare text
 *  links read as prose), and it ENDS WHERE THE PLANK BEGINS (user, 2026-09-26, two rounds): a
 *  boxed card under a filter carries the sibling pager's plank at its foot, whose inset hairline
 *  sits on its top edge; a control bleeding past that line wore it as an underline. So the bleed is
 *  the card's padding LESS the plank's strip (`--foot-mb`, which RailPager sets to 0), which puts
 *  the control's bottom edge exactly on the plank's hairline, and the corners square there
 *  (`--foot-radius`, which RailPager zeroes). */
export default function RecordsDoor({
  subject,
  span,
  what,
}: {
  /** The network the log is scoped to (null or the DAG: unscoped — `openRecords` says why). */
  subject: string | null;
  span: RecordSpan | null;
  /** What the card states, for the control's title: "moment" or "range". */
  what: "moment" | "range";
}) {
  const at = what === "moment" ? "at this moment" : "over this range";
  return (
    <button
      type="button"
      disabled={!span}
      // Under All the log reads every network's records too (2026-10-07), so the door always lands.
      title={subject && subject !== "dag" ? `Opens the snapshot records ${at}, for this network.` : `Opens the snapshot records ${at}, for every network.`}
      onClick={() => openRecords(subject, span)}
      className={cn(
        "mt-3 flex w-[calc(100%+2*var(--card-pad))] items-center gap-2.5 text-left text-body text-foreground cursor-pointer",
        "-mx-[var(--card-pad)] px-[var(--card-pad)] py-2.5",
        "mb-[var(--foot-mb,calc(0px-var(--card-pad)))]",
        "rounded-b-[var(--foot-radius,calc(var(--radius)-1px))] border-t border-wash-strong [background:light-dark(var(--wash-soft),var(--wash-faint))] hover:[background:light-dark(var(--wash-hover),var(--wash-soft))]", // the Door's own per-ground wash (parts.tsx)
        "disabled:opacity-45 disabled:pointer-events-none",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
      )}
    >
      <Table2 aria-hidden className="size-3.5 flex-none text-primary" />
      Snapshot records
      {/* The document's own door glyph (↗), not a chevron: › is the sibling pager's step on the
          cards below, and one glyph must not mean two things (user). */}
      <ArrowUpRight aria-hidden className="ml-auto size-3.5 flex-none text-muted-foreground" />
    </button>
  );
}
