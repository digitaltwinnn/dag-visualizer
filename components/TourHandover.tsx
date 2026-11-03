"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Hand, MousePointerClick, Pointer, ZoomIn, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseEdge } from "@/components/EdgePulse";
import TypedNote from "@/components/notes/TypedNote";
import { useBreakpoint } from "@/components/useBreakpoint";
import { useTouch } from "@/components/useTouch";
import { BRIEFING_TYPE_SLOW, HANDOVER_MS, handoverHand, handoverPulses, type HandoverTarget } from "@/src/engine/domain/briefing";
import { useStore } from "@/src/store/store";

// THE HAND-OVER (user, 2026-11-03 — design A + D with C's gesture, in the brainstorming companion):
// a tour played to its END leaves the reader on the live Geography view, and nothing there said the
// screen was now theirs to touch. Three beats on one clock (`domain/briefing.ts`):
//   · A — the tour's sign-off caption, typed in where the tour's words stood and in their type, with
//     the three gestures under it in the pointer's own words (`useTouch`: tap and pinch on touch);
//   · D — each surface plays the card EDGE PULSE it already plays on a change (the `.edge-pulse`
//     recipe, `PulseEdge`), in turn, on its scene-facing edge: the explore card, the card rail and
//     the band on desktop, the open sheet and the dock on the phone;
//   · C — one drag traced across the scene by a hand, where the scene's framing centre stands.
// The reader's first gesture (a press, the wheel, a key) ends it at once, so it never stands over
// what they are doing; otherwise it leaves after `HANDOVER_MS`. Reduced motion keeps the caption alone.
// It overlays the HUD and takes no pointer events. Measured once per beat from the live layout
// (`#leftcol`, `#rightcol`, `#vitalsband`, the phone sheet), because the HUD is still settling when
// the tour ends, and each beat reads the box as it then stands.

const CAPTION = "Your turn. This is the live network.";
/** The caption's fade on the way out, matching the tour words' own. */
const OUT_MS = 400;
/** The phone caption's clearance over the sheet's top edge. */
const SHEET_GAP_PX = 16;

type Box = { left: number; top: number; width: number; height: number };
const boxOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};

/** The box each surface pulses on, and which of its edges faces the scene. */
function targetBox(t: HandoverTarget): { box: Box; edge: "left" | "right" | "top" } | null {
  switch (t) {
    case "explore": {
      const box = boxOf(document.querySelector("#leftcol .ig-panel"));
      return box && { box, edge: "right" };
    }
    case "rail": {
      // The pile, from its first card to its last: one edge down the whole stack.
      const box = boxOf(document.querySelector("#rightcol .rail-ladder"));
      return box && { box, edge: "left" };
    }
    case "band": {
      const box = boxOf(document.getElementById("vitalsband"));
      return box && { box, edge: "top" };
    }
    case "sheet": {
      const sheets = [...document.querySelectorAll('[data-slot="sheet-content"]')].map(boxOf).filter((b): b is Box => b != null);
      const box = sheets.sort((a, b) => b.height - a.height)[0] ?? null;
      return box && { box, edge: "top" };
    }
    case "dock": {
      const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--phone-dock-h")) || 56;
      return { box: { left: 0, top: window.innerHeight - h, width: window.innerWidth, height: h }, edge: "top" };
    }
  }
}

/** One surface's pulse, as the cards play it: a vertical track on a side edge, or the phone dock's
 *  rotated carrier on a top edge (`PhoneDockSweep` has the geometry and why the origin is pinned). */
function Pulse({ box, edge }: { box: Box; edge: "left" | "right" | "top" }) {
  const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height, ["--spine" as string]: "var(--primary)" };
  return (
    <span aria-hidden className="fixed pointer-events-none" style={style}>
      {edge === "top" ? (
        <span className="absolute top-[3px] left-0 w-[3px] origin-top-left -rotate-90 [--pulse-len:30%]" style={{ height: box.width }}>
          <PulseEdge pulseKey={1} />
        </span>
      ) : (
        <PulseEdge pulseKey={1} rail={edge === "left" ? "right" : "left"} />
      )}
    </span>
  );
}

/** The traced drag, a hand along a dashed arc, run once (`handover-drag` in globals.css). */
function HandTrace({ x, y, durMs }: { x: number; y: number; durMs: number }) {
  return (
    <span
      aria-hidden
      className="fixed pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-[handover-coach_var(--dur)_linear_both]"
      style={{ left: x, top: y, ["--dur" as string]: `${durMs}ms` }}
    >
      <svg viewBox="0 0 170 50" fill="none" className="block w-[150px]">
        <path d="M 10 40 Q 85 2 160 40" className="stroke-foreground/45" strokeWidth={2} strokeDasharray="4 6" />
      </svg>
      <Hand
        strokeWidth={1.8}
        className="absolute left-0 top-0 size-[30px] text-foreground [offset-path:path('M_10_40_Q_85_2_160_40')] animate-[handover-drag_var(--dur)_ease-in-out_both] [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.6))]"
      />
    </span>
  );
}

