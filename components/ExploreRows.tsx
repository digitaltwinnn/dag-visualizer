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

// A single-open DISCLOSURE row (geo's country-cohort, hyper's composition group): the button
// chrome + the trailing affordance (the ✓ when it holds the selection while collapsed, else the
// hover-revealed chevron that rotates when open). `children` = the row's own middle content
// (which should end with an `ml-auto` count so it and the affordance sit right).
export function DisclosureRow({
  open,
  holdsSel,
  title,
  onToggle,
  onHoverEnter,
  onHoverLeave,
  children,
}: {
  open: boolean;
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
        "group/disc relative flex items-center gap-2 w-[calc(100%+6px)] py-[5px] pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
        "hover:bg-wash-hover hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
      )}
      aria-expanded={open}
      title={title}
      onClick={onToggle}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {children}
      {holdsSel && !open ? (
        <SelectedRowMark className="flex-none" />
      ) : (
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 flex-none transition-transform duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover/disc:opacity-100 group-focus-visible/disc:opacity-100 [@media(hover:none)]:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
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
