"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { ListTree, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, type LucideIcon } from "lucide-react";
import { EXPLORE_ICON } from "@/components/icons";
import { useStore } from "@/src/store/store";

// One entry in a dock's icon TRAY (user redesign 2026-07-05 — supersedes the old hint dot + the
// dot↔glyph morph, on the edge tabs AND the phone dock halves): the tray is a quiet LEGEND of the
// cards the sheet currently hosts — one `VIEW_ICONS`/`ABOUT_ICON` mark per hosted card, muted at
// rest. `active` marks a card that updated while the sheet was closed (unseen): its icon goes
// bold/vivid in the card's identity `hue` and breathes on the shared dot-beat heartbeat until the
// sheet opens (the caller clears the actives on open; the icons themselves stay — they are the
// legend, not the alert).
export type TabSignal = { id: string; icon: LucideIcon; hue?: string; active?: boolean };

// Shared one-shot pulse plumbing (switch signal + update signal ride the same mechanics):
// `useEdgePulse` debounces key changes (~1.2s — so e.g. the ledger's live snapshot follow pulses
// at most once per sweep), and the LIVE window bounds the carrier's MOUNT to the pulse window:
// PulseEdge replays its CSS animation on every mount (its keyed-remount contract), so without the
// window a sheet opened long after a pulse would replay the stale sweep on open.
// Exported so `PhoneDockSweep` (the shared full-width phone switch-sweep, page.tsx) can drive the
// SAME debounce/window semantics as the per-card carriers here, without re-deriving them.
export function usePulseWindow(key: unknown): { pulse: number; live: boolean } {
  const pulse = useEdgePulse(key);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pulse === 0) return;
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), 1300);
  }, [pulse]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { pulse, live };
}

