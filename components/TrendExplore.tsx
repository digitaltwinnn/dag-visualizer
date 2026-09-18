"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import ExplorerShell from "@/components/ExplorerShell";
import { ROW_OUTSET } from "@/components/ExploreRows";
import { IdentityDot } from "@/components/inspector/parts";
import { SelectedRowMark, selectedRow, selectionHue } from "@/components/selection";
import { MetricPicker, ScaleToggle, ScopeChip, SettingSwitch } from "@/components/trendPickers";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing } from "@/components/useSubjectPairing";
import { cn } from "@/lib/utils";
import { scopeEmptyCopy } from "@/src/data/trendScope";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { VISIBLE_PLANES, clampScroll } from "@/src/engine/domain/trendStack";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";

// HISTORY'S ONE TOOL CARD (2026-09-19) — the architectural sibling of HyperExplore and GeoExplore:
// each view's explorer breaks its subject down along the view's OWN dimension, and History's is
// the ROSTER OF LAYERS, one chart plane per network.
//
// It carries two things, in the order the card grammar puts them (the usage hint LEADS, then the
// instrument, then the browse list):
//
//   · THE CONTROLS this view has lacked. `trendMetric` is a PICKER — a committed choice about what
//     every chart draws — while `trendLayout` and `trendScale` are SETTINGS: the reader is not
//     doing something, they are saying how the charts should be drawn, and a setting reads as a
//     name plus its state (`SettingSwitch`, whose header carries the full reasoning). None of them
//     is a selection, so they write their setters directly; `selectionBoundary.test.ts`'s scope
//     note says why the metric, the layout and the scroll stay outside the decision table while
//     the PLANE FOCUS is in it — they are how the reader wants the stack drawn, not what it is
//     about.
//
//   · THE LAYERS LIST. One row per ranked network: mark, name, its last measured reading. A row is
//     a BROWSE TARGET and nothing more (the explorer row rule — the prose that explains a subject
//     belongs to that subject's right-rail card). Clicking one applies `trendPlaneActions` through
//     the one executor, which is the SAME builder the plane's own header strip runs (rule 2): a row
//     click and the equivalent plane click cannot drift.
//
// ⚠️ THE ROSTER IS NOT COMPUTED HERE. `useTrendRoster` is the one pass the planes, this list and
// the cursor card all read, so a row can never name a plane that is not in the stack or quote a
// number no chart on screen agrees with. This card reads `trendIds` NOWHERE — that channel is
// React's publish to the engine and is write-only from here (`publishChannelBoundary.test.ts`).
//
// ⚠️ HOVER PAIRS, IT NEVER COMMITS (convention 9). A row hovers `hoverFilter` — the app's own
// network channel, which every other surface already pairs a network on — so hovering a row lifts
// its plane to full opacity in the scene and hovering a plane's header washes this row. No new
// store channel, and nothing about the pose moves: a preview that re-staggered the stack would
// read as a commit.

