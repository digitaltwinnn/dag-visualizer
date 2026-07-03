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
// prefers-reduced-motion (the dot itself falls back to a static appearance — see CSS).
export default function RailDock({
  side,
  label,
  style,
  children,
  hint,
  pulseKey,
  onOpenChange,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  hint?: boolean;
  pulseKey?: unknown;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const dotRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const anim = useRef<Animation | null>(null);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (open) return; // only pulses while the tab is the only visible affordance
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
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side={side} style={style} aria-describedby={undefined}>
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
