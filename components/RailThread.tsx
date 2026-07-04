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
// rest): everything the SVG draws is scaled to 60% opacity so the brightness budget goes to the
// SIGNALS — the view-switch pulse below and the card edge signals. Hues unchanged; the CSS
// `--thread-*` tokens (other consumers: sheet rulers, bar-chart axis, card hover whisper) are NOT
// touched — the dim is rail-local.
const REST_DIM = 0.6;

export default function RailThread({ side = "right" }: { side?: Side }) {
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  // Resolve to a real colour: filterAccent returns `var(--core)` for "all", but an SVG `stroke`
  // ATTRIBUTE doesn't resolve CSS custom properties — so the identity line + dots rendered invisible
  // on "all". Fall back to the core hex for the var() case.
  const rawAccent = filterAccent(filter);
  const accent = rawAccent.startsWith("var(") ? CORE_HEX : rawAccent;
  const [g, setG] = useState<{ top: number; left: number; height: number; dots: number[] } | null>(null);
  // View-switch signal: a mode change plays the SAME travelling-light language as the cards on
  // BOTH threads — the shared `useEdgePulse` hook (once per switch, debounced, skips mount,
  // reduced-motion → CSS static blink) driving the shared `.edge-pulse` recipe, overlaid on the
  // identity spine (the recipe is HTML/CSS, so it rides a fixed wrapper rather than the SVG).
  const pulseKey = useEdgePulse(mode);

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
      const cards = Array.from(rail.querySelectorAll<HTMLElement>(":scope > .ig-panel"));
      const dots = cards
        .map((c) => { const cr = c.getBoundingClientRect(); return cr.top + cr.height / 2 - r.top; })
        .filter((y) => y >= 6 && y <= r.height - 6); // only dots inside the visible rail
      // Sit in the margin just OUTSIDE the cards: right → at the rail's right edge; left → the thread's
      // width to the LEFT of the rail's left edge (so its ticks reach toward the screen edge).
      const left = side === "right" ? r.right : r.left - W;
      setG({ top: r.top, left, height: Math.round(r.height), dots });
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
        {/* Everything at rest sits inside ONE dim group (REST_DIM) — the thread is the calm
           resting cue; brightness belongs to the signals (view-switch pulse + card edges). */}
        <g opacity={REST_DIM}>
          {/* neutral base line — SOFT/muted; carries the ruler ticks. */}
          <line x1={gm.neut} y1={0} x2={gm.neut} y2={H} stroke={TICK_LINE} strokeWidth={1} />
          {/* ruler ticker hatches — short marks stepping OUTWARD from the neutral line toward the screen
             edge; muted, every 4th a touch longer/brighter (an instrument scale). */}
          {ticks.map((y, i) => (
            <line key={i} x1={gm.neut} y1={y} x2={i % 4 === 0 ? gm.tickMaj : gm.tickMin} y2={y} stroke={i % 4 === 0 ? TICK_MAJOR : TICK_MINOR} strokeWidth={1} />
          ))}
          {/* identity line + node-dots — BOTH rails, mirrored (the HUD's resting identity cue; cards
             are spineless at rest). The line is the selection's hue; the dots ride it at each card's
             middle, tethered to the card edge by the connector. */}
          <line x1={gm.identity} y1={0} x2={gm.identity} y2={H} stroke={accent} strokeWidth={2} />
          {g.dots.map((y, i) => (
            <g key={i}>
              <line x1={gm.conn} y1={y} x2={gm.dot} y2={y} stroke={accent} strokeWidth={1.25} opacity={0.7} />
              <circle cx={gm.dot} cy={y} r={5} fill={accent} opacity={0.16} />
              {/* dark ring punches the dot off the identity line. NB a real hex, not var(--panel): an SVG
                 stroke ATTRIBUTE doesn't resolve CSS custom properties (same trap as the accent above). */}
              <circle cx={gm.dot} cy={y} r={3.4} fill={accent} stroke="#0c1020" strokeWidth={1.5} />
            </g>
          ))}
        </g>
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
