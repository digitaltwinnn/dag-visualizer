"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent, CORE_HEX } from "@/src/data/network";

// The right rail's identity cue: an **instrument-channel thread** running down the rail's OUTER
// edge (just outside the cards, in the margin). A neutral base line + an identity-hued line (the
// active metagraph's colour, cyan for "all"), fine ticker hatches, and a node-dot centered on each
// card. Fixed-position + measured from the live layout (ResizeObserver / MutationObserver / scroll)
// so the dots track each card even as cards are added, grow, or the rail scrolls. Fades top+bottom
// (CSS mask). Purely decorative (pointer-events: none) — see the no-effect-bleed rule: no
// data-driven animation here, it just reflects the selection's hue + the current card layout.
const W = 22; // channel width (px)
// Ruler-hairline spec — mirrors the CSS `--thread-tick*` / `--rail-hairlines` tokens (00-base.css)
// so this SVG thread and the left rail's CSS spine read identically. Kept here as literals because
// an SVG stroke ATTRIBUTE can't resolve a CSS var(); keep the two in sync.
const TICK_PITCH = 13; // px between hairlines
const TICK_LINE = "rgba(178,193,223,0.40)"; // neutral base line (CSS --thread-line)
const TICK_MINOR = "rgba(178,193,223,0.3)"; // short hairline
const TICK_MAJOR = "rgba(178,193,223,0.42)"; // every 4th — longer + brighter

export default function RailThread() {
  const filter = useStore((s) => s.filter);
  // Resolve to a real colour: filterAccent returns `var(--core)` for "all", but an SVG `stroke`
  // ATTRIBUTE doesn't resolve CSS custom properties — so the identity line + connector rendered
  // invisible on "all". Fall back to the core hex for the var() case.
  const rawAccent = filterAccent(filter);
  const accent = rawAccent.startsWith("var(") ? CORE_HEX : rawAccent;
  const [g, setG] = useState<{ top: number; left: number; height: number; dots: number[] } | null>(null);

  useEffect(() => {
    const rail = document.getElementById("rightcol");
    if (!rail) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = rail.getBoundingClientRect();
      const cards = Array.from(rail.querySelectorAll<HTMLElement>(":scope > .panel"));
      const dots = cards
        .map((c) => { const cr = c.getBoundingClientRect(); return cr.top + cr.height / 2 - r.top; })
        .filter((y) => y >= 6 && y <= r.height - 6); // only dots inside the visible rail
      // Sit in the margin just OUTSIDE the cards (a small gap), so the thread doesn't touch them.
      setG({ top: r.top, left: r.right, height: Math.round(r.height), dots });
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
  }, []);

  if (!g || g.height <= 0) return null;
  const H = g.height;
  const ax = 9; // identity line x (INNER — the cards' dots + connectors anchor to it; a real connector length)
  const nx = 16; // neutral base line x (OUTER — well clear of the identity line, carries the hairlines)
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
      {/* neutral base line (outer) — SOFT/muted; the identity line is the prominent one. */}
      <line x1={nx} y1={0} x2={nx} y2={H} stroke={TICK_LINE} strokeWidth={1} />
      {/* ruler ticker hatches — short marks stepping OUTWARD from the neutral line; muted, every 4th
         a touch longer/brighter (an instrument scale), well clear of the identity line. */}
      {ticks.map((y, i) => (
        <line key={i} x1={nx} y1={y} x2={i % 4 === 0 ? W : W - 2} y2={y} stroke={i % 4 === 0 ? TICK_MAJOR : TICK_MINOR} strokeWidth={1} />
      ))}
      {/* identity line (inner) — the selection's hue, the PROMINENT spine the cards ride. */}
      <line x1={ax} y1={0} x2={ax} y2={H} stroke={accent} strokeWidth={2} />
      {/* per card: a visible connector from the card edge to the dot, then the haloed node-dot */}
      {g.dots.map((y, i) => (
        <g key={i}>
          <line x1={1} y1={y} x2={ax} y2={y} stroke={accent} strokeWidth={1.25} opacity={0.7} />
          <circle cx={ax} cy={y} r={5} fill={accent} opacity={0.16} />
          {/* dark ring punches the dot off the identity line. NB a real hex, not var(--panel): an SVG
             stroke ATTRIBUTE doesn't resolve CSS custom properties (same trap as the accent above). */}
          <circle cx={ax} cy={y} r={3.4} fill={accent} stroke="#0c1020" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}