function Gesture({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon aria-hidden className="size-[1.1em] flex-none" />
      {children}
    </span>
  );
}

export default function TourHandover() {
  const on = useStore((s) => s.handover);
  const setHandover = useStore((s) => s.setHandover);
  const sheetPx = useStore((s) => s.sceneCoverBExplore);
  const phone = useBreakpoint() === "phone";
  const touch = useTouch();
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pulses, setPulses] = useState<{ target: HandoverTarget; box: Box; edge: "left" | "right" | "top" }[]>([]);
  const [hand, setHand] = useState<{ x: number; y: number } | null>(null);

  // Arm on the flag: the clock, the beats, the end, and the reader's first gesture.
  useEffect(() => {
    if (!on) return;
    const start = performance.now();
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setT0(start);
    setLeaving(false);
    setReduced(rm);
    setPulses([]);
    setHand(null);
    const timers: number[] = [];
    const leave = () => {
      setLeaving(true);
      timers.push(window.setTimeout(() => setHandover(false), OUT_MS));
    };
    if (!rm) {
      for (const p of handoverPulses(phone)) {
        timers.push(window.setTimeout(() => {
          const at = targetBox(p.target);
          if (at) setPulses((list) => [...list, { target: p.target, ...at }]);
        }, p.atMs));
      }
      const h = handoverHand(phone);
      timers.push(window.setTimeout(() => {
        // The scene's framing centre: midway across, and midway down the room the HUD leaves it —
        // under the command bar, over the band (desktop) or the open sheet (phone). The Engine
        // frames the view on that same room (`chromeShiftPx`, `sheetShift`).
        const top = boxOf(document.getElementById("topbar"));
        const floor = phone ? targetBox("sheet")?.box.top : boxOf(document.getElementById("vitalsband"))?.top;
        const y0 = top ? top.top + top.height : 0;
        const y1 = floor ?? window.innerHeight;
        setHand({ x: window.innerWidth / 2, y: (y0 + y1) / 2 });
      }, h.atMs));
    }
    timers.push(window.setTimeout(leave, HANDOVER_MS));
    // The reader takes over: any press, the wheel or a key ends it at once (capture, so a control
    // that stops propagation still counts).
    const gesture = () => leave();
    const opts = { capture: true, once: true } as const;
    window.addEventListener("pointerdown", gesture, opts);
    window.addEventListener("wheel", gesture, opts);
    window.addEventListener("keydown", gesture, opts);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pointerdown", gesture, opts);
      window.removeEventListener("wheel", gesture, opts);
      window.removeEventListener("keydown", gesture, opts);
    };
  }, [on, phone, setHandover]);

  // The hand's own run ends before the hand-over does; unmount it then, so it never stands frozen.
  useEffect(() => {
    if (!hand || t0 == null) return;
    const id = window.setTimeout(() => setNow(performance.now()), handoverHand(phone).durMs);
    return () => clearTimeout(id);
  }, [hand, t0, phone]);
  const handDone = t0 != null && now - t0 >= handoverHand(phone).atMs + handoverHand(phone).durMs;

  if (!on) return null;
  const words = touch
    ? [<Gesture key="d" icon={Hand}>drag to turn</Gesture>, <Gesture key="z" icon={ZoomIn}>pinch to zoom</Gesture>, <Gesture key="c" icon={Pointer}>tap a country or a row</Gesture>]
    : [<Gesture key="d" icon={Hand}>drag to turn</Gesture>, <Gesture key="z" icon={ZoomIn}>scroll to zoom</Gesture>, <Gesture key="c" icon={MousePointerClick}>click a country or a row</Gesture>];
  // Desktop: above the band, where the tour's words stood. Phone: a fixed gap over the open sheet's
  // top edge (its published height over the dock bar), never on it.
  const bottom = phone ? `calc(var(--phone-dock-h) + ${sheetPx}px + ${SHEET_GAP_PX}px)` : "calc(var(--bottom-reserve) + 26px)";

  return (
    <section
      aria-label="Your turn"
      className={cn("fixed inset-0 z-[45] pointer-events-none transition-opacity ease-out motion-reduce:transition-none", leaving && "opacity-0")}
      style={{ transitionDuration: `${OUT_MS}ms` }}
    >
      <p className="sr-only" aria-live="polite">{CAPTION}</p>
      <div aria-hidden className="absolute inset-x-0" style={{ bottom }}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[calc(100%+56px)] [background:linear-gradient(transparent,var(--scene-ground)_55%)] opacity-85" />
        <div className="relative mx-auto max-w-[79%] px-4 text-center max-[700px]:max-w-full">
          <div className="text-briefing font-medium text-foreground text-balance">
            <TypedNote text={CAPTION} always slow={BRIEFING_TYPE_SLOW} />
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-body text-foreground-dim">{words}</div>
        </div>
      </div>
      {!reduced && pulses.map((p) => <Pulse key={p.target} box={p.box} edge={p.edge} />)}
      {!reduced && hand && !handDone && <HandTrace x={hand.x} y={hand.y} durMs={handoverHand(phone).durMs} />}
    </section>
  );
}
