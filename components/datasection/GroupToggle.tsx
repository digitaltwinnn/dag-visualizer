"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// THE RAW LISTS' GROUP PLATE IS ITS OWN DISCLOSURE (user, 2026-10-25: "give the option to collapse
// and expand a group? Use the correct shadcn controls", then "make the whole section clickable …
// not just the >"). A group is a header ROW inside a table, and Radix's Collapsible cannot wrap
// table rows (its content is one element, and a <tbody> holds only rows), so this follows
// shadcn's own data-table pattern for expandable rows: the header is a native button with
// `aria-expanded`, and the table renders the group's rows only while it is open. The whole plate
// is the target; the chevron turns on the 150ms disclosure clock every chevron in the app uses.
export default function GroupPlate({
  open,
  onToggle,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** The plate's own look — its band, hairline and height. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        "w-full flex items-center gap-2 text-left cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]",
        className,
      )}
    >
      <ChevronRight
        aria-hidden
        className={cn("size-3.5 flex-none -ml-0.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
      />
      {children}
    </button>
  );
}
