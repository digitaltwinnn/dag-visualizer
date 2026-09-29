"use client";

import Explorer, { type ExplorerLevelSpec } from "@/components/explorer/Explorer";
import { IdentityDot } from "@/components/inspector/parts";
import useTrendRoster, { NO_READING } from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { scopeEmptyCopy } from "@/src/data/trendScope";
import { METRIC_LABELS, METRIC_ORDER, TREND_METRICS, metricUnit, spanWord } from "@/src/data/trendSeries";
import { spanPhrase } from "@/src/data/trendWindow";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore, type TrendMetric } from "@/src/store/store";
import { NodeStars } from "@/components/state/StateAtoms";

// HISTORY'S EXPLORER — a DESCRIPTION for the one `Explorer` component (design session 2026-09-26;
// read `docs/superpowers/design/2026-09-26-explorer-card/README.md` first). The view breaks its
// subject down along its OWN dimension, the ROSTER OF NETWORKS — one chart plane each — so
// the description is ONE level: the ranked networks, busiest first, each with its last measured
// reading. A row has no children; clicking it brings its plane to the front.
//
// What the description decides, and only this:
//
//   · THE HEADING is the measure every card is on — the trend METRIC, the heading control's list
//     (`METRIC_ORDER`, with each measure's unit at the current cadence). It is a view-level
//     setting because every card steps together (a stack whose planes showed different measures
//     would stop being a comparison), so it writes `setTrendMetric` directly, the same write the
//     cards' `↑`/`↓` keys make. It is the heading's ONLY setting since 2026-09-28: `Same scale`
//     rode beside it for nine days and never changed a row of this list — it draws the PLANES —
//     so it moved to the band's pill group with the stack's other drawing settings (user: "does
//     not belong in the explorer as it doesn't affect anything there"; TrendTimeline has the
//     argument). `selectionBoundary.test.ts`'s scope note says why the metric and the scroll
//     stay outside the decision table while the PLANE FOCUS is in it.
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
  const focus = useStore((s) => s.trendFocus);
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const setTrendMetric = useStore((s) => s.setTrendMetric);

  const roster = useTrendRoster(useTrendsSlice(windowId, range), filter, metric);
  // THE LIST FOLLOWS THE RANGE (design A, 2026-09-29 — "it is not clear that the explorer is a
  // fixed value based on today"). Each figure is the network's `span` reading over the window on
  // screen — an average per day for a rate — and the hint names that span, so the list and the
  // range selector visibly answer one question, while the Moment card states one INSTANT. It used
  // to state the latest full day, which read as a second, unlabelled copy of the Moment's list.
  const { ranked, rows } = roster;
  // An average of COUNTS is stated as a count — "1,978.7 snapshots a day" is precision the reading
  // does not have. Metrics with their own formatter (DAG, MB, seconds) keep it.
  const format = TREND_METRICS[metric].format ?? ((v: number) => Math.round(v).toLocaleString());
  const unit = metricUnit(metric, 86_400_000);
  const over = `${spanWord(metric)} · ${spanPhrase(windowId, range)}`;
  const empty = scopeEmptyCopy(roster.scope, "view");

  // THE WHOLE ROSTER, NO PAGER (user, 2026-09-28, two rounds). The card paged for nine days — first
  // a pager under all eleven rows that moved only the stack's five-plane window ("3–7 of 11" under
  // eleven rows read as broken pagination), then a list cut to the five on stage — and the second
  // was the tell: "other views just expand the card; only Snapshots pages, because that number is
  // huge; metagraphs are not paged". A dozen networks is a list, not a chain. So every network
  // lists, busiest first, like the Hypergraph card's, and the STAGE is driven by the rows alone: a
  // click brings that plane to the front, and the store pages the stack's window to keep it on
  // stage (`scrollToKeep`, inside `setTrendIds`/the focus write). `trendScroll` is read by the
  // stack and written by that keep — no control here names it.

  // The unmount backstop for the pairing — a row that leaves the roster under a stationary pointer
  // (a filter commit, a re-rank) never fires its own leave. Every write goes through the RETURNED
  // setter, so the hook releases only hovers this card set.
  const setHover = useHoverRelease(hoverFilter, ranked, setHoverFilter);

  // The bar: each network's last reading as a share of the busiest — the ranking the stack's depth
  // already carries, made visible in the list.
  const maxLast = Math.max(1e-9, ...ranked.map((id) => rows.get(id)?.span ?? 0));

  const level: ExplorerLevelSpec = {
    key: "networks",
    crumb: { label: "Networks" },
    measure: {
      options: METRIC_ORDER.map((m) => ({ id: m, label: METRIC_LABELS[m], unit: metricUnit(m, 86_400_000) })),
      value: metric,
      onPick: (id) => setTrendMetric(id as TrendMetric),
    },
    hasFigure: true,
    // No tags at this level, so the name takes the tag home's room; the readings run long
    // ("12,345.6"), so the figure column takes the fee width.
    nameW: 112,
    // Wide enough for a busy chain's average ("31,643").
    figureW: 64,
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
              share: row.span != null ? row.span / maxLast : undefined,
              hue: row.hue,
              figure:
                // A dash with the words on hover: "no reading" truncated to "no rea…" in the 48px
                // figure column (a quiet network may have measured nothing in the span).
                row.span != null ? format(row.span) : roster.pending ? <NodeStars count={3} /> : <span className="text-muted-foreground" title={NO_READING}>—</span>,
              on,
              title: `${row.name} · ${row.span != null ? `${format(row.span)}${unit ? ` ${unit}` : ""} · ${over.toLowerCase()}` : NO_READING}`,
              onClick: () => applyClickActions(trendPlaneActions(id, focus)),
              pair: subjectPairing(hoverFilter, id, setHover, row.hue),
            },
          ];
        }),
  };

  return (
    <Explorer
      id="trendexplore"
      // The tool card says what you BROWSE (the naming rule), by the AXIS the rows break the network
      // down along — NETWORKS, the Hypergraph card's own word (user, 2026-09-26: "should be
      // 'network breakdown' like in hyper"); "layer" was the stack's word for a plane, not the rows'.
      title="Networks"
      // "Open one for…" is the other explorers' second half and would be a lie here — a layer row
      // has no children, it brings its plane forward.
      // As short as the other explorers' hints (user, 2026-09-28: "way too verbose").
      // The hint NAMES THE SPAN the figures are over (design A) — the one place the list says
      // which time it is about.
      hint={empty ? null : `${over}. Pick one to bring it forward.`}
      levels={[level]}
      defaultCollapsed={defaultCollapsed}
      onLeave={() => setHover(null)}
    />
  );
}
