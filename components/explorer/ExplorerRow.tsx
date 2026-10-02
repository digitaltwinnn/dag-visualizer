"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { selectedRow, selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";

// THE EXPLORER ROW (design session 2026-09-26, `row-elements.html` A and `aligned.html`): ONE
// grid for every row of every explorer, so a bar starts at one x and a figure ends at one x in
// every row at every depth.
//
//   glyph 14px · name (a per-level width, 84px by default) · tag home (flex, takes the rest) ·
//   bar 36px (24px inside a level) · figure 40px (a level may widen it: a 4-decimal fee needs
//   48), 5px gaps — measured to the rail's 264px FLOOR
//   (`--rail-w`, a clamp() since 2026-10-02 — the name column grows with it): the row is 247px wide
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
// The ±6px OUTSET is the explorer rows' right-edge contract (once `ExploreRows`' `ROW_OUTSET`): a row
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
  /** The figure column's width for this level; 40 fits a count, a 4-decimal fee needs 48. */
  figureW?: number;
  /** The glyph column's width (see the level's `glyphW`). A wide glyph is LEFT-aligned. */
  glyphW?: number;
  /** The committed subject wears the wash, in its hue. */
  on?: boolean;
  hue?: string | null;
  /** Inside a level: one step quieter. */
  nested?: boolean;
  /** No row in this LEVEL carries a tag, so the bar takes the tag's flexible column (2026-09-28,
   *  user: "lots of space on their left side — any reason not to use it?"). Decided per level by
   *  the caller, never per row: bars only compare when every one starts at the same x. */
  wideBar?: boolean;
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

/** WHEN THE READER LAST ACTED — a pointer press or a key — so a commit can tell a gesture from a
 *  heartbeat. One passive listener pair for the whole document, installed on first use. */
let lastGestureAt = 0;
let gestureClock = false;
function recentGesture(): boolean {
  if (!gestureClock && typeof window !== "undefined") {
    gestureClock = true;
    const mark = () => { lastGestureAt = performance.now(); };
    window.addEventListener("pointerdown", mark, { passive: true, capture: true });
    window.addEventListener("keydown", mark, { passive: true, capture: true });
  }
  return performance.now() - lastGestureAt < 1500;
}

