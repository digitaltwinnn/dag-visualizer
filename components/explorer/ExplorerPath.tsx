"use client";

import { House } from "lucide-react";
import type { ReactNode } from "react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

// THE EXPLORER'S PATH (design session 2026-09-26, `depth.html` A, then `path-control.html` C+B
// later the same day): depth is a path, not a tree. The card shows ONE level at a time; the
// ancestry above it is this path, each step a way back up. Clicking a step RELEASES every rung
// finer than it (through the one executor — the caller wires the action) and shows that step's
// level with the step's row washed, so there is never more than one selection wash on screen.
//
// ONE CONTROL, NOT A COLLECTION (user: the first cut — a house, pills, `›`s and a line of text —
// "looks too much like a random collection of pills, > and text; I want a uniform control"). The
// path is ARROW STEPS on one faint plate: each step is a chevron-shaped segment whose own edge is
// the separator, the house is the first step, the level on screen is the last and the filled one,
// and the level's one clause of meaning sits on the SAME plate beneath the steps — the plate is
// what makes the clause part of the control rather than a line under it (the user picked C's
// steps with B's bounding block). ONE HUE in the wash ladder's strengths carries it — the plate
// faint, the ancestors soft, the current step STRONG with full ink (user, second round: the old
// blue-grey washes read as grey boxes on the light ground, so the `--wash-*` tokens became the
// accent; and the current step was invisible as "you are here" — it should be, and now it is the
// strongest fill). The rows beneath hang from the plate on a SPINE in the same wash (`Explorer`),
// so the level's list visibly belongs to the control that names it.
//
// shadcn's Breadcrumb underneath still: the `nav` landmark, the list semantics and `aria-current`
// on the last step come for free; its `›` separators are not used, the steps' edges are them.
//
// TYPE AND FIT: a step is a ROW'S NAME moved up, so it is set at the rows' own `text-body`. The
// path never wraps: ancestors keep their (short) names, capped at 45% of the plate, and the LAST
// step ellipsises first, with the full label on its `title`. A label with a short form uses it
// (a country step is the name alone). THE ROOT IS THE HOUSE GLYPH (two rounds: the root word
// restated the card's title; then "I can't go back to the 1st level once I start navigating"),
// its accessible name the root's word, releasing everything.

export interface Crumb {
  key: string;
  label: ReactNode;
  /** The full label, for the step's `title` where the rendered one may be ellipsised. */
  title?: string;
  /** Go back up to this rung. Absent on the last step, which is where the reader is. */
  onSelect?: () => void;
  /** The root: rendered as the house glyph, `title` as its accessible name. */
  root?: boolean;
}

// The chevron: a 7px arrow tip on the right and, past the first step, a 7px notch on the left that
// the previous step's tip sits in. Steps overlap by 5px, so a 2px seam of the plate's own colour
// runs between them. (Literal class strings — Tailwind's scanner reads no template.)
const STEP = "inline-flex h-[24px] pointer-coarse:h-10 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap";
const SHAPE_FIRST = "rounded-l-[5px] [clip-path:polygon(0_0,calc(100%-7px)_0,100%_50%,calc(100%-7px)_100%,0_100%)]";
const SHAPE_MID = "[clip-path:polygon(0_0,calc(100%-7px)_0,100%_50%,calc(100%-7px)_100%,0_100%,7px_50%)]";
const SHAPE_LAST = "rounded-r-[5px] [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,7px_50%)]";

