"use client";
// THE STEPPED FACE — the phone's two ‹ › faces (the view name in the top bar, the register under it)
// change their content as a HORIZONTAL ODOMETER (user, 2026-11-09: "the transition (odometer or
// similar) is too fast (also for the view selector)"). It was the new name alone sliding a 1rem step
// in 300ms, the old one simply gone — a flick, not a roll. Now both move, as the odometer's digits
// do: the old face leaves toward the side the step points away from while the new one arrives from
// the other, inside a clip, on the odometer's own clock (`--tempo-roll`, 0.65s). ONE STRIP: each face
// travels its FULL width on the SAME curve (`--ease-roll`), so the two abut as they pass and never
// cross (a 60% step on two curves, tried first, laid the names over each other mid-roll).
// A change that came from anywhere else (`from` null: a list pick, a footer link, the browser's back)
// keeps the HUD's vertical `roll-in` and lets the old face go at once, as before.
// The leaving face is a SNAPSHOT of the last committed render, laid absolutely over the arriving one
// so the box takes the new face's size at once and never grows to hold both.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FaceSide = "left" | "right";

const ROLL = "duration-(--tempo-roll) ease-(--ease-roll) motion-reduce:animate-none";
// The step is written straight into tw-animate's own translate variables: `--face-step` on the clip,
// the mean of the two faces' widths — the one distance at which a wider and a narrower name abut
// for the whole roll (each travelling its own full width laid the wider one over the narrower).
const STEP = "var(--face-step, 100%)";
const SIGNED: Record<FaceSide, string> = { right: STEP, left: `calc(${STEP} * -1)` };

export function SlideFace({ id, from, className, clipClassName, children }: {
  /** What the face shows (a mode, a register): a new id is a new face. */
  id: string;
  /** The side the new face arrives from, or null for the plain roll-in. */
  from: FaceSide | null;
  /** The face's own layout, applied to the arriving and the leaving face alike. */
  className?: string;
  /** The clip's box (padding that keeps descenders inside it). */
  clipClassName?: string;
  children: ReactNode;
}) {
  // The last committed face, read when the id moves on. A ref, written after every commit, so the
  // snapshot is the face exactly as it last drew (its live span and count included).
  const last = useRef<{ id: string; node: ReactNode; w: number }>({ id, node: children, w: 0 });
  const clip = useRef<HTMLSpanElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const [leaving, setLeaving] = useState<{ id: string; node: ReactNode; to: FaceSide } | null>(null);
  // Before paint, so the arriving face's first frame already stands at the measured step.
  useLayoutEffect(() => {
    const prev = last.current;
    const w = face.current?.offsetWidth ?? 0; // layout width: the running transform does not touch it
    if (prev.id !== id) {
      if (from && prev.w && w) clip.current?.style.setProperty("--face-step", `${(prev.w + w) / 2}px`);
      setLeaving(from ? { id: prev.id, node: prev.node, to: from === "right" ? "left" : "right" } : null);
    }
    last.current = { id, node: children, w };
  });
  return (
    <span ref={clip} className={cn("relative grid overflow-hidden", clipClassName)}>
      <span
        key={id}
        ref={face}
        style={from ? ({ "--tw-enter-translate-x": SIGNED[from] } as CSSProperties) : undefined}
        className={cn(className, from ? cn("animate-in fade-in", ROLL) : "roll-in")}
      >
        {children}
      </span>
      {leaving && (
        <span
          key={`out-${leaving.id}`}
          aria-hidden
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) setLeaving(null); }}
          style={{ "--tw-exit-translate-x": SIGNED[leaving.to] } as CSSProperties}
          className={cn(className, "absolute inset-0 justify-center pointer-events-none motion-reduce:hidden animate-out fade-out fill-mode-forwards", ROLL)}
        >
          {leaving.node}
        </span>
      )}
    </span>
  );
}
