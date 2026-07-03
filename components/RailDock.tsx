"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";

// Tablet/phone edge dock for a rail's content: a slim fixed edge tab (`‹`/`›`) that opens the
// SAME content the desktop inline rail shows, inside a Sheet overlay (full-width scene stays
// behind it). Desktop never renders this — `LeftColumn`/`Inspector` branch on `useBreakpoint()`
// and keep the inline `#leftcol`/`#rightcol` path unchanged there. The Sheet primitive has no
// built-in close affordance, so this adds a visible ✕ (`.sheet-close`, ≥44px) at the top,
// alongside the existing scrim-click/Escape dismissal.
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
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <SheetClose className="sheet-close" aria-label={`Close ${label} panel`}>
            ×
          </SheetClose>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
