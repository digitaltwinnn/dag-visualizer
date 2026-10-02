"use client";

import { useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ThemeRows from "@/components/topbar/ThemeToggle";
import NetworkRows, { NET_ROWS } from "@/components/topbar/NetworkSwitch";
import { useNet } from "@/components/topbar/useNet";
import { cn } from "@/lib/utils";

// THE SETTINGS MENU (user, 2026-09-08: "the right section gets busy with many icons — keep
// the HUD/scene toggle and RAW, move the rest underneath a settings button"). The shared pair
// — theme, network — folds into ONE popover of labeled sections, each section the rows its
// standalone popover used to carry (ThemeRows / NetworkRows are those files, popovers shed).
// The bar's right zone then reads exactly as the 2026-09-04 divider regrouping wanted: the
// view-scoped island (SCENE⇄HUD + RAW + ABOUT), then one control for everything app-wide.
//
// THE DOC PAGES LEFT THIS MENU on 2026-09-28 (user: "doc pages are not settings; fine to keep
// them in the footer only"). They had ridden here as a third section since the 2026-09-08
// consolidation, one rank below the view switch; the footer's About · Design row is their one
// door now, and `InfoMenu.tsx` retired with the section.
//
// ONE STATE SURFACES ON THE TRIGGER, because folding a control away must not fold its state:
// "which chain am I looking at" must never go missing (the old network face's own rule) — on
// any network but mainnet the gear carries the network CODE in the live accent; absence means
// the default chain, presence shouts the dev one. (The doc-open tint went with the pages.)
export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const net = useNet();
  const code = NET_ROWS.find((r) => r.id === net)!.code;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Settings — theme, network (current: ${code})`}
          className={cn(
            // px + chevron trimmed on phone: the gear is the one addition the phone bar
            // absorbed from the consolidation, and the filter face is the first thing a
            // squeezed row starves (measured 2026-08-21, the network face's old lesson).
            "group flex flex-none items-center gap-1 h-9 py-1.5 px-2.5 max-[700px]:px-1.5 rounded-btn! pointer-coarse:min-h-11",
            "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
          )}
        >
          <Settings aria-hidden className="size-4" />
          {net !== "mainnet" && (
            <span className="text-label tracking-caps uppercase text-[var(--primary)]">{code}</span>
          )}
          <ChevronDown aria-hidden className="size-3.5 opacity-70 max-[700px]:hidden" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-60 p-1.5">
        <SectionLabel>Theme</SectionLabel>
        <ThemeRows onDone={() => setOpen(false)} />
        <SectionRule />
        <SectionLabel>Network</SectionLabel>
        <NetworkRows />
      </PopoverContent>
    </Popover>
  );
}

/** The sections' eyebrow — the card grammar's micro-caps register, muted, never interactive. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 text-label tracking-caps uppercase text-muted-foreground/80 select-none">
      {children}
    </p>
  );
}

/** Inset hairline between sections — the resting-division rule (inset by the row padding). */
function SectionRule() {
  return <div aria-hidden className="mx-2.5 mt-1.5 h-px bg-border/60" />;
}
