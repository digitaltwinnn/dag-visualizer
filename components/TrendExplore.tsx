"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import Explorer, { type ExplorerLevelSpec } from "@/components/explorer/Explorer";
import { IdentityDot } from "@/components/inspector/parts";
import { ScaleToggle } from "@/components/trendPickers";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { scopeEmptyCopy } from "@/src/data/trendScope";
import { METRIC_LABELS, METRIC_ORDER, metricUnit } from "@/src/data/trendSeries";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { VISIBLE_PLANES, clampScroll, pagerVisible } from "@/src/engine/domain/trendStack";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore, type TrendMetric } from "@/src/store/store";

// HISTORY'S EXPLORER — a DESCRIPTION for the one `Explorer` component (design session 2026-09-26;
// read `docs/superpowers/design/2026-09-26-explorer-card/README.md` first). The view breaks its
// subject down along its OWN dimension, the ROSTER OF LAYERS — one chart plane per network — so
// the description is ONE level: the ranked networks, busiest first, each with its last measured
// reading. A row has no children; clicking it brings its plane to the front.
//
// What the description decides, and only this:
//
//   · THE HEADING is the measure every card is on — the trend METRIC, the heading control's list
//     (`METRIC_ORDER`, with each measure's unit at the current cadence). It is a view-level
//     setting because every card steps together (a stack whose planes showed different measures
//     would stop being a comparison), so it writes `setTrendMetric` directly, the same write the
//     cards' `↑`/`↓` keys make. `Same scale` is the view's other SETTING and rides the heading row
//     beside it — a reader saying how the charts should be drawn, not what they are about.
//     `selectionBoundary.test.ts`'s scope note says why the metric and the scroll stay outside
//     the decision table while the PLANE FOCUS is in it.
//
//   · THE ROWS commit through `trendPlaneActions` and the one executor — the SAME builder the
//     plane's own header strip runs (rule 2), so a row click and a plane click cannot drift. The
//     figure is the last measured reading in the roster's ONE formatter; an unmeasured chain says
//     so in words rather than showing a 0.
//
// ⚠️ THE ROSTER IS NOT COMPUTED HERE. `useTrendRoster` is the one pass the planes, this list and
// the cursor card all read, so a row can never name a plane that is not in the stack or quote a
// number no chart on screen agrees with. This card reads `trendIds` NOWHERE — that channel is
// React's publish to the engine and is write-only from here (`publishChannelBoundary.test.ts`).
//
// ⚠️ HOVER PAIRS, IT NEVER COMMITS (convention 9). A row hovers `hoverFilter` — the app's own
// network channel — so hovering a row lifts its plane in the scene and hovering a plane's header
// washes this row. Nothing about the pose moves: a preview that re-staggered the stack would read
// as a commit.

export default function TrendExplore({ defaultCollapsed }: { defaultCollapsed?: boolean } = {}) {
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const scale = useStore((s) => s.trendScale);
  const scroll = useStore((s) => s.trendScroll);
  const focus = useStore((s) => s.trendFocus);
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const setTrendMetric = useStore((s) => s.setTrendMetric);
  const setTrendScale = useStore((s) => s.setTrendScale);
  const setTrendScroll = useStore((s) => s.setTrendScroll);

  const roster = useTrendRoster(useTrendsSlice(windowId, range), filter, metric);
  const { ranked, rows, unit, format, stepMs } = roster;
  const empty = scopeEmptyCopy(roster.scope, "view");

  // THE PAGER'S WINDOW, clamped by the stack's OWN rule (`clampScroll`, domain/trendStack.ts) —
  // the control and the geometry must agree about where the ends are, or a chevron dims a step
  // early or offers a step the stack will refuse.
  const start = clampScroll(ranked.length, scroll);
  const last = Math.min(start + VISIBLE_PLANES, ranked.length);
  const maxScroll = Math.max(0, ranked.length - VISIBLE_PLANES);

  // The unmount backstop for the pairing — a row that leaves the roster under a stationary pointer
  // (a filter commit, a re-rank) never fires its own leave. Every write goes through the RETURNED
  // setter, so the hook releases only hovers this card set.
  const setHover = useHoverRelease(hoverFilter, ranked, setHoverFilter);

  // The bar: each network's last reading as a share of the busiest — the ranking the stack's depth
  // already carries, made visible in the list.
  const maxLast = Math.max(1e-9, ...ranked.map((id) => rows.get(id)?.last ?? 0));

  const level: ExplorerLevelSpec = {
    key: "layers",
    crumb: { label: "Networks" },
    // Only where there is a COLUMN to compare: with one network in scope there is nothing for a
    // shared ceiling to be shared with.
    setting:
      ranked.length > 1 ? (
        <ScaleToggle className="mr-auto gap-1.5 whitespace-nowrap" shared={scale === "shared"} onChange={(on) => setTrendScale(on ? "shared" : "own")} />
      ) : undefined,
    measure: {
      options: METRIC_ORDER.map((m) => ({ id: m, label: METRIC_LABELS[m], unit: metricUnit(m, stepMs) })),
      value: metric,
      onPick: (id) => setTrendMetric(id as TrendMetric),
    },
    hasFigure: true,
    // No tags at this level, so the name takes the tag home's room; the readings run long
    // ("12,345.6"), so the figure column takes the fee width.
    nameW: 112,
    figureW: 56,
    // No fabricated rows (rule 10): the two commits the trends store keeps nothing for say so in
    // the same sentences the stack and the document say them in.
    empty: empty ? `${empty.fact} ${empty.route}` : "Waiting for the measured history…",
    rows: empty
      ? []
      : ranked.flatMap((id) => {
          const row = rows.get(id);
          if (!row) return [];
          const on = focus === id;
          return [
            {
              key: id,
              glyph: <IdentityDot hue={row.hue} />,
              name: row.name,
              share: row.last != null ? row.last / maxLast : undefined,
              hue: row.hue,
              figure: row.last != null ? format(row.last) : <span className="text-muted-foreground">{NO_READING}</span>,
              on,
              title: `${row.name} · ${row.last != null ? `${format(row.last)}${unit ? ` ${unit}` : ""}` : NO_READING}`,
              onClick: () => applyClickActions(trendPlaneActions(id, focus)),
              pair: subjectPairing(hoverFilter, id, setHover, row.hue),
            },
          ];
        }),
    // THE PAGER — ABSENT unless there is something to navigate, and the predicate is the DOMAIN's
    // (`pagerVisible`, beside the clamp): presence and the end stops are the same question asked
    // twice. An EXHAUSTED direction is inactive rather than gone, so the row never re-composes at
    // the ends.
    pager: pagerVisible(ranked.length) ? (
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
    ) : undefined,
  };

  return (
    <Explorer
      id="trendexplore"
      // The tool card says what you BROWSE (the naming rule), by the AXIS the rows break the network
      // down along — NETWORKS, the Hypergraph card's own word (user, 2026-09-26: "should be
      // 'network breakdown' like in hyper"); "layer" was the stack's word for a plane, not the rows'.
      title="Network breakdown"
      // "Open one for…" is the other explorers' second half and would be a lie here — a layer row
      // has no children, it brings its plane forward.
      hint={empty ? null : "Every network's own chart, busiest first. Pick one to bring its plane to the front."}
      levels={[level]}
      defaultCollapsed={defaultCollapsed}
      onLeave={() => setHover(null)}
    />
  );
}
