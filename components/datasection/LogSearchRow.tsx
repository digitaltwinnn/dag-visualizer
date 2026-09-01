"use client";

import { Search, Loader2 } from "lucide-react";
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
//   · ANCHORED INTO — a global ordinal resolves to a timestamp for one ~320 B cached read
//     (/api/global/at?ordinal=), and the chain is monotonic in time, so it is seekable from there.
//   · AGE — a date is a timestamp; same seek (src/data/chainSeek).
//
// FEE and SIZE have no index at any layer: a control there could only ever filter the 25 rows on
// screen, and a reader who typed a fee and got "no match" would reasonably conclude no such snapshot
// exists when we had looked at 25 of 1.1 million. NETWORK is inert here because under a commit the
// table IS one network. So those cells stay empty — an absent affordance tells the truth, a disabled
// or scoped-to-page one asks the reader to notice a qualifier before believing the result.
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
  const field =
    "w-full min-w-0 rounded-xs bg-[var(--panel-plate)] border border-border/60 px-1.5 py-0.5 " +
    "font-mono text-micro tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:border-transparent";

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
    <TableRow className="border-border hover:bg-transparent">
      {columns.map((c) => {
        if (c.key === "ordinal") {
          return (
            <TableHead key={c.key} className="py-1.5">
              {num(snapshot, onSnapshot, "snapshot", "go to #", "Go to snapshot ordinal")}
            </TableHead>
          );
        }
        if (c.key === "tick") {
          return (
            <TableHead key={c.key} className="py-1.5">
              {num(tick, onTick, "tick", "go to tick #", "Go to the snapshot anchored into a global ordinal")}
            </TableHead>
          );
        }
        if (c.key === "age") {
          return (
            <TableHead key={c.key} className="py-1.5">
              {/* A RANGE, and the FROM bound is what the seek lands on — `to` bounds which rows the
                  walk will mark, not where it goes. Stated that way round because a chain is walked
                  from a point, not filtered to a slice. */}
              <span className="flex items-center gap-1 justify-end">
                <input
                  type="date" value={from} aria-label="From date"
                  onChange={(e) => onFrom(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit("age"); } }}
                  className={cn(field, "w-[112px] flex-none")}
                />
                <span aria-hidden className="text-micro text-muted-foreground">–</span>
                <input
                  type="date" value={to} aria-label="To date"
                  onChange={(e) => onTo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit("age"); } }}
                  className={cn(field, "w-[112px] flex-none")}
                />
                {/* The walk costs several requests, so it SAYS it is running — a control that goes
                    quiet for a few seconds reads as broken, not as busy. */}
                {seeking
                  ? <Loader2 aria-label="searching the chain" className="size-3 flex-none animate-spin text-muted-foreground motion-reduce:animate-none" />
                  : <Search aria-hidden className="size-3 flex-none text-muted-foreground" />}
              </span>
            </TableHead>
          );
        }
        // Fee, Size, Network — see the header: no affordance is the honest state.
        return <TableHead key={c.key} className="py-1.5" />;
      })}
    </TableRow>
  );
}
