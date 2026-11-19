"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StateMark } from "@/components/state/StateAtoms";

// THE RAW LISTS' GROUP PLATE AND ITS DISCLOSURE (user, 2026-10-25: "give the option to collapse and
// expand a group? Use the correct shadcn controls"). A group is a header ROW inside a table, and
// Radix's Collapsible cannot wrap table rows (its content is one element, and a <tbody> holds only
// rows), so this follows shadcn's own data-table pattern for expandable rows: a native button with
// `aria-expanded`, and the table renders the group's rows only while it is open. The chevron turns
// on the 150ms disclosure clock every chevron in the app uses.
//
// TWO SHAPES, by whether the group is a SUBJECT:
//  · no `onSelect` — the whole plate is the fold (a country, a network plate: neither is committed
//    from the raw layer);
//  · `onSelect` — the plate selects its subject and the CHEVRON folds (user, same day: "can't we
//    collapse / expand the row and also deselect/select the subject at the same time?" — answered
//    as the explorer rows behave: a click commits, a click on the committed one releases it, and
//    selecting a folded group opens it). Two gestures, two targets; neither reaches the other.
export default function GroupPlate({
  open,
  onToggle,
  onSelect,
  selected = false,
  onHover,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** The plate's subject's select/deselect, when it has one. */
  onSelect?: () => void;
  /** Whether that subject is the committed one (a plate that selects is a toggle). */
  selected?: boolean;
  /** Rule 9: a surface hovers what its click commits — so only a selecting plate previews. */
  onHover?: (on: boolean) => void;
  /** The plate's own look — its band, hairline and height. */
  className?: string;
  children: ReactNode;
}) {
  const chevron = (
    <ChevronRight
      aria-hidden
      className={cn("size-3.5 flex-none transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
    />
  );
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]";
  if (!onSelect) {
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn("w-full flex items-center gap-2 text-left cursor-pointer", focus, className)}
      >
        <span className="-ml-0.5 flex">{chevron}</span>
        {children}
      </button>
    );
  }
  return (
    <div className={cn("w-full flex items-center", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Collapse group" : "Expand group"}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        // The chevron's own target: the plate's full height, a little wider than the glyph.
        className={cn("self-stretch -ml-1.5 pl-1.5 pr-1 flex items-center cursor-pointer rounded-sm hover:text-foreground", focus)}
      >
        {chevron}
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          // Selecting a folded group opens it — what was selected is now on screen.
          if (!selected && !open) onToggle();
          onSelect();
        }}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
        className={cn("flex-1 min-w-0 self-stretch flex items-center gap-2 text-left cursor-pointer", focus)}
      >
        {children}
      </button>
    </div>
  );
}

/** THE GLOBAL SNAPSHOT'S PLATE — the head of a RAW group that is one global snapshot (the anchor log
 *  grouped by tick, the Blocks table grouped by the accepting global): "GLOBAL", its number, the
 *  LIVE / PINNED mark following the number it qualifies, and its age at the right. The plate is an
 *  accent-tinted band with an accent hairline (user, 2026-10-08, design B1); the SELECTED global
 *  deepens to the selection accent — the group's head carries that selection, never its rows. ONE
 *  home for the markup both tables share (refactor round R1, P5), so the two RAW lists can never
 *  drift in their plate grammar. The plate SELECTS the global (a second click releases it) and its
 *  chevron folds the group (`GroupPlate`'s selecting shape); hovering it previews the global. */
export function GlobalGroupPlate({
  ordinal,
  age,
  selected,
  following,
  open,
  onToggle,
  onSelect,
  onHover,
}: {
  ordinal: number;
  /** The age, already worded ("17s ago" names itself). */
  age: ReactNode;
  /** Is this global the committed one (live or pinned)? */
  selected: boolean;
  following: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  onHover: (on: boolean) => void;
}) {
  return (
    <GroupPlate
      open={open}
      onToggle={onToggle}
      selected={selected && !following}
      onSelect={onSelect}
      onHover={onHover}
      className={cn(
        // px matches the rows' own cell inset, so "GLOBAL" stands on the identity dots' edge.
        "h-[34px] px-2 max-[700px]:px-1.5 rounded-t-md border-b text-label transition-colors",
        selected
          ? "bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] border-[var(--primary)] text-primary-ink"
          : "bg-[color-mix(in_oklch,var(--primary)_9%,var(--panel-plate))] border-[color-mix(in_oklch,var(--primary)_35%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--panel-plate))] text-muted-foreground",
      )}
    >
      <span className={cn("uppercase tracking-caps", selected ? "text-primary-ink" : "text-[color-mix(in_oklch,var(--primary-ink)_80%,var(--muted-foreground))]")}>Global</span>
      <span className={cn("font-mono tabular-nums", selected ? "text-primary-ink" : "text-foreground")}>{ordinal.toLocaleString()}</span>
      {/* The mark FOLLOWS THE NUMBER IT QUALIFIES, as a row's pin follows its snapshot number. */}
      {selected && <StateMark following={following} className="normal-case tracking-normal" />}
      <span className={cn("ml-auto tabular-nums", selected ? "text-primary-ink" : "text-foreground-dim")}>{age}</span>
    </GroupPlate>
  );
}

