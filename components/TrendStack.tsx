"use client";

// THE TREND STACK (2026-09-18) — the charts ARE the scene. One plane per network, each hosting
// the DOCUMENT's own `TrendChart`, receding in depth so that depth reads as network: the front
// plane is the busiest chain (or the focused one) and the column behind it is everyone else.
//
// SPLIT OF LABOUR, the callout's exactly (`components/SceneCallout.tsx`): REACT owns this DOM and
// everything inside it — which networks, which metric, what each chart asserts — and a later
// task's `TrendStackSync` (engine layer) owns the per-frame PLACEMENT, projecting each
// `PlanePose` through the camera and writing one `transform` onto the matching `[data-plane]`
// element. So `#trend-stack` and `[data-plane]` are marker contracts (components/CLAUDE.md's
// table), and position never triggers a React render.
//
// ONE CHART PRIMITIVE, TWO REGISTERS. These planes and the Trends document render the same
// component, so every honesty rule travels unchanged: a null bucket is a GAP (never a zero), a
// series with nothing measured says so in words rather than drawing an empty plot, and the head's
// readout is stamped with the bucket it actually came from. The per-network maths — which stored
// row a metric reads, whether it rescales, counter or gauge, the busiest-first rank — is
// `src/data/trendSeries.ts`, shared with the document for the same reason.
//
// ⚠️ NO BLUR, NO SHADOW, ANYWHERE ON A PLANE. Each would force the compositor to re-raster a
// transformed layer every frame, with five planes under a per-frame matrix — the single biggest
// cost of doing this in DOM at all. `components/trendStackBoundary.test.ts` keeps it that way.
//
// ⚠️ AND THE BODIES MUST NOT SWALLOW THE ORBIT DRAG. The canvas is under these planes and the
// camera is driven by dragging it, so a plane body takes no pointer events; only its header strip
// and the one plane the pose marks `interactive` do.

import TrendChart from "@/components/docs/TrendChart";
import useTrendsWindow from "@/components/useTrendsWindow";
import { cn } from "@/lib/utils";
import { displayNetwork } from "@/src/data/unlisted";
import {
  TREND_METRICS,
  metricSeries,
  metricUnit,
  rankByLast,
  trimCounterEdges,
} from "@/src/data/trendSeries";
import { leadingTrim } from "@/src/data/trendWindow";
import { stackPoses, VISIBLE_PLANES } from "@/src/engine/domain/trendStack";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { METAGRAPHS } from "@/src/net/current";
import { useStore } from "@/src/store/store";

/** The plane's own box, in CSS pixels at scale 1 — a 16:7-ish pane, wide enough for the
 *  document's chart at its natural height with room above and below it. */
const PLANE_W = 540;
const PLANE_H = 250;

/** ⚠️ STATIC PLACEMENT ONLY — `TrendStackSync` (the next task) takes this over and writes a
 *  projected `matrix3d` onto the same `transform`. It lives here, in ONE expression, precisely so
 *  that hand-over is a deletion rather than a hunt: the look can be reviewed before the projector
 *  exists, and nothing else in this file encodes where a plane sits. The rear slots step UP and
 *  shrink, which is the depth cue the poses already carry as scale and opacity. */
const STEP_Y = 38;
const staticTransform = (slot: number, scale: number): string =>
  `translate(-50%, -50%) translateY(${-slot * STEP_Y}px) scale(${scale})`;

