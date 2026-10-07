"use client";

import { AlignEndHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { SELECTED_ROW } from "@/components/selection";
import { displayNetwork } from "@/src/data/unlisted";
import { ZOOMS, type TrendRange, type ZoomId } from "@/src/data/trendWindow";

// THE TRENDS CONTROLS, ONE HOME (2026-09-18; widened 2026-09-19) — the window pills and the scale
// switch, shared by the Trends DOCUMENT, the History view's band TIMELINE and that view's Network
// breakdown card. (A six-pill METRIC picker lived here too until 2026-09-26, when the Networks card took the
// explorer's heading control (`components/explorer/ExplorerHeading.tsx`) in its place and no surface picked from a
// map.) They are two registers of one rung
// (convention 12), and the pair had already been noted drifting once: the vitals rim adopted this
// register in 2026-09-08's round and then evolved to SELECTED_ROW while the document's copy stayed
// behind — "styled differently in bottom bar than in the trend view — deliberate?" (user,
// 2026-09-09). A second copy of these class strings is that drift waiting to happen again, so the
// strings live here and neither surface holds one.

/** ⚠️ THE GROUP IS A HAIRLINE, NEVER A FILLED TRACK (user, 2026-09-14: in light mode the pickers
 *  "all have a gray background which looks a bit off on a nice light clean background"). Measured,
 *  the shadcn track lands about 24 sRGB levels below the Trends document's paper — a grey slab, and
 *  the only slab on a page that is otherwise paper and hairlines.
 *  (The measurement is stated in words on purpose: rule 3's test reads comments too, and a literal
 *  here would be a colour this file does not own.)
 *
 *  `bg-muted` is the shadcn primitive's own default and was adopted unchanged at first; it reads
 *  acceptably on the dark face, where everything is low-luminance, and as UI chrome dropped onto a
 *  document on the light one. But /trends is explicitly a DOCUMENT (convention 12 — prose,
 *  sections, 2D charts), and this app's document register is a hairline: the card-head rule, the
 *  raw layer's search box and the file-cabinet tabs directly below these pickers all define their
 *  groups that way. So the group keeps its shape and loses its fill — a hairline plus
 *  `--wash-faint`, the app's own quiet surface, which is `light-dark()` by construction and so
 *  answers both faces at once.
 *
 *  ONE HOME for every group that wears it (topic, window, scale, and now the band's own window):
 *  they were copies of one literal, and the next picker would have been another. */
// THE WASH LADDER (user, 2026-09-26: "get rid of the boring gray background also for those
// controls" — the `--wash-*` tokens are the accent now): the group's plate is the faint wash under
// a hairline of the strong one, a pill lifts to the hover wash, and the pressed pill keeps the
// committed-selection language — the same ladder the explorer's path wears.
export const PICKER_GROUP =
  "inline-flex items-center rounded-lg border border-wash-strong bg-wash-faint p-[3px] max-[700px]:flex max-[700px]:justify-center max-[700px]:[&>button]:flex-1";

/** ONE PILL. Compact throughout (h-6/px-2/text-label — the h-7 pills stopped fitting one line
 *  beside the section tabs once ALL and the range joined; user, 2026-09-09), and the PRESSED
 *  register is the app's own committed-selection language, `SELECTED_ROW`: a window is a
 *  committed selection, not a tab. */
export const zoomBtn = (pressed: boolean) =>
  cn(
    "h-6 px-1.5 rounded-md text-label tracking-caps uppercase",
    pressed ? cn("font-bold text-foreground", SELECTED_ROW) : "text-muted-foreground hover:text-foreground hover:bg-wash-hover",
  );

/** The instant stamps on a range chip — the document's own `stampRange` rule: a date, plus the
 *  clock only where the buckets on screen can actually resolve one. */
function stampRange(ms: number, stepMs: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(stepMs < 86_400_000 ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "UTC",
  });
}

/** THE WINDOW PICKER — the six windows, and, while a range stands, THE RANGE ITSELF as the group's
 *  one pressed chip with its own × (user, 2026-09-09: a chip beside the group read as a second
 *  control). A committed range IS a window statement, so it belongs inside the same group rather
 *  than next to it — which is also why picking a pill clears it.
 *
 *  `range.metaId` is the document's alone (the chart a drag was drawn on); the band's range carries
 *  none, since the stack's range is the whole stack's. One component either way — an absent stamp
 *  simply renders nothing. */
export function WindowPicker({
  zoom,
  range,
  stepMs,
  onPick,
  onClearRange,
  className,
}: {
  zoom: ZoomId;
  range: TrendRange | null;
  /** The bucket size ON SCREEN, which decides whether the chip's stamps carry a clock. */
  stepMs: number;
  onPick: (id: ZoomId) => void;
  onClearRange: () => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Time window" className={cn(PICKER_GROUP, className)}>
      {!range &&
        ZOOMS.map((z) => (
          <button
            key={z.id}
            type="button"
            aria-pressed={zoom === z.id}
            onClick={() => onPick(z.id)}
            className={zoomBtn(zoom === z.id)}
          >
            {z.label}
          </button>
        ))}
      {range && (
        <span className={cn("h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-label font-bold text-foreground whitespace-nowrap", SELECTED_ROW)}>
          {/* The network and the span are two facts, set apart by the gap — no mid-dot. */}
          {range.metaId && <span>{displayNetwork(range.metaId)?.ticker ?? ""}</span>}
          <span className="tabular-nums">
            {stampRange(range.fromMs, stepMs)}–{stampRange(range.toMs, stepMs)}
          </span>
          <button
            type="button"
            onClick={onClearRange}
            title="Clear the selected range"
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}

/** THE SCALE PILL — History's band (user, 2026-09-28, option A of four in the companion, icon
 *  picked there: "aligned bars"): the Same scale setting as ONE icon toggle in its OWN small group
 *  box beside the window group, in the same frame and pressed language. Its own box, not a
 *  segment of the windows' (user, same day: "pills or a button group?"): a segmented control
 *  holds mutually exclusive options, and an independent on/off inside it read as a seventh
 *  window. Two bars on one baseline say "compared on one footing"; the tooltip carries the words
 *  in both states. It replaced a label + switch that took its own line on phone. */
export function ScalePill({ shared, onChange }: { shared: boolean; onChange: (shared: boolean) => void }) {
  return (
    <div role="group" aria-label="Chart scale" className={cn(PICKER_GROUP, "flex-none bg-transparent max-[700px]:flex-none")}>
      <button
        type="button"
        aria-pressed={shared}
        aria-label="Same scale"
        title={
          shared
            ? "Same scale: every chart shares the busiest network's scale, so the column compares. Click to let each chart scale to its own data."
            : "Own scale: each chart scales to its own data. Click to put every chart on the busiest network's scale."
        }
        onClick={() => onChange(!shared)}
        className={cn(zoomBtn(shared), "inline-flex items-center justify-center w-7 px-0", shared && "text-primary")}
      >
        <AlignEndHorizontal aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
