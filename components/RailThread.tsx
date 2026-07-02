"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { filterAccent } from "@/src/data/network";

// The right rail's identity cue: an **instrument-channel thread** running down the rail's OUTER
// edge (just outside the cards, in the margin). A neutral base line + an identity-hued line (the
// active metagraph's colour, cyan for "all"), fine ticker hatches, and a node-dot centered on each
// card. Fixed-position + measured from the live layout (ResizeObserver / MutationObserver / scroll)
// so the dots track each card even as cards are added, grow, or the rail scrolls. Fades top+bottom
// (CSS mask). Purely decorative (pointer-events: none) — see the no-effect-bleed rule: no
// data-driven animation here, it just reflects the selection's hue + the current card layout.
const W = 18; // channel width (px)

export default function RailThread() {
  const filter = useStore((s) => s.filter);
  const accent = filterAccent(filter);
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
  const nx = 12; // neutral base line x (out in the margin, clear of the cards)
  const ax = 15; // identity line x (the parallel second line)
  const ticks: number[] = [];
  for (let y = 10; y <= H - 10; y += 13) ticks.push(y);

  return (
    <svg
      className="rail-thread"
      width={W}
      height={H}
      style={{ top: g.top, left: g.left }}
      aria-hidden
      focusable="false"
    >
      {/* neutral base line */}
      <line x1={nx} y1={0} x2={nx} y2={H} stroke="rgba(178,193,223,0.62)" strokeWidth={1.25} />
      {/* ruler ticker hatches, stepping outward; every 4th runs longer (an instrument scale) */}
      {ticks.map((y, i) => (
        <line key={i} x1={nx} y1={y} x2={i % 4 === 0 ? W : W - 3} y2={y} stroke={`rgba(178,193,223,${i % 4 === 0 ? 0.62 : 0.5})`} strokeWidth={1} />
      ))}
      {/* identity line — the selection's hue, the second line of the pair */}
      <line x1={ax} y1={0} x2={ax} y2={H} stroke={accent} strokeWidth={2} />
      {/* per card: a short connector anchoring the dot back to the card, then the haloed node-dot */}
      {g.dots.map((y, i) => (
        <g key={i}>
          <line x1={2} y1={y} x2={ax} y2={y} stroke={accent} strokeWidth={1} opacity={0.45} />
          <circle cx={ax} cy={y} r={6} fill={accent} opacity={0.16} />
          <circle cx={ax} cy={y} r={3.4} fill={accent} stroke="var(--panel)" strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}
