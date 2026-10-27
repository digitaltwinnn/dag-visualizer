"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SCENE_GLASS } from "@/components/selection";
import { cn } from "@/lib/utils";
import type { NoteDay } from "@/src/data/noteTypes";
import { type TrackGeom, xAtMs } from "@/src/data/trendTimeline";
import { useStore } from "@/src/store/store";
import { rangeDays } from "@/src/util/localTime";
import { useAiNote } from "./NotesCard";

// THE NOTABLE DAYS ON THE TIMELINE (2026-10-27) — the AI note's notable days, one iridescent
// diamond each, on the History band's track. The same days the AI notes card lists as rows; the
// two surfaces are PAIRED through `hoverNoteDay` (rule 9): hovering a diamond lights its row,
// hovering a row lights its diamond and raises the popover. Hovers preview, a click commits the
// day as History's range — the row's own commit (`DayRow`), through the same store action.
//
// ONE NOTE, ONE FETCH: `useAiNote` is the card's own derivation, so the diamonds and the card read
// the same note through the loader's module cache. Nothing renders unless that note is `ok` and
// carries days; the days are the model's words (untrusted) rendered as React text only.
//
// ⚠️ A DIAMOND IS AN ISLAND ON A TRACK THAT OWNS EVERY POINTER. `onPointerDown` stops at the
// button, so the track's capture, brush and cursor never see a press that began on a mark — a
// press on EMPTY track still brushes. Keyboard events bubble on purpose (Escape clears a standing
// range from a focused diamond too).
//
// THE POPOVER wears `SCENE_GLASS`, the one scene-anchored label container, inside a 1px
// `--ai-edge` ring (the card's own edge: this text is a model's, marked so everywhere it stands).
// The caption also lives in the card's row, so it is never hover-only text.

const DAY_MS = 86_400_000;
const HALF_DAY_MS = 43_200_000;
/** Two notables on one UTC day share one x: the later ones step right by this many px, so both
 *  stay clickable. */
const STACK_PX = 12;
/** Within this many px of either end the popover anchors INTO the track instead of centring. */
const EDGE_PX = 110;

const keyOf = (d: NoteDay) => `${d.dayMs}:${d.kind}:${d.networkId ?? ""}`;

function Diamond({
  day,
  x,
  bottom,
  width,
  first,
}: {
  day: NoteDay;
  x: number;
  bottom: number;
  width: number;
  /** The first notable of its day answers the card row's hover (a row names a day, not a kind). */
  first: boolean;
}) {
  const lit = useStore((s) => s.hoverNoteDay === day.dayMs);
  // Hover or keyboard focus on THIS diamond; a row's hover raises only the day's first diamond.
  const [own, setOwn] = useState(false);
  // CLEARS ONLY WHAT IT SET, like `DayRow`: an unmount under the pointer (a new note, a range
  // committed) must not leave a hover behind, nor clear a day another surface lit meanwhile.
  const mine = useRef(false);
  useEffect(
    () => () => {
      const st = useStore.getState();
      if (mine.current && st.hoverNoteDay === day.dayMs) st.setHoverNoteDay(null);
    },
    [day.dayMs],
  );
  const on = () => {
    mine.current = true;
    setOwn(true);
    useStore.getState().setHoverNoteDay(day.dayMs);
  };
  const off = () => {
    mine.current = false;
    setOwn(false);
    useStore.getState().setHoverNoteDay(null);
  };
  const date = rangeDays(day.dayMs, day.dayMs + DAY_MS);
  const shown = own || (lit && first);
  const align = x < EDGE_PX ? "left-0" : x > width - EDGE_PX ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className="absolute size-0" style={{ left: x, bottom }}>
      <button
        type="button"
        aria-label={`Notable day, ${date}: ${day.caption}`}
        // The track would capture this press and start a brush or move the cursor.
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={on}
        onPointerLeave={off}
        onFocus={(e) => {
          // A mouse press focuses the button too; only keyboard focus is a preview worth keeping
          // (a click commits and the hover would otherwise stay lit on the card's row).
          if (e.currentTarget.matches(":focus-visible")) on();
        }}
        onBlur={off}
        onClick={() => useStore.getState().setTrendRange({ fromMs: day.dayMs, toMs: day.dayMs + DAY_MS })}
        className={cn(
          "absolute left-0 top-0 size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border-0 p-0",
          "[background:var(--ai-edge)] outline-none transition-transform duration-150",
          // The hit area is larger than the mark; the touch tier's is a finger's.
          "before:absolute before:-inset-2 before:content-[''] touch:before:-inset-4",
          "focus-visible:ring-1 focus-visible:ring-foreground",
          (own || lit) && "scale-125",
        )}
      />
      {shown && (
        // Decoration for the eye: the button's own name already says all of it.
        <div aria-hidden className={cn("absolute bottom-3 z-10 w-max max-w-[240px] pointer-events-none", align)}>
          <div className="rounded-md p-px [background:var(--ai-edge)]">
            {/* An opaque ground under the translucent glass, so the sweep stays in the 1px ring and
                never tints the fill (the card's own rule, NotesCard). */}
            <div className="rounded-[calc(var(--radius-md)-1px)] bg-background">
              <div className={cn(SCENE_GLASS, "border-0 px-2.5 py-1.5")}>
                <div className="text-label tracking-caps text-muted-foreground tabular-nums">{date}</div>
                <div className="text-body leading-snug text-foreground">{day.caption}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The days of the note on screen that fall inside the track, as marks on its baseline.
 *  `bottom` is the baseline's distance from the track's bottom edge (the month strip's height). */
export default function NoteDiamonds({ geom, bottom }: { geom: TrackGeom; bottom: number }) {
  const { subject, note } = useAiNote();
  const res = note.res;
  const days = subject?.view === "trend" && res?.state === "ok" ? res.days : null;
  const marks = useMemo(() => {
    if (!days || geom.width <= 0) return [];
    const seen = new Map<number, number>();
    return days
      .filter((d) => d.dayMs >= geom.fromMs && d.dayMs < geom.toMs)
      .map((d) => {
        const nth = seen.get(d.dayMs) ?? 0;
        seen.set(d.dayMs, nth + 1);
        const x = Math.min(geom.width, xAtMs(d.dayMs + HALF_DAY_MS, geom) + nth * STACK_PX);
        return { day: d, x, first: nth === 0 };
      });
  }, [days, geom]);
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((m) => (
        <Diamond key={keyOf(m.day)} day={m.day} x={m.x} bottom={bottom} width={geom.width} first={m.first} />
      ))}
    </>
  );
}
