"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent, CORE_HEX } from "@/src/data/network";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";

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
// bar-chart axis read identically. Kept as literals because an SVG stroke ATTRIBUTE can't resolve a
// CSS var(); keep the two in sync.
const TICK_PITCH = 13; // px between hairlines
const TICK_LINE = "rgba(178,193,223,0.40)"; // neutral base line (CSS --thread-line)
const TICK_MINOR = "rgba(178,193,223,0.3)"; // short hairline
const TICK_MAJOR = "rgba(178,193,223,0.42)"; // every 4th — longer + brighter

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

// The dark punch behind a node-dot, separating it from the identity spine it sits on. NB a real
// hex, not var(--panel): an SVG `fill`/`stroke` ATTRIBUTE doesn't resolve CSS custom properties.
const PUNCH = "#0c1020";

/** One card's marker on the thread. `inset` = how far the card is stepped back from the rail (its
 *  ladder depth, measured rather than shared as a constant — see Inspector's RUNG_STEP), so the
 *  connector reaches exactly to its edge; `focus` = the finest committed rung; `ghost` = an empty
 *  slot showing its hint. */
type Mark = { y: number; inset: number; focus: boolean; ghost: boolean };

export default function RailThread({ side = "right" }: { side?: Side }) {
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  // Resolve to a real colour: filterAccent returns `var(--primary)` for "all", but an SVG `stroke`
  // ATTRIBUTE doesn't resolve CSS custom properties — so the identity line + dots rendered invisible
  // on "all". Fall back to the core hex for the var() case.
  const rawAccent = filterAccent(filter);
  const accent = rawAccent.startsWith("var(") ? CORE_HEX : rawAccent;
  const [g, setG] = useState<{ top: number; left: number; height: number; marks: Mark[] } | null>(null);

  // View-switch AND filter-change signal: either plays the SAME travelling-light language as the
  // cards on BOTH threads — the shared `useEdgePulse` hook (once per change, debounced, skips
  // mount, reduced-motion → CSS static blink) driving the shared `.edge-pulse` recipe, overlaid
  // on the identity spine (the recipe is HTML/CSS, so it rides a fixed wrapper rather than the
  // SVG). ONE combined subject key: a simultaneous mode+filter change is a single key change →
  // one pulse (and the hook's PULSE_MS debounce keeps rapid back-to-back changes calm).
  const pulseKey = useEdgePulse(`${mode}|${filter}`);

  const { W } = GEOM[side];
  const railId = side === "right" ? "rightcol" : "leftcol";

  useEffect(() => {
    const rail = document.getElementById(railId);
    if (!rail) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = rail.getBoundingClientRect();
      // Every rail card carries `.ig-panel` (the shared glass frame); the thread drops a dot at
      // each one's middle. (Was `:scope > .panel` before the Card-frame swap retired 12-panel-system.)
      // NB the query is DEPTH-AGNOSTIC (2026-08-02): the facts rail nests its ladder rungs in a
      // lane, so `:scope >` matched nothing and the thread silently lost every card dot. Nested
      // panels (a card inside a card) would double-count, so only outermost ones count.
      const cards = Array.from(rail.querySelectorAll<HTMLElement>(".ig-panel")).filter(
        (c) => !c.parentElement?.closest(".ig-panel"),
      );
      const raw = cards
        .map((c) => {
          const cr = c.getBoundingClientRect();
          const rung = c.closest<HTMLElement>("[data-depth]");
          return {
            y: cr.top + cr.height / 2 - r.top,
            // Measured, not derived from a shared step constant — a scrollbar or a future layout
            // tweak can't put the connectors out of register with the real card edges.
            inset: side === "right" ? r.right - cr.right : cr.left - r.left,
            focus: !!rung?.hasAttribute("data-focus"),
            ghost: c.hasAttribute("data-ghost"),
          };
        })
        .filter((m) => m.y >= 6 && m.y <= r.height - 6); // only dots inside the visible rail
      // Normalise: the shallowest card defines "flush", so a scrollbar (or any constant gutter)
      // offsets nothing and depth 0 always reads as depth 0.
      const base = raw.length ? Math.min(...raw.map((m) => m.inset)) : 0;
      const marks = raw.map((m) => ({ ...m, inset: Math.round(m.inset - base) }));
      // Sit in the margin just OUTSIDE the cards: right → at the rail's right edge; left → the thread's
      // width to the LEFT of the rail's left edge (so its ticks reach toward the screen edge).
      const left = side === "right" ? r.right : r.left - W;
      setG({ top: r.top, left, height: Math.round(r.height), marks });

    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(rail);
    const mo = new MutationObserver(schedule);
    mo.observe(rail, { childList: true, subtree: true });
    rail.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      rail.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [railId, side, W]);

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
          // Fades the thread top/bottom so it reads as an instrument rail, not a hard bar
          // (was `.rail-thread`, 13-right-column.css). Kept as inline style, not a Tailwind
          // arbitrary property, since the vendor-prefixed property name doesn't round-trip
          // cleanly through the utility-class syntax.
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, #000 7%, #000 93%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0, #000 7%, #000 93%, transparent 100%)",
        }}
        aria-hidden
        focusable="false"
      >
        {/* The RULER (neutral line + ticks) is barely dimmed — its greys are already muted, so
           the resting REST_DIM read as over-faded there (user); only the COLOURED identity
           spine takes the full resting dim, keeping brightness for the signals + node dots. */}
        <g style={{ opacity: 0.9 }}>
          {/* neutral base line — SOFT/muted; carries the ruler ticks. */}
          <line x1={gm.neut} y1={0} x2={gm.neut} y2={H} stroke={TICK_LINE} strokeWidth={1} />
          {/* ruler ticker hatches — short marks stepping OUTWARD from the neutral line toward the screen
             edge; muted, every 4th a touch longer/brighter (an instrument scale). */}
          {ticks.map((y, i) => (
            <line key={i} x1={gm.neut} y1={y} x2={i % 4 === 0 ? gm.tickMaj : gm.tickMin} y2={y} stroke={i % 4 === 0 ? TICK_MAJOR : TICK_MINOR} strokeWidth={1} />
          ))}
        </g>
        <g style={{ opacity: REST_DIM }}>
          {/* identity line — BOTH rails, mirrored (the HUD's resting identity cue; cards are
             spineless at rest). The line is the selection's hue. */}
          <line x1={gm.identity} y1={0} x2={gm.identity} y2={H} stroke={accent} strokeWidth={2} />
        </g>
        {/* node-dots — OUTSIDE the dim group at original full brightness (user adjustment): one per
           card at its middle, tethered to the card edge by the connector. The thread is the rail's
           ONE instrument (2026-08-02), so it also carries the card stack's HIERARCHY:
           · connector LENGTH = the card's ladder depth (it steps back from the rail, the thread
             reaches for it) — containment reads down the rail instead of needing a second spine;
           · dot STATE = the slot's state — hollow for a ghost (an empty slot showing its hint),
             solid for a populated card, solid + a wider halo for the focus rung (the finest
             committed one). So the rail shows the view's whole possibility space and where you are. */}
        {g.marks.map((m, i) => {
          const x1 = side === "right" ? gm.conn - m.inset : gm.conn + m.inset;
          return (
            <g key={i} opacity={m.ghost ? 0.5 : 1}>
              <line x1={x1} y1={m.y} x2={gm.dot} y2={m.y} stroke={accent} strokeWidth={1.25} opacity={m.focus ? 0.9 : 0.7} />
              {m.ghost ? (
                <>
                  {/* punch first, then the ring — a hollow dot still has to sit ON the spine */}
                  <circle cx={gm.dot} cy={m.y} r={4.2} fill={PUNCH} />
                  <circle cx={gm.dot} cy={m.y} r={3.2} fill="none" stroke={accent} strokeWidth={1.3} />
                </>
              ) : (
                <>
                  <circle cx={gm.dot} cy={m.y} r={m.focus ? 7 : 5} fill={accent} opacity={m.focus ? 0.26 : 0.16} />
                  <circle cx={gm.dot} cy={m.y} r={3.4} fill={accent} stroke={PUNCH} strokeWidth={1.5} />
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
