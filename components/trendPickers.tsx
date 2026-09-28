"use client";

import { useId } from "react";
import { AlignEndHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { SELECTED_ROW } from "@/components/selection";
import { Switch } from "@/components/ui/switch";
import { displayNetwork } from "@/src/data/unlisted";
import { ZOOMS, type TrendRange, type ZoomId } from "@/src/data/trendWindow";
import { filterToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";

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

/** ONE PILL. Compact throughout (h-6/px-2/text-micro — the h-7 pills stopped fitting one line
 *  beside the section tabs once ALL and the range joined; user, 2026-09-09), and the PRESSED
 *  register is the app's own committed-selection language, `SELECTED_ROW`: a window is a
 *  committed selection, not a tab. */
export const zoomBtn = (pressed: boolean) =>
  cn(
    "h-6 px-1.5 rounded-md text-micro tracking-caps uppercase",
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
        <span className={cn("h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-micro font-bold text-foreground whitespace-nowrap", SELECTED_ROW)}>
          <span className="tabular-nums">
            {range.metaId ? `${displayNetwork(range.metaId)?.ticker ?? ""} · ` : ""}
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
 *  in both states. It replaced a label + switch that took its own line on phone. The Trends
 *  DOCUMENT keeps its `ScaleToggle` switch, where a page has room for the name. */
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



/** ONE SETTING, AS A NAME PLUS ITS STATE (2026-09-19).
 *
 *  ⚠️ A SWITCH IS NOT THE PRESSED-TOGGLE GRAMMAR, and the difference is why the scale control
 *  stopped being a pill (user, 2026-09-14, two rounds: first "should read like a simple toggle",
 *  then "make it a label with a simple on/off control"). The command bar's Scene⇄HUD and RAW name
 *  an ACTION the reader presses FOR, with the wash reporting that it is on — right for a control
 *  that pushes a surface in and pops it out. A SETTING is different: the reader is not doing
 *  something, they are choosing how the charts are DRAWN, and a setting reads as a name plus its
 *  state. History's `Same scale` is that species, which is why it wears this shape rather than
 *  borrowing the bar's.
 *
 *  The label is the switch's own `<label>`, so the words are a hit target too — the switch alone is
 *  28×16, well under the touch floor every other control here keeps. */
export function SettingSwitch({
  label,
  on,
  onChange,
  title,
  className,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** What each state means, in the reader's words — both states stated, so the tooltip explains
   *  the setting rather than only its current half. */
  title?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-micro tracking-caps uppercase text-muted-foreground cursor-pointer select-none">
        {label}
      </label>
      <Switch id={id} checked={on} onCheckedChange={onChange} title={title} />
    </span>
  );
}

/** THE SCALE SETTING — shared by the Trends document's metagraphs tab and the History view's
 *  band, beside the window pills (2026-09-19; on the explorer's heading until 2026-09-28): it is
 *  the same question about the same charts, and the two would otherwise be the sort of near-copy
 *  this file exists to prevent. */
export function ScaleToggle({
  shared,
  onChange,
  className,
}: {
  shared: boolean;
  onChange: (shared: boolean) => void;
  className?: string;
}) {
  return (
    <SettingSwitch
      label="Same scale"
      on={shared}
      onChange={onChange}
      className={className}
      title={
        shared
          ? "Every chart shares the busiest network's scale, so the column compares. Switch off to let each chart scale to its own data."
          : "Each chart scales to its own data. Switch on to put every chart on the busiest network's scale."
      }
    />
  );
}

/** WHAT IS APPLIED, IN WORDS, AND A WAY TO CLEAR IT — the raw layer's search-toolbar rule, which
 *  answers the same problem: a surface showing a CUT of its data must say so on itself, or the
 *  reader is left inferring a missing column from a control one zone away. It is the same
 *  selected-row pill the range chip above wears, so the two scopes read as one species.
 *
 *  Clearing goes through `filterToggleActions` (rule 2's one write path) — toggling the committed
 *  network OFF is what returns the surface to every network, and it commits the same release the
 *  explorer row and the scene do. The DOCUMENT's alone since 2026-09-26 — the explorer shows no
 *  scope mark; the top bar's filter is the one place to see and clear it. */
export function ScopeChip({ filter, className }: { filter: string; className?: string }) {
  if (filter === "all") return null;
  const net = displayNetwork(filter);
  return (
    <span
      className={cn(
        "h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-micro font-bold text-foreground whitespace-nowrap",
        SELECTED_ROW,
        className,
      )}
    >
      <span className="inline-block size-2 rounded-full flex-none" style={{ background: net?.hue ?? "var(--primary)" }} aria-hidden />
      {net?.name ?? filter} only
      <button
        type="button"
        onClick={() => applyClickActions(filterToggleActions(filter, filter))}
        title="Show every network again"
        className="text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </span>
  );
}
