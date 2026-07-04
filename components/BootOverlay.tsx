"use client";
import { useBootPhase } from "@/components/useBootPhase";
import { cn } from "@/lib/utils";

// Cold-start overlay, painted by React independent of the Three scene: a centred forming Global L0
// core (soft radial glow + an expanding ping) + a "reaching the network…" label, in neutral cyan.
// On LIVE it cross-fades out as the real 3D core fades in; on timeout it switches to the grey NO
// SIGNAL treatment. Removed from the DOM once fully faded (LIVE) so it never intercepts anything.
export default function BootOverlay() {
  const phase = useBootPhase();
  if (phase === "live") return null; // handoff complete — gone for good
  const noSignal = phase === "no-signal";
  const noEngine = phase === "no-engine";
  // no-engine: the 3D scene can't run (WebGL unavailable). Say so plainly and stop the ping — this
  // is a settled dead-end, not a "still trying" state. Reuse the grey nosignal skin.
  const label = noEngine
    ? "3D unavailable — WebGL not supported"
    : noSignal
      ? "No signal — retrying…"
      : "reaching the network…";
  const dead = noSignal || noEngine;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[9] flex flex-col items-center justify-center gap-[18px] pointer-events-none",
        "animate-boot-fade-in motion-reduce:animate-none", // the overlay itself fades IN at 0 ms
        dead && "saturate-[.35]",
      )}
      aria-hidden
    >
      <div className="relative w-[120px] h-[120px]">
        {!noEngine && (
          <span
            className={cn(
              "absolute inset-[34px] rounded-full border border-[color-mix(in_oklch,var(--primary)_55%,transparent)]",
              "animate-boot-ping motion-reduce:animate-none motion-reduce:opacity-0", // reuse the sonar expand (peak ≤ 0.6)
              dead && "grayscale",
            )}
          />
        )}
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_85%,transparent)_0%,transparent_62%)]",
            "animate-breathe motion-reduce:animate-none motion-reduce:opacity-90",
            dead && "grayscale",
          )}
        />
      </div>
      <p
        className={cn(
          "text-xs tracking-[0.08em] lowercase m-0",
          dead ? "text-muted-foreground" : "text-[color-mix(in_oklch,var(--primary)_80%,var(--foreground))]",
        )}
      >
        {label}
      </p>
    </div>
  );
}
