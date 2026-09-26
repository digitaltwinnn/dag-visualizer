"use client";

import type { CSSProperties, ReactNode } from "react";

import { selectedRow, selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";

// THE EXPLORER ROW (design session 2026-09-26, `row-elements.html` A and `aligned.html`): ONE
// grid for every row of every explorer, so a bar starts at one x and a figure ends at one x in
// every row at every depth.
//
//   glyph 14px · name (a per-level width, 84px by default) · tag home (flex, takes the rest) ·
//   bar 36px (24px inside a level) · figure 40px, 5px gaps — measured to the rail's 264px
//   (`--rail-w`): the row is 247px wide
//   with its outset, so the fixed columns leave the tag home ~45px at the network level and ~70px
//   where a level narrows its name (compositions are one word). The reference drawings were made
//   at ~360px; the proportions are theirs, the numbers are the rail's.
//
// The bar is a SHORT ACCENT, never flex ("the horizontal bars are just a nice visual effect" —
// user); the tag home is where every extra a row can carry lives — role chips, a provider, a
// hash, a state — and it stays empty rather than shifting anything when a row has none. The
// grid is PER LEVEL, not per card: a level whose rows carry no figure (nodes, signers) drops the
// bar and figure columns entirely and the name widens — an id shows a longer middle — while the
// right edge stays the card's edge. `hasFigure` is that switch, and every row of a level passes
// the same value.
//
// Type (T1, `type-systems.html`): name 12.5px regular full ink, figure 12.5px mono REGULAR
// (the rail's Fact rows are regular; only a total is bold) right-aligned and tabular, tags
// 10.5px muted. Inside a level (`nested`) the name and figure drop to dim ink so the parent
// row stays the loudest thing. No ✓ and no chevron (`quieter.html` A): the WASH is the
// selection, and the row is the control — hover washes it, a click opens or commits it.
//
// The ±6px OUTSET is the explorer rows' right-edge contract (ExploreRows' `ROW_OUTSET`): a row
// reaches the card's inner edge on both sides so its wash box spans the column edge to edge.

export interface ExplorerRowProps {
  /** The identity glyph: a hue dot, a country code, or nothing. */
  glyph?: ReactNode;
  name: ReactNode;
  /** Set the name in the data face (ordinals, ids, hashes). */
  nameMono?: boolean;
  /** Whatever else the row carries — chips, a provider, a hash, a state. */
  tag?: ReactNode;
  /** The figure's share of the level's busiest row, 0..1, and the bar's colour. */
  bar?: { share: number; hue: string };
  /** The figure, already formatted. */
  figure?: ReactNode;
  /** Whether THIS LEVEL's rows carry a figure — decides the grid, not this row's `figure`. */
  hasFigure: boolean;
  /** The name column's width for this level (px). Short labels give the tag home the room. */
  nameW?: number;
  /** The committed subject wears the wash, in its hue. */
  on?: boolean;
  hue?: string | null;
  /** Inside a level: one step quieter. */
  nested?: boolean;
  /** A real-but-empty subject (a 0-node network): present, dimmed. */
  faint?: boolean;
  title?: string;
  onClick?: () => void;
  /** The hover pairing's classes and handlers (`useSubjectPairing.subjectPairing`). */
  pair?: {
    paired: boolean;
    className: string;
    style: CSSProperties | undefined;
    onMouseEnter: () => void;
    onMouseMove: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  className?: string;
}

export default function ExplorerRow({
  glyph, name, nameMono, tag, bar, figure, hasFigure, nameW = 84, on, hue, nested, faint, title, onClick, pair, className,
}: ExplorerRowProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on ? true : undefined}
      onClick={onClick}
      className={cn(
        "nb-row group grid items-center gap-x-[5px] w-[calc(100%+12px)] -mx-1.5 px-1.5 py-1 rounded-[5px] text-left",
        "border border-transparent bg-transparent cursor-pointer transition-[background] duration-150",
        "hover:bg-wash-hover",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        on && selectedRow(true),
        faint && !on && "opacity-45",
        pair?.paired && pair.className,
        className,
      )}
      style={{
        // The grid is data: a level's name width is a prop, so it cannot be a utility class.
        // Inside a level the bar is shorter still: the tag home there carries chips and providers,
        // and the bar is the accent, not the reading.
        gridTemplateColumns: hasFigure ? `14px ${nameW}px minmax(0,1fr) ${nested ? 24 : 36}px 40px` : "14px minmax(0,1fr) auto",
        ...(on ? selectionHue(hue) : undefined),
        ...pair?.style,
      }}
      onMouseEnter={pair?.onMouseEnter}
      onMouseMove={pair?.onMouseMove}
      onMouseLeave={pair?.onMouseLeave}
      onFocus={pair?.onFocus}
      onBlur={pair?.onBlur}
    >
      <span className="flex items-center justify-center">{glyph}</span>
      <span
        className={cn(
          "min-w-0 truncate text-body",
          nested ? "text-foreground-dim" : "text-foreground",
          nameMono && "font-mono tabular-nums",
        )}
      >
        {name}
      </span>
      <span className="min-w-0 truncate flex items-center gap-1 text-micro text-muted-foreground">{tag}</span>
      {hasFigure && (
        <>
          <span className="h-[5px] rounded-[3px] bg-wash-faint overflow-hidden">
            {bar && (
              <span
                className="block h-full rounded-[3px]"
                style={{ width: `${Math.round(Math.max(0, Math.min(1, bar.share)) * 100)}%`, background: bar.hue, opacity: nested ? 0.6 : 1 }}
              />
            )}
          </span>
          <span className={cn("min-w-0 truncate text-right font-mono text-body tabular-nums", nested ? "text-foreground-dim" : "text-foreground")}>
            {figure}
          </span>
        </>
      )}
    </button>
  );
}
