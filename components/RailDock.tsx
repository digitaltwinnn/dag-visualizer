"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";

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
export default function RailDock({
  side,
  label,
  style,
  children,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`rail-tab rail-tab--${side}`}
        aria-label={`${label} panel`}
        onClick={() => setOpen(true)}
      >
        {side === "left" ? "‹" : "›"}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
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
