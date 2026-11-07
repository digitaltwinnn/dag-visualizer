"use client";

import { useSyncExternalStore } from "react";
import { REGISTER_ICONS } from "@/components/icons";
import { BLOCKS_PAGE, VIEWS } from "@/components/views";
import { useFeedRead } from "@/components/useFeedRead";
import { useNowTick } from "@/components/useNowTick";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { POLL } from "@/src/engine/config";
import { blockSpanWord, snapshotSpanWord } from "@/src/data/ledgerSpan";
import { getBlockWindow, getPastWindow, onBlockWindow, onPastWindow } from "@/src/data/pastWindow";
import type { LedgerRegister } from "@/src/store/mode";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { cn } from "@/lib/utils";

// THE REGISTER SWITCH, ON THE SCENE (D3, user 2026-11-07 — option A of
// `.superpowers/brainstorm/521282-1794046091/content/register-switch-v2.html`: "a glass switch at the
// top of the scene"). Which register the Snapshots view reads — its global snapshots, or the blocks
// on them — as ONE segmented control centred just under the command bar, each half carrying its own
// SPAN so the reader sees both ranges before choosing: "Snapshots · last 11 min", "Blocks · last 13
// hours"; with a pin, the half names the pinned stretch ("5 h, 2d ago"). The words are
// `src/data/ledgerSpan.ts`'s, the one home the explorer's foot reads too. It rode the explorer card's
// control band until then; that band keeps only the measure tiles.
//
// A press goes through `switchLedgerRegister` (src/store/applyClickActions.ts), the one door: it
// releases what the register being left drew and the other cannot draw, then sets the field — the
// raw store setter releases nothing (`selectionBoundary.test.ts` holds every surface to it). The URL
// follows the field (`RouteSync`: /snapshots ⇄ /blocks).
//
// Shown only where the view's row offers more than one register (`viewPolicy.registers`, convention
// 7), in the view's own order. It stands where the motion hint used to, so the hint drops by
// `REGISTER_SWITCH_H` beneath it (`MotionHint`). During a view transition the staging band gathers on
// the same line, so the switch waits out the choreography (`motionPhase`) and fades in with the room.
// The span halves read the two windows the bridges hold: the live buffer or a past window
// (`PastWindowBridge`), and the block window (`BlockWindowBridge`, which reads it from either register
// for this reason).

/** The switch's height — one number the motion hint's drop reads (two lines a half, a touch target). */
export const REGISTER_SWITCH_H = 52;

/** Each register's word: the Snapshots register is the view itself, Blocks its routed page's name —
 *  the words the address bar's title and the footer already say. */
const REGISTER_WORDS: Readonly<Record<LedgerRegister, string>> = {
  snapshots: VIEWS.find((v) => v.id === "ledger")?.name ?? "Snapshots",
  blocks: BLOCKS_PAGE.name,
};

export default function RegisterSwitch() {
  const mode = useStore((s) => s.mode);
  const registers = VIEW_POLICIES[mode].registers;
  const on = registers.length > 1;
  useFeedRead(["global", "api-blocks"], "RegisterSwitch", on);
  const register = useStore((s) => s.ledgerRegister);
  const phase = useStore((s) => s.motionPhase);
  const pastStatus = useStore((s) => s.pastWindow?.status ?? null);
  const blockStatus = useStore((s) => s.blockWindowStatus);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, on);
  const past = useSyncExternalStore(onPastWindow, getPastWindow, () => null);
  const blocks = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  // The live block window's span runs to NOW (its silence since the newest block tick is part of it).
  const now = useNowTick(30_000);
  if (!on) return null;

  const span: Record<LedgerRegister, string> = {
    snapshots: snapshotSpanWord({ pastStatus, past: past?.globalSnapshots ?? null, live: [...snaps].reverse(), nowMs: now }),
    blocks: blockSpanWord({ status: blockStatus, globals: blocks?.globalSnapshots ?? [], nowMs: now }),
  };

  return (
    <div
      // A marker contract: the callout's free band starts under it (`ChromeBounds.sceneTop`).
      id="register-switch"
      role="group"
      aria-label="Register"
      data-on={phase ? "0" : "1"}
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra, 0px))", height: REGISTER_SWITCH_H }}
      className={cn(
        // The scene's glass (`SCENE_GLASS`'s ground and blur), as a control: one frame around both
        // halves, the lit half in the selection fill and ring — the view switch's own on-state.
        // Two EQUAL halves as wide as the wider one's content (`1fr` keeps its content minimum, and
        // the frame sizes to content): at a phone's width an even split clipped "Snapshots".
        "absolute left-1/2 z-[5] -translate-x-1/2 w-max grid grid-cols-[1fr_1fr] gap-1 p-1",
        "rounded-lg border border-border bg-[var(--panel-solid)] backdrop-blur-[8px]",
        "transition-opacity duration-200 data-[on='0']:opacity-0 data-[on='0']:pointer-events-none motion-reduce:transition-none",
      )}
    >
      {registers.map((r) => {
        const Icon = REGISTER_ICONS[r];
        const lit = register === r;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={lit}
            onClick={() => switchLedgerRegister(r)}
            className={cn(
              "group flex flex-col justify-center gap-0.5 rounded-md px-3 text-left cursor-pointer border-0",
              "bg-transparent text-muted-foreground hover:text-foreground hover:bg-wash-soft",
              "aria-pressed:bg-[var(--sel-bg)] aria-pressed:shadow-[inset_0_0_0_1px_var(--sel-border)] aria-pressed:text-primary-ink aria-pressed:hover:bg-[var(--sel-bg)]",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
            )}
          >
            <span className="flex items-center gap-1.5 text-body font-semibold leading-none whitespace-nowrap">
              <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
              {REGISTER_WORDS[r]}
            </span>
            <span className="font-mono text-label leading-none tabular-nums whitespace-nowrap">{span[r]}</span>
          </button>
        );
      })}
    </div>
  );
}
