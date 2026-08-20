"use client";
import { useBootPhase } from "@/components/useBootPhase";
import { useMinHold } from "@/components/useMinHold";
import { cn } from "@/lib/utils";

// Cold-start overlay, painted by React independent of the Three scene: a centred forming Global L0
// core — a small crisp disc with a tight glow, the two armillary shells it wears in the hypergraph
// turning slowly around it, and the expanding sonar ping — plus a "Connecting…" label, in neutral
// cyan. The mark PREFIGURES its own destination: this overlay hands off to the hypergraph's core,
// so it draws that core forming rather than a generic glow.
// On LIVE it cross-fades out as the real 3D core fades in; on timeout it switches to the grey NO
// SIGNAL treatment. Removed from the DOM once fully faded (LIVE) so it never intercepts anything.
export default function BootOverlay() {
  const phase = useBootPhase();
  // Transient boot signal: hold "Connecting…" for a minimum calm cycle then fade out,
  // so a fast LIVE handoff doesn't blink away (concern #8). The dead states (no-signal/no-engine)
  // keep `phase !== "live"`, so `active` stays true and the overlay stays put — they're steady
  // states, not subject to the hold/fade.
  const { show, fading } = useMinHold(phase !== "live");
  if (!show) return null; // handoff complete + faded — gone for good
  const noSignal = phase === "no-signal";
  const noEngine = phase === "no-engine";
  // no-engine: the 3D scene can't run (WebGL unavailable). Say so plainly and stop the ping — this
  // is a settled dead-end, not a "still trying" state. Reuse the grey nosignal skin.
  const label = noEngine
    ? "3D unavailable: WebGL not supported"
    : noSignal
      ? "No signal, retrying…"
      : "Connecting…";
  const dead = noSignal || noEngine;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[9] flex flex-col items-center justify-center gap-[18px] pointer-events-none",
        // Fades IN at 0 ms; once the boot resolves LIVE (after the min hold) it fades OUT calmly
        // instead of unmounting. Reduced motion: the hook collapses the fade, so `fading` never
        // trips and the swap is instant (the class is guarded too).
        fading ? "animate-hold-fade-out motion-reduce:animate-none" : "animate-boot-fade-in motion-reduce:animate-none",
        dead && "saturate-[.35]",
      )}
      aria-hidden
    >
      <div className="relative w-[120px] h-[120px]">
        {!noEngine && (
          <span
            className={cn(
              "absolute inset-[45px] rounded-full border border-[color-mix(in_oklch,var(--primary)_55%,transparent)]",
              "animate-boot-ping motion-reduce:animate-none motion-reduce:opacity-0", // reuse the sonar expand (peak ≤ 0.6)
              dead && "grayscale",
            )}
          />
        )}
        {/* The two armillary shells. Each wrapper spins in SCREEN space (`boot-shell`) and its
            child carries the static tilt — a rotateX with no perspective, so it resolves to a
            flattened circle. Turning that ellipse's major axis is what reads as a hoop in orbit;
            two of them, at different flattenings and opposite cadences, read as the shells the
            hypergraph core wears. Reduced motion leaves them parked at their tilt, which still
            says "core with shells". */}
        {!noEngine && (
          <>
            <span className={cn("absolute inset-0 animate-boot-shell motion-reduce:animate-none", dead && "grayscale")}>
              <span className="absolute inset-[16px] rounded-full border border-[color-mix(in_oklch,var(--primary)_38%,transparent)] [transform:rotateX(66deg)]" />
            </span>
            <span className={cn("absolute inset-0 animate-boot-shell-alt motion-reduce:animate-none", dead && "grayscale")}>
              <span className="absolute inset-[31px] rounded-full border border-[color-mix(in_oklch,var(--primary)_52%,transparent)] [transform:rotateX(44deg)]" />
            </span>
          </>
        )}
        {/* The core itself: a small CRISP disc with a tight glow, not a soft field. It used to be a
            120px radial gradient breathing its opacity, which at that size is a large solid centre
            with a long smear — a blob, where every other mark in the app is an instrument. */}
        <span
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[13px] h-[13px] rounded-full",
            "bg-[var(--primary)] shadow-[0_0_14px_3px_color-mix(in_oklch,var(--primary)_45%,transparent)]",
            "animate-breathe motion-reduce:animate-none motion-reduce:opacity-90",
            dead && "grayscale",
          )}
        />
      </div>
      <p
        className={cn(
          "text-label tracking-[0.08em] lowercase m-0",
          dead ? "text-muted-foreground" : "text-[color-mix(in_oklch,var(--primary)_80%,var(--foreground))]",
        )}
      >
        {label}
      </p>
    </div>
  );
}
