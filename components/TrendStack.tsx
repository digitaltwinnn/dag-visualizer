"use client";

// THE TREND STACK (2026-09-18) — the charts ARE the scene. One plane per network, each hosting
// the DOCUMENT's own `TrendChart`, receding in depth so that depth reads as network: the front
// plane is the busiest chain (or the focused one) and the column behind it is everyone else.
//
// SPLIT OF LABOUR, the callout's exactly (`components/SceneCallout.tsx`): REACT owns this DOM and
// everything inside it — which networks, which metric, what each chart asserts, plus each plane's
// opacity, paint order and interactivity, all read from the same `PlanePose` — and
// `src/engine/TrendStackSync.ts` (engine layer) owns the per-frame PLACEMENT, projecting that pose
// through the camera and writing one `transform` onto the matching `[data-plane]` anchor. So
// `#trend-stack` and `[data-plane]` are marker contracts (components/CLAUDE.md's table), and
// position never triggers a React render.
//
// ⚠️ A PLANE IS AN ANCHOR PLUS A CHILD, and the split is load-bearing. `[data-plane]` is a 0-size
// box pinned at the layer's top-left with `transform-origin: 0 0`, so the engine's matrix can be
// the projected point itself — a translate and a uniform scale, no centring term to compose and no
// rotation, which is what keeps the chart's text crisp and the compositor off the re-raster path.
// Its ONE child is the actual `PLANE_PX_W` plane, centred on that origin by its own −50%/−50%. The
// anchor mounts `invisible` and the ENGINE flips `style.visibility`: a class, so React's own
// re-renders can never clobber the engine's inline write, and a plane can never flash at the
// corner before the first projection lands.
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
//
// A PLANE CLICK IS FOCUS ONLY, and the semantics are not this file's to decide: the header strip
// (and, on the interactive plane, its body) applies `trendPlaneActions` through the one executor,
// like every other interactive surface in the app (rule 2). It does NOT commit the network — a
// committed filter scopes the stack to one plane, so a click would delete the four planes the
// gesture is about; the decision and its reasoning live in `domain/pickActions.ts`.
//
// ⚠️ A DRAG IS NOT A CLICK. These strips sit over a camera you orbit by dragging, and a press that
// TRAVELS is a drag whatever it started on — so the pointer's travel is measured and a click that
// moved more than a few px is dropped. (A press that starts on a strip does not reach the canvas
// at all, so it cannot orbit: the strips swallow that drag, which is the accepted cost of putting
// a control over the scene. Every pixel that is not a header still orbits.)

import { useEffect, useMemo, useRef } from "react";

import TrendChart from "@/components/docs/TrendChart";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import { cn } from "@/lib/utils";
import { scopeEmptyCopy } from "@/src/data/trendScope";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { PLANE_PX_W, stackPoses } from "@/src/engine/domain/trendStack";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";

/** The empty roster, as ONE frozen reference. Publishing a fresh `[]` would be a content-free
 *  change the engine's `!==` still has to answer. */
const NO_IDS: readonly string[] = [];

/** How far a press may travel and still count as a click, in px. Generous enough for a shaky
 *  finger, tight enough that a deliberate orbit attempt never commits a focus. */
