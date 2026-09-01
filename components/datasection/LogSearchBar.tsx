"use client";

import { Loader2, Search } from "lucide-react";

import DateRange from "@/components/datasection/DateRange";
import { cn } from "@/lib/utils";

// THE ANCHOR LOG'S SEARCH BAR — three named fields, revealed by the toolbar's search button
// (user, 2026-09-01: "instead of putting the search fields under the columns, what about just
// three named search fields that show when we click the search button; this way it does not
// fight with the table").
//
// ⚠️ IT REPLACED A PER-COLUMN ROW, AND THE REASON IS WORTH KEEPING. Controls seated under the
// header cells they answer for is a real pattern with a real virtue — context — but it made the
// TABLE's geometry the form's budget, and the table won every argument: two date inputs could not
// render `mm/dd/yyyy` inside a ~165px AGE column, so they were stacked; the hints had to fit
// column widths, so they were cramped; and every control had to be an alignment-preserving cell
// even where the column could answer nothing. Off the table the fields are just fields — the date
// range fits on one line again, and each control is named by a LABEL rather than by whichever
// column it happens to sit beneath.
//
// ⚠️ THREE FIELDS IS ITSELF THE STATEMENT — the old row said it with empty cells. Under a
// committed network this table pages a chain of >1M pages server-side, and only three axes can be
// searched across it:
//
//   · SNAPSHOT — ordinals are gapless, so the page is arithmetic. One request.
//   · ANCHORED INTO — a global snapshot CARRIES the list of what anchored into it, so the answer
//     is one exact read of that snapshot's own manifest. See AnchorLogTable's seekTick.
//   · AGE — a date is a timestamp; the interpolating walk in src/data/chainSeek.
//
// FEE and SIZE have no index at any layer: a field there could only ever filter the 25 rows on
// screen, and a reader who typed a fee and got "no match" would reasonably conclude no such
// snapshot exists when we had looked at 25 of 1.1 million. NETWORK is inert because under a commit
// the table IS one network. Three fields say that by being the only three.
//
// ⚠️ VOCABULARY: the props still say `tick` because that is the COLUMN KEY the sort table uses,
// but nothing a reader sees may (user, 2026-09-01: "whatever tick means to you, it's not the
// vocabulary we use in our app"). Every label and message here says GLOBAL SNAPSHOT.
export default function LogSearchBar({
  seeking,
  snapshot,
  tick,
  from,
  to,
  onSnapshot,
  onTick,
  onFrom,
  onTo,
  onSubmit,
  onClose,
}: {
  seeking: boolean;
  snapshot: string;
  tick: string;
  from: string;
  to: string;
  onSnapshot: (v: string) => void;
  onTick: (v: string) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onSubmit: (which: "snapshot" | "tick" | "age") => void;
  /** Escape folds the bar away — the same key that dismisses every other transient surface here. */
  onClose: () => void;
}) {
  // A field reads at the size of the values it finds (`text-body` mono), not at the smallest size
  // in the scale — the lesson from the row this replaces, where `text-micro` made the hints look
  // like fine print under the header.
  const field =
    "w-full min-w-0 h-6 px-1.5 py-0 bg-[var(--panel-plate)] border border-border/50 rounded-xs " +
    "font-mono text-body tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans " +
    "hover:border-border focus:border-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] transition-colors";

  // ⚠️ EVERY FIELD CARRIES A VISIBLE SUBMIT, AND ENTER STILL WORKS — both, never one (user,
  // 2026-09-01: "'press ↵ to jump'? Why not a just search button?"). The bar's first cut relied on
  // Enter alone and explained it in words at the end of the row, which is the tell: instructional
  // microcopy is what a UI writes when it is missing an affordance. The guidance is consistent — a
  // button "signals that an action is required", rescues everyone who does not know the Enter
  // convention, and is the faster target on touch, while implicit submission stays for everyone who
  // does. It sits to the RIGHT of its input, the position that reads as "…and then go".
  //
  // PER FIELD, not one for the bar: these are three different seeks with three different costs, and
  // a single button would have to guess which one you meant from a hidden precedence rule. The date
  // range already carried its own explicit control inside its popover, so per-field submit is also
  // what makes the three read as one family.
  const num = (
    value: string,
    onChange: (v: string) => void,
    which: "snapshot" | "tick",
    label: string,
    placeholder: string,
    width: string,
  ) => (
    <span className={cn("flex flex-none items-center gap-1.5", width)}>
      <label className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="flex-none text-micro uppercase tracking-caps text-muted-foreground">{label}</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(which); } }}
          className={cn(field, "text-right")}
        />
      </label>
      <button
        type="button"
        onClick={() => onSubmit(which)}
        disabled={!value}
        aria-label={`Search by ${label}`}
        className={cn(
          "inline-flex size-6 flex-none items-center justify-center rounded-xs cursor-pointer",
          "border border-border/50 bg-[var(--panel-plate)] text-muted-foreground transition-colors",
          "hover:text-foreground hover:border-border",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          "disabled:opacity-30 disabled:cursor-default disabled:hover:text-muted-foreground",
        )}
      >
        <Search aria-hidden className="size-3" />
      </button>
    </span>
  );

  return (
    // ⚠️ It WRAPS. This bar lives in a master–detail pane that is ~576px at tablet, and three
    // labelled fields do not fit that on one line — the failure the column row kept hitting was
    // exactly this width, met by shrinking controls until they lied about their format. Here the
    // row simply wraps and every field keeps its size.
    <div
      className="flex-none flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-1.5"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {num(snapshot, onSnapshot, "snapshot", "snapshot", "#", "w-[218px]")}
      {num(tick, onTick, "tick", "anchored into", "global #", "w-[238px]")}
      <label className="flex flex-none items-center gap-1.5">
        <span className="flex-none text-micro uppercase tracking-caps text-muted-foreground">age</span>
        <DateRange from={from} to={to} seeking={false} onFrom={onFrom} onTo={onTo} onSubmit={() => onSubmit("age")} />
      </label>
      {/* The walk costs several requests, so it SAYS it is running — a control that goes quiet for
          a few seconds reads as broken, not as busy. Only WHILE it runs. */}
      <span aria-hidden className="w-3 flex-none">
        {seeking && <Loader2 aria-label="searching the chain" className="size-3 animate-spin text-muted-foreground motion-reduce:animate-none" />}
      </span>
    </div>
  );
}
