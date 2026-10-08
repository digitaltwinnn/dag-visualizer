"use client";

import { cn } from "@/lib/utils";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
// The phone draws it too (user, 2026-09-29: "on mobile I don't see the dotted lines").
//
// ⚠️ THE LINES PAINT IN FRONT OF THE BAND (user, 2026-10-08: "the dotted lines from card to vitals
// should be in front of the vitals section, not go behind it, so that they actually touch the
// control"). They lived in the chart stack's layer (z-4), under the band (the strip, z-10) and the
// phone's Vitals sheet, so their last stretch vanished behind the plate and they ended short of the
// brush. The svg is now PORTALLED to the body as its own fixed layer just above the strip (z-11,
// under the command bar's z-40; above the phone's sheet there) — and since it is no longer inside the stack, it MIRRORS the
// stack's engine-written `data-on` (MutationObserver), so it still arrives and leaves with it.
// Above the band it would also run ACROSS the Time range pills that stand over the band's corner,
// so the pills' box (`[data-tether-avoid]`) is masked out of the lines: they pass behind the pills
// and in front of everything else.

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
  // SCENE MODE TAKES THE TETHER WITH THE BAND (user, 2026-10-04: "in scene mode the vitals section
  // is hidden but the dotted lines still show"): the lines run from the timeline, so with the
  // timeline stepped aside they point at nothing. They leave on the band's own exit tempo.
  const railsHidden = useStore((s) => s.railsHidden);
  // The portal needs the document, which the server render does not have.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);

  // Mirror the stack's arrival (`#trend-stack[data-on]`, written by the engine, not React).
  useEffect(() => {
    const el = svg.current;
    const stack = document.getElementById("trend-stack");
    if (!el || !stack) return;
    const copy = () => {
      el.dataset.on = stack.dataset.on ?? "";
    };
    copy();
    const mo = new MutationObserver(copy);
    mo.observe(stack, { attributes: true, attributeFilter: ["data-on"] });
    return () => mo.disconnect();
  }, [host]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    let last = "";
    let raf = 0;
    const measure = () => {
      const brush = document.querySelector<SVGRectElement>("[data-brush]");
      const plot = document.querySelector<HTMLElement>("[data-plane][data-front] [data-plot]");
      const host = el.getBoundingClientRect();
      const avoid = document.querySelector<HTMLElement>("[data-tether-avoid]")?.getBoundingClientRect();
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
        const hole = avoid && avoid.width > 0 ? [avoid.left - host.left, avoid.top - host.top, avoid.width, avoid.height] : [0, 0, 0, 0];
        if (p.width > 0 && b.width > 0) d = [bl, bt, L, y, br, R, ...hole].map((v) => v.toFixed(1)).join(",");
      }
      if (d === last) return;
      last = d;
      const [a, b2, c] = el.querySelectorAll("line") as unknown as [SVGLineElement, SVGLineElement, SVGLineElement];
      const hole = el.querySelector<SVGRectElement>("[data-hole]")!;
      if (!d) {
        el.style.visibility = "hidden";
        return;
      }
      const [bl, bt, L, y, br, R, hx, hy, hw, hh] = d.split(",").map(Number) as number[];
      hole.setAttribute("x", `${hx}`); hole.setAttribute("y", `${hy}`); hole.setAttribute("width", `${hw}`); hole.setAttribute("height", `${hh}`);
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
  }, [bp, range, windowId, focus, scroll, moving, dock, sheetPx, host]);

  if (!host) return null;
  return createPortal(
    <svg
      ref={svg}
      aria-hidden
      className={cn(
        // z-11 sits over the band (the strip, z-10); on the PHONE the timeline lives in the Vitals
        // sheet (ui/sheet, z-41), so the lines rise over that instead — z-42 shares the dock's
        // number, which they never reach, and stays under nothing they cross.
        "fixed inset-0 z-[11] max-[700px]:z-[42] w-full h-full pointer-events-none overflow-visible",
        "opacity-0 [transition:opacity_var(--tempo-nav)_ease] data-[on='1']:opacity-100 motion-reduce:!transition-none",
        railsHidden && "!opacity-0",
      )}
      style={{ visibility: "hidden" }}
    >
      {/* ⚠️ THE LINE'S STRENGTH IS PER GROUND (user, 2026-10-03: "the dotted line to the chart in
          light mode is too faint"). The bare accent at 0.45 is a glow on the dark ground and a
          pale thread on paper, where there is no bloom and the page is its own bright field. On
          paper it takes the accent's INK (`--primary-ink`) at 0.8; dark keeps what it had.
          `light-dark()` resolves colours only, so the alpha rides the colour, not `strokeOpacity`. */}
      <defs>
        <mask id="trend-tether-mask" maskUnits="userSpaceOnUse" x="-10000" y="-10000" width="30000" height="30000">
          <rect x="-10000" y="-10000" width="30000" height="30000" fill="white" />
          <rect data-hole rx="8" fill="black" />
        </mask>
      </defs>
      <g mask="url(#trend-tether-mask)">
        <line style={TETHER_STROKE} strokeWidth={1} strokeDasharray="3 4" />
        <line style={TETHER_STROKE} strokeWidth={1} strokeDasharray="3 4" />
        <line stroke="var(--primary)" strokeOpacity={0.9} strokeWidth={2} strokeLinecap="round" />
      </g>
    </svg>,
    host,
  );
}
