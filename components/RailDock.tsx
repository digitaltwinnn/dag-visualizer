"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";

const PULSE_MS = 900;

// Tablet/phone edge dock for a rail's content: a slim fixed edge tab (`‹`/`›`) that opens the
// SAME content the desktop inline rail shows, inside a Sheet overlay (full-width scene stays
// behind it). Desktop never renders this — `LeftColumn`/`Inspector` branch on `useBreakpoint()`
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
// dot — the collapsed-panel equivalent of the desktop cards' own `useFlashOnChange` ring (which
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
// `sheetSide`: the Sheet's slide-in edge, when it should differ from the tab's screen-edge
// position (`side`) — e.g. the phone Detail dock keeps its tab on the right edge but slides the
// sheet up from the bottom. Defaults to `side`.
export default function RailDock({
  side,
  label,
  style,
  children,
  hint,
  pulseKey,
  onOpenChange,
  sheetSide,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  hint?: boolean;
  pulseKey?: unknown;
  onOpenChange?: (open: boolean) => void;
  sheetSide?: "left" | "right" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const dotRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const anim = useRef<Animation | null>(null);
  const prevHint = useRef(hint);
  useEffect(() => {
    const hintJustArrived = hint && !prevHint.current;
    prevHint.current = hint;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (open) return; // only pulses while the tab is the only visible affordance
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
  return (
    <>
      <button
        className={`rail-tab rail-tab--${side}`}
        aria-label={`${label} panel`}
        onClick={() => handleOpenChange(true)}
      >
        {side === "left" ? "‹" : "›"}
        {showDot && (
          <span
            ref={dotRef}
            className={`rail-tab-hint${hint ? "" : " rail-tab-hint--transient"}`}
            aria-hidden="true"
          />
        )}
      </button>
      {/* NON-MODAL (`modal={false}`): the left "Explore" and right "Details" docks can be open at
          the SAME time, and the 3D scene between them stays interactive (picking still works — which
          is how interacting with the scene/Explore updates Details). No focus trap, no scrim (see
          `overlay={false}`), and outside-pointer no longer force-closes it — the user decides when
          each closes (its own ✕ / Escape). Each RailDock owns its own `open`, so the two are fully
          independent. */}
      <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side={sheetSide ?? side}
          style={style}
          overlay={false}
          // Don't let a pointer-down/interaction OUTSIDE the sheet (e.g. on the scene, or on the
          // OTHER open dock) dismiss it — the user closes each dock explicitly via its own ✕ (or
          // Escape). Without this, radix's DismissableLayer auto-closes a non-modal dialog on any
          // outside pointer-down, which would make the two docks fight + close on every scene pick.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          {sheetSide === "bottom" && <div className="sheet-grabber" aria-hidden="true" />}
          <div className="sheet-head">
            <SheetTitle className="sheet-head-title">{label}</SheetTitle>
            <SheetClose className="sheet-close" aria-label={`Close ${label} panel`}>
              ×
            </SheetClose>
          </div>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