export default function ExplorerRow({
  glyph, name, nameMono, tag, bar, figure, hasFigure, nameW = 84, figureW = 40, glyphW = 14, on, hue, nested, wideBar, faint, title, onClick, pair, className,
}: ExplorerRowProps) {
  const el = useRef<HTMLButtonElement>(null);
  // SELECTION STAYS IN PLACE (design 2026-09-26, decision 12): the list never re-orders on a
  // commit; the committed row is scrolled into view instead — `nearest`, so a row already on
  // screen does not move the rail under the pointer.
  // …and only when a GESTURE committed it: the Snapshots explorer's `on` moves to the newest tick
  // on every live advance while following, and a scroll on each would yank the rail back under
  // the pointer every ~30s (review, 2026-09-26). A heartbeat is not a gesture.
  useEffect(() => {
    if (on && recentGesture()) el.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  // A ROW THAT LEAVES UNDER THE POINTER RELEASES ITS HOVER (rule 9's unmount backstop, in the one
  // row every explorer uses): clicking a row that opens a deeper level unmounts the row while it
  // is hovered, so its own mouseleave never fires and the pairing channel — a tick, a lane, a
  // country — stays lit in the scene and previews on the heading. Found live 2026-09-26 as the
  // PINNED pill wearing its dashed hover-preview after a click.
  // Keyboard focus previews on the same channel (`pair.onFocus`), and a focused row that
  // unmounts gets no reliable blur either — so focus counts as hovered here.
  const hovered = useRef(false);
  const leave = useRef(pair?.onMouseLeave);
  leave.current = pair?.onMouseLeave;
  useEffect(() => () => {
    if (hovered.current) leave.current?.();
  }, []);
  const nameCol = `calc(${nameW}px + (var(--rail-w) - 264px) * 0.6)`;
  // THE FIGURE COLUMN IS IN EM (2026-10-02): its width was measured for a 12.5px mono figure, and
  // the body step is fluid now — a 4-decimal fee in a 48px column truncated to "0.02…" at 14px.
  // The row's own font-size is `text-body` (below), so an em here IS the figure's size.
  const figureCol = `${(figureW / 12.5).toFixed(2)}em`;
  return (
    <button
      ref={el}
      type="button"
      title={title}
      aria-pressed={on ? true : undefined}
      onClick={onClick}
      className={cn(
        // `pr-2.5`, not the symmetric 6px (user, 2026-09-26): the figure — or the state dot where a
        // row ends in one — sat hard on the wash's right edge and wanted air.
        "nb-row group grid items-center gap-x-[5px] w-[calc(100%+12px)] -mx-1.5 pl-1.5 pr-2.5 py-1 rounded-[5px] text-left text-body",
        "border border-transparent bg-transparent cursor-pointer transition-[background] duration-150",
        "hover:bg-wash-hover",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        on && selectedRow(true),
        faint && !on && "opacity-65",
        pair?.paired && pair.className,
        className,
      )}
      style={{
        // The grid is data: a level's name width is a prop, so it cannot be a utility class.
        // Inside a level the bar is shorter still: the tag home there carries chips and providers,
        // and the bar is the accent, not the reading.
        // With no tags in the level the empty tag column collapses to 0 and the bar takes the
        // rest of the row, so its length reads at a glance instead of in a 36px sliver.
        // ⚠️ THE NAME COLUMN MAY SHRINK (user, 2026-09-29: with a snapshot open, the network rows
        // ran past the card's right edge). Its width was a fixed `nameW`, and a NESTED level loses
        // the tree indent from the row, so name + bar minimum + figure outgrew the card and the
        // grid overflowed instead of yielding. `minmax(0, nameW)` keeps nameW wherever it fits and
        // truncates the name (it already ellipsises) where it doesn't; the wide bar's floor is the
        // nested level's own 24px.
        // THE NAME COLUMN GROWS WITH THE RAIL (2026-10-02): `--rail-w` is a clamp() now, and the
        // name takes 60% of whatever the rail gained over its 264px floor — on a 1920px screen
        // that is +26px, enough to untruncate "Dor Technologies" — while the tag home takes the
        // rest. Stated against the token, so the grammar's one width stays the stylesheet's.
        gridTemplateColumns: hasFigure
          ? wideBar
            ? `${glyphW}px minmax(0,${nameCol}) 0px minmax(${nested ? 24 : 36}px,1fr) ${figureCol}`
            : `${glyphW}px minmax(0,${nameCol}) minmax(0,1fr) ${nested ? 24 : 36}px ${figureCol}`
          : `${glyphW}px minmax(0,1fr) auto`,
        ...(on ? selectionHue(hue) : undefined),
        ...pair?.style,
      }}
      onMouseEnter={() => {
        hovered.current = true;
        pair?.onMouseEnter();
      }}
      onMouseMove={pair?.onMouseMove}
      onMouseLeave={() => {
        hovered.current = false;
        pair?.onMouseLeave();
      }}
      onFocus={() => {
        hovered.current = true;
        pair?.onFocus();
      }}
      onBlur={() => {
        hovered.current = false;
        pair?.onBlur();
      }}
    >
      <span className={cn("flex items-center min-w-0", glyphW > 14 ? "justify-start" : "justify-center")}>{glyph}</span>
      <span
        className={cn(
          "min-w-0 truncate text-body",
          nested ? "text-foreground-dim" : "text-foreground",
          nameMono && "font-mono tabular-nums",
        )}
      >
        {name}
      </span>
      <span className="min-w-0 truncate flex items-center gap-1 text-label text-muted-foreground">{tag}</span>
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