// Tablet/phone edge dock for a rail's content: a slim fixed edge tab (`‹`/`›`) that opens the
// SAME content the desktop inline rail shows, inside a Sheet overlay (full-width scene stays
// behind it). Desktop never renders this — `ExploreRail`/`Inspector` branch on `useBreakpoint()`
// and keep the inline `#leftcol`/`#rightcol` path unchanged there.
//
// The Sheet primitive has no built-in close affordance, so this adds a dedicated **header row**
// (`.sheet-head`) at the top of the SheetContent: the panel label on the left (which doubles as
// the accessible `SheetTitle`) and the ✕ close (`.sheet-close`, ≥44px) on the right, ABOVE the
// hosted `children`. A floating corner ✕ would collide with the hosted cards' own top-right
// controls (CardPane's `.rc-close`, ContextCard's close, the left tool cards' `.panel-collapse`),
// so the close lives in the sheet's own chrome instead. Scrim-click + Escape still dismiss too.
//
// `signals`: the dock's icon TRAY (see `TabSignal` above) — a quiet legend of the hosted cards
// (muted icons at rest, on the edge tab as a vertical stack under the chevron, on the phone dock
// half as a horizontal row after the label), with `active` entries vivid/identity-hued and
// breathing (`dot-beat`; reduced motion → static vivid, no beat). PURELY visual: never opens the
// sheet itself (Global Constraint — no auto-open on a pick; the user always taps the trigger).
// Presentation-only data (icon component + a CSS colour + the active flag), so RailDock stays
// generic — each caller owns its card→icon/hue mapping and its seen-tracking (clearing actives
// when `onOpenChange` reports the open).
//
// `updateKey`: bumps once per update EVENT (whatever flagged a tray entry active) — the dock's
// outline edge replays the card-style travelling `.edge-pulse` once per bump (debounced by the
// shared `useEdgePulse`, so live snapshot ticks pulse at most once per sweep while the Layers
// icon just stays lit). Runs on the collapsed tab's scene-facing edge (tablet) and along the
// phone dock half's top edge; while the sheet is open the hosted card's own edge pulse already
// plays, so this stays a closed-state affordance.
//
// `sheetSide`: the Sheet's slide-in edge, when it should differ from the tab's screen-edge
// position (`side`) — e.g. the phone Detail dock keeps its tab on the right edge but slides the
// sheet up from the bottom. Defaults to `side`.
//
// `trigger`: the tap affordance that opens the sheet. Defaults to `"edge-tab"` (the slim `‹`/`›`
// tab on tablet). `"bottom-bar-half"` (phone only — see ExploreRail/Inspector) renders HALF of a
// single PERSISTENT full-width bar docked at the very bottom of the viewport instead: this dock's
// icon + label, occupying the left or right 50% (`.phone-dock-half--{side}`). The two halves come
// from the two separate RailDock instances (ExploreRail's Explore + Inspector's Details) but are
// styled to align pixel-perfect into one seamless strip. Same signal icons + update pulse, so
// this stays the ONE place that owns that signalling logic rather than forking it per breakpoint.
//
// The persistent bar NEVER unmounts (unlike the edge tab, which the old floating-button design
// hid while open) — tapping the ACTIVE half again collapses its own sheet (toggle), tapping the
// OTHER half switches to it. So the bar reads as the sheet's own docked header/handle: the sheet's
// content area is anchored `bottom: var(--phone-dock-h)` (i.e. directly ABOVE the bar, never
// covering it) and slides up from there, while the bar itself never moves — it just visually
// "grows" a sheet above itself. No separate `.sheet-head` row in this mode (the bar already shows
// the label); only a slim grabber up top of the sheet content remains.
//
// `open`: optional CONTROLLED mode. When provided, RailDock's
// internal `open` state is bypassed entirely — the caller (via a store field) decides when this
// dock is open, which is how the phone bar's "opening one closes the other" behaviour comes for
// free (both docks derive `open` from the same `store.phoneDock`). `onOpenChange` is still called
// on every user-driven change (tap-open, tap-active-to-collapse, Escape) either way; in controlled
// mode the caller is responsible for feeding that back into the store field. Uncontrolled
// (tablet's two independent edge docks) keeps owning its own `open` exactly as before.
export default function RailDock({
  side,
  label,
  style,
  children,
  signals,
  updateKey,
  onOpenChange,
  sheetSide,
  trigger = "edge-tab",
  open: openProp,
  sheetPx,
  onSheetPx,
  signalKey,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  signals?: TabSignal[];
  updateKey?: unknown;
  onOpenChange?: (open: boolean) => void;
  sheetSide?: "left" | "right" | "bottom";
  trigger?: "edge-tab" | "bottom-bar-half";
  open?: boolean;
  // Bottom-sheet drag (phone): the caller-held height override in px (null = the default 60vh)
  // + its setter. Store-backed by BOTH phone docks (`store.phoneSheetPx`) so switching halves
  // keeps the chosen height; the store resets it on full close (reopen = default). RailDock
  // stays store-free — it just reads/writes through these props.
  sheetPx?: number | null;
  onSheetPx?: (px: number | null) => void;
  // TABLET switch-signal carrier: RailThread (the desktop view/filter-switch pulse's home) is
  // desktop-only, so below 1100px the switch had no visible carrier. The caller passes the SAME
  // subject key RailThread uses (`${mode}|${filter}`) and RailDock plays the SAME travelling
  // `.edge-pulse` recipe (shared `useEdgePulse` — one pulse per change, debounced, mount-skipped,
  // reduced-motion → CSS static blink) on the tablet edge-tab's spine-equivalent: the open sheet's
  // `.ig-sheet-edge` identity spine, or — while the sheet is closed — the edge tab's scene-facing
  // edge. PHONE (bar-half mode) no longer reads this: the two dock halves used to each replay
  // their own half-width sweep from their screen edge toward the shared seam, which read as two
  // sweeps meeting in the middle rather than one — that carrier moved to `PhoneDockSweep`
  // (page.tsx), a single full-width overlay spanning both halves, so the switch reads as ONE
  // continuous left-edge→right-edge sweep. `updateKey`'s per-half carrier (below) is unaffected —
  // a card update is genuinely local to its own half.
  signalKey?: unknown;
}) {
  const [openState, setOpen] = useState(false);
  const open = openProp ?? openState;
  // Sheets portal to document.body, so they DON'T ride the SectionSlider transform — in the
  // data section they'd float over the table. Gate them (and the phone bar, which lands in the
  // sliver between strip and table when translated) off while section 2 is presented; the
  // internal open state is kept, so returning to the scene restores what was open.
  const section = useStore((s) => s.section);
  const shellVisible = section === "scene";
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  // ── Bottom-sheet drag (phone, grabber-initiated) ────────────────────────────────────────────
  // Standard mobile sheet gesture, v1 GRABBER-ONLY by design: the sheet body owns touch scroll,
  // so only the grabber (a dedicated ≥44px handle with `touch-action:none`) initiates a drag —
  // no drag/scroll arbitration needed. Pointer events, no dependency: capture on the grabber,
  // the sheet follows the finger live (height written through `onSheetPx`, transition suspended
  // while dragging), release snaps to the NEAREST of dismissed / default (60vh, the CSS value) /
  // expanded (~80vh, capped so the top bar stays visible). A fast downward flick (velocity over
  // the last ~120ms) dismisses regardless of position. A plain tap (no real movement) keeps
  // today's tap-to-collapse. Reduced motion: the snap is instant (the transition class is
  // motion-reduce-suppressed); the drag itself is direct manipulation and stays.
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startH: number; moved: boolean; samples: { t: number; y: number }[]; el: HTMLElement } | null>(null);
  const expandedPx = () => Math.min(Math.round(window.innerHeight * 0.8), window.innerHeight - 140);
  const defaultPx = () => Math.round(window.innerHeight * 0.6); // = the CSS h-[60vh]
  const grabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget.closest<HTMLElement>('[data-slot="sheet-content"]');
    if (!el) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no active pointer (synthetic events) — the move/up handlers still work via bubbling */
    }
    drag.current = {
      startY: e.clientY,
      startH: el.getBoundingClientRect().height,
      moved: false,
      samples: [{ t: performance.now(), y: e.clientY }],
      el,
    };
    setDragging(true);
  };
  const grabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY; // up = grow
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    onSheetPx?.(Math.max(90, Math.min(expandedPx(), Math.round(d.startH + dy))));
    d.samples.push({ t: performance.now(), y: e.clientY });
    if (d.samples.length > 10) d.samples.shift();
  };
  const grabUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      // Plain tap on the grabber — today's tap-to-collapse, unchanged.
      onSheetPx?.(null);
      handleOpenChange(false);
      return;
    }
    const h = d.el.getBoundingClientRect().height;
    const def = defaultPx();
    // Downward flick velocity (px/ms, positive = down) over the last ~120ms of the gesture.
    const now = performance.now();
    const past = d.samples.find((s) => now - s.t <= 120) ?? d.samples[0]!;
    const vy = (e.clientY - past.y) / Math.max(1, now - past.t);
    if (vy > 0.5 || h < def * 0.55) {
      // Fast flick down, or released well below the default → dismiss (same as retap).
      onSheetPx?.(null);
      handleOpenChange(false);
      return;
    }
    const exp = expandedPx();
    onSheetPx?.(Math.abs(h - def) <= Math.abs(h - exp) ? def : exp);
  };
  // A completed drag also fires a click on the grabber — swallow it so it doesn't re-collapse.
  const grabClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return; // pointer-driven click: pointerup already handled tap-vs-drag
    // Keyboard activation (Enter/Space, detail 0): the grabber's original collapse affordance.
    onSheetPx?.(null);
    handleOpenChange(false);
  };

  // ── Edge pulses: the view/filter SWITCH signal + the hosted-card UPDATE signal ──────────────
  // Two channels, one shared recipe/tempo (see `usePulseWindow`). The carrier wrapper is a 3px
  // positioning context for the `.edge-pulse` recipe, sitting where the spine-equivalent runs,
  // `--spine` carrying the identity hue (the caller's --filter-accent rides in on the same style
  // object). `short` marks a SHORT host (the collapsed tab, the dock half's top edge): the
  // travelling segment scales to ~45% of the track (`--pulse-len`) so the sweep still reads there
  // instead of blinking the whole line at once.
  const switchP = usePulseWindow(signalKey);
  const updateP = usePulseWindow(updateKey);
  const pulseSpan = (p: { pulse: number; live: boolean }, cls: string, short = false) =>
    p.live && (
      <span
        className={cn("absolute w-[3px] pointer-events-none z-[43]", short && "[--pulse-len:45%]", cls)}
        style={{ ...style, ["--spine" as string]: "var(--filter-accent, var(--primary))" } as CSSProperties}
        aria-hidden
      >
        <PulseEdge pulseKey={p.pulse} />
      </span>
    );

  const isBarHalf = trigger === "bottom-bar-half";
  // The icon TRAY (see the `signals` prop doc): the hosted cards' legend. Muted at rest; an
  // `active` (updated-unseen) icon goes vivid in its identity hue + breathes on the shared
  // dot-beat heartbeat (reduced motion → static vivid). Vertical stack on the edge tab,
  // horizontal row on the phone dock half. The frame is FIXED-SIZE for 3 icons (user refinement:
  // the two edge trays mirror each other's geometry exactly and never grow/shrink as hosted
  // cards change — fewer icons = empty slots), sized 3 × 14px icons + 2 gaps. Renders whenever
  // the caller provides a tray at all (even momentarily empty), keeping the frame stable.
  // aria-hidden — the trigger keeps its accessible label.
  const tray = signals && (
    <span
      className={cn(
        "flex items-center pointer-events-none flex-none",
        isBarHalf ? "gap-1.5 w-[54px] justify-start" : "flex-col gap-2 h-[58px] justify-start",
      )}
      aria-hidden="true"
    >
      {signals.map(({ id, icon: Icon, hue, active }) => (
        <Icon
          key={id}
          strokeWidth={active ? 2.25 : 1.75}
          className={cn(
            "size-3.5 flex-none",
            active
              ? "animate-dot-beat motion-reduce:animate-none drop-shadow-[0_0_4px_currentColor]"
              : "text-muted-foreground opacity-60",
          )}
          style={active ? { color: hue ?? "var(--primary)" } : undefined}
        />
      ))}
    </span>
  );
  // The [icons legend] | [open control] split (user refinement): the chevron serves a different
  // purpose than the card icons (open affordance vs contents legend), so a hairline separates
  // the two sections — the app's inset-hairline idiom — and the chevron sits at the END of the
  // tray (bottom on edge tabs, trailing on the phone dock half), subtly dimmer than the icons'
  // active states. The WHOLE tray stays one ≥44px tap target.
  const trayRule = signals && (
    <span
      className={cn("flex-none bg-border", isBarHalf ? "w-px h-4" : "h-px w-4")}
      aria-hidden="true"
    />
  );
  return (
    <>
      {isBarHalf ? (
        // Phone persistent bottom bar HALF: hidden except on phone (<700px). The two halves (this
        // dock's + the other rail's) tile into one seamless full-width strip docked at bottom:0;
        // the ACTIVE half reads as selected (shared cyan --sel-* language + a cyan top accent).
        // Rebased on the themed ToggleGroup primitive (user-approved 2026-07-05): a one-item
        // `type="single"` group per half — the primitive's NATIVE deselect-on-reclick is exactly
        // the dock's tap-to-open / retap-to-collapse semantics, so no hand-rolled toggle handler.
        // Each half is its own group (the two halves live in two separate RailDock instances —
        // ExploreRail's and Inspector's); their mutual exclusion stays where it was, in the shared
        // controlled `open` (`store.phoneDock`), which RailDock never owned anyway.
        <ToggleGroup
          type="single"
          value={open ? "open" : ""}
          onValueChange={(v) => handleOpenChange(v === "open")}
          className={cn(
            "fixed z-[42] bottom-0 w-1/2 h-[var(--phone-dock-h)] hidden max-[699px]:flex rounded-none",
            side === "left" ? "left-0" : "right-0",
            // Section 2 is presented: the bar would land in the sliver between the docked strip
            // and the table (it's fixed to the real viewport, outside the slider's transform).
            // Overrides the phone-breakpoint `max-[699px]:flex` above (same twMerge group+variant,
            // so the later class wins) — a bare `hidden` wouldn't, the variant would still show it.
            !shellVisible && "max-[699px]:hidden",
          )}
        >
          <ToggleGroupItem
            value="open"
            aria-label={`${label} panel`}
            className={cn(
              // The half fills its group; `!` beats the primitive's first/last rounding + the
              // toggle baseline's hover/on fills (this design owns its selection language).
              // `relative` = the positioning context for the top-edge update-pulse carrier.
              // The on-state cyan tint targets `>svg` (the half's OWN EXPLORE_ICON/ListTree mark
              // only) — the tray icons inside the span keep their muted/identity colours.
              "relative w-full h-full rounded-none! items-center justify-center gap-2 cursor-pointer",
              "bg-[var(--panel-light)] border border-[var(--thread-faint)] backdrop-blur-[8px]",
              "text-body font-semibold tracking-[0.02em] text-muted-foreground",
              "hover:bg-[var(--panel-light)] hover:text-muted-foreground",
              "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_2px_0_var(--sel-border)] data-[state=on]:[&>svg]:text-[var(--primary)]",
            )}
          >
            {side === "left" ? <EXPLORE_ICON size={18} strokeWidth={1.75} aria-hidden="true" /> : <ListTree size={18} strokeWidth={1.75} aria-hidden="true" />}
            <span>{label}</span>
            {/* [icons legend] | [open control]: the tray, then the hairline, then the trailing
                open/collapse chevron (up = opens a sheet above; down while open = collapses). */}
            {tray}
            {trayRule}
            {open ? (
              <ChevronDown size={16} className="flex-none opacity-70" aria-hidden />
            ) : (
              <ChevronUp size={16} className="flex-none opacity-70" aria-hidden />
            )}
            {/* Hosted-card UPDATE signal only: a travelling pulse along the half's TOP edge — the
                shared vertical recipe rotated onto the horizontal edge (the mask/geometry live in
                the carrier's local coords, so the soft tips + sweep rotate with it), sweeping from
                THIS half's screen edge toward the centre seam — genuinely local to this half's own
                card. The view/filter SWITCH signal is NOT rendered per-half here (see the
                `signalKey` doc) — it rides `PhoneDockSweep`'s single full-width overlay instead,
                so the two halves don't each play a competing half-sweep. */}
            {pulseSpan(
              updateP,
              cn(
                "h-[50vw] top-[3px]",
                side === "left" ? "left-0 origin-top-left -rotate-90" : "right-0 origin-top-right rotate-90",
              ),
              true,
            )}
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        // Tablet edge tab (700–1099px only; hidden on desktop AND phone): a slim rectangular TRAY
        // docked to the screen edge — the hosted cards' icon legend (a FIXED 3-slot frame, so the
        // left + right trays mirror each other's height exactly) over a hairline, over the
        // chevron (the open affordance). Width holds the ≥44px tap target (w-11); the fixed
        // column means icons never collide with the chevron and the geometry never shifts.
        <button
          className={cn(
            "fixed z-[39] top-1/2 -translate-y-1/2 w-11 min-h-[56px] hidden flex-col items-center justify-center gap-2 py-2.5 cursor-pointer",
            "bg-[var(--panel)] border border-border text-foreground backdrop-blur-[14px]",
            "min-[700px]:max-[1099px]:flex",
            side === "left" ? "left-0 rounded-r-[var(--radius)] border-l-0" : "right-0 rounded-l-[var(--radius)] border-r-0",
          )}
          aria-label={`${label} panel`}
          // The edge tab is hidden the instant its own sheet opens, so it can only ever mean
          // "open" (the bar half's open/collapse toggle is ToggleGroup's native deselect above).
          onClick={() => handleOpenChange(true)}
        >
          {/* [icons legend] above the hairline, [open control] below — see the trayRule doc. */}
          {tray}
          {trayRule}
          {side === "left" ? (
            <ChevronLeft size={20} className="flex-none opacity-70" aria-hidden />
          ) : (
            <ChevronRight size={20} className="flex-none opacity-70" aria-hidden />
          )}
          {/* CLOSED-state pulses down the tab's scene-facing edge (the sheet's spine-equivalent
              while there's no sheet on screen): the view/filter SWITCH signal + the hosted-card
              UPDATE signal — both short-host scaled. */}
          {!open && pulseSpan(switchP, cn("inset-y-1", side === "left" ? "right-0" : "left-0"), true)}
          {!open && pulseSpan(updateP, cn("inset-y-1", side === "left" ? "right-0" : "left-0"), true)}
        </button>
      )}
      {/* NON-MODAL (`modal={false}`): on tablet the left "Explore" and right "Details" edge docks
          can be open at the SAME time, and the 3D scene between them stays interactive (picking
          still works — which is how interacting with the scene/Explore updates Details). No focus
          trap, no scrim (see `overlay={false}`), and outside-pointer no longer force-closes it —
          the user decides when each closes (its own ✕ / Escape / bar-half toggle). On phone the
          two bar-half docks are mutually exclusive via the CONTROLLED `open` prop (driven by
          `store.phoneDock` from the caller), not by anything in here — RailDock itself still just
          renders whatever `open` it's given. */}
      <Sheet open={open && shellVisible} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side={sheetSide ?? side}
          // Drag-chosen height override (phone bottom sheet): inline height + unlocked max-height
          // (the CSS caps at 72vh, below the expanded snap). Cleared back to the 60vh default when
          // `sheetPx` is null.
          style={isBarHalf && sheetPx != null ? { ...style, height: sheetPx, maxHeight: "none" } : style}
          overlay={false}
          // Phone bar-half variant: the sheet sits DIRECTLY ABOVE the persistent dock bar (never
          // covers it — the bar is its visible header/handle), so offset it up by the bar height.
          // `!` beats the base `bottom-0` from the bottom-side placement in sheet.tsx. Snapping
          // animates the height (calm 0.2s; suspended while the finger drags, instant under
          // reduced motion).
          className={
            isBarHalf
              ? cn(
                  "!bottom-[var(--phone-dock-h)]",
                  dragging
                    ? "!transition-none"
                    : "transition-[height] duration-200 ease-out motion-reduce:!transition-none",
                )
              : undefined
          }
          // Don't let a pointer-down/interaction OUTSIDE the sheet (e.g. on the scene, or on the
          // OTHER open dock) dismiss it — the user closes each dock explicitly via its own ✕ /
          // Escape / bar-half toggle. Without this, radix's DismissableLayer auto-closes a
          // non-modal dialog on any outside pointer-down, which would make the two docks fight +
          // close on every scene pick.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          {/* Tablet switch-signal, OPEN state: the pulse rides the sheet's own `.ig-sheet-edge`
              identity spine (its screen-edge side) — same recipe/tempo as the desktop
              RailThread pulse, full-length segment (a tall host). Edge-tab (tablet) mode only;
              the phone bar-half sheet carries no spine (accepted). */}
          {!isBarHalf && pulseSpan(switchP, cn("inset-y-2", side === "left" ? "left-0" : "right-0"))}
          {sheetSide === "bottom" && (
            // Centred grabber bar (36×4) with a ≥44px tap target — the sheet's DRAG handle
            // (follow-the-finger + snap, see the drag block above) and still the plain
            // tap-to-collapse affordance. `touch-action:none` so the browser never turns the
            // drag into a page scroll; keyboard activation still collapses (grabClick).
            <button
              type="button"
              className={cn(
                "self-center w-11 h-11 mx-0 -mt-[22px] -mb-[18px] flex items-center justify-center cursor-grab active:cursor-grabbing",
                "p-0 border-none bg-none [-webkit-tap-highlight-color:transparent] [touch-action:none]",
                "before:content-[''] before:w-9 before:h-1 before:rounded-[2px] before:bg-border",
              )}
              aria-label={`Collapse ${label} panel`}
              onPointerDown={grabDown}
              onPointerMove={grabMove}
              onPointerUp={grabUp}
              onPointerCancel={grabUp}
              onClick={grabClick}
            />
          )}
          {isBarHalf ? (
            // The persistent bar half already shows the label + icon tray visibly — no redundant
            // header row (no ✕ either; the bar half itself is the close affordance, via the toggle
            // above). SheetTitle stays for the accessible dialog name only.
            <SheetTitle className="sr-only">{label}</SheetTitle>
          ) : (
            // Sheet's own chrome (label + close), ABOVE the hosted content so the ✕ never overlaps a
            // hosted card's top-right control. The close is ≥44px.
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="m-0 text-body font-semibold tracking-[0.02em] uppercase text-foreground opacity-90 [text-shadow:0_1px_2px_rgba(3,5,12,0.7)]">
                {label}
              </SheetTitle>
              {/* The sheet's × on the same ghost-Button baseline as CardHead's card close (muted,
                  no box — the old hand-rolled panel-boxed button is gone), just kept ≥44px since
                  it's the sheet's primary touch dismiss. */}
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Close ${label} panel`}
                title={`Close ${label} panel`}
                onClick={() => handleOpenChange(false)}
                className="flex-none w-11 h-11 rounded-[var(--radius)] leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
              >
                <X aria-hidden className="size-5" />
              </Button>
            </div>
          )}
          {/* The cards scroll in an inner body so the sheet itself is `overflow: visible` — that lets
              the bottom sheet paint its instrument ruler ABOVE its top edge (outside the element).
              Native scrollbar hidden, momentum kept (like #rightcol). `sheet-cards` (globals.css)
              suppresses the hosted cards' per-card spines/right-edges — the sheet's own
              `.ig-sheet-edge` spine is the single identity cue (no double spine); the transient
              edge PULSE still plays on each card's own edge. */}
          <div className="sheet-cards flex-1 min-h-0 flex flex-col gap-[var(--rail-gap)] overflow-y-auto overscroll-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
