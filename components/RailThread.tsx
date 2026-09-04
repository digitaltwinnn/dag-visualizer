"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { SHELL_ID } from "@/components/SectionShell";

// A rail's instrument-channel thread, a fixed SVG running down the rail's OUTER edge (in the margin,
// just outside the cards). Measured from the live layout (ResizeObserver / MutationObserver / scroll)
// so it tracks the cards as they're added, grow, or the rail scrolls; fades top+bottom (CSS mask);
// purely decorative (pointer-events: none — see the no-effect-bleed rule). Must live OUTSIDE the rail
// div (a sibling) — the rail clips horizontally + can gain an overflow-fade mask, either of which
// would blank a child thread (see Inspector / ExploreRail).
//
// BOTH rails carry the full identity thread, MIRRORED (design evolution, Task 12): neutral ruler +
// an identity-hued spine (cyan for "all") + a node-dot on each card. The threads are the HUD's
// RESTING identity cue — the cards themselves are spineless at rest (a card's edge is a transient
// signal channel only; see the "Card signal system" block in globals.css). The left thread is the
// exact x-mirror of the right one (x' = W − x), ticks pointing outward toward the screen edge.
//
// Ruler-hairline spec — mirrors the CSS `--thread-*` tokens (globals.css) so the SVG threads and the
// bar-chart axis read identically. The lines below consume them via the `.thread-rule`/`.thread-tick`/
// `.thread-tick-major` classes (globals.css, unlayered) — a CSS PROPERTY on SVG resolves var() even
// though a presentation ATTRIBUTE (`stroke="…"`) doesn't, which is why this used to mirror the tokens
// as literal consts (retired 2026-08-21).
const TICK_PITCH = 13; // px between hairlines

type Side = "left" | "right";

// Concrete svg-x per side (x grows rightward within the svg). Both rails now sit in the same 26px
// outer margin (globals.css #leftcol/#rightcol), so the left thread is the EXACT mirror of the
// right (every x' = W − x): card edge → connector → identity spine + dots → neutral line → ticks
// stepping outward toward the screen edge.
const GEOM: Record<Side, {
  W: number; neut: number; tickMaj: number; tickMin: number;
  identity: number; dot: number; conn: number;
}> = {
  right: { W: 22, neut: 16, tickMaj: 22, tickMin: 20, identity: 9, dot: 9, conn: 1 },
  left:  { W: 22, neut: 6,  tickMaj: 0,  tickMin: 2,  identity: 13, dot: 13, conn: 21 },
};

// The resting thread is deliberately DIM (Task 13 follow-up, user: the rails read too bright at
// rest): the LINES — neutral ruler line + ticks + the identity spine — are scaled to 60% opacity
// so the brightness budget goes to the SIGNALS (the view-switch pulse below and the card edge
// signals). The NODE DOTS (connector + halo + dot) keep their ORIGINAL full brightness (user
// adjustment) — they are the per-card markers, not ambient furniture. Hues unchanged; the CSS
// `--thread-*` tokens (other consumers: sheet rulers, bar-chart axis, card hover whisper) are NOT
// touched. The value itself is the SHARED `--rail-rest-dim` token (globals.css :root) — the
// tablet/phone sheet's `.ig-sheet-edge` channel dims by the same factor, so rest vs signal
// contrast is consistent across breakpoints. 0.6 here is the SVG-attribute fallback (SVG `opacity`
// attributes don't resolve CSS vars; the group uses a style prop instead — see below).
const REST_DIM = "var(--rail-rest-dim, 0.6)";

// The thread's soft top/bottom entry, in PIXELS — see the render note where it is applied for why
// a percentage was the wrong unit here. The top ramp is short enough to clear the first card's
// eyebrow (~16px below the rail's top edge); the bottom keeps the length the percentage used to
// give it at a typical viewport, since what it dissolves into is the end of the lane.
const TOP_FADE = 10;
const BOT_FADE = 44;
const THREAD_FADE = `linear-gradient(to bottom, transparent 0, #000 ${TOP_FADE}px, #000 calc(100% - ${BOT_FADE}px), transparent 100%)`;

