"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Compass, ListTree } from "lucide-react";

const PULSE_MS = 900;
// How long the hint dot stays morphed into the updating card's type glyph before settling back.
const GLYPH_MS = 2000;

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
// `hint`: an optional "new detail landed" affordance on the tab (a small pulsing dot,
// `.rail-tab-hint`) — shown when `hint` is true AND the sheet is closed. It is PURELY visual:
// it never opens the sheet itself (Global Constraint — no auto-open on a pick; the user always
// taps the tab). `onOpenChange` is exposed so a caller (Inspector) can track its own "seen"
// state (e.g. clear the hint the instant the sheet opens) without RailDock needing to know why.
//
// `pulseKey`: an optional value whose REFERENCE change replays a one-shot transient pulse on the
// dot — the collapsed-panel equivalent of the desktop cards' own `useEdgePulse` edge sweep (which
// is invisible while the rail is hidden). Fires for a hosted card's DATA updating even when
// `hint` is already false (already seen) — e.g. the live snapshot ticking while the sheet is
// closed — so the tab still "feels alive" without resurrecting the persistent unseen dot. Skips
// the initial mount, does nothing while the sheet is open, and is a no-op under
// prefers-reduced-motion (the dot itself falls back to a static appearance — see CSS). It is
// ALSO skipped the instant `hint` itself just transitioned false→true: that arrival is already
// announced by the persistent CSS pulse (`railTabHintPulse`), so replaying the transient WAAPI
// pulse on the very same frame would double-animate the same dot. The transient pulse is reserved
// for a DATA update on an already-seen card (`hint` staying false across the bump).
//
// `pulseGlyph`/`pulseHue`: the SIGNAL CHIP (user-approved 2026-07-05). When provided alongside a
// `pulseKey` bump, the dot briefly MORPHS into the updating card's type glyph (◆ dossier / ◍ node /
// ▦ snapshot — the same monochrome marks the card heads use), tinted the updating card's
// identity/spine hue, rides the same one-shot pulse, then settles back to the plain dot
// (~GLYPH_MS total). So a closed tab doesn't just "feel alive" — it says WHICH kind of card just
// updated. Presentation-only props (a glyph string + a CSS colour), so RailDock stays generic —
// the caller (Inspector) owns the kind→glyph/hue mapping. Reduced motion: the glyph swap still
// happens (it's information), only the pulse animation is skipped. Callers whose cards don't
// meaningfully update (ExploreRail) simply never pass one → plain dot, unchanged.
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
// styled to align pixel-perfect into one seamless strip. Same hint/pulse dot, so this stays the
// ONE place that owns that animation logic rather than forking it per breakpoint.
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
  hint,
  pulseKey,
  pulseGlyph,
  pulseHue,
  onOpenChange,
  sheetSide,
  trigger = "edge-tab",
  open: openProp,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  hint?: boolean;
  pulseKey?: unknown;
  pulseGlyph?: string;
  pulseHue?: string;
  onOpenChange?: (open: boolean) => void;
  sheetSide?: "left" | "right" | "bottom";
  trigger?: "edge-tab" | "bottom-bar-half";
  open?: boolean;
}) {
  const [openState, setOpen] = useState(false);
  const open = openProp ?? openState;
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const dotRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const anim = useRef<Animation | null>(null);
  const prevHint = useRef(hint);
  // The signal chip: while set, the dot renders as the updating card's type glyph (see the
  // prop doc above). One timer; a new bump inside the window just restarts it.
  const [glyphFlash, setGlyphFlash] = useState<{ glyph: string; hue?: string } | null>(null);
  const glyphTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (glyphTimer.current) clearTimeout(glyphTimer.current); }, []);
  useEffect(() => {
    const hintJustArrived = hint && !prevHint.current;
    prevHint.current = hint;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (open) return; // only pulses while the tab is the only visible affordance
    // The glyph morph happens on EVERY qualifying bump (incl. a brand-new detail arriving — the
    // glyph is what tells you WHAT landed); under reduced motion it's a static swap, no pulse.
    if (pulseGlyph) {
      setGlyphFlash({ glyph: pulseGlyph, hue: pulseHue });
      if (glyphTimer.current) clearTimeout(glyphTimer.current);
      glyphTimer.current = setTimeout(() => setGlyphFlash(null), GLYPH_MS);
    }
    // Skip the transient pulse when the persistent hint just turned on — its own resting CSS
    // pulse already signals "new" on this same dot; firing both at once double-animates it.
    if (hintJustArrived) return;
    const el = dotRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    anim.current?.cancel();
    anim.current = el.animate(
      [
        { opacity: 0.4, transform: "scale(0.8)" },
        { opacity: 1, transform: "scale(1.35)" },
        { opacity: 0.85, transform: "scale(1)" },
      ],
      { duration: PULSE_MS, easing: "ease-out" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey]);

  // The dot mounts whenever there's something to show (persistent hint) OR whenever a pulse
  // might need to play (pulseKey provided) — kept mounted so the transient WAAPI pulse always has
  // an element to animate, even on an already-seen detail that just got a data update.
  const showDot = (hint || pulseKey !== undefined) && !open;
  const isBarHalf = trigger === "bottom-bar-half";
  // The hint dot: a small cyan dot. On the edge tab it's absolutely placed inside the (fixed) tab;
  // on the phone bar half it sits inline after the label. PERSISTENT (`hint`) → the resting CSS
  // pulse; TRANSIENT (pulseKey only, `hint` false) → invisible at rest, a one-shot WAAPI pulse
  // plays on the ref (see the effect above). Absolutely positioned on the tab so it never grows
  // the 44px tap target.
  const dot = showDot && (
    <span
      ref={dotRef}
      className={cn(
        isBarHalf ? "static ml-0.5" : cn("absolute", side === "left" ? "right-1" : "left-1"),
        glyphFlash
          ? // Signal chip: the card-type glyph, identity-tinted, visible for the whole window
            // (the WAAPI pulse rides on top; reduced motion → this static swap alone).
            cn("text-[11px] leading-none", !isBarHalf && "top-1")
          : cn(
              "w-2 h-2 rounded-full bg-[var(--core)] shadow-[0_0_6px_1px_var(--core)]",
              !isBarHalf && "top-1.5",
              hint
                ? "animate-rail-hint motion-reduce:animate-none motion-reduce:opacity-90"
                : "opacity-0", // transient: WAAPI drives it; no resting animation
            ),
      )}
      style={glyphFlash ? { color: glyphFlash.hue ?? "var(--core)" } : undefined}
      aria-hidden="true"
    >
      {glyphFlash?.glyph}
    </span>
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
          )}
        >
          <ToggleGroupItem
            value="open"
            aria-label={`${label} panel`}
            className={cn(
              // The half fills its group; `!` beats the primitive's first/last rounding + the
              // toggle baseline's hover/on fills (this design owns its selection language).
              "w-full h-full rounded-none! items-center justify-center gap-2 cursor-pointer",
              "bg-[rgba(12,16,32,0.35)] border border-[rgba(178,193,223,0.10)] backdrop-blur-[7px]",
              "text-[12.5px] font-semibold tracking-[0.02em] text-[var(--muted)]",
              "hover:bg-[rgba(12,16,32,0.35)] hover:text-[var(--muted)]",
              "data-[state=on]:text-[var(--text)] data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_2px_0_var(--sel-border)] data-[state=on]:[&_svg]:text-[var(--core)]",
            )}
          >
            {side === "left" ? <Compass size={18} strokeWidth={1.75} aria-hidden="true" /> : <ListTree size={18} strokeWidth={1.75} aria-hidden="true" />}
            <span>{label}</span>
            {dot}
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        // Tablet edge tab (700–1099px only; hidden on desktop AND phone): a slim ‹/› entry docked
        // to the screen edge, ≥44px tap target.
        <button
          className={cn(
            "fixed z-[39] top-1/2 -translate-y-1/2 w-11 min-h-[56px] hidden items-center justify-center cursor-pointer",
            "bg-[var(--panel)] border border-[var(--panel-border)] text-[var(--text)] backdrop-blur-[14px] text-[20px] leading-none",
            "min-[700px]:max-[1099px]:flex",
            side === "left" ? "left-0 rounded-r-[var(--radius)] border-l-0" : "right-0 rounded-l-[var(--radius)] border-r-0",
          )}
          aria-label={`${label} panel`}
          // The edge tab is hidden the instant its own sheet opens, so it can only ever mean
          // "open" (the bar half's open/collapse toggle is ToggleGroup's native deselect above).
          onClick={() => handleOpenChange(true)}
        >
          {side === "left" ? "‹" : "›"}
          {dot}
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
      <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side={sheetSide ?? side}
          style={style}
          overlay={false}
          // Phone bar-half variant: the sheet sits DIRECTLY ABOVE the persistent dock bar (never
          // covers it — the bar is its visible header/handle), so offset it up by the bar height.
          // `!` beats the base `bottom-0` from the bottom-side placement in sheet.tsx.
          className={isBarHalf ? "!bottom-[var(--phone-dock-h)]" : undefined}
          // Don't let a pointer-down/interaction OUTSIDE the sheet (e.g. on the scene, or on the
          // OTHER open dock) dismiss it — the user closes each dock explicitly via its own ✕ /
          // Escape / bar-half toggle. Without this, radix's DismissableLayer auto-closes a
          // non-modal dialog on any outside pointer-down, which would make the two docks fight +
          // close on every scene pick.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          {sheetSide === "bottom" && (
            // Centred grabber bar (36×4) with a ≥44px tap target; a real tap-to-collapse affordance.
            <button
              type="button"
              className={cn(
                "self-center w-11 h-11 mx-0 -mt-[22px] -mb-[18px] flex items-center justify-center cursor-pointer",
                "p-0 border-none bg-none [-webkit-tap-highlight-color:transparent]",
                "before:content-[''] before:w-9 before:h-1 before:rounded-[2px] before:bg-[var(--panel-border)]",
              )}
              aria-label={`Collapse ${label} panel`}
              onClick={() => handleOpenChange(false)}
            />
          )}
          {isBarHalf ? (
            // The persistent bar half already shows the label + hint visibly — no redundant header
            // row (no ✕ either; the bar half itself is the close affordance, via the toggle above).
            // SheetTitle stays for the accessible dialog name only.
            <SheetTitle className="sr-only">{label}</SheetTitle>
          ) : (
            // Sheet's own chrome (label + close), ABOVE the hosted content so the ✕ never overlaps a
            // hosted card's top-right control. The close is ≥44px.
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="m-0 text-[13px] font-semibold tracking-[0.02em] uppercase text-[var(--text)] opacity-90 [text-shadow:0_1px_2px_rgba(3,5,12,0.7)]">
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
                className="flex-none w-11 h-11 rounded-[var(--radius)] text-[22px] leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
              >
                ×
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