export default function ExplorerPath({ crumbs, hint, className }: { crumbs: readonly Crumb[]; hint?: string; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    // The plate takes the ROWS' outset (6px each side, `ExplorerRow`'s box), not the heading's inset:
    // the rows' wash boxes are what the reader sees the plate against, and 6px of overhang on the
    // right read as misalignment (user, 2026-09-26).
    <Breadcrumb className={cn("w-[calc(100%+12px)] -mx-1.5 rounded-md bg-wash-faint p-1", className)}>
      <BreadcrumbList className="flex-nowrap gap-0 text-body text-muted-foreground sm:gap-0">
        {crumbs.map((c, i) => {
          const first = i === 0;
          const last = i === crumbs.length - 1;
          const shape = first && last ? "rounded-[5px]" : first ? SHAPE_FIRST : last ? SHAPE_LAST : SHAPE_MID;
          // Padding follows the shape: room for the notch on the left, for the tip on the right.
          const pad = cn(first ? "pl-2" : "pl-[13px]", last ? "pr-2" : "pr-[11px]");
          return (
            <BreadcrumbItem
              key={c.key}
              // The CURRENT step runs to the plate's edge (user, 2026-09-26: the steps "often stop
              // half way") — the control is the plate's full width, and the filled last segment
              // is what carries that; ancestors stay their own width.
              // THE LAST STEP IS WHERE THE READER IS, SO IT IS THE ONE THAT KEEPS ITS ROOM (found
              // 2026-10-03, four steps deep in Snapshots: the ancestors were unshrinkable at up to
              // 45% each, and the current step — a snapshot's ordinal — was squeezed down to ":").
              // It holds at least two fifths of the row and takes whatever is left; the steps
              // behind it give way, each ellipsised down to a floor that still shows a few
              // characters. The root is a glyph and never shrinks.
              className={cn(
                "gap-0",
                // The root as the only step HUGS its house — a full-width bar holding one glyph reads
                // as an empty field.
                last && c.root ? "shrink-0" : last ? "min-w-[40%] flex-1" : c.root ? "shrink-0" : "min-w-[3.25rem] max-w-[45%] shrink",
                !first && "-ml-[5px]",
              )}
            >
              {last ? (
                // "YOU ARE HERE" IS A LABEL, NOT TEXT (user, 2026-10-07: "the mouse pointer is |"): its
                // list is already on screen, so it takes no click — the default cursor and no text
                // selection keep it from reading as a broken link beside the steps that do.
                <BreadcrumbPage className={cn(STEP, shape, pad, "cursor-default select-none bg-wash-strong text-foreground", !c.root && "w-full")} title={c.title}>
                  {/* THE ROOT AS THE PAGE IS THE HOUSE ALONE (user, 2026-10-07): its word is the card's
                      title one line above, so printing it here said the same thing twice. The word
                      stays the step's accessible name; the bar gains a name once a level is opened. */}
                  {c.root ? (
                    <>
                      <House aria-hidden className="size-3.5 flex-none" />
                      <span className="sr-only">{c.label}</span>
                    </>
                  ) : (
                    <span className="min-w-0 truncate [&>*]:align-middle">{c.label}</span>
                  )}
                </BreadcrumbPage>
              ) : (
                <button
                  type="button"
                  onClick={c.onSelect}
                  title={c.root ? `${c.title ?? "Back to the start"} — back to the start` : c.title ? `${c.title} — back up to this level` : "Back up to this level"}
                  aria-label={c.root ? (c.title ?? "Back to the start") : undefined}
                  className={cn(
                    STEP,
                    shape,
                    pad,
                    "group cursor-pointer bg-wash-soft text-foreground-dim hover:bg-wash-hover hover:text-foreground",
                    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                  )}
                >
                  {/* A STEP BACK LOOKS LIKE A WAY BACK (user, 2026-10-07: the current step "looks the
                      same as something that can be clicked"). The breadcrumb convention: an earlier
                      step is a LINK — its name in the accent ink, underlined on hover — and the
                      current step is plain, the filled "you are here". A dotted underline was tried
                      the same day and dropped: on the web it says "more information", not "go back". */}
                  {c.root ? (
                    <House aria-hidden className="size-3.5 flex-none text-primary-ink" />
                  ) : (
                    <span className="min-w-0 truncate text-primary-ink underline-offset-[3px] decoration-[1px] group-hover:underline [&>*]:align-middle">
                      {c.label}
                    </span>
                  )}
                </button>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
      {/* The clause FOLLOWS the list in the DOM so AT reads the path first; on the plate it is
          the control's own caption. */}
      {hint && <p className="mt-1 px-1 pb-0.5 text-label leading-snug text-muted-foreground">{hint}</p>}
    </Breadcrumb>
  );
}