export default function TrendExplore({ defaultCollapsed }: { defaultCollapsed?: boolean } = {}) {
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const layout = useStore((s) => s.trendLayout);
  const scale = useStore((s) => s.trendScale);
  const scroll = useStore((s) => s.trendScroll);
  const focus = useStore((s) => s.trendFocus);
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const setTrendMetric = useStore((s) => s.setTrendMetric);
  const setTrendLayout = useStore((s) => s.setTrendLayout);
  const setTrendScale = useStore((s) => s.setTrendScale);
  const setTrendScroll = useStore((s) => s.setTrendScroll);

  const roster = useTrendRoster(useTrendsSlice(windowId, range), filter, metric);
  const { ranked, rows, unit, format } = roster;
  const empty = scopeEmptyCopy(roster.scope, "view");

  // THE PAGER'S WINDOW, clamped by the stack's OWN rule (`clampScroll`, domain/trendStack.ts) —
  // the control and the geometry must agree about where the ends are, or a chevron dims a step
  // early or offers a step the stack will refuse.
  const start = clampScroll(ranked.length, scroll);
  const last = Math.min(start + VISIBLE_PLANES, ranked.length);
  const maxScroll = Math.max(0, ranked.length - VISIBLE_PLANES);

  return (
    <ExplorerShell
      defaultCollapsed={defaultCollapsed}
      id="trendexplore"
      // The tool card says what you BROWSE (the naming rule): the planes, which the About card
      // above and the view's own copy both call LAYERS.
      title="Layers over time"
      // The shell's hint shape: what the card holds and its ordering, then what the click does.
      // "Open one for…" is the other explorers' second half and would be a lie here — a layer row
      // has no children, it brings its plane forward.
      hint={
        empty ? null : "Every network's own chart, busiest first. Pick one to bring its plane to the front."
      }
      onLeave={() => setHoverFilter(null)}
    >
      {/* ── THE CONTROLS ──────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <MetricPicker metric={metric} onPick={setTrendMetric} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <SettingSwitch
            label="Align to front"
            on={layout === "flat"}
            onChange={(on) => setTrendLayout(on ? "flat" : "stack")}
            // A LAYOUT, not a camera move and not a selection (store `trendLayout`) — the words
            // say what the planes do, so nothing implies the view will fly anywhere.
            title={
              layout === "flat"
                ? "The planes sit in one flat column, all at the same size. Switch off to send them back into depth."
                : "The planes recede into depth, nearest first. Switch on to line them up facing you."
            }
          />
          {/* Only where there is a COLUMN to compare: with one network in scope there is nothing
              for a shared ceiling to be shared with. */}
          {ranked.length > 1 && (
            <ScaleToggle shared={scale === "shared"} onChange={(on) => setTrendScale(on ? "shared" : "own")} />
          )}
        </div>
      </div>

      {/* The resting division between the INSTRUMENT and the LIST (LedgerPanel's rule): one weight
          for anything simply THERE, inset by `mx-[2px]` so it shares the card head's own 16px
          edge — the body's padding is 14px, and 2px is what lines the two up. */}
      <div className="border-b border-border mx-[2px] mt-2.5 mb-2" aria-hidden />

      {/* ── THE SCOPE, IN WORDS ───────────────────────────────────────────────────────────── */}
      <ScopeChip filter={filter} className="self-start mb-2" />

      {/* ── THE LIST ──────────────────────────────────────────────────────────────────────── */}
      {empty ? (
        // No fabricated rows (rule 10): the two commits the trends store keeps nothing for say so
        // in the same sentences the stack and the document say them in.
        <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">
          {empty.fact} {empty.route}
        </p>
      ) : ranked.length === 0 ? (
        <p className="mt-1 mx-1 mb-1.5 text-label text-muted-foreground">Waiting for the measured history…</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {ranked.map((id) => {
            const row = rows.get(id);
            if (!row) return null;
            const on = focus === id;
            const pair = subjectPairing(hoverFilter, id, setHoverFilter, row.hue);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                // ONE write path (rule 2): the same builder the plane's header strip runs, applied
                // through the same executor — so a row click and a plane click cannot drift, the
                // re-click release included.
                onClick={() => applyClickActions(trendPlaneActions(id, focus))}
                title={`${row.name} · ${row.last != null ? `${format(row.last)}${unit ? ` ${unit}` : ""}` : NO_READING}`}
                className={cn(
                  "nb-row group flex items-center gap-2.5 text-left text-body border border-transparent bg-transparent cursor-pointer py-[5px] rounded-sm transition-[background] duration-150",
                  ROW_OUTSET,
                  "pr-7 relative",
                  "hover:bg-wash-hover",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                  // FULL strength, unlike the drill-down explorers' ancestor rule: the focused
                  // plane is the front of the stack whatever else is committed — the cursor is a
                  // reading ACROSS the roster, not a finer rung under one network.
                  on && selectedRow(true),
                  pair.paired && pair.className,
                )}
                style={{ ...(on ? selectionHue(row.hue) : undefined), ...pair.style }}
                onMouseEnter={pair.onMouseEnter}
                onMouseMove={pair.onMouseMove}
                onMouseLeave={pair.onMouseLeave}
                onFocus={pair.onFocus}
                onBlur={pair.onBlur}
              >
                {/* Identity is NAMED, never colour alone — the dot is the second channel. */}
                <IdentityDot hue={row.hue} />
                <span className="flex-1 min-w-0 text-body text-foreground-dim whitespace-nowrap overflow-hidden text-ellipsis">
                  {row.name}
                </span>
                {/* MONO, like every count and reading in this app (/design's sans/mono split). An
                    unmeasured chain says so in words rather than showing a 0. */}
                <span
                  className={cn(
                    "flex-none text-right font-mono text-body tabular-nums",
                    row.last != null ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {row.last != null ? format(row.last) : NO_READING}
                </span>
                {on && <SelectedRowMark className="absolute right-2 flex-none" hue={row.hue} />}
              </button>
            );
          })}

          {/* THE PAGER — ABSENT unless there is something to navigate (the rail plank's own rule:
              permanently dead chrome is not a control), and an EXHAUSTED direction is inactive
              rather than gone, so the row never re-composes at the ends. It cannot be exercised on
              mainnet today: the live roster is exactly `VISIBLE_PLANES`. */}
          {ranked.length > VISIBLE_PLANES && (
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={start <= 0}
                aria-label="Show the planes before these"
                onClick={() => setTrendScroll(clampScroll(ranked.length, start - 1))}
                className="inline-flex items-center justify-center size-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-wash-hover disabled:opacity-35 disabled:pointer-events-none"
              >
                <ChevronLeft aria-hidden className="size-3.5" />
              </button>
              <span className="font-mono text-micro tabular-nums text-muted-foreground">
                {start + 1}–{last} of {ranked.length}
              </span>
              <button
                type="button"
                disabled={start >= maxScroll}
                aria-label="Show the planes after these"
                onClick={() => setTrendScroll(clampScroll(ranked.length, start + 1))}
                className="inline-flex items-center justify-center size-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-wash-hover disabled:opacity-35 disabled:pointer-events-none"
              >
                <ChevronRight aria-hidden className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </ExplorerShell>
  );
}
