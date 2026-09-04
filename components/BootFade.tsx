"use client";
import { cn } from "@/lib/utils";
import { useBootStage } from "@/components/useBootStage";

// A boot-entrance wrapper for one fixed HUD zone (see useBootStage for the ladder). A plain div
// — no transform, no filter — so it is safe around fixed-position children (CSS trap 2), and it
// carries `inert` while hidden so an invisible command bar can't be clicked or focused. Opacity
// only: translating a zone would move the rects RailThread measures mid-flight. Reduced motion
// keeps the staging (it is information: the order the instrument comes up) and drops the fade.
const LEVEL = { frame: 1, data: 2, live: 3 } as const;

export default function BootFade({ at, children }: { at: keyof typeof LEVEL; children: React.ReactNode }) {
  const stage = useBootStage();
  const hidden = stage < LEVEL[at];
  return (
    <div
      inert={hidden || undefined}
      className={cn(
        "transition-opacity duration-700 ease-out motion-reduce:transition-none",
        hidden && "opacity-0",
      )}
    >
      {children}
    </div>
  );
}
