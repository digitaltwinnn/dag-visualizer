"use client";

import { Focus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";

// The command bar's FOCUS toggle (card-redesign follow-up, 2026-08-08): collapses BOTH card
// rails to their threads so the scene takes the spotlight — the threads' dots remain as the
// minimized rails (the possibility map), and clicking again restores the cards. It lives in the
// COMMAND bar (the RAW-switch precedent: whole-layout controls belong here — the two per-rail
// chevrons it replaces were too subtle to discover, user). Desktop-only: below 1100px the rails
// are dock sheets with their own triggers. Pressed state wears the house selection language
// (`--sel-bg`/`--sel-border`) so the mode is visible at a glance.
export default function RailsToggle() {
  const hidden = useStore((s) => s.railsHidden);
  const setRailsHidden = useStore((s) => s.setRailsHidden);
  const label = hidden ? "Show the card rails" : "Focus the scene — collapse the card rails to their threads";
  return (
    <button
      type="button"
      aria-pressed={hidden}
      title={label}
      aria-label={label}
      onClick={() => setRailsHidden(!hidden)}
      className={cn(
        "max-[1099px]:hidden flex-none inline-flex items-center justify-center size-9 rounded-[8px] cursor-pointer transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-1 focus-visible:outline-ring/60",
        hidden
          ? "text-foreground bg-[var(--sel-bg)] shadow-[inset_0_0_0_1px_var(--sel-border)]"
          : "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
      )}
    >
      <Focus aria-hidden className="size-4" />
    </button>
  );
}
