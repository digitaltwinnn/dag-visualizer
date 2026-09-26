"use client";

import type { CSSProperties, ReactNode } from "react";

import ExplorerShell from "@/components/ExplorerShell";
import ExplorerHeading, { type MeasureControl } from "@/components/explorer/ExplorerHeading";
import ExplorerPath, { type Crumb } from "@/components/explorer/ExplorerPath";
import ExplorerRow from "@/components/explorer/ExplorerRow";
import ScopeMark from "@/components/explorer/ScopeMark";

// THE EXPLORER — one component, four views (design session 2026-09-26; the agreed screens and
// their README live in `docs/superpowers/design/2026-09-26-explorer-card/`). Every view's explorer
// is a DESCRIPTION handed to this component, never a layout of its own (user: "every view will
// have an explorer, so I'd like to keep its behaviour consistent by design rather than
// copy-paste"). The description is the STACK of levels currently open, root first; the last level
// is the one on screen and the ones before it are the crumbs above it. From that one structure this
// component renders, in order:
//
//   the shell     · title, hint, the committed scope as its ticker in the head (`ScopeMark`)
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
// never local open/closed state, so the scene, the rail and this card land the same level), what
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
  /** How this level appears as a crumb once a deeper level is on screen, and the release that
   *  brings the reader back to it — every rung finer than this one goes, through the executor.
   *  The ROOT's crumb is never rendered (the title names the root; the scope dot's × returns to it). */
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
  rows: ExplorerRowSpec[];
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
  /** The committed network's hue, ticker and name, with the release, for the head's mark. */
  scope?: { hue: string; ticker: string; label: string; onRelease: () => void } | null;
  /** The open levels, root first; the last is on screen. */
  levels: readonly ExplorerLevelSpec[];
  onLeave?: () => void;
  defaultCollapsed?: boolean;
}

export default function Explorer({ id, title, hint, scope, levels, onLeave, defaultCollapsed }: ExplorerProps) {
  const current = levels[levels.length - 1];
  const nested = levels.length > 1;
  // The crumbs: the ROOT as the house glyph (its word is the accessible name — the card's title
  // already says it, and the word cost the width the crumbs need; user, 2026-09-26, two rounds),
  // then every OPENED level, the current one last as the page.
  const crumbs: Crumb[] = nested
    ? levels.map((l, i) => ({
        key: l.key,
        label: l.crumb.label,
        title: l.crumb.title ?? (typeof l.crumb.label === "string" ? l.crumb.label : undefined),
        root: i === 0,
        ...(i < levels.length - 1 ? { onSelect: l.crumb.onRelease } : {}),
      }))
    : [];
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
      hint={hint}
      scope={scope ? <ScopeMark hue={scope.hue} ticker={scope.ticker} label={scope.label} onRelease={scope.onRelease} /> : undefined}
      onLeave={onLeave}
      defaultCollapsed={defaultCollapsed}
    >
      {current && (
        <>
          <ExplorerHeading setting={current.setting} measure={measure} />
          <ExplorerPath crumbs={crumbs} hint={current.meaning} />
          {current.rows.length === 0 ? (
            current.empty != null ? (
              <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">{current.empty}</p>
            ) : null
          ) : (
            <div className="flex flex-col gap-0.5">
              {current.rows.map((r) => (
                <ExplorerRow
                  key={r.key}
                  hasFigure={current.hasFigure}
                  nameW={current.nameW}
                  figureW={current.figureW}
                  nested={nested}
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
                  onClick={r.onClick}
                  pair={r.pair}
                />
              ))}
            </div>
          )}
          {current.pager}
        </>
      )}
    </ExplorerShell>
  );
}