const DRAG_SLOP = 4;

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
  // THE SHARED TIME CURSOR — one instant, marked on every plane whose span contains it, so the
  // stack is read at ONE moment rather than five. A COMMIT, not a hover (store `trendCursorMs`);
  // nothing writes it yet, and `null` draws nothing anywhere.
  const cursorMs = useStore((s) => s.trendCursorMs);
  // THE SCENE↔HUD HOVER PAIRING (convention 9), on the network channel every other surface in the
  // app already pairs a network on: hovering a plane's header previews its Layers row in the rail,
  // and hovering that row previews this plane. A preview is never a commit — the only thing it
  // changes here is the plane's OPACITY, never its pose.
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  // THE WINDOW, AND THE SAME ONE THE DOCUMENT READS. `trendWindow`/`trendRange` are the store's
  // own statement of what is on screen; `useTrendsSlice` turns that into the payloads it needs and
  // the cuts they take (`planTrendFetch`/`assembleTrendSlice`, src/data/trendWindow.ts) — the
  // auto-tiered range, the 1H slice and the fleet's hourly payload all come free, because the
  // Trends document asks the very same question through the very same hook.
  // `null` while the view is elsewhere is the hook's documented conditional form (a hook cannot be
  // called conditionally), so no other view pays for the fetch; the cache is shared with the
  // vitals rim and the document either way.
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const slice = useTrendsSlice(on ? windowId : null, range);
  const { p, error } = slice;

  // ⚠️ ONE ROSTER PASS, SHARED WITH BOTH RAILS (2026-09-19). Which networks, in what order, drawn
  // against which axis and with what measured — `components/useTrendRoster.ts` is the one answer,
  // read here, by the Layers card and by the cursor card. Three copies of it would be three
  // chances to disagree about the very ranking these planes are laid out by. It carries the
  // counter EDGE TRIM too, so a rail can never quote a number no chart on screen agrees with.
  const roster = useTrendRoster(slice, filter, metric);
  const { ranked, buckets: axis, stepMs: step, unit: unitWord, pending } = roster;
  // THE SCOPE WITH NOTHING TO DRAW (2026-09-19, Task 12's remainder): a `dag` or unlisted commit
  // leaves the roster EMPTY, because the trends store keeps one series set per LISTED metagraph.
  // The sentences are `src/data/trendScope.ts`'s, shared with the document so the two registers of
  // this rung cannot say different things about the same commit.
  const empty = scopeEmptyCopy(roster.scope, "view");

  const poses = stackPoses(ranked, { layout, scroll, focus });
  // THE UNMOUNT BACKSTOP (convention 9's other half, 2026-09-19). A header strip clears its own
  // pairing on leave — while it is still there to hear one. It often is not: paging drops a plane
  // out of the visible window, a metric switch re-ranks the roster, a filter commit cuts it to one,
  // and an element that has been removed under a stationary pointer never fires a leave. The
  // channel would then keep a plane previewed with nothing pointing at it.
  //
  // ⚠️ THE RETURNED SETTER IS WHAT THE PAIRING WRITES THROUGH, so the hook knows which hovers are
  // THIS surface's. It matters most here: the stack renders ~5 of a roster of 11, and a domain
  // check would have it wiping every hover the rails and the top-bar filter strip set on the other
  // six, on its very next render — which is every write, since it subscribes to the channel.
  // `poses`, not `ranked`: only the planes actually on screen can hold a hover of its own.
  const setHover = useHoverRelease(hoverFilter, poses.map((p) => p.id), setHoverFilter);

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
  const sharedMax = useMemo(
    () =>
      scaleMode === "shared"
        ? ranked.reduce(
            // A REDUCE, not `Math.max(...flatMap)`: the spread puts one argument on the stack per
            // measured bucket, and a long window across a full roster is tens of thousands of them
            // — the shape that throws `RangeError: Maximum call stack size exceeded` the day the
            // store grows past the engine's argument limit.
            (m, id) => (roster.rows.get(id)?.series.points ?? []).reduce<number>((n, v) => (v != null && v > n ? v : n), m),
            0,
          )
        : undefined,
    [scaleMode, ranked, roster],
  );

  // THE DRAG GUARD (see the header): pointerdown records where the press started, pointerup says
  // whether it travelled, and `activate` drops a click that did. Refs, not state — a gesture must
  // never re-render five charts.
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    dragged.current = !!d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_SLOP;
  };
  // ONE write path (rule 2): the table decides what a plane click means, the executor applies it.
  // Read the focus from the store at ACTIVATION time rather than closing over the render's value —
  // a keyboard press can land after a focus change from anywhere else.
  //
  // ⚠️ A KEY PRESS IS NEVER A DRAG, AND THE FLAG NEVER OUTLIVES ONE GESTURE (2026-09-18, review).
  // These refs are shared by all five planes, and a pointer gesture does not always end in an
  // activation: press on plane A's header, release over plane B's, and the browser fires the click
  // on their common ancestor — no handler, nothing consumes the flag, and `dragged` stays true.
  // The next activation from ANY plane would then be swallowed, and for the keyboard that is a
  // control that silently stops working. So the flag is consumed on every activation whatever the
  // outcome, and the keyboard path never reads it: travel is a pointer's property alone.
  const activate = (id: string, fromKey: boolean) => {
    const wasDrag = dragged.current;
    dragged.current = false;
    if (wasDrag && !fromKey) return;
    applyClickActions(trendPlaneActions(id, useStore.getState().trendFocus));
  };

  if (!on) return null;

  // A SCOPE WITH NOTHING TO DRAW SAYS SO, IN THE CANVAS CENTRE (2026-09-19). A `dag` or unlisted
  // commit leaves the roster empty, and an empty stage would read as a broken view rather than as
  // the honest fact it is (rule 10). The sentences are the document's, from the one home both
  // registers read, with the ROUTE named as a gesture available HERE.
  if (empty) {
    return (
      <div id="trend-stack" className="absolute inset-0 pointer-events-none grid place-items-center z-[4]">
        <p className="max-w-[46ch] text-center text-label text-muted-foreground">
          {empty.fact} {empty.route}
        </p>
      </div>
    );
  }

  // FAILURE IS A SIGNAL, NOT A SILENCE (rule 10, and the trends hook's own contract): no cached
  // payload and a failed load says so in the document's words. No spinner, no fabricated series.
  if (!p && error) {
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
    //
    // THE ENTRANCE IS ONE ATTRIBUTE. The planes mount the instant the view commits, but the camera
    // is still flying and the room still building for the first second of the choreography — so the
    // layer waits at opacity 0 and the ENGINE says when the view has arrived (`data-on`, the
    // `#callout` precedent). One arbitrary `[transition:…]` property rather than two utilities:
    // `transition-*` is a twMerge group, so a second one would silently drop the first.
    <div
      id="trend-stack"
      className="absolute inset-0 pointer-events-none z-[4] opacity-0 [transition:opacity_var(--tempo-nav)_ease] data-[on='1']:opacity-100 motion-reduce:!transition-none"
    >
      {poses.map((pose) => {
        // The one roster pass the rank, the ceiling and both rails read — already cut by the
        // metric's own edge rule, so a rail can never quote a bucket this plane does not draw.
        const row = roster.rows.get(pose.id);
        if (!row) return null;
        const pair = subjectPairing(hoverFilter, pose.id, setHover, row.hue);
        return (
          <div
            key={pose.id}
            data-plane={pose.id}
            className={cn(
              // THE ANCHOR: a 0-size box at the layer's origin, hidden until the engine has
              // projected it. `origin-top-left` is what makes the engine's matrix a plain
              // translate — see this file's header.
              "absolute left-0 top-0 origin-top-left invisible",
              // The body takes no pointer events — the orbit drag belongs to the canvas beneath.
              // The one plane the pose marks interactive is the exception, and its header strip
              // re-enables them below whatever the pose says. `pointer-events` inherits, so the
              // 0-size anchor carrying it reaches the plane inside.
              pose.interactive ? "pointer-events-auto" : "pointer-events-none",
            )}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            // THE INTERACTIVE PLANE'S WHOLE BODY is a target too — it is the one plane a click
            // cannot be ambiguous about, and asking for the header strip alone on a plane that is
            // already in front reads as a dead surface. Every other plane keeps the body inert, so
            // the orbit drag passes through it. The header strip stops its own click, so the two
            // never fire for one press.
            onClick={pose.interactive ? () => activate(pose.id, false) : undefined}
            style={{
              // A PREVIEWED PLANE LIFTS TO FULL, AND NOTHING ELSE MOVES (rule 9 — hovers preview,
              // never commit). The pose is untouched: depth, scale and paint order are what a
              // COMMIT changes, so a hover that re-staggered the stack would read as one.
              opacity: pair.paired ? 1 : pose.opacity,
              // PAINT ORDER IS DEPTH, from the pose itself: a nearer plane (larger z) paints over
              // a farther one, so a lifted focus lands in front of the stack it came from and the
              // flat layout's equal z leaves tree order to break the tie. Local to this root,
              // which is its own stacking context; the offset keeps it positive.
              zIndex: Math.round(100 + pose.z),
            }}
          >
            {/* THE PLANE. Centred on the anchor's projected point, and CONTENT-height: the chart's
                own plot frame IS its one hairline, so a box around it would be a second edge around
                the same rectangle. Width is the shared `PLANE_PX_W` — the projector divides by the
                same constant, so the two sides cannot drift about how big a plane is. */}
            <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2" style={{ width: PLANE_PX_W }}>
            {p && (
              <TrendChart
                name={row.name}
                // The unit word follows the TIER — an hourly bucket labelled "per day" would
                // misstate every reading by a factor of 24 (the document's own rule).
                unit={unitWord}
                format={roster.format}
                note={pending ? "reading the hourly samples…" : undefined}
                buckets={axis}
                stepMs={step}
                sampled={row.series.sampled}
                gaps={row.series.gaps}
                lines={[{ label: metric, points: row.series.points, hue: row.hue }]}
                scaleMax={sharedMax}
                cursorMs={cursorMs}
                className="w-full"
                // THE HEAD IS THE PLANE'S HEADER STRIP. The body is fully transparent — the
                // chart's own hairline and its coloured line are all the ink it has — so this one
                // row carries a plate, at a presence measured to stay readable over both the dark
                // scene and the light one. `--panel-solid` is the app's own near-opaque glass and
                // the only token here; the mix is its presence, not a colour of its own. NO BLUR
                // (see this file's header) — the plate does the work a backdrop-filter would.
                // THE HEAD IS THE TARGET, so it reads as one: the pointer's own cursor, the app's
                // hover wash mixed INTO the plate, and a focus ring for the keyboard. A hover
                // previews, it never commits (rule 9).
                // ⚠️ ONE `background` VALUE, in the plate's own shorthand form. A `bg-*` utility
                // sets background-COLOR and would fight the shorthand this plate is written as
                // (CSS trap 3's neighbourhood), so the hover state restates the whole value —
                // and it restates it as a single mix rather than as a wash layered over the
                // plate, which keeps it one property value to read. Mixing TOWARD `--panel-solid`
                // (not toward transparent) means the hover lifts the plate as well as tinting it,
                // so a header strip over a busy chart gains presence exactly when it is the thing
                // being pointed at.
                headClassName="pointer-events-auto cursor-pointer px-2 py-1 rounded-md [background:color-mix(in_oklch,var(--panel-solid)_62%,transparent)] hover:[background:color-mix(in_oklch,var(--wash-hover)_35%,var(--panel-solid))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                // The pairing's five writers, on the one element of a plane that takes pointer
                // events at every depth. `onMouseMove` is the swap-under-pointer healer and
                // `onFocus`/`onBlur` the keyboard mirror — one pair of functions, five props, so
                // a keyboard walk previews exactly what a hover does.
                headHover={{
                  onMouseEnter: pair.onMouseEnter,
                  onMouseMove: pair.onMouseMove,
                  onMouseLeave: pair.onMouseLeave,
                  onFocus: pair.onFocus,
                  onBlur: pair.onBlur,
                }}
                headAction={{
                  activate: (fromKey) => activate(pose.id, fromKey),
                  pressed: focus === pose.id,
                  // LABEL IN NAME (WCAG 2.5.3): an `aria-label` replaces the accessible name, so it
                  // opens with the strip's own visible words — the network and its unit — and then
                  // says what the press does. "Dor Technologies per day — bring forward".
                  label: `${row.name}${unitWord ? ` ${unitWord}` : ""} — ${
                    focus === pose.id ? "send back" : "bring forward"
                  }`,
                }}
              />
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
