"use client";

import { useEffect, useRef } from "react";

import { useBreakpoint } from "@/components/useBreakpoint";
import { useStore } from "@/src/store/store";

// THE TETHER — the History timeline's span drawn up to the front chart's TIME AXIS (design round
// 2026-09-29, "A + B, the time-only tether"; user: the band "feels a bit disconnected from the
// scene … unclear that it can be used to interact with the scene").
//
// ⚠️ IT SPEAKS TIME, NEVER VALUES. The band's line is the WHOLE network (TrendTimeline: "the frame
// the planes sit in, never one chain") and the front card is ONE network, so a tether wrapping the
// card's plot would claim a 1:1 zoom that isn't true (user: "the selector shows the hypergraph,
// while the chart card shows the metagraph … it's not a 1-1 zoom"). So the two dashed lines run
// from the span's edges to the plot plate's BOTTOM EDGE — the time axis — and a hairline marks
// that axis: "this stretch of time", nothing about the numbers.
//
// Measured, not derived: the brush frame (`[data-brush]`, TrendTrack) and the front plane's plot
// plate (`[data-front] [data-plot]`) are both on screen, and the plane is projected by the engine
// every frame. A read-and-write loop runs ONLY while something moves — the scene (`sceneMoving`,
// which covers the stack's ease and the camera) or a store change that moves either end — and
// stops on the frame after; at rest the tether costs nothing. The DOM is written only on change.
// The phone draws it too (user, 2026-09-29: "on mobile I don't see the dotted lines"): the
// timeline lives in the Vitals sheet, which opens directly under the stack, so the lines rise
// from behind the sheet's top edge — the sheet paints over this layer — to the chart's axis.

const TETHER_STROKE = {
  stroke: "light-dark(color-mix(in oklch, var(--primary-ink) 80%, transparent), color-mix(in oklch, var(--primary) 45%, transparent))",
} as const;

export default function TrendTether() {
  const svg = useRef<SVGSVGElement>(null);
  const bp = useBreakpoint();
  const range = useStore((s) => s.trendRange);
  const windowId = useStore((s) => s.trendWindow);
  const focus = useStore((s) => s.trendFocus);
  // Not `trendIds` — that is React's one-way publish to the engine (publishChannelBoundary). A
  // re-rank moves the planes, which raises `sceneMoving`; paging is the other front-plane change.
  const scroll = useStore((s) => s.trendScroll);
  const moving = useStore((s) => s.sceneMoving);
  // The phone's timeline lives in the Vitals SHEET, which mounts a commit after it opens and then
  // grows (and shifts the scene up by half its height), so an open, a close or a drag of the sheet
  // is a change to both ends.
  const dock = useStore((s) => s.phoneDock);
  const sheetPx = useStore((s) => s.phoneSheetPx);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    let last = "";
    let raf = 0;
    const measure = () => {
      const brush = document.querySelector<SVGRectElement>("[data-brush]");
      const plot = document.querySelector<HTMLElement>("[data-plane][data-front] [data-plot]");
      const host = el.getBoundingClientRect();
      let d = "";
      if (brush && plot) {
        const b = brush.getBoundingClientRect();
        const p = plot.getBoundingClientRect();
        // The plot's own horizontal inset (TrendChart's PLOT_MARGIN, 2px a side) is under a pixel
        // at the plane's projected scale — the plate's edges ARE the axis ends to the eye.
        // A hair INSIDE the plate's bottom border: on the border itself the axis line vanished into
        // it and the tether read as aiming at the card's corners rather than at its time axis.
        const y = p.bottom - host.top - 3;
        const L = p.left - host.left;
        const R = p.right - host.left;
        const bl = b.left - host.left;
        const br = b.right - host.left;
        const bt = b.top - host.top;
        if (p.width > 0 && b.width > 0) d = `${bl.toFixed(1)},${bt.toFixed(1)},${L.toFixed(1)},${y.toFixed(1)},${br.toFixed(1)},${R.toFixed(1)}`;
      }
      if (d === last) return;
      last = d;
      const [a, b2, c] = el.children as unknown as [SVGLineElement, SVGLineElement, SVGLineElement];
      if (!d) {
        el.style.visibility = "hidden";
        return;
      }
      const [bl, bt, L, y, br, R] = d.split(",").map(Number) as [number, number, number, number, number, number];
      a.setAttribute("x1", `${bl}`); a.setAttribute("y1", `${bt}`); a.setAttribute("x2", `${L}`); a.setAttribute("y2", `${y}`);
      b2.setAttribute("x1", `${br}`); b2.setAttribute("y1", `${bt}`); b2.setAttribute("x2", `${R}`); b2.setAttribute("y2", `${y}`);
      c.setAttribute("x1", `${L}`); c.setAttribute("y1", `${y}`); c.setAttribute("x2", `${R}`); c.setAttribute("y2", `${y}`);
      el.style.visibility = "visible";
    };
    // For a short settle after any change (React paints the brush/plane, the engine projects it,
    // a sheet grows into place), and every frame for as long as the scene is moving.
    const until = moving ? Infinity : performance.now() + 700;
    const tick = () => {
      measure();
      if (performance.now() < until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    // A DRAG on the band moves the brush through the track's LOCAL preview, which writes no store
    // value until release — so the track's own attribute changes are the signal while it happens.
    // ⚠️ The track may not EXIST yet (a cold load: the overview lands after this effect's settle,
    // with no dep change between), so attaching is retried until it takes — and the first sight of
    // the track is itself a change to draw.
    let mo: MutationObserver | null = null;
    const attach = () => {
      const track = document.querySelector("[aria-label='Time cursor over the measured history']");
      if (!track) return false;
      mo = new MutationObserver(() => requestAnimationFrame(measure));
      mo.observe(track, { attributes: true, subtree: true, childList: true });
      measure();
      return true;
    };
    const retry = attach() ? 0 : window.setInterval(() => {
      if (attach()) window.clearInterval(retry);
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.clearInterval(retry);
      window.removeEventListener("resize", onResize);
      mo?.disconnect();
    };
  }, [bp, range, windowId, focus, scroll, moving, dock, sheetPx]);

  return (
    <svg ref={svg} aria-hidden className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ visibility: "hidden" }}>
      {/* ⚠️ THE LINE'S STRENGTH IS PER GROUND (user, 2026-10-03: "the dotted line to the chart in
          light mode is too faint"). The bare accent at 0.45 is a glow on the dark ground and a
          pale thread on paper, where there is no bloom and the page is its own bright field. On
          paper it takes the accent's INK (`--primary-ink`) at 0.8; dark keeps what it had.
          `light-dark()` resolves colours only, so the alpha rides the colour, not `strokeOpacity`. */}
      <line style={TETHER_STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <line style={TETHER_STROKE} strokeWidth={1} strokeDasharray="3 4" />
      <line stroke="var(--primary)" strokeOpacity={0.9} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