/** One card's marker on the thread. `inset` = the card's measured step-back from the rail edge
 *  (all cards sit flush since the card redesign retired RUNG_STEP — kept measured so a future
 *  layout change can't desync the connectors); `focus` = the finest committed rung; `ghost` =
 *  an empty slot showing its hint; `entry` = an UNBOXED ancestor entry (its tie-line rests
 *  dimmer than a box's — a STATE distinction, not a depth one; see the render note). */
type Mark = { y: number; inset: number; focus: boolean; ghost: boolean; entry: boolean };

// RETIRED with the SLAB (2026-08-08, same day it shipped): the DEPTH-REACH funnel — an unboxed
// entry's tie-line reaching into the lane, one REACH_STEP shorter per rung, terminal-ticked,
// funnelling onto the open box. It encoded ladder containment on the thread, which the slab now
// states physically (`.rail-ladder`, globals.css: committed entries abut into one pile the focus
// box breaks out of). Two encodings of the same depth on one rail is the two-instrument problem
// again, one rail-width narrower — so the labour split is THE STACK CARRIES DEPTH, THE THREAD
// CARRIES STATE. Every connector is the standard short measured tie again, which also lets the
// SVG box shrink back to `W` (the funnel needed a REACH_PAD widening on the lane side, because
// the top/bottom fade MASK clips to the element box and ink outside it draws at alpha 0).

