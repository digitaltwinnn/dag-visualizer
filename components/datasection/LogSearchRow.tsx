"use client";

import { TableHead, TableRow } from "@/components/ui/table";
import DateRange from "@/components/datasection/DateRange";
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
  onClose,
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
  /** Escape folds the row away — the same key that dismisses every other transient surface here. */
  onClose: () => void;
}) {
  // SPINELESS AT REST, like every card in this app. Three bordered plates sitting under the header
  // read as a form bolted onto a data table (user, 2026-09-01: "looks ugly") — and they cost height
  // the table does not have, on a body that already overflows by ~66px at 25 rows. At rest a control
  // is a placeholder on a hairline, in the column's own type; the plate and the ring arrive on focus,
  // when it IS a field being used. `py-0` + `h-5` is what takes the row from 36px to ~22px.
  // ⚠️ A CONTROL READS AT ITS COLUMN'S SIZE, NOT THE SMALLEST ONE AVAILABLE (user, 2026-09-01:
  // "the hint in the snapshot search is quite small font, is that allowed by our design"). It is
  // allowed — `text-micro` is in the scale — but it is the EYEBROW/FOOT tier, and this field is a
  // preview of the column beneath it: you type an ordinal and ordinals come back, so it takes the
  // cells' own `text-body` mono. The same argument settles the alignment below.
  const field =
    "w-full min-w-0 h-5 px-1 py-0 bg-transparent border-0 border-b border-border/50 rounded-none " +
    "font-mono text-body tabular-nums text-foreground placeholder:text-muted-foreground placeholder:font-sans " +
    "hover:border-border focus:bg-[var(--panel-plate)] focus:rounded-xs focus:border-transparent " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] " +
    "transition-colors";

  // ⚠️ EVERY cell carries it, the empty ones included: `TableHead`'s base is `h-9`, so a single
  // unaltered cell holds the whole row at 36px no matter how short the controls are. Missing the
  // Network/Fee/Size fallbacks is exactly why the first pass changed nothing measurable.
  const cell = "py-0.5 h-auto align-middle";

  // ⚠️ …AND IT ALIGNS WITH ITS COLUMN. The Snapshot cells are left-aligned mono and Anchored-into's
  // are right-aligned, so a single `text-right` on both put one hint on the opposite edge from every
  // value under it (user, same). The alignment is the CELL's, passed in rather than assumed.
  const num = (
    value: string,
    onChange: (v: string) => void,
    which: "snapshot" | "tick",
    placeholder: string,
    label: string,
    align: "text-left" | "text-right",
  ) => (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(which); } }}
      className={cn(field, align)}
    />
  );

  return (
    // No row-level fill and no hover: this is chrome under the header, not a data row — which is
    // also why it is only here once asked for (see AnchorLogTable's `searchOpen`).
    <TableRow className="border-border hover:bg-transparent" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      {columns.map((c) => {
        if (c.key === "ordinal") {
          return (
            <TableHead key={c.key} className={cell}>
              {num(snapshot, onSnapshot, "snapshot", "snapshot #", "Go to metagraph snapshot ordinal", "text-left")}
            </TableHead>
          );
        }
        if (c.key === "tick") {
          return (
            <TableHead key={c.key} className={cell}>
              {num(tick, onTick, "tick", "global snapshot #", "Go to the snapshot anchored into a global snapshot", "text-right")}
            </TableHead>
          );
        }
        if (c.key === "age") {
          return (
            <TableHead key={c.key} className={cn(cell, "text-right")}>
              {/* ⚠️ ONE CONTROL, NOT TWO FIELDS (user pick, 2026-09-01). Two native `type="date"`
                  inputs cannot both render `mm/dd/yyyy` in this column: the ledger's raw layer is a
                  master–detail split, so the table lives in a ~576px pane whose six data columns
                  need ~395, leaving ~165 for AGE — against the ~190 a readable pair needs. Inline
                  they pushed the table 72px into horizontal scroll and cut this column off screen;
                  shaved to fit they truncated to `mm/dd/y`, a control lying about what it takes;
                  stacked they cost a second line. A trigger states the range in words at ~110px and
                  the picking happens in a portalled popover, where width is free. */}
              <DateRange
                from={from}
                to={to}
                seeking={seeking}
                onFrom={onFrom}
                onTo={onTo}
                onSubmit={() => onSubmit("age")}
              />
            </TableHead>
          );
        }
        // Fee, Size, Network — see the header: no affordance is the honest state.
        return <TableHead key={c.key} className={cell} />;
      })}
    </TableRow>
  );
}
