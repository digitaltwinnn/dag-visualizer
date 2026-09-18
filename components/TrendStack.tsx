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
// ONE HAIRLINE PER PLANE, and it is the CHART'S. The body is fully transparent — no background,
// no frame of its own — because `TrendChart` already draws a `border-border` box around its plot,
// and a plane box around that would be a second edge around the same rectangle. So the plane is a
// width and its content's height, and the only ink it adds is the header strip's plate.
//
// ⚠️ NO BLUR, NO SHADOW, ANYWHERE ON A PLANE. Each would force the compositor to re-raster a
// transformed layer every frame, with five planes under a per-frame matrix — the single biggest
// cost of doing this in DOM at all. `components/trendStackBoundary.test.ts` keeps it that way.
//
// ⚠️ AND THE BODIES MUST NOT SWALLOW THE ORBIT DRAG. The canvas is under these planes and the
// camera is driven by dragging it, so a plane body takes no pointer events; only its header strip
// and the one plane the pose marks `interactive` do.

import { useEffect, useMemo } from "react";

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
import { PLANE_GAP, stackPoses } from "@/src/engine/domain/trendStack";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { METAGRAPHS } from "@/src/net/current";
import { useStore } from "@/src/store/store";

/** The plane's own width at scale 1. There is no height: the plane is CONTENT-height, because the
 *  chart's own plot frame IS the plane's one hairline — a box around it would be a second edge
 *  around the same rectangle. */
const PLANE_W = 540;

/** The empty roster, as ONE frozen reference. Publishing a fresh `[]` would be a content-free
 *  change the engine's `!==` still has to answer. */
const NO_IDS: readonly string[] = [];

/** ⚠️ STATIC PLACEMENT ONLY — `TrendStackSync` (the next task) takes this over and writes a
 *  projected `matrix3d` onto the same `transform`. It lives here, in ONE expression, precisely so
 *  that hand-over is a deletion rather than a hunt: the look can be reviewed before the projector
 *  exists, and nothing else in this file encodes where a plane sits.
 *
 *  It reads the POSE, never the array index, so `layout: "flat"` and the focus lift are visible
 *  before the projector exists: `pose.z` is world depth with NEARER = LARGER z (the cameraRig
 *  looks down −Z), so a screen-y of `+z` puts the nearest plane LOWEST and the rear ones stepping
 *  up behind it — the same reading the real projection gives, at a fake scale. */
const STEP_Y = 38;
const staticTransform = (pose: { z: number; scale: number }): string =>
  `translate(-50%, -50%) translateY(${(pose.z / PLANE_GAP) * STEP_Y}px) scale(${pose.scale})`;

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
  const scaleMode = useStore((s) => s.trendScale);
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
  const rankedNow = rankByLast(roster, (id) => metricSeries(metric, id, series).points);
  // STABILISED BY CONTENT, because the roster is a PUBLISH CHANNEL (store `trendIds`). The rank is
  // recomputed from scratch every render — a poll, a hover, any unrelated store write — so its
  // identity changes constantly while the list itself sits still. The engine's change signal is
  // `!==` on that array, so publishing the raw value would retarget the projector's ease on every
  // render and the stack would never settle. Keying the memo on the joined ids publishes a fresh
  // reference exactly when the CONTENT moves, which is the only time the engine needs to hear.
  const rankedKey = rankedNow.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankedNow, [rankedKey]);
  const poses = stackPoses(ranked, { layout, scroll, focus });

  // THE ONE PUBLISH of the fourth React → Engine channel (see store `trendIds`). The engine's
  // projector places a plane per id and needs the same order the planes are rendered in; only
  // React holds the fetched series the rank is computed from. `[]` whenever the stack is not
  // mounted — on the gate turning off and on unmount — so a view switch never leaves the
  // projector chasing planes that no longer exist.
  const setTrendIds = useStore((s) => s.setTrendIds);
  useEffect(() => {
    if (!on) {
      setTrendIds(NO_IDS);
      return;
    }
    setTrendIds(ranked);
    return () => setTrendIds(NO_IDS);
  }, [on, ranked, setTrendIds]);

  // ⚠️ ONE SCALE OR EACH ITS OWN, and the reader picks — `store.trendScale`, the document's own
  // control carried into the view. `shared` is the default because a stack is read AS a column
  // before it is read one plane at a time, and autoscaled per plane it says "these are the same
  // size" about a chain anchoring three a day and one anchoring forty. The ceiling is taken across
  // the WHOLE ranked roster rather than the visible window, so scrolling never rescales the charts
  // under the reader; each chart still states its own peak (TrendChart's `ownMax`). `undefined` is
  // TrendChart's "scale yourself".
  const sharedMax =
    scaleMode === "shared"
      ? Math.max(
          0,
          ...ranked.flatMap((id) => metricSeries(metric, id, series).points.filter((v): v is number => v != null)),
        )
      : undefined;

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
      {poses.map((pose) => {
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
              "absolute left-1/2 top-1/2",
              // The body takes no pointer events — the orbit drag belongs to the canvas beneath.
              // The one plane the pose marks interactive is the exception, and its header strip
              // re-enables them below whatever the pose says.
              pose.interactive ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{
              width: PLANE_W,
              transform: staticTransform(pose),
              transformOrigin: "center",
              opacity: pose.opacity,
              // PAINT ORDER IS DEPTH, from the pose itself: a nearer plane (larger z) paints over
              // a farther one, so a lifted focus lands in front of the stack it came from and the
              // flat layout's equal z leaves tree order to break the tie. Local to this root,
              // which is its own stacking context; the offset keeps it positive.
              zIndex: Math.round(100 + pose.z),
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
                scaleMax={sharedMax}
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
