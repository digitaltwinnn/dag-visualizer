"use client";

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
// never more than one selection wash on screen. The root crumb is the card's axis in the plural
// ("Networks", "Countries", "Snapshots") and releases everything.
//
// shadcn's Breadcrumb underneath: the `nav` landmark, the list semantics and `aria-current` on
// the last crumb come for free; the look is the card's — the crumbs are quiet pills in the wash,
// the root is bare, the separator is the app's `›`.

export interface Crumb {
  key: string;
  label: ReactNode;
  /** Go back up to this rung. Absent on the last crumb, which is where the reader is. */
  onSelect?: () => void;
}

export default function ExplorerPath({ crumbs, className }: { crumbs: readonly Crumb[]; className?: string }) {
  if (crumbs.length === 0) return null;
  return (
    <Breadcrumb className={cn("pb-2", className)}>
      <BreadcrumbList className="gap-1.5 text-label text-muted-foreground sm:gap-1.5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            // shadcn's separator is an `li` of its own, so it goes BETWEEN items, never inside one.
            <Fragment key={c.key}>
              {i > 0 && <BreadcrumbSeparator className="text-muted-foreground/60 [&>svg]:size-3">›</BreadcrumbSeparator>}
              <BreadcrumbItem className="gap-1.5">
                {last ? (
                  <BreadcrumbPage
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap text-foreground",
                      i > 0 && "rounded-md bg-wash-faint px-2 py-0.5",
                    )}
                  >
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <button
                    type="button"
                    onClick={c.onSelect}
                    title="Back up to this level"
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer text-foreground-dim hover:text-foreground",
                      i > 0 && "rounded-md bg-wash-faint px-2 py-0.5 hover:bg-wash-hover",
                      "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                    )}
                  >
                    {c.label}
                  </button>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
