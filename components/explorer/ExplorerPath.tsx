"use client";

import { House } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

// THE EXPLORER'S PATH (design session 2026-09-26, `depth.html` A): depth is a path, not a tree.
// The card shows ONE level at a time; the ancestry above it is this breadcrumb, each crumb a way
// back up. Clicking a crumb RELEASES every rung finer than it (through the one executor — the
// caller wires the action) and shows that crumb's level with the crumb's row washed, so there is
// never more than one selection wash on screen. THE ROOT IS A HOUSE GLYPH (user, 2026-09-26, two
// rounds: the root word — "Networks", "Countries", "Snapshots" — restated the card's title and cost
// the width the crumbs need, so it went; then "I can't go back to the 1st level once I start
// navigating" — so it is back as the shortest possible entry, an icon whose accessible name is the
// root's word). It releases everything.
//
// shadcn's Breadcrumb underneath: the `nav` landmark, the list semantics and `aria-current` on
// the last crumb come for free; the look is the card's — the crumbs are quiet pills in the wash,
// the root is bare, the separator is the app's `›`.
//
// TYPE AND FIT (user, 2026-09-26, two notes): a crumb is a ROW'S NAME moved up, so it is set at
// the rows' own `text-body`, not the primitive's `text-sm` — 14px over 12.5px rows read as a
// heading. And the path never wraps: the list is `nowrap` and every crumb is a shrinkable
// `min-w-0` item that ELLIPSISES, so a long label (a provider, "Frankfurt · Hetzner Online GmbH")
// gives up width before the path takes a second line, and the full label stays on the crumb's
// `title`. A label that has a short form uses it (a country crumb is the name alone, not the
// code and the name). The LAST crumb gives up width first: the crumbs above it are the short
// names the reader navigates by and never shrink — each is capped at 45% of the path instead, so
// only a genuinely long one ("Frankfurt Am Main · Hetzner", once its nodes are open) ellipsises —
// and "Ge… › Frankfurt Am Main · Hetzner" (proportional shrink, tried first) is the wrong one clipped.
//
// THE HINT IS PART OF THE PATH (user, 2026-09-26: an eyebrow "BY NODE" over "nodes that seal
// snapshots…" was "very redundant", and a separate row for it read as a third thing between the
// path and the list). One muted clause of what the level CONTAINS sits snug under the crumbs, in
// the nav, as the path's own caption — no eyebrow, no total (the parent row's figure is that
// number and the heading names its unit).

export interface Crumb {
  key: string;
  label: ReactNode;
  /** The full label, for the crumb's `title` where the rendered one may be ellipsised. */
  title?: string;
  /** Go back up to this rung. Absent on the last crumb, which is where the reader is. */
  onSelect?: () => void;
  /** The root: rendered as the house glyph, `title` as its accessible name. */
  root?: boolean;
}

export default function ExplorerPath({ crumbs, hint, className }: { crumbs: readonly Crumb[]; hint?: string; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    <Breadcrumb className={cn("pb-2", className)}>
      {/* The caption FOLLOWS the list in the DOM so AT reads the path first; visually it sits under it. */}
      <BreadcrumbList className="flex-nowrap gap-1.5 text-body text-muted-foreground sm:gap-1.5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          if (c.root && !last)
            return (
              <BreadcrumbItem key={c.key} className="min-w-0 gap-1.5">
                <button
                  type="button"
                  onClick={c.onSelect}
                  title={c.title ? `${c.title} — back to the start` : "Back to the start"}
                  aria-label={c.title ?? "Back to the start"}
                  className={cn(
                    "inline-flex flex-none items-center justify-center size-5 -mx-0.5 rounded-sm cursor-pointer text-foreground-dim hover:text-foreground hover:bg-wash-hover",
                    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                  )}
                >
                  <House aria-hidden className="size-3.5" />
                </button>
              </BreadcrumbItem>
            );
          return (
            // shadcn's separator is an `li` of its own, so it goes BETWEEN items, never inside one.
            <Fragment key={c.key}>
              {i > 0 && <BreadcrumbSeparator className="flex-none text-muted-foreground/60 [&>svg]:size-3">›</BreadcrumbSeparator>}
              <BreadcrumbItem className={cn("min-w-0 gap-1.5", last ? "shrink" : "shrink-0 max-w-[45%]")}>
                {last ? (
                  <BreadcrumbPage
                    className={cn(
                      "inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap text-foreground",
                      i > 0 && "rounded-md bg-wash-faint px-2 py-0.5",
                    )}
                    title={c.title}
                  >
                    <span className="min-w-0 truncate [&>*]:align-middle">{c.label}</span>
                  </BreadcrumbPage>
                ) : (
                  <button
                    type="button"
                    onClick={c.onSelect}
                    title={c.title ? `${c.title} — back up to this level` : "Back up to this level"}
                    className={cn(
                      "inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap cursor-pointer text-foreground-dim hover:text-foreground",
                      i > 0 && "rounded-md bg-wash-faint px-2 py-0.5 hover:bg-wash-hover",
                      "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                    )}
                  >
                    <span className="min-w-0 truncate [&>*]:align-middle">{c.label}</span>
                  </button>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
      {hint && <p className="mt-1 pl-0.5 text-label leading-snug text-muted-foreground/80">{hint}</p>}
    </Breadcrumb>
  );
}
