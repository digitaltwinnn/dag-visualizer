"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

// The adopted date-range calendar (react-day-picker), the raw log's AGE column being its one
// consumer (user pick, 2026-09-01). It replaces a stacked pair of native `type="date"` fields that
// could not fit the ledger's ~576px master pane at a readable size.
//
// ⚠️ THIS IS THE LARGEST PIECE OF STOCK UI IN THE APP, so every surface it paints is re-stated in
// THIS app's tokens — the library ships its own `style.css` and shadcn's default class map, and
// neither is imported. Rule 3 (one colour source) reaches `components/`, so nothing here may carry
// a raw hex: selection is `--primary`, the range interior is the same `--wash-*` family every row
// selection uses, and the type comes off the HUD scale. The grid, the month arithmetic, the range
// logic and the keyboard handling are the library's — that is what adopting it bought.
//
// The `classNames` map is keyed by react-day-picker's own UI enum values (v10). Key names are the
// contract; if a version renames one the class silently stops applying, so a restyle after an
// upgrade means re-reading `node_modules/react-day-picker/dist/cjs/UI.d.ts`, not guessing.
export function Calendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  // One cell recipe shared by the day BUTTON in all its states, so selected/in-range/today differ
  // only by the arms below rather than by three near-copies of the same box.
  const day =
    "relative flex size-7 items-center justify-center rounded-xs font-mono text-body tabular-nums " +
    "text-foreground-dim transition-colors hover:bg-wash-hover hover:text-foreground " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] " +
    "disabled:pointer-events-none disabled:opacity-30";

  return (
    <DayPicker
      showOutsideDays
      // Reachable in one gesture rather than 34 (see `dropdowns` below). The bounds are the DATA's,
      // not a guess: nothing behind the payload host serves a global snapshot older than
      // 2023-11-13, and a future date cannot be in a chain that has not produced it yet — a
      // disabled day is the honest way to say a range simply is not there (rule 10).
      captionLayout="dropdown"
      startMonth={new Date(2023, 10, 1)}
      endMonth={new Date()}
      disabled={{ after: new Date() }}
      className={cn("p-0", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "flex flex-col gap-2",
        // The caption is an EYEBROW, like every other section head in the HUD.
        month_caption: "flex h-6 items-center justify-center",
        // ⚠️ `caption_label` IS THE VISIBLE FACE IN BOTH LAYOUTS. In dropdown mode `Dropdown`
        // renders the `<select>` AND an aria-hidden span carrying this class with the selected
        // label inside it — so styling the select visibly renders the month and year TWICE, side
        // by side, which is exactly what the first cut did. The select becomes a transparent
        // overlay (below) and this span is what the reader sees.
        caption_label: "inline-flex items-center gap-0.5 text-label uppercase tracking-caps text-muted-foreground",
        // ⚠️ MONTH/YEAR DROPDOWNS ARE NOT DECORATION HERE. Under a committed network this control
        // searches a chain reaching back to 2023-11-13 (the metagraph-era restart, the oldest
        // ordinal anything behind the LB serves), so arrow-only navigation is ~34 clicks to the
        // start and the reader has no idea how far they are. The dropdowns are the caption in that
        // mode, so `caption_label` above stops rendering and these carry the same eyebrow weight.
        dropdowns: "flex items-center gap-1.5",
        dropdown_root:
          "relative inline-flex items-center rounded-xs px-1 py-0.5 transition-colors " +
          "hover:bg-wash-hover [&:hover_span]:text-foreground " +
          "has-[select:focus-visible]:outline has-[select:focus-visible]:outline-1 has-[select:focus-visible]:outline-[var(--primary)]",
        // The native select, laid over its own face at zero opacity: it keeps the platform's
        // keyboard handling and its popup list while the app draws what is actually seen.
        dropdown: "absolute inset-0 z-10 w-full cursor-pointer opacity-0",
        // ⚠️ The nav is absolutely positioned OVER the caption row rather than beside it: laid out
        // in flow it competes with the month name for a 7-column width and pushes the grid wider
        // than the cells need, which is the whole problem this control was brought in to solve.
        nav: "absolute inset-x-0 top-0 flex h-6 items-center justify-between",
        button_previous:
          "inline-flex size-6 items-center justify-center rounded-xs text-muted-foreground " +
          "transition-colors hover:bg-wash-hover hover:text-foreground disabled:opacity-30",
        button_next:
          "inline-flex size-6 items-center justify-center rounded-xs text-muted-foreground " +
          "transition-colors hover:bg-wash-hover hover:text-foreground disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-7 text-micro uppercase tracking-caps text-muted-foreground/70",
        weeks: "",
        week: "flex w-full",
        // The DAY cell carries the range WASH so the fill runs edge to edge across the week; the
        // BUTTON inside carries the ink and the endpoint marks. Splitting them that way is what
        // lets a range read as one continuous band instead of seven separate chips.
        day: "p-0 text-center",
        day_button: day,
        // ⚠️ The endpoint FILL is written with an arbitrary variant reaching the button inside the
        // cell (`[&>button]`), because react-day-picker puts these classes on the CELL while the
        // ink and the hit area live on its button. Without the variant an endpoint paints the whole
        // cell and the mark loses its shape against the band beside it.
        range_start:
          "bg-wash-soft rounded-l-xs [&>button]:bg-[var(--primary)] [&>button]:text-[var(--primary-foreground)] " +
          "[&>button]:hover:bg-[var(--primary)] [&>button]:hover:text-[var(--primary-foreground)]",
        range_end:
          "bg-wash-soft rounded-r-xs [&>button]:bg-[var(--primary)] [&>button]:text-[var(--primary-foreground)] " +
          "[&>button]:hover:bg-[var(--primary)] [&>button]:hover:text-[var(--primary-foreground)]",
        // A middle day is INSIDE the range but was never chosen, so it keeps its own ink under a
        // faint band — the same two-weight reading the row selection uses (wash + committed mark).
        range_middle: "bg-wash-faint [&>button]:text-foreground",
        selected: "",
        // ⚠️ `today` must not read as selected — it is a POSITION cue, not a choice. A ring, never a fill.
        today: "outline outline-1 outline-offset-[-1px] outline-border",
        outside: "text-muted-foreground/40",
        disabled: "opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        // ⚠️ THREE ORIENTATIONS, not two. `Dropdown` asks for a "down" chevron for its own face,
        // and a two-arm ternary silently served it a RIGHT arrow — a stray `›` beside each of the
        // month and year captions.
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
          return <Icon className={orientation === "down" ? "size-3 opacity-60" : "size-3.5"} />;
        },
      }}
      {...props}
    />
  );
}
