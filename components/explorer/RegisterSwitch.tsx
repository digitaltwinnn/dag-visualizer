"use client";

import { REGISTER_ICONS } from "@/components/icons";
import { BLOCKS_PAGE, VIEWS } from "@/components/views";
import type { LedgerRegister } from "@/src/store/mode";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { cn } from "@/lib/utils";

// THE REGISTER SWITCH (the Blocks register, 2026-11-05): which register the Snapshots view reads —
// its global snapshots, or the blocks on them. It rides the explorer's CONTROL BAND above the
// measure tiles, in the tiles' own segmented grammar (`MeasureTiles`: one hairline frame around the
// set, a divider between the cells, the lit cell in the view switch's on-state), so the band reads
// as two settings of one species — what the list is OF, then what its figure measures.
//
// A press goes through `switchLedgerRegister` (src/store/applyClickActions.ts), the one door: it
// releases what the register being left drew and the other cannot draw, then sets the field — the
// raw store setter releases nothing (`selectionBoundary.test.ts` holds every surface to the door).
// The URL follows the field (`RouteSync`: /snapshots ⇄ /blocks).
//
// The cells are the view's own register list (`viewPolicy.registers`), in its order; the caller
// mounts the switch only where that list holds more than one.
/** Each register's word: the Snapshots register is the view itself, Blocks its routed page's name —
 *  the words the address bar's title and the footer already say. */
const REGISTER_WORDS: Readonly<Record<LedgerRegister, string>> = {
  snapshots: VIEWS.find((v) => v.id === "ledger")?.name ?? "Snapshots",
  blocks: BLOCKS_PAGE.name,
};

export default function RegisterSwitch() {
  const register = useStore((s) => s.ledgerRegister);
  const mode = useStore((s) => s.mode);
  const registers = VIEW_POLICIES[mode].registers;
  return (
    <div role="group" aria-label="Register" className="grid grid-cols-2 gap-0 rounded-btn shadow-[inset_0_0_0_1px_var(--border)] overflow-hidden">
      {registers.map((r, i) => {
        const Icon = REGISTER_ICONS[r];
        const on = register === r;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            onClick={() => switchLedgerRegister(r)}
            className={cn(
              // The tile's own cell, rule for rule (`MeasureTiles`): the muted word unlit, the 12%
              // selection fill and its inset ring lit, the frame's radius on the outer corners only.
              "group flex min-w-0 items-center justify-start gap-1 h-7 px-1 text-label cursor-pointer",
              "text-muted-foreground bg-transparent border-0",
              i === 0 && "rounded-l-btn",
              i === registers.length - 1 && "rounded-r-btn",
              i > 0 && "shadow-[inset_1px_0_0_0_var(--border)]",
              "hover:text-foreground hover:bg-wash-soft",
              "aria-pressed:text-foreground aria-pressed:bg-[var(--sel-bg)] aria-pressed:shadow-[inset_0_0_0_1px_var(--sel-border)]",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
              "touch:min-h-10",
            )}
          >
            <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
            <span className="truncate">{REGISTER_WORDS[r]}</span>
          </button>
        );
      })}
    </div>
  );
}
