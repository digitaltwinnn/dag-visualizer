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
// A PLANE IS AN OPAQUE CARD (user, 2026-09-19: "remove the transparency of the trend cards" —
// reversing the first cut, where the body was fully transparent and only the header wore a plate).
// Transparent sheets let every chart behind the front one draw THROUGH its plot: five series
// crossing in one rectangle, and the chart being read was the one hardest to read. An opaque face
// makes the stack a deck — occlusion, the stagger and the scale carry the depth, and each card
// shows exactly one network. So every plane also sits at FULL opacity: a card faded to a third is
// still see-through, which is the thing that was asked away. The face is the app's own
// `--panel-solid` glass composited over the opaque `--scene-ground`, so it is solid on both
// grounds from tokens alone, framed by the app's hairline.
//
// THE COLOUR IS STILL AN AREA UNDER THE LINE (`fill`, opt-in on the chart and passed nowhere else
// in the app): on a solid face it reads as the card's own tint rather than as a translucent sheet.
// It carries the line's gaps — an unmeasured bucket is a hole in the fill too, never a bridge and
// never a drop to zero.
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
// ⚠️ A DRAG IS NOT A CLICK. A press that TRAVELS is a drag whatever it started on — so the
// pointer's travel is measured and a click that moved more than a few px is dropped. History has
// no orbit (2026-09-26; `viewPolicy.rotate` is false): a drag across the FRONT chart's plot is the
// range BRUSH (`onRange`), and the wheel still zooms through the canvas.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import TrendChart, { type TrendLine } from "@/components/docs/TrendChart";
import useTrendRoster from "@/components/useTrendRoster";
import useTrendsSlice from "@/components/useTrendsSlice";
import useStagedMeasure, { ROLL_CLASS, useHeldOrder } from "@/components/useStagedMeasure";
import { cn } from "@/lib/utils";
import { scopeEmptyCopy } from "@/src/data/trendScope";
import { metricCaption, sharedCeiling, stepMetric } from "@/src/data/trendSeries";
import { trendPlaneActions } from "@/src/engine/domain/pickActions";
import { MORE_ID, PLANE_PLOT_PX_H, PLANE_PX_H, PLANE_PX_W, moreCount, morePose, stackPoses } from "@/src/engine/domain/trendStack";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { subjectPairing, useHoverRelease } from "@/components/useSubjectPairing";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";

/** The empty roster, as ONE frozen reference. Publishing a fresh `[]` would be a content-free
 *  change the engine's `!==` still has to answer. */
const NO_IDS: readonly string[] = [];

