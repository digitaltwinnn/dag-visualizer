"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent, CORE_HEX } from "@/src/data/network";

// A rail's instrument-channel thread, a fixed SVG running down the rail's OUTER edge (in the margin,
// just outside the cards). Measured from the live layout (ResizeObserver / MutationObserver / scroll)
// so it tracks the cards as they're added, grow, or the rail scrolls; fades top+bottom (CSS mask);
// purely decorative (pointer-events: none — see the no-effect-bleed rule). Must live OUTSIDE the rail
// div (a sibling) — the rail clips horizontally + can gain an overflow-fade mask, either of which
// would blank a child thread (see Inspector / LeftColumn).
//
// The two rails differ by design:
//  • RIGHT — the full identity thread: neutral ruler + an identity-hued spine (cyan for "all") + a
//    node-dot on each card. It carries the right rail's identity cue.
//  • LEFT  — the neutral ruler ONLY (ticks pointing outward toward the screen edge). The left rail's
//    identity cue is the original cyan spine attached to each card's edge (CSS, 12-panel-system.css),
//    so the thread here adds just the hairline effect — no dot, no identity line.
//
// Ruler-hairline spec — mirrors the CSS `--thread-*` tokens (00-base.css) so the SVG threads and the
// bar-chart axis read identically. Kept as literals because an SVG stroke ATTRIBUTE can't resolve a
// CSS var(); keep the two in sync.
const TICK_PITCH = 13; // px between hairlines
const TICK_LINE = "rgba(178,193,223,0.40)"; // neutral base line (CSS --thread-line)
const TICK_MINOR = "rgba(178,193,223,0.3)"; // short hairline
const TICK_MAJOR = "rgba(178,193,223,0.42)"; // every 4th — longer + brighter

type Side = "left" | "right";

// Concrete svg-x per side (x grows rightward within the svg). The right rail has a wider outer
// margin (~26px) than the left (~16px), so the left thread is compact. `identity`/`dot`/`conn` are
// null on the left (it's the neutral ruler only). Ticks step from `neut` OUTWARD toward the screen
// edge — right: rightward to tickMaj/tickMin; left: leftward (smaller x, toward x≈0).
const GEOM: Record<Side, {
  W: number; neut: number; tickMaj: number; tickMin: number;
  identity: number | null; dot: number | null; conn: number | null;
}> = {
  right: { W: 22, neut: 16, tickMaj: 22, tickMin: 20, identity: 9, dot: 9, conn: 1 },
  // W=16 → card edge (the card's cyan CSS spine) is at svg x=16. Sit the neutral line snug beside it
  // (~3px), then step the ticks outward toward the screen edge (major 6px → x=7, minor 4px → x=9).
  left: { W: 16, neut: 13, tickMaj: 7, tickMin: 9, identity: null, dot: null, conn: null },
};

export default function RailThread({ side = "right" }: { side?: Side }) {
  const filter = useStore((s) => s.filter);
  // Resolve to a real colour: filterAccent returns `var(--core)` for "all", but an SVG `stroke`
  // ATTRIBUTE doesn't resolve CSS custom properties — so the identity line + dots rendered invisible
  // on "all". Fall back to the core hex for the var() case. (Only the right thread uses it.)
  const rawAccent = filterAccent(filter);
  const accent = rawAccent.startsWith("var(") ? CORE_HEX : rawAccent;
  const [g, setG] = useState<{ top: number; left: number; height: number; dots: number[] } | null>(null);

  const { W } = GEOM[side];
  const railId = side === "right" ? "rightcol" : "leftcol";

  useEffect(() => {
    const rail = document.getElementById(railId);
    if (!rail) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = rail.getBoundingClientRect();
      const cards = Array.from(rail.querySelectorAll<HTMLElement>(":scope > .panel"));
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
    <svg
      className="rail-thread"
      width={W}
      height={H}
      style={{ top: g.top, left: g.left }}
      aria-hidden
      focusable="false"
    >
      {/* neutral base line — SOFT/muted; carries the ruler ticks. */}
      <line x1={gm.neut} y1={0} x2={gm.neut} y2={H} stroke={TICK_LINE} strokeWidth={1} />
      {/* ruler ticker hatches — short marks stepping OUTWARD from the neutral line toward the screen
         edge; muted, every 4th a touch longer/brighter (an instrument scale). */}
      {ticks.map((y, i) => (
        <line key={i} x1={gm.neut} y1={y} x2={i % 4 === 0 ? gm.tickMaj : gm.tickMin} y2={y} stroke={i % 4 === 0 ? TICK_MAJOR : TICK_MINOR} strokeWidth={1} />
      ))}
      {/* identity line + node-dots — RIGHT rail only (the left rail's identity is its card-edge CSS
         spine). The line is the selection's hue; the dots ride it at each card's middle. */}
      {gm.identity !== null && (
        <line x1={gm.identity} y1={0} x2={gm.identity} y2={H} stroke={accent} strokeWidth={2} />
      )}
      {gm.dot !== null && g.dots.map((y, i) => (
        <g key={i}>
          {gm.conn !== null && (
            <line x1={gm.conn} y1={y} x2={gm.dot!} y2={y} stroke={accent} strokeWidth={1.25} opacity={0.7} />
          )}
          <circle cx={gm.dot!} cy={y} r={5} fill={accent} opacity={0.16} />
          {/* dark ring punches the dot off the identity line. NB a real hex, not var(--panel): an SVG
             stroke ATTRIBUTE doesn't resolve CSS custom properties (same trap as the accent above). */}
          <circle cx={gm.dot!} cy={y} r={3.4} fill={accent} stroke="#0c1020" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}
