"use client";

import { Loader2 } from "lucide-react";
import { TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// THE COLUMN SEARCH ROW — a control under each header cell it can actually answer for (user,
// 2026-09-01: "a more common control sitting on top of the table columns ... for example I want to
// search a global snapshot ... perhaps a date range for 'age'").
//
// ⚠️ THE EMPTY CELLS ARE THE DESIGN, NOT AN OMISSION. Under a committed network this table pages a
// chain of >1M pages server-side, 25 rows at a time, so a control on a column implies that column is
// searchable across all of it — and only three are:
//
//   · SNAPSHOT — ordinals are gapless, so the page is arithmetic. One request.
//   · ANCHORED INTO — a global snapshot CARRIES the list of what anchored into it, so the answer is
//     one exact read of that snapshot's own manifest. See AnchorLogTable's seekTick.
//   · AGE — a date is a timestamp; same seek (src/data/chainSeek).
//
// FEE and SIZE have no index at any layer: a control there could only ever filter the 25 rows on
// screen, and a reader who typed a fee and got "no match" would reasonably conclude no such snapshot
// exists when we had looked at 25 of 1.1 million. NETWORK is inert here because under a commit the
// table IS one network. So those cells stay empty — an absent affordance tells the truth, a disabled
// or scoped-to-page one asks the reader to notice a qualifier before believing the result.
// ⚠️ VOCABULARY: the props still say `tick` because that is the COLUMN KEY the sort table uses, but
// nothing a reader sees may (user, 2026-09-01: "whatever tick means to you, it's not the vocabulary
// we use in our app"). Every placeholder, label and message here says GLOBAL SNAPSHOT.
export default function LogSearchRow({
  columns,
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
}: {
  /** The header's own keys, in order, so this row can never drift out of alignment with it. */
  columns: { key: string }[];
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
}) {
  // SPINELESS AT REST, like every card in this app. Three bordered plates sitting under the header
  // read as a form bolted onto a data table (user, 2026-09-01: "looks ugly") — and they cost height
  // the table does not have, on a body that already overflows by ~66px at 25 rows. At rest a control
  // is a placeholder on a hairline, in the column's own type; the plate and the ring arrive on focus,
  // when it IS a field being used. `py-0` + `h-5` is what takes the row from 36px to ~22px.
  const field =
    "w-full min-w-0 h-5 px-1 py-0 bg-transparent border-0 border-b border-border/50 rounded-none " +
    "font-mono text-micro tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans " +
    "hover:border-border focus:bg-[var(--panel-plate)] focus:rounded-xs focus:border-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] " +
    "transition-colors";

  // ⚠️ EVERY cell carries it, the empty ones included: `TableHead`'s base is `h-9`, so a single
  // unaltered cell holds the whole row at 36px no matter how short the controls are. Missing the
  // Network/Fee/Size fallbacks is exactly why the first pass changed nothing measurable.
  const cell = "py-0.5 h-auto align-middle";

  const num = (
    value: string,
    onChange: (v: string) => void,
    which: "snapshot" | "tick",
    placeholder: string,
    label: string,
  ) => (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(which); } }}
      className={cn(field, "text-right")}
    />
  );

  return (
    // No row-level fill and no hover: this is chrome under the header, not a data row.
    <TableRow className="border-border hover:bg-transparent">
      {columns.map((c) => {
        if (c.key === "ordinal") {
          return (
            <TableHead key={c.key} className={cell}>
              {num(snapshot, onSnapshot, "snapshot", "snapshot #", "Go to metagraph snapshot ordinal")}
            </TableHead>
          );
        }
        if (c.key === "tick") {
          return (
            <TableHead key={c.key} className={cell}>
              {num(tick, onTick, "tick", "global snapshot #", "Go to the snapshot anchored into a global snapshot")}
            </TableHead>
          );
        }
        if (c.key === "age") {
          return (
            <TableHead key={c.key} className={cell}>
              {/* A RANGE, and the FROM bound is what the seek lands on — `to` bounds which rows the
                  walk will mark, not where it goes. Stated that way round because a chain is walked
                  from a point, not filtered to a slice. */}
              <span className="flex items-center gap-1 justify-end">
                {/* ⚠️ The native date control carries a browser calendar glyph that does not belong to
                    this type system — `date-slim` (globals.css) mutes it to the row's own ink and
                    only brings it up on hover, so at rest the cell reads as two quiet dates. */}
                <input
                  type="date" value={from} aria-label="From date"
                  onChange={(e) => onFrom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit("age"); } }}
                  className={cn(field, "date-slim w-[104px] flex-none")}
                />
                <span aria-hidden className="text-micro text-muted-foreground/60">–</span>
                <input
                  type="date" value={to} aria-label="To date"
                  onChange={(e) => onTo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit("age"); } }}
                  className={cn(field, "date-slim w-[104px] flex-none")}
                />
                {/* The walk costs several requests, so it SAYS it is running — a control that goes
                    quiet for a few seconds reads as broken, not as busy. Only WHILE it runs: a
                    permanent magnifier is decoration on a row whose placeholders already say what
                    each cell takes, and this row's whole problem was carrying too much. */}
                <span aria-hidden className="w-3 flex-none">
                  {seeking && <Loader2 aria-label="searching the chain" className="size-3 animate-spin text-muted-foreground motion-reduce:animate-none" />}
                </span>
              </span>
            </TableHead>
          );
        }
        // Fee, Size, Network — see the header: no affordance is the honest state.
        return <TableHead key={c.key} className={cell} />;
      })}
    </TableRow>
  );
}
