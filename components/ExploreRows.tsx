"use client";

// Shared explorer ROW primitives — the chrome both the Geography and Hypergraph explorers
// render identically (extracted 2026-07-12; the two files had ~identical row JSX). Each owns
// only the visual chrome; the parent supplies behaviour via callbacks + content via children,
// so the two explorers can't drift on row styling.
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SELECTED_ROW, SelectedRowMark } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { shortHash, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import type { NodeRow } from "@/src/data/types";

// The ONE disclosure-chevron affordance, used by every explorer row that expands/collapses
// (extracted 2026-07-18 from DisclosureRow, its original/canonical treatment — a ledger fix had
// hand-copied it and dropped the hover-reveal, the exact drift a shared component prevents):
// invisible at rest, fades in on row hover/focus (always visible on touch, no hover to reveal
// it), rotates 90° while open. CONTRACT: the consuming row must carry the (unscoped) `group`
// class itself — `group-hover`/`group-focus-visible` below target it — and reserve this
// component's `flex-none` slot in its trailing column (e.g. next to a count) so the row's layout
// doesn't shift when the chevron is invisible.
export function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-3.5 flex-none transition-transform duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        open && "rotate-90 opacity-100",
      )}
    />
  );
}

// A single-open DISCLOSURE row (geo's country-cohort, hyper's composition group): the button
// chrome + the trailing affordance (the ✓ when it holds the selection while collapsed, else the
// hover-revealed chevron that rotates when open). `children` = the row's own middle content
// (which should end with an `ml-auto` count so it and the affordance sit right).
// `on` = the row itself is a COMMITTED selection (geo's cohort rung, the country-row idiom) —
// wears SELECTED_ROW + the ✓ unconditionally (it wins over `holdsSel`, the collapsed-holds-a-
// selected-node case, when both are true). Optional: hyper's composition groups are disclosure-
// only and never pass it.
export function DisclosureRow({
  open,
  on,
  holdsSel,
  title,
  onToggle,
  onHoverEnter,
  onHoverLeave,
  children,
}: {
  open: boolean;
  on?: boolean;
  holdsSel: boolean;
  title: string;
  onToggle: () => void;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex items-center gap-2 w-[calc(100%+6px)] py-[5px] pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
        "hover:bg-wash-hover hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        on && SELECTED_ROW,
      )}
      aria-expanded={open}
      title={title}
      onClick={onToggle}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {children}
      {on || (holdsSel && !open) ? (
        <SelectedRowMark className="flex-none" />
      ) : (
        <DisclosureChevron open={open} />
      )}
    </button>
  );
}

// The leaf PICKER row — "Node <id>" — the terminal subject in both explorers. Computes its own
// identity hue + the scene↔row hover pairing (same in both); the parent supplies the select +
// an optional extra hover effect (geo also previews the node's country border).
export function NodePickerRow({
  row,
  selected,
  hoverNodeId,
  setHoverNodeId,
  onSelect,
  onHoverEnter,
}: {
  row: NodeRow;
  selected: boolean;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
  onSelect: () => void;
  onHoverEnter?: () => void;
}) {
  const hoverKey = hoverKeyOf(row.pick);
  const hue = row.pick.kind === "metanode" && row.pick.meta ? identityHudHex(row.pick.meta.id) : CORE_HEX;
  const pair = subjectPairing(hoverNodeId, hoverKey, setHoverNodeId, hue);
  return (
    <button
      className={cn(
        "nb-row relative flex items-center gap-2 w-full py-1 pl-2 pr-7 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
        "hover:bg-wash-hover hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        selected && SELECTED_ROW,
        pair.paired && pair.className,
      )}
      style={pair.style}
      title={`${row.label} · ${row.state ?? "—"}`}
      onClick={onSelect}
      onMouseEnter={() => {
        pair.onMouseEnter();
        onHoverEnter?.();
      }}
    >
      {/* Just "Node" + the mono id — the row is a pure picker; the parent row carries the
          composition / place / provider. */}
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className="flex-none text-label">Node</span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-label text-muted-foreground">
          {row.id ? shortHash(row.id) : row.label}
        </span>
      </span>
      {selected && <SelectedRowMark className="absolute right-2" />}
    </button>
  );
}
