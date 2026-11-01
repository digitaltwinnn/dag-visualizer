import type { CSSProperties } from "react";
import { SCENE_GLASS } from "@/components/selection";
import { cn } from "@/lib/utils";

// A NOTABLE DAY'S LABEL, one component for the band's mark and a chart's coin. It wears
// `SCENE_GLASS`, the one scene-anchored label container, inside a 1px `--ai-edge` ring (the card's
// own edge: this text is a model's, marked so everywhere it stands). Decoration for the eye: the
// button beside it already says all of it, and the card's row carries the caption too.
export default function NoteDayPopover({ date, caption, className, style }: { date: string; caption: string; className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden className={cn("absolute w-max max-w-[240px] pointer-events-none", className)} style={style}>
      <div className="rounded-md p-px [background:var(--ai-edge)]">
        {/* An opaque ground under the translucent glass, so the sweep stays in the 1px ring and
            never tints the fill (the card's own rule, NotesCard). */}
        <div className="rounded-[calc(var(--radius-md)-1px)] bg-background">
          <div className={cn(SCENE_GLASS, "border-0 px-2.5 py-1.5")}>
            <div className="text-label tracking-caps text-muted-foreground tabular-nums">{date}</div>
            <div className="text-label leading-snug text-foreground">{caption}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