// STANDALONE MODE (2026-09-04): the doc overlay wants this same instrument at the view's edges
// (user: "the rails should just sit at the edge of the view like any other view … this should be
// an existing component, not a guess and/or duplication") — but DocGate unmounts the rail columns
// this component normally measures. `standalone` renders the ruler + identity spine + pulse with
// NO card marks (there are no cards), deriving its x from the same facts the rails' own CSS uses:
// `--rail-margin` places the column, and the thread sits in the gutter outside it (right → at the
// rail's right edge; left → W to the left of its left edge — the mirror of the measured branch).
// It mounts OUTSIDE the shell, so viewport units are its local units and no `k` rescale applies.
// `signal` folds an extra subject into the pulse key so a host can play the view-switch pulse on
// its own arrivals (DocLayer keys it on the risen document).
export default function RailThread({
  side = "right",
  standalone = false,
  signal = "",
}: { side?: Side; standalone?: boolean; signal?: string }) {
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  // The accent may be a hex (a committed metagraph) OR a var() (all → --primary, unlisted →
  // --muted-foreground). Either way it is set ONCE as the SVG's `color` style property and
  // every accent stroke/fill below rides `currentColor` — a native SVG keyword, so the var()
  // cases resolve through CSS instead of needing a resolved-hex mirror in JS. That retires the
  // whole 2026-08-08 bug class (the one-size core-hex fallback repainting the unlisted thread),
  // and it is what lets the accent track the per-network [data-net] --primary override.
  const accent = filterAccent(filter);
  const [g, setG] = useState<{ top: number; left: number; height: number; marks: Mark[] } | null>(null);

  // View-switch AND filter-change signal: either plays the SAME travelling-light language as the
  // cards on BOTH threads — the shared `useEdgePulse` hook (once per change, debounced, skips
  // mount, reduced-motion → CSS static blink) driving the shared `.edge-pulse` recipe, overlaid
  // on the identity spine (the recipe is HTML/CSS, so it rides a fixed wrapper rather than the
  // SVG). ONE combined subject key: a simultaneous mode+filter change is a single key change →
  // one pulse (and the hook's PULSE_MS debounce keeps rapid back-to-back changes calm).
  const pulseKey = useEdgePulse(`${mode}|${filter}|${signal}`);

  const { W } = GEOM[side];
  const railId = side === "right" ? "rightcol" : "leftcol";

  useEffect(() => {
    // Standalone: no rail to measure, no marks to place — the geometry is the tokens' own.
    // `--rail-margin` is a plain px token (globals.css :root), so parseFloat is exact.
    if (standalone) {
      const measure = () => {
        const margin =
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--rail-margin"),
          ) || 26;
        const left = side === "right" ? window.innerWidth - margin : margin - W;
        setG({ top: 0, left, height: window.innerHeight, marks: [] });
      };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const rail = document.getElementById(railId);
    if (!rail) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = rail.getBoundingClientRect();
      // ⚠️ VIEWPORT → SHELL-LOCAL, and it is load-bearing. The rails and this SVG are
      // `position: fixed` INSIDE the SectionShell wrapper, whose inline transform makes IT their
      // containing block (CSS trap 2) — so the `top`/`left` written below resolve in the wrapper's
      // own UNSCALED coordinate space, while getBoundingClientRect reports the TRANSFORMED viewport
      // box. The two agree only while the wrapper sits at scale 1, which is exactly what the RAW
      // switch breaks: it scales the wrapper to SCENE_BACK to recede the scene.
      //
      // The bug (user, 2026-08-09 — "go to raw mode, switch to another view, exit raw mode and the
      // rail is not aligned well with the cards"): switching views with the raw layer up mutates the
      // rail's cards, the MutationObserver measures inside the SCALED frame, and that geometry
      // survives the trip back — an ancestor transform changes no border box, so NEITHER the
      // ResizeObserver NOR the MutationObserver fires when the scale returns to 1, and nothing
      // re-measures. Measuring in local units removes the coupling instead of chasing it: the rail's
      // local box doesn't move when the shell scales, so a measurement is valid at any scale and
      // needs no re-run. (`k` is uniform — GSAP tweens `scale`; the shell is `fixed inset-0`, so its
      // offsetWidth is the unscaled width. No shell → identity, which is what a test/story sees.)
      const shell = document.getElementById(SHELL_ID);
      const sr = shell?.getBoundingClientRect();
      const k = sr && shell!.offsetWidth ? sr.width / shell!.offsetWidth : 1;
      const px = (v: number) => v / k; // a LENGTH in local units
      const lx = (v: number) => (v - (sr?.left ?? 0)) / k; // a viewport X → local X
      const ly = (v: number) => (v - (sr?.top ?? 0)) / k; // a viewport Y → local Y
      const hRail = px(r.height);
      // ⚠️ THE RULER RUNS THE FULL VIEWPORT (user, 2026-09-01: "extend the ruler on the left- and
      // right- side all to the top and bottom of the view OR give the bottom- and top-bar less
      // margin"). It already ran the whole rail LANE (2026-08-09), which stops below the command
      // bar and above the vitals band — leaving an empty gutter square in all four corners. Of the
      // two offers this is the one that keeps earlier decisions intact: pulling the bars out to
      // meet it would put them over this gutter, which is exactly what 2026-08-30 moved them off
      // ("the band sits on top of the rail of the side panels").
      //
      // Nothing is covered by the extension: the ruler lives in the 22px gutter OUTSIDE
      // `--bar-margin`, so the length it gains runs beside the two bars rather than under them.
      // The px top/bottom fades do the rest — the ink reaches the corners and dies there.
      const ORIGIN_VY = 0;
      // Every rail card carries a thread marker: `.ig-panel` (the shared glass frame — the ONE
      // materialized box + the left rail's tool cards) or `.rail-entry` (the unboxed ancestor
      // entries + ghost hint lines, card-redesign 2026-08-08). The thread drops a dot at each
      // one's middle. NB the query is DEPTH-AGNOSTIC (2026-08-02): the facts rail nests its
      // ladder rungs in a lane, so `:scope >` matched nothing and the thread silently lost every
      // card dot. Nested panels (a card inside a card) would double-count, so only outermost ones
      // count.
      const cards = Array.from(rail.querySelectorAll<HTMLElement>(".ig-panel, .rail-entry")).filter(
        (c) => !c.parentElement?.closest(".ig-panel"),
      );
      const raw = cards
        .map((c) => {
          const cr = c.getBoundingClientRect();
          const rung = c.closest<HTMLElement>("[data-depth]");
          const entry = c.classList.contains("rail-entry") && !c.hasAttribute("data-ghost");
          // ONE connector anatomy (user, 2026-08-08): every populated mark — unboxed ENTRY and
          // materialized BOX alike — ties in at its EYEBROW's height (the entry's centre put the
          // line through the title-row aside; the box's centre wandered with its body height).
          // Ghosts keep the card-middle tie (their single hint line IS their middle).
          const eb = !c.hasAttribute("data-ghost") ? c.querySelector("[data-eyebrow]") : null;
          const er = eb?.getBoundingClientRect();
          return {
            // ⚠️ MEASURED FROM THE SVG'S ORIGIN, WHICH IS THE VIEWPORT'S TOP, NOT THE RAIL'S.
            // The ruler now starts above the rail (see the height note below), so a dot placed
            // relative to `r.top` would sit `--rail-top` too high — the whole instrument would
            // still line up with itself and be wrong against every card.
            y: px((er ? er.top + er.height / 2 : cr.top + cr.height / 2) - ORIGIN_VY),
            // Measured, not derived from a shared step constant — a scrollbar or a future layout
            // tweak can't put the connectors out of register with the real card edges.
            inset: px(side === "right" ? r.right - cr.right : cr.left - r.left),
            focus: !!rung?.hasAttribute("data-focus"),
            ghost: c.hasAttribute("data-ghost"),
            entry,
          };
        })
        // ⚠️ THE CLIP IS THE RAIL'S BAND, EXPRESSED IN THE RULER'S SPACE. It read `0 … hRail`
        // while both the marks and the rail shared an origin; now the marks are measured from the
        // viewport's top and the rail starts `--rail-top` below it, so the same two numbers would
        // silently drop every dot in the lower `--rail-top` pixels of the lane — the bottom cards
        // losing their marks for no visible reason. The rule is unchanged (a card scrolled out of
        // the rail gets no dot just because the ruler is longer than the content); only the frame
        // it is stated in moved.
        .filter((m) => m.y >= px(r.top - ORIGIN_VY) + 6 && m.y <= px(r.bottom - ORIGIN_VY) - 6);
      // Normalise: the shallowest card defines "flush", so a scrollbar (or any constant gutter)
      // offsets nothing and depth 0 always reads as depth 0.
      const base = raw.length ? Math.min(...raw.map((m) => m.inset)) : 0;
      const marks = raw.map((m) => ({ ...m, inset: Math.round(m.inset - base) }));
      // Sit in the margin just OUTSIDE the cards, MIRRORED: right → the box starts AT the rail's
      // right edge and runs outward; left → its width to the LEFT of the rail's left edge. Both
      // land inside the 26px page gutter (`#leftcol`/`#rightcol`), ticks reaching toward the screen
      // edge. ⚠️ `r.right - W` here (the shape the funnel's `r.right - REACH_PAD` collapsed to when
      // the pad left the WIDTH but not the ORIGIN) slides the whole thread a full band INSIDE the
      // rail, so the connectors start under the cards and the ruler lands on their right 22px.
      const left = side === "right" ? lx(r.right) : lx(r.left) - W;
      // FULL-LANE height (user, 2026-08-09: "the left and right can be extended to the view […]
      // same as we have already in tablet mode"). The rails are content-height (`display: flex` +
      // `max-height` band, globals.css), so `r.height` ended the ruler at the last card and a
      // two-card view got a stub of an instrument. The thread now runs the whole lane — top of the
      // rail to the bottom of its own band — like the tablet sheet's `.ig-sheet-edge` channel. The
      // band is
      // READ from the rail's computed `max-height` rather than recomputed here, so the
      // rail-top/topbar-extra/bottom-reserve token math stays in one place (and is already in local
      // CSS px, like every value here); `|| hRail` covers a `none`. Marks stay clipped to the rail's
      // own height above — a card scrolled out of the rail must not get a dot just because the ruler
      // is longer than the content.
      // The lane's own extent is still what MARKS are clipped to (a card scrolled out of the rail
      // must not get a dot just because the ruler is longer than the content) — that clip lives
      // with the marks above and is unaffected by the ruler's new length.
      const band = parseFloat(getComputedStyle(rail).maxHeight) || hRail;
      void band;
      setG({ top: ly(ORIGIN_VY), left, height: Math.round(px(window.innerHeight - ORIGIN_VY)), marks });

    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    schedule();

    // ⚠️ THE RAIL SLIDES, AND A SLIDE IS NOT ONE MEASUREMENT (user, 2026-09-01: the ruler's
    // "anchor to the card" breaks when the strip opens — "cards move down, ruler stays
    // unchanged"; present in prod, so it predates the corner-to-corner change).
    //
    // Opening a top-bar strip writes `--topbar-extra`, which moves the rails DOWN by that much
    // over a 0.35s CSS transition. Neither existing observer answers that: a ResizeObserver
    // watches SIZE and a position change has none, and while it does happen to fire once here
    // (the rail's `max-height` shrinks), one callback lands at the START of the slide — measured,
    // the dots stayed at 108 while their eyebrows travelled to 187, a drift of exactly the
    // published 79px. This is the same family as the transform bug the header above records:
    // the thing that moved fires no event of its own.
    //
    // So the ruler FOLLOWS the slide rather than sampling it: `--topbar-extra` is written to
    // `documentElement.style`, which IS observable, and each write starts a per-frame re-measure
    // lasting the rail's own transition (read from it, so re-tuning the CSS re-tunes this) plus a
    // frame. Under reduced motion the duration is 0 and the loop is the single frame an instant
    // jump needs. It costs nothing at rest — there is no polling, only a burst per strip toggle.
    let follow = 0;
    const followSlide = () => {
      cancelAnimationFrame(follow);
      const ms = (parseFloat(getComputedStyle(rail).transitionDuration) || 0) * 1000 + 60;
      const until = performance.now() + ms;
      const step = () => {
        measure();
        follow = performance.now() < until ? requestAnimationFrame(step) : 0;
      };
      follow = requestAnimationFrame(step);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(rail);
    const mo = new MutationObserver(schedule);
    // `attributes: style` joined childList for HeightEase (2026-09-04): a rung's height ease
    // writes inline style twice (pin, clear) and WAAPI itself mutates nothing — in a rail at
    // max-height the box never resizes, so without these two signals the dots measured at the
    // swap frame and stayed there while the cards eased away underneath (the "thing that
    // moved fires no event" family this file keeps records of). During the ease itself the
    // rail's own ResizeObserver covers the content-height case frame by frame.
    mo.observe(rail, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    // The rails' own offsets ride tokens on the ROOT (`--topbar-extra`, `--bottom-reserve`), and
    // every one of them is set through `documentElement.style` — so one attribute filter covers
    // each thing that can move a rail without resizing it.
    const rootMo = new MutationObserver(followSlide);
    rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    rail.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(follow);
      ro.disconnect();
      mo.disconnect();
      rootMo.disconnect();
      rail.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [railId, side, W, standalone]);

  if (!g || g.height <= 0) return null;
  const H = g.height;
  const gm = GEOM[side];
  const ticks: number[] = [];
  for (let y = 10; y <= H - 10; y += TICK_PITCH) ticks.push(y);

  return (
    <>
      <svg
        // `max-[1099px]:!hidden` is the tablet/phone safety net (was 16-responsive-shell.css's
        // `#leftcol, #rightcol, .rail-thread { display: none !important }`): the rail components only
        // render this SVG in their desktop branch, but SSR/first-paint assume desktop (useBreakpoint),
        // so this hides the fixed thread below the desktop breakpoint until the effect resolves. `!`
        // beats nothing here (the SVG has no id rule), but mirrors the rails' `!hidden` for parity.
        className="fixed z-[11] pointer-events-none overflow-visible max-[1099px]:!hidden"
        width={W}
        height={H}
        style={{
          top: g.top,
          left: g.left,
          // The one place the accent is stated — every accent stroke/fill in this SVG is
          // `currentColor`, so a var() accent resolves in CSS, never in JS.
          color: accent,
          // Fades the thread top/bottom so it reads as an instrument rail, not a hard bar
          // (was `.rail-thread`, 13-right-column.css). Kept as inline style, not a Tailwind
          // arbitrary property, since the vendor-prefixed property name doesn't round-trip
          // cleanly through the utility-class syntax.
          //
          // ⚠️ THE RAMPS ARE FIXED PIXELS, NOT PERCENTAGES (user, 2026-08-13 — "rail top-fade
          // should be a bit less, can't see the vertical line that is linked to the metagraph
          // cards when its collapsed"). What has to clear the top ramp is the FIRST card's
          // eyebrow, and that sits a fixed ~16px below the rail's top edge whatever the viewport
          // does — while the old `7%` measured against the whole LANE height, so a taller window
          // pushed the ramp further down over a mark that never moved (measured at 1600×897: a
          // 43px ramp over a mark at y=16, leaving the topmost tie-line and dot at ~37% alpha).
          // TOP_FADE clears that mark outright; BOT_FADE keeps the old ~43px so the lane still
          // dissolves into the bottom of the band rather than ending on a cut.
          WebkitMaskImage: THREAD_FADE,
          maskImage: THREAD_FADE,
        }}
        aria-hidden
        focusable="false"
      >
        {/* The RULER (neutral line + ticks) is barely dimmed — its greys are already muted, so
           the resting REST_DIM read as over-faded there (user); only the COLOURED identity
           spine takes the full resting dim, keeping brightness for the signals + node dots. */}
        <g style={{ opacity: 0.9 }}>
          {/* neutral base line — SOFT/muted; carries the ruler ticks. */}
          <line x1={gm.neut} y1={0} x2={gm.neut} y2={H} className="thread-rule" strokeWidth={1} />
          {/* ruler ticker hatches — short marks stepping OUTWARD from the neutral line toward the screen
             edge; muted, every 4th a touch longer/brighter (an instrument scale). */}
          {ticks.map((y, i) => (
            <line key={i} x1={gm.neut} y1={y} x2={i % 4 === 0 ? gm.tickMaj : gm.tickMin} y2={y} className={i % 4 === 0 ? "thread-tick-major" : "thread-tick"} strokeWidth={1} />
          ))}
        </g>
        <g style={{ opacity: REST_DIM }}>
          {/* identity line — BOTH rails, mirrored (the HUD's resting identity cue; cards are
             spineless at rest). The line is the selection's hue. */}
          <line x1={gm.identity} y1={0} x2={gm.identity} y2={H} stroke="currentColor" strokeWidth={2} />
        </g>
        {/* node-dots — OUTSIDE the dim group at original full brightness (user adjustment): one per
           card at its middle, tethered to the card edge by the connector. The thread is the rail's
           ONE instrument (2026-08-02), and since the SLAB it carries STATE ALONE — depth is stated
           physically by the cards themselves (committed entries abut into one pile the focus box
           breaks out of; `.rail-ladder`, globals.css). So: every connector is the same short
           measured tie, and the DOT says what the slot is — hollow for a ghost (an empty slot
           showing its hint), solid for a populated card, solid + a wider halo for the focus rung
           (the finest committed one). The rail still shows the view's whole possibility space and
           where you are; it just no longer says "how deep" twice. */}
        {g.marks.map((m, i) => {
          const x1 = side === "right" ? gm.conn - m.inset : gm.conn + m.inset;
          return (
            <g key={i} opacity={m.ghost ? 0.5 : 1}>
              {/* An unboxed ancestor's tie rests dimmer than a box's — a STATE tier (materialized
                 vs shed its glass), matching the entries' own distance dim, not a depth encoding. */}
              <line x1={x1} y1={m.y} x2={gm.dot} y2={m.y} stroke="currentColor" strokeWidth={1.25} opacity={m.focus ? 0.9 : m.entry ? 0.55 : 0.7} />
              {m.ghost ? (
                <>
                  {/* punch first, then the ring — a hollow dot still has to sit ON the spine. A CSS
                     PROPERTY (style), not the `fill` attribute, so var() resolves; `.thread-punch`
                     is stroke-only (its other consumer below keeps its own currentColor fill). */}
                  <circle cx={gm.dot} cy={m.y} r={4.2} style={{ fill: "var(--thread-punch)" }} />
                  <circle cx={gm.dot} cy={m.y} r={3.2} fill="none" stroke="currentColor" strokeWidth={1.3} />
                </>
              ) : (
                <>
                  <circle cx={gm.dot} cy={m.y} r={m.focus ? 7 : 5} fill="currentColor" opacity={m.focus ? 0.26 : 0.16} />
                  <circle cx={gm.dot} cy={m.y} r={3.4} fill="currentColor" className="thread-punch" strokeWidth={1.5} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {/* View-switch pulse — the SAME `.edge-pulse` recipe the cards use (soft line fade-in, bright
         gradient-tipped segment sweeping down, fade-out; reduced motion → one static blink),
         overlaid on the identity spine at full brightness (outside the dimmed SVG). The wrapper is
         the fixed positioning context for the recipe's absolute span: 3px wide, centred on the
         spine (`gm.identity`, stroke-width 2), `--spine` carries the identity hue into the
         recipe's `--pulse-hue`. Keyed remount per pulse is PulseEdge's own contract. */}
      {pulseKey > 0 && (
        <div
          className="fixed z-[12] pointer-events-none max-[1099px]:!hidden"
          style={{
            top: g.top,
            left: g.left + gm.identity - 2.5,
            width: 3,
            height: H,
            ["--spine" as string]: accent,
          } as CSSProperties}
          aria-hidden
        >
          <PulseEdge pulseKey={pulseKey} rail="left" />
        </div>
      )}
    </>
  );
}