export default function TrendStack() {
  // Convention 7: gate on the view this behaviour is FOR, read from the allow-list — never a
  // `mode === "trend"` comparison, which is a deny-list that grows a line per view.
  const mode = useStore((s) => s.mode);
  const on = VIEW_POLICIES[mode].chartStack;
  // SUBSCRIBED, not read once: picking a chip in the bar's filter strip must cut the stack under
  // the reader's eyes, exactly as it cuts the document's per-network columns.
  const filter = useStore((s) => s.filter);
  const metric = useStore((s) => s.trendMetric);
  const layout = useStore((s) => s.trendLayout);
  const scroll = useStore((s) => s.trendScroll);
  const focus = useStore((s) => s.trendFocus);
  // The store's whole measured depth, leading-trimmed to where measuring began — the document's
  // own default window. `null` while the view is elsewhere is the hook's documented conditional
  // form (a hook cannot be called conditionally), so no other view pays for this fetch; the cache
  // is shared with the vitals rim and the document either way.
  const win = useTrendsWindow(on ? "all" : null);

  const p = win.data ? leadingTrim(win.data) : undefined;
  const series = p?.series ?? {};
  const buckets = p?.buckets ?? [];
  const stepMs = p?.stepMs ?? 86400000;
  const spec = TREND_METRICS[metric];
  // The roster is the catalog, scoped by the committed filter — a filter with no catalog row (the
  // DAG core, an unlisted channel) leaves it EMPTY, which is honest: the trends store keys its
  // series per listed metagraph, so there is genuinely nothing measured for either. Naming that
  // case in copy is a later task's job; for now the stack simply has no planes.
  const roster = METAGRAPHS.filter((m) => m.id && (filter === "all" || m.id === filter)).map((m) => m.id!);
  const ranked = rankByLast(roster, (id) => metricSeries(metric, id, series).points);
  const poses = stackPoses(ranked, { layout, scroll, focus });

  // ⚠️ ONE SCALE FOR THE WHOLE STACK (the document's own ruling, 2026-09-14): a column of
  // per-network charts that each autoscale answers "how did THIS network's week go?" and "which
  // of these is bigger?" with a flat lie — a chain anchoring three a day and one anchoring forty
  // draw the same silhouette. A depth stack IS that comparison, so it shares one ceiling. Taken
  // across the WHOLE ranked roster rather than the visible window, so scrolling never rescales
  // the charts under the reader. Each chart still states its own peak (TrendChart's `ownMax`).
  const sharedMax = Math.max(
    0,
    ...ranked.flatMap((id) => metricSeries(metric, id, series).points.filter((v): v is number => v != null)),
  );

  if (!on) return null;

  // FAILURE IS A SIGNAL, NOT A SILENCE (rule 10, and the trends hook's own contract): no cached
  // payload and a failed load says so in the document's words. No spinner, no fabricated series.
  if (!p && win.error) {
    return (
      <div id="trend-stack" className="absolute inset-0 pointer-events-none grid place-items-center z-[4]">
        <p className="text-label text-muted-foreground">
          The trends store is unreachable right now. It recovers on its own.
        </p>
      </div>
    );
  }

  return (
    // A HUD layer over the canvas and under the rails: `absolute inset-0` resolves against the
    // scene shell (CSS trap 2 — the shell is the fixed/positioned ancestor), and z-[4] sits above
    // the canvas's tree-order paint and below the rails' z-10.
    <div id="trend-stack" className="absolute inset-0 pointer-events-none z-[4]">
      {poses.map((pose, slot) => {
        const net = displayNetwork(pose.id);
        const s = metricSeries(metric, pose.id, series);
        // COUNTER series drop their partial edge buckets; a GAUGE keeps everything. The axis is
        // cut by the same rule as the lines, or the plot desyncs from its own dates.
        const counter = spec.kind === "counter";
        const cut = <T,>(a: readonly T[]): T[] => (counter ? trimCounterEdges(a, stepMs) : a.slice());
        return (
          <div
            key={pose.id}
            data-plane={pose.id}
            className={cn(
              "absolute left-1/2 top-1/2 flex flex-col justify-center px-3 rounded-lg border border-border",
              // The body takes no pointer events — the orbit drag belongs to the canvas beneath.
              // The one plane the pose marks interactive is the exception, and its header strip
              // re-enables them below whatever the pose says.
              pose.interactive ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{
              width: PLANE_W,
              height: PLANE_H,
              transform: staticTransform(slot, pose.scale),
              transformOrigin: "center",
              opacity: pose.opacity,
              // Nearest slot on top, so a nearer plane's header can never be hidden by a farther
              // one. Local to this root, which is its own stacking context.
              zIndex: VISIBLE_PLANES - slot,
            }}
          >
            {p && (
              <TrendChart
                name={net?.name ?? pose.id}
                unit={metricUnit(metric, stepMs)}
                format={spec.format}
                buckets={cut(buckets)}
                stepMs={stepMs}
                sampled={s.sampled && cut(s.sampled)}
                gaps={s.gaps && cut(s.gaps)}
                lines={[{ label: metric, points: cut(s.points), hue: net?.hue }]}
                scaleMax={sharedMax > 0 ? sharedMax : undefined}
                className="w-full"
                // THE HEAD IS THE PLANE'S HEADER STRIP. The body is fully transparent — the
                // chart's own hairline and its coloured line are all the ink it has — so this one
                // row carries a plate, at a presence measured to stay readable over both the dark
                // scene and the light one. `--panel-solid` is the app's own near-opaque glass and
                // the only token here; the mix is its presence, not a colour of its own. NO BLUR
                // (see this file's header) — the plate does the work a backdrop-filter would.
                headClassName="pointer-events-auto px-2 py-1 rounded-md [background:color-mix(in_oklch,var(--panel-solid)_62%,transparent)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