/** How far a press may travel and still count as a click, in px. Generous enough for a shaky
 *  finger, tight enough that a deliberate brush never commits a focus or a cursor pick. */
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
  const scroll = useStore((s) => s.trendScroll);
  const focus = useStore((s) => s.trendFocus);
  const scaleMode = useStore((s) => s.trendScale);
  // THE SHARED TIME CURSOR — one instant, marked on every plane whose span contains it, so the
  // stack is read at ONE moment rather than five. A COMMIT, not a hover (store `trendCursorMs`,
  // written by the band's timeline at most once per BUCKET), and `null` draws nothing anywhere.
  const cursorMs = useStore((s) => s.trendCursorMs);
  // A click on a plane's PLOT picks the instant under it (user, 2026-09-26 — the cursor acts on
  // the charts in the scene as well as on the band's timeline). The same setter the timeline
  // writes, deliberately outside the pickActions table (the cursor is not a rung — see the
  // cursor card's notes in components/CLAUDE.md); the drag guard below keeps an orbit that
  // started on the plot from landing as a pick.
  const setTrendCursor = useStore((s) => s.setTrendCursor);
  // A drag across a plane's plot brushes the RANGE (see `onPointerMove`): the timeline's own
  // write, for the whole stack, never one plane.
  const setTrendRange = useStore((s) => s.setTrendRange);
  // THE SCENE↔HUD HOVER PAIRING (convention 9), on the network channel every other surface in the
  // app already pairs a network on: hovering a plane's header previews its Networks row in the rail,
  // and hovering that row previews this plane. A preview is never a commit — the only thing it
  // changes here is the plane's OPACITY, never its pose.
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const setMetric = useStore((s) => s.setTrendMetric);
  // THE CARDS SHOW `staged.shown`, WHICH LAGS THE PICKED MEASURE through an out → swap → in →
  // re-order sequence (`components/useStagedMeasure.ts` has the whole argument). Everything a card
  // draws — its roster pass, its caption, its lines — reads the SHOWN measure; only the control
  // under the bar reads the picked one.
  const staged = useStagedMeasure(metric);
  const shown = staged.shown;
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
  // read here, by the Networks card and by the cursor card. Three copies of it would be three
  // chances to disagree about the very ranking these planes are laid out by. It carries the
  // counter EDGE TRIM too, so a rail can never quote a number no chart on screen agrees with.
  const roster = useTrendRoster(slice, filter, shown);
  const { ranked, rows, buckets: axis, stepMs: step, pending } = roster;
  // THE ORDER ON SCREEN — the ranking once settled, the HELD order while a measure change is in
  // flight, so the plots land before the cards move. Poses, the hover backstop and the engine's
  // `trendIds` all read THIS, never `ranked`: the projector and React must agree on the order.
  const order = useHeldOrder(ranked, staged.settled);
  // What a card says it shows.
  const caption = metricCaption(shown, step);
  // THE SCOPE WITH NOTHING TO DRAW (2026-09-19): a `dag` or unlisted commit
  // leaves the roster EMPTY, because the trends store keeps one series set per LISTED metagraph.
  // The sentences are `src/data/trendScope.ts`'s, shared with the document so the two registers of
  // this rung cannot say different things about the same commit.
  const empty = scopeEmptyCopy(roster.scope, "view");

  const poses = stackPoses(order, { scroll, focus });
  // THE SIXTH, UNNAMED PLANE (user, 2026-09-28) — the domain's `morePose`, rendered below the
  // window's cards as one more anchor the projector places like any other. It says only how many
  // networks the depth budget leaves behind the deck; the rows are the route onto the stage.
  const more = morePose(order, { scroll, focus });
  const behind = moreCount(order, scroll);
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
  //
  // A LAYOUT effect: the publish can also move `trendScroll` (the store keeps a focused card on
  // screen through a re-rank, in the same write), and that must land before paint — a passive
  // effect would paint one frame of the new order under the old window, mounting the wrong planes.
  const setTrendIds = useStore((s) => s.setTrendIds);
  useLayoutEffect(() => {
    setTrendIds(on ? order : NO_IDS);
  }, [on, order, setTrendIds]);
  // ⚠️ The UNMOUNT clear is its own effect. As the publish's cleanup it ran between every two
  // orders, so the store went old → [] → new and never saw a re-rank at all — only an empty roster
  // being filled — which is exactly the case `scrollToKeep` declines.
  useEffect(() => () => setTrendIds(NO_IDS), [setTrendIds]);

  // ⚠️ ONE SCALE OR EACH ITS OWN, and the reader picks — `store.trendScale`, the document's own
  // control carried into the view. `shared` is the default because a stack is read AS a column
  // before it is read one plane at a time, and autoscaled per plane it says "these are the same
  // size" about a chain anchoring three a day and one anchoring forty. The ceiling is taken across
  // the WHOLE ranked roster rather than the visible window, so scrolling never rescales the charts
  // under the reader; each chart still states its own peak (TrendChart's `ownMax`). `undefined` is
  // TrendChart's "scale yourself".
  const sharedMax = useMemo(
    () =>
      // ONE CEILING FUNCTION, shared with the document (`sharedCeiling`, 2026-09-19): it is a FOLD
      // rather than `Math.max(0, ...spread)` — the spread puts one argument on the stack per
      // measured bucket, and a long window across a full roster is tens of thousands of them, the
      // shape that throws `RangeError: Maximum call stack size exceeded` the day the store grows
      // past the engine's argument limit. The document had kept the spread until this was a
      // function both registers read.
      scaleMode === "shared" ? sharedCeiling(ranked.map((id) => rows.get(id)?.series.points ?? [])) : undefined,
    // ⚠️ THE DEPS ARE THE ROSTER'S MEMOISED PARTS, never a fresh object. `useTrendRoster` holds its
    // whole return still now, but the narrow deps are what this actually reads — and the trap is
    // one render away either way: a hook that composed a `{…}` per render would recompute this on
    // every cursor write and every hover, which is exactly what it cost before it was memoised.
    [scaleMode, ranked, rows],
  );

  // ⚠️ ONE `lines` ARRAY PER PLANE, HELD STILL (2026-09-19). `TrendChart`'s plot is
  // memoised, and a `lines={[…]}` literal in the JSX below would be a fresh reference on every
  // render — which is EVERY cursor write and every hover, the two things the memo exists to
  // absorb. The chart is a one-series chart here, so the array's whole content is the metric's
  // name, the roster row's already-stable points and its hue: a Map built beside the roster pass
  // it reads from, on exactly the deps that pass has.
  const linesById = useMemo(() => {
    const m = new Map<string, TrendLine[]>();
    for (const [id, row] of rows) m.set(id, [{ label: shown, points: row.series.points, hue: row.hue }]);
    return m;
  }, [rows, shown]);

  // THE DRAG GUARD (see the header): pointerdown records where the press started, pointerup says
  // whether it travelled, and `activate` drops a click that did. Refs, not state — a gesture must
  // never re-render five charts.
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  };
  // A PRESS THAT TRAVELS IS A BRUSH, NOT A CLICK (2026-09-26). It used to be handed to the canvas
  // as the scene's orbit (`orbitHandoff`, 2026-09-19); History has had no orbit since 2026-09-26
  // (`viewPolicy.rotate` is false — the cards hold their implied places and a click brings one
  // forward), so the drag was free, and the user asked for the document's own gesture on the
  // scene's charts: "create a window also in the main chart". The front chart's `onRange` brush
  // (the same one the document's charts run) commits the range for the whole stack, exactly as
  // the band's timeline does; `dragged` keeps the click the browser synthesises after the
  // release from also landing as a cursor pick.
  const onPointerMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d || e.buttons === 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DRAG_SLOP) return;
    dragged.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    dragged.current = dragged.current || (!!d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_SLOP);
  };
  // UP / DOWN IS THE VIEW'S THIRD AXIS (user, 2026-09-19). Left/right on the timeline is WHEN, the
  // depth of the stack is WHO, and the measure — WHAT — had no gesture on the canvas. The control
  // is the Networks card's heading control (`ExplorerHeading`, 2026-09-26 — it was the title under the bar) and
  // `↑`/`↓` from inside a card. Every card steps together (a stack whose planes each showed a different
  // measure would stop being a comparison), through the ONE order the picker reads, and the ends
  // go inactive rather than wrapping. A SETTING, not a selection — it writes its setter directly,
  // as the picker does (`selectionBoundary` names it out of scope).
  // ⚠️ THERE IS NO SWIPE. A vertical touch swipe on a card stepped the measure for a few hours —
  // until a drag on a card became a gesture of its own (the orbit then, the brush now), and one
  // gesture cannot mean both. The rail's heading control is a finger-sized target, so touch lost
  // nothing.
  const stepMeasure = (dir: -1 | 1) => {
    const next = stepMetric(useStore.getState().trendMetric, dir);
    if (next) setMetric(next);
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
      // `group/stack` + `data-roll`: every plot's roll is ONE attribute on this root, so five
      // charts leave and arrive together without five pieces of state (`ROLL_CLASS` reads it).
      // The two offsets are the direction: the next measure rises into place, the previous drops.
      data-roll={staged.phase}
      style={{
        ["--roll-out-y" as string]: staged.dir === "next" ? "-10px" : "10px",
        ["--roll-in-y" as string]: staged.dir === "next" ? "14px" : "-14px",
      }}
      className="group/stack absolute inset-0 pointer-events-none z-[4] opacity-0 [transition:opacity_var(--tempo-nav)_ease] data-[on='1']:opacity-100 motion-reduce:!transition-none"
    >
      {more && (
        // THE HINT CARD: the same anchor contract as every plane (0-size, origin-top-left,
        // invisible until projected — the projector writes its matrix and visibility), the same
        // opaque face, no network, no chart, no hue, no pointer events. A count is an honest fact
        // (rule 10), and it is the only thing printed, so the card can never read as a chart.
        <div
          key={MORE_ID}
          data-plane={MORE_ID}
          aria-hidden
          className="absolute left-0 top-0 origin-top-left invisible touch-none pointer-events-none"
          style={{ opacity: more.opacity, zIndex: Math.round(100 + more.z) }}
        >
          <div
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border p-2 [background:linear-gradient(var(--panel-solid),var(--panel-solid)),var(--scene-ground)]"
            style={{ width: PLANE_PX_W, height: PLANE_PX_H }}
          >
            <div className="px-2 py-1 text-label text-muted-foreground select-none">
              {behind} more
            </div>
          </div>
        </div>
      )}
      {poses.map((pose) => {
        // The one roster pass the rank, the ceiling and both rails read — already cut by the
        // metric's own edge rule, so a rail can never quote a bucket this plane does not draw.
        const row = rows.get(pose.id);
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
              // `touch-none`: a finger that drags the front card is brushing a range (see
              // `onPointerMove`), so the browser must not claim the gesture for a pan and cancel the
              // pointer mid-drag.
              "absolute left-0 top-0 origin-top-left invisible touch-none",
              // The body takes no pointer events — the wheel's zoom belongs to the canvas beneath.
              // The one plane the pose marks interactive is the exception, and its header strip
              // re-enables them below whatever the pose says. `pointer-events` inherits, so the
              // 0-size anchor carrying it reaches the plane inside.
              pose.interactive ? "pointer-events-auto" : "pointer-events-none",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            // THE INTERACTIVE PLANE'S WHOLE BODY is a target too — it is the one plane a click
            // cannot be ambiguous about, and asking for the header strip alone on a plane that is
            // already in front reads as a dead surface. Every other plane keeps the body inert, so
            // the canvas beneath still takes the wheel. The header strip stops its own click, so the
            // two never fire for one press.
            onClick={pose.interactive ? () => activate(pose.id, false) : undefined}
            // ↑ / ↓ STEP THE MEASURE from anywhere inside a card (its head strip is the focusable
            // part). The default is taken so an arrow never scrolls a rail or the page under it.
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              stepMeasure(e.key === "ArrowDown" ? 1 : -1);
            }}
            style={{
              // Every card is opaque at every depth (see the header) — `pose.opacity` is 1 across
              // the stack, read here rather than assumed so the domain stays the one statement.
              opacity: pose.opacity,
              // PAINT ORDER IS DEPTH, from the pose itself: a nearer plane (larger z) paints over
              // a farther one, so a focused plane — re-dealt to slot 0 — paints over the rest. Local
              // to this root, which is its own stacking context; the offset keeps it positive.
              zIndex: Math.round(100 + pose.z),
            }}
          >
            {/* THE PLANE — an opaque card centred on the anchor's projected point, content-height.
                Width is the shared `PLANE_PX_W`; the projector divides by the same constant, so the
                two sides cannot drift about how big a plane is.
                ⚠️ TWO BACKGROUND LAYERS, ONE SHORTHAND: `--panel-solid` is 0.92-alpha glass, so on
                its own the card would still leak the plane behind it. Laid over the opaque
                `--scene-ground` it is solid — and both are tokens, so both grounds follow.
                A PREVIEWED CARD TAKES ITS NETWORK'S HUE ON THE HAIRLINE AND AS A WASH ON ITS FACE
                (rule 9 — hovers preview, never commit). The wash is the explorer rows' own
                `.nb-row.subject-paired` recipe — the hue at a low mix — laid as a THIRD background
                layer over the two below, so the card stays opaque (user, 2026-09-26: the hairline
                alone did not read as the pairing the rows show). It was an opacity lift while the
                cards were translucent; on an opaque deck there is no opacity left to spend, and the
                app's `.subject-paired` glow is a box-shadow, which a transformed plane may not
                carry (see NO BLUR, NO SHADOW above). */}
            <div
              className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border p-2 [background:linear-gradient(var(--panel-solid),var(--panel-solid)),var(--scene-ground)] [transition:border-color_0.16s_ease] motion-reduce:!transition-none"
              style={{
                width: PLANE_PX_W,
                ...(pair.paired
                  ? {
                      borderColor: `color-mix(in oklch, ${row.hue ?? "var(--primary)"} 60%, transparent)`,
                      background: `linear-gradient(color-mix(in oklch, ${row.hue ?? "var(--primary)"} 12%, transparent), color-mix(in oklch, ${row.hue ?? "var(--primary)"} 12%, transparent)), linear-gradient(var(--panel-solid), var(--panel-solid)), var(--scene-ground)`,
                    }
                  : {}),
              }}
            >
            {p && (
              <TrendChart
                name={row.name}
                // ITS OWN SYNC GROUP (2026-09-19). recharts syncs hover across every chart sharing
                // a `syncId`, and the stack stays MOUNTED behind the raw layer's document — so on
                // the document's shared group a hover there re-rendered these five hidden plots.
                // The planes are a group of their own: a hover on one plane still marks the same
                // bucket on its neighbours, which is the whole point of reading a stack at one
                // instant, and the document's column is untouched.
                syncId="trend-stack"
                // The unit word follows the TIER — an hourly bucket labelled "per day" would
                // misstate every reading by a factor of 24 (the document's own rule).
                // THE CARD NAMES ITS MEASURE, not just its unit — it can be stepped from right here,
                // so the card has to say what it turned into.
                unit={caption}
                format={roster.format}
                note={pending ? "reading the hourly samples…" : undefined}
                buckets={axis}
                stepMs={step}
                sampled={row.series.sampled}
                gaps={row.series.gaps}
                lines={linesById.get(pose.id)!}
                scaleMax={sharedMax}
                cursorMs={cursorMs}
                onPick={(ms) => {
                  if (!dragged.current) setTrendCursor(ms);
                }}
                onRange={pose.interactive ? (fromMs, toMs) => setTrendRange({ fromMs, toMs }) : undefined}
                // THE PLANE CARRIES ITS COLOUR AS AN AREA, and only here — on the card's solid face
                // it reads as the network's own tint. A plain boolean, so it holds the plot's memo
                // as still as every other prop on this call.
                fill
                // A card is ONE chart read on its own, so its plot is taller than the document's
                // small-multiples. The number is the domain's: the ground's drop and the flat
                // column's pitch are derived from the card's height.
                plotHeight={PLANE_PLOT_PX_H}
                // THE PLOT ROLLS ON A MEASURE CHANGE, inside a frame that holds still: the card is
                // the NETWORK, and the network did not change — only what is being read off it.
                // A CSS transition keyed off the root's `data-roll`, NOT a remount: the plots leave
                // on the compositor, swap while invisible and ease back in (`useStagedMeasure`).
                rollClassName={ROLL_CLASS}
                className="w-full"
                // THE HEAD IS THE TARGET, so it reads as one: the pointer's own cursor, the app's
                // hover wash, and a focus ring for the keyboard. It needs no plate of its own any
                // more — it sits on the card's solid face. A hover previews, it never commits
                // (rule 9).
                headClassName="pointer-events-auto cursor-pointer px-2 py-1 rounded-md hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
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
                  // …and then the axis a reader cannot see from here: ↑/↓ steps the measure.
                  label: `${row.name} ${caption} — ${
                    focus === pose.id ? "send back" : "bring forward"
                  }. Up and down arrows change the measure`,
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
