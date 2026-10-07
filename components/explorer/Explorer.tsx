"use client";

import { useCallback, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import ExplorerShell from "@/components/ExplorerShell";
import ExplorerHeading, { MeasureMenu, type MeasureControl } from "@/components/explorer/ExplorerHeading";
import ExplorerPath, { type Crumb } from "@/components/explorer/ExplorerPath";
import ExplorerRow from "@/components/explorer/ExplorerRow";
import { useStore } from "@/src/store/store";
import { openRailCard } from "@/components/railOpen";
import { levelsForBox } from "@/components/explorer/boxLevel";
import { cn } from "@/lib/utils";

// THE EXPLORER — one component, four views (design session 2026-09-26; the agreed screens and
// their README live in `docs/superpowers/design/2026-09-26-explorer-card/`). Every view's explorer
// is a DESCRIPTION handed to this component, never a layout of its own (user: "every view will
// have an explorer, so I'd like to keep its behaviour consistent by design rather than
// copy-paste"). The description is the STACK of levels currently open, root first; the last level
// is the one on screen and the ones before it are the crumbs above it. From that one structure this
// component renders, in order:
//
//   the shell     · title and hint (no scope mark: the top bar's filter already names the
//                   committed network and is the one place to clear it — user, 2026-09-26)
//   the heading   · the hairline row: the view's one setting, then the figure column's heading —
//                   a control when the level has several measures, a label when one, nothing
//                   when none (`ExplorerHeading`)
//   the path      · the house, then the crumbs, one per opened level, with the level's one clause
//                   of meaning snug beneath them as the path's caption (`ExplorerPath`)
//   the rows      · one grid, glyph · name · tag home · bar · figure (`ExplorerRow`); no ✓, no
//                   chevron — the wash is the selection and the row is the control
//   the pager     · where a level pages
//
// What a view decides, and only this: which levels are open (read off the STORE's committed rungs,
// never local open/closed state, so the scene, the rail and this card land the same level — and
// cut back to the OPEN card's children here, `levelsForBox`), what
// each row is and what its click commits (through the one executor — rule 2), what each level
// measures, and the words. What a view can NOT decide is any of the layout, which is the point.

export interface ExplorerRowSpec {
  key: string;
  /** The identity glyph: a hue dot, a country code, or nothing. */
  glyph?: ReactNode;
  name: ReactNode;
  nameMono?: boolean;
  /** Whatever else the row carries: chips, a provider, a hash, a state. */
  tag?: ReactNode;
  /** The figure's share of the level's busiest row, 0..1 — the bar. Omit for no bar. */
  share?: number;
  /** The bar's and the wash's colour. */
  hue?: string | null;
  figure?: ReactNode;
  /** The committed subject: wears the wash. */
  on?: boolean;
  /** The rail CARD this row's subject boxes (a slot id: "country", "node", "metaSnap" …). With it,
   *  a click on the COMMITTED row whose card is not the box brings that card back to the front
   *  instead of deselecting — or opens it when no card is the box (user, 2026-10-04: "clicking a row in the explorer should open the
   *  related card; happens for some but not for all") — the deselect stays the click on a row whose
   *  card is already open. */
  rung?: string;
  /** A real-but-empty subject: present, dimmed. */
  faint?: boolean;
  title?: string;
  onClick?: () => void;
  /** The scene↔HUD hover pairing (`useSubjectPairing.subjectPairing`), when the subject has one. */
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
}

export interface ExplorerLevelSpec {
  key: string;
  /** The rail card (slot id) whose subject this level lists the children of — how the Explorer
   *  shows the OPEN card's children (`levelsForBox`). Absent on a root with no card above it. */
  parent?: string;
  /** How this level appears as a crumb once a deeper level is on screen, and the release that
   *  brings the reader back to it — every rung finer than this one goes, through the executor.
   *  The ROOT's crumb is the house glyph (the title names the root; the house releases everything). */
  crumb: { label: ReactNode; title?: string; onRelease?: () => void };
  /** What this level contains, in one muted clause under the path — absent at the root, whose
   *  meaning is the card's title and hint. */
  meaning?: string;
  /** The figure column's heading: a control, a single static measure, or null for no figure. */
  measure: MeasureControl | { label: string } | null;
  /** Whether this level's rows carry a figure (drives the grid). */
  hasFigure: boolean;
  /** The name column's width for this level; short labels give the tag home the room. */
  nameW?: number;
  /** The figure column's width for this level (40 fits a count; a 4-decimal fee needs 48). */
  figureW?: number;
  /** The glyph column's width for this level — 14px for a dot or a country code; a node level
   *  widens it for the network TICKER that leads its rows (`NODE_GLYPH_W`). */
  glyphW?: number;
  rows: ExplorerRowSpec[];
  /** A row PINNED above the list and set apart by a hairline — what the rows are read against
   *  (History's DAG row, the networks' total), never ranked among them. It shares the list's
   *  columns, and carries no bar: a bar there would be a share of itself. */
  lead?: ExplorerRowSpec;
  /** What to say when there are no rows — an honest instrument state, never fabricated rows. */
  empty?: ReactNode;
  /** The view's one setting, shown on the heading row (Same scale, Live). */
  setting?: ReactNode;
  /** A pager under the rows, where the level pages. */
  pager?: ReactNode;
}

export interface ExplorerProps {
  id: string;
  title: string;
  hint: ReactNode | null;
  /** The open levels, root first; the last is on screen. */
  levels: readonly ExplorerLevelSpec[];
  onLeave?: () => void;
  defaultCollapsed?: boolean;
  /** The card head's right-aligned slot — a CARD-level state that holds on every level (the
   *  snapshot explorer's LIVE/PINNED, since 2026-09-28), as opposed to a level's own `setting`. */
  aside?: ReactNode;
}

/** A committed row's click: re-box its card when another card is the box (the accordion's own
 *  expand — single-open, a quiet navigation, the camera following the box), else run the row's own
 *  click, which for a committed row is the deselect. View state only — no selection is written. */
function openOrToggle(rung: string, click: () => void): void {
  const boxed = useStore.getState().boxedCard;
  if (boxed === rung) return click();
  openRailCard(rung, [boxed]);
}

export default function Explorer({ id, title, hint, levels: selected, onLeave, defaultCollapsed, aside }: ExplorerProps) {
  // The view hands every level its selection opens; the OPEN CARD decides how deep the path stands.
  const boxed = useStore((s) => s.boxedCard);
  const levels = levelsForBox(selected, boxed);
  const current = levels[levels.length - 1];
  const nested = levels.length > 1;
  // THE TICKER COLUMN FITS ITS LIST (user, 2026-10-03: "a lot of space between the ticker and the
  // node id … grow the ticker part only when it needs to be larger"). A node level's `glyphW` is
  // the room a co-located PAIR needs ("DAG UP", or one long "USDC.dag") — and every list of plain
  // three-letter tickers held that width open beside each id. Measured rather than estimated: the
  // face is proportional ("DOR" is 26px, "USDC.dag" 56) and the type is fluid, so the list's own
  // glyph cells are read after layout and the widest sets `--glyph-w`, capped by the level's
  // `glyphW` (past it the ticker truncates, as it always has). A callback ref, re-run whenever the
  // rows change; the rows read the variable with `glyphW` as its fallback, so the first paint and
  // the server render keep the old width rather than collapsing.
  const cap = current?.glyphW ?? 14;
  const rowKeys = (current?.lead ? `${current.lead.key}||` : "") + (current?.rows.map((r) => r.key).join("|") ?? "");
  const figKey = (current?.lead && (typeof current.lead.figure === "string" || typeof current.lead.figure === "number") ? `${String(current.lead.figure).length}:` : "") + (current?.rows.map((r) => (typeof r.figure === "string" || typeof r.figure === "number" ? String(r.figure).length : 0)).join(",") ?? "");
  const listEl = useRef<HTMLDivElement | null>(null);
  const fitGlyphs = useCallback((el: HTMLDivElement | null) => { listEl.current = el; }, []);
  useLayoutEffect(() => {
    const el = listEl.current;
    if (!el) return;
    const fit = () => {
      let w = 0;
      for (const g of el.querySelectorAll<HTMLElement>("[data-glyph]")) {
        const inner = g.firstElementChild as HTMLElement | null;
        if (inner) w = Math.max(w, inner.scrollWidth);
      }
      if (w > 0) el.style.setProperty("--glyph-w", `${Math.min(cap, w + 1)}px`);
      else el.style.removeProperty("--glyph-w");
      // The FIGURE column, the same way (ExplorerRow's `figureCol`): as wide as the widest figure
      // printed, capped by the level's own width in the row's template.
      let f = 0;
      for (const g of el.querySelectorAll<HTMLElement>("[data-fit-fig]")) f = Math.max(f, g.getBoundingClientRect().width);
      const next = f > 0 ? `${Math.ceil(f) + 1}px` : "";
      if (el.style.getPropertyValue("--fig-w") !== next) {
        if (next) el.style.setProperty("--fig-w", next);
        else el.style.removeProperty("--fig-w");
      }
    };
    fit();
    // The type scale is fluid, so a resize changes what the tickers measure.
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  // `figKey`: a figure that gains a digit (9 → 10) changes what the column must hold.
  }, [rowKeys, cap, figKey]);
  // The crumbs: the ROOT as the house glyph (its word is the accessible name — the card's title
  // already says it, and the word cost the width the crumbs need; user, 2026-09-26, two rounds),
  // then every OPENED level, the current one last as the page. THE PATH IS ALWAYS DRAWN (user,
  // 2026-10-07 — "where there is no filter, the whole control is missing … shouldn't we indicate
  // that there is a control there always?"): at the root it is the one filled step, house and word,
  // so the control is in place before the first drill rather than appearing with it.
  const crumbs: Crumb[] = levels.map((l, i) => ({
    key: l.key,
    label: l.crumb.label,
    title: l.crumb.title ?? (typeof l.crumb.label === "string" ? l.crumb.label : undefined),
    root: i === 0,
    ...(i < levels.length - 1 ? { onSelect: l.crumb.onRelease } : {}),
  }));
  const measure: MeasureControl | null =
    current && current.measure
      ? "options" in current.measure
        ? current.measure
        : { options: [{ id: "one", label: current.measure.label }], value: "one", onPick: () => {} }
      : null;
  return (
    <ExplorerShell
      id={id}
      title={title}
      // THE HINT RIDES THE HEADING ROW (user, 2026-09-28: "can the hint be on the same line as the
      // dropdown? No need for 2 rows") — and since 2026-10-02 (A2) the dropdown rides the HEAD,
      // so the hint has the row's full width: at 307px the control left it 199px, three lines
      // in three of four views. The shell's own hint line stays only for the no-level case.
      hint={current ? null : hint}
      onLeave={onLeave}
      defaultCollapsed={defaultCollapsed}
      // The card head's aside: a view's card-level state, then THE MEASURE CONTROL (A2) — the
      // figure column's heading, right of the title where the eye finds the list's one setting.
      aside={
        aside != null || measure ? (
          <span className="inline-flex items-center gap-1.5">
            {aside}
            <MeasureMenu measure={measure} />
          </span>
        ) : undefined
      }
    >
      {current && (
        <>
          <ExplorerHeading hint={hint} setting={current.setting} />
          <ExplorerPath crumbs={crumbs} hint={current.meaning} />
          {/* Inside a level the list HANGS FROM THE PATH on a spine in the path's own accent (user,
              2026-09-26: "a vertical line on the left side to show that the section underneath
              belongs to it"). The spine starts at the plate's left edge, under the house step. */}
          <div className={cn("flex flex-col", nested && "mt-1.5 -ml-0.5 border-l-2 border-wash-strong pl-2.5")}>
            {current.rows.length === 0 ? (
              current.empty != null ? (
                <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">{current.empty}</p>
              ) : null
            ) : (
              <div ref={fitGlyphs} className="flex flex-col gap-0.5">
                {current.lead && (
                  <div className="mb-1 border-b border-border pb-1">
                    <ExplorerRow
                      hasFigure={current.hasFigure}
                      nameW={current.nameW}
                      figureW={current.figureW}
                      glyphW={current.glyphW}
                      nested={nested}
                      plain
                      glyph={current.lead.glyph}
                      name={current.lead.name}
                      tag={current.lead.tag}
                      figure={current.lead.figure}
                      on={current.lead.on}
                      hue={current.lead.hue}
                      faint={current.lead.faint}
                      title={current.lead.title}
                      onClick={current.lead.onClick}
                      pair={current.lead.pair}
                    />
                  </div>
                )}
                {current.rows.map((r) => (
                  <ExplorerRow
                    key={r.key}
                    hasFigure={current.hasFigure}
                    nameW={current.nameW}
                    figureW={current.figureW}
                    glyphW={current.glyphW}
                    nested={nested}
                    wideBar={!current.rows.some((x) => x.tag != null && x.tag !== false)}
                    glyph={r.glyph}
                    name={r.name}
                    nameMono={r.nameMono}
                    tag={r.tag}
                    bar={r.share != null && r.hue ? { share: r.share, hue: r.hue } : undefined}
                    figure={r.figure}
                    on={r.on}
                    hue={r.hue}
                    faint={r.faint}
                    title={r.title}
                    onClick={r.on && r.rung && r.onClick ? () => openOrToggle(r.rung!, r.onClick!) : r.onClick}
                    pair={r.pair}
                  />
                ))}
              </div>
            )}
            {current.pager}
          </div>
        </>
      )}
    </ExplorerShell>
  );
}
