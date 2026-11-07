"use client";

import { useSyncExternalStore } from "react";
import { REGISTER_ICONS } from "@/components/icons";
import { REGISTER_NAMES } from "@/components/views";
import { useFeedRead } from "@/components/useFeedRead";
import { useNowTick } from "@/components/useNowTick";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { POLL } from "@/src/engine/config";
import { blockSpanWord, countWord, snapshotSpanWord } from "@/src/data/ledgerSpan";
import { windowBlocks } from "@/src/data/blockWindow";
import { dataBlocksInWindow } from "@/src/data/dataStats";
import { getBlockWindow, getPastWindow, onBlockWindow, onPastWindow } from "@/src/data/pastWindow";
import type { LedgerRegister } from "@/src/store/mode";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { cn } from "@/lib/utils";

// THE REGISTER SWITCH, ON THE SCENE (D3, user 2026-11-07 — option A of
// `.superpowers/brainstorm/521282-1794046091/content/register-switch-v2.html`: "a glass switch at the
// top of the scene"). Which register the Snapshots view reads — its metagraph snapshots, the
// transaction blocks on them, or the data blocks they carry (D6, three-way) — as ONE segmented control
// centred just under the command bar, each half carrying its own SPAN so the reader sees every range
// before choosing: "Metagraph snapshots · last 11 min", "Transaction blocks · last 13 hours", "Data
// blocks · last 11 min" (it reads the snapshots' source); with a pin, a half names the pinned stretch
// ("5 h, 2d ago"). The words are
// `src/data/ledgerSpan.ts`'s, the one home the explorer's foot reads too. It rode the explorer card's
// control band until then; that band keeps only the measure tiles.
//
// A press goes through `switchLedgerRegister` (src/store/applyClickActions.ts), the one door: it
// releases what the register being left drew and the other cannot draw, then sets the field — the
// raw store setter releases nothing (`selectionBoundary.test.ts` holds every surface to it). The URL
// follows the field (`RouteSync`: /snapshots, /blocks, /data-blocks).
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

export default function RegisterSwitch() {
  const mode = useStore((s) => s.mode);
  const registers = VIEW_POLICIES[mode].registers;
  const on = registers.length > 1;
  useFeedRead(["global", "api-blocks", "exact"], "RegisterSwitch", on); // the data-block count reads the exact reads
  const register = useStore((s) => s.ledgerRegister);
  const phase = useStore((s) => s.motionPhase);
  const pastStatus = useStore((s) => s.pastWindow?.status ?? null);
  const blockStatus = useStore((s) => s.blockWindowStatus);
  const snapshotExact = useStore((s) => s.snapshotExact);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, on);
  const past = useSyncExternalStore(onPastWindow, getPastWindow, () => null);
  const blocks = useSyncExternalStore(onBlockWindow, getBlockWindow, () => null);
  // The live block window's span runs to NOW (its silence since the newest block tick is part of it).
  const now = useNowTick(30_000);
  if (!on) return null;

  // The Data blocks register reads the Metagraph snapshots register's own source (the live buffer or
  // a past window), so its half says the same span in the same words.
  const spans = (short: boolean): Record<LedgerRegister, string> => {
    const snapshotSpan = snapshotSpanWord({ pastStatus, past: past?.globalSnapshots ?? null, live: [...snaps].reverse(), nowMs: now, short });
    return {
      snapshots: snapshotSpan,
      blocks: blockSpanWord({ status: blockStatus, globals: blocks?.globalSnapshots ?? [], nowMs: now, around: blocks ? blocks.around : undefined, short }),
      data: snapshotSpan,
    };
  };
  const span = spans(false);
  // THE COUNT beside the span (user, 2026-11-07): what fills the stretch — the source's ticks (the
  // live buffer's fixed depth, or the past window's) for the two snapshot registers, the window's
  // blocks for Transaction blocks; none while a half says a read state. Desktop only: on a phone the
  // lit half's full words already run to the gutters.
  // Each half counts ITS OWN SUBJECT (user, 2026-11-07: "its subject is metagraph snapshots, count
  // those instead of global, same for data blocks"): the METAGRAPH SNAPSHOTS the source's ticks
  // anchored (the feed's own per-tick count), the DATA BLOCKS their exact reads carry (a floor,
  // "31+", while reads are still landing — rule 10), the window's BLOCKS.
  const sourceTicks = past ? past.globalSnapshots : [...snaps].reverse();
  const reading = pastStatus === "loading" || pastStatus === "failed";
  const metaSnaps = sourceTicks.reduce((n, g) => n + (g.metagraphSnapshotCount ?? 0), 0);
  const data = dataBlocksInWindow(sourceTicks, snapshotExact, () => true);
  const count: Record<LedgerRegister, string | null> = {
    snapshots: reading ? null : countWord(metaSnaps, "snapshot"),
    blocks: blockStatus?.status === "ready" && blocks?.globalSnapshots.length ? countWord(windowBlocks(blocks).length, "block") : null,
    data: reading ? null : countWord(data.count, "data block", data.read < data.total),
  };
  // The phone's short form for an UNLIT half (`ledgerSpan`'s `SpanOpts`): a pinned stretch by when
  // alone, a read state in one word — measured, the full words ran the switch past the gutters.
  const shortSpan = spans(true);

  return (
    <div
      // A marker contract: the callout's free band starts under it (`ChromeBounds.sceneTop`).
      id="register-switch"
      role="group"
      aria-label="Register"
      data-on={phase ? "0" : "1"}
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra, 0px))", height: REGISTER_SWITCH_H }}
      className={cn(
        // The scene's glass (`SCENE_GLASS`'s ground and blur), as a control: one frame around the
        // halves, the lit half in the selection fill and ring — the view switch's own on-state.
        // EQUAL halves as wide as the widest one's content (implicit `1fr` columns keep their
        // content minimum, and the frame sizes to content), one per register the row offers.
        // ON A PHONE three full names do not fit one row (user, D6: "glyph + span per half, the full
        // name on the lit half only"), so each half sizes to its own content there and only the lit
        // half names itself; the others keep their glyph and span — and their accessible name.
        // Measured at 390 (D6): with the longest name lit ("Metagraph snapshots") the desktop padding ran
        // the frame to 392px; the phone's tighter padding holds it to ~350, inside the 16px gutters.
        // With a PINNED stretch on the snapshot halves (D7, measured): 370px, so on the phone an unlit
        // half states its short span ("1d ago", "reading…") and the lit half keeps the full one.
        "absolute left-1/2 z-[5] -translate-x-1/2 w-max grid grid-flow-col auto-cols-fr max-[700px]:auto-cols-auto gap-1 p-1 max-[700px]:gap-0.5 max-[700px]:p-0.5",
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
            aria-label={count[r] ? `${REGISTER_NAMES[r]}, ${span[r]}, ${count[r]}` : `${REGISTER_NAMES[r]}, ${span[r]}`}
            onClick={() => switchLedgerRegister(r)}
            className={cn(
              // THE LIT STATION IS A WASH, NOT A FRAME (user, 2026-11-07, option 5 without the underline):
              // the unlit halves recede a step, the lit one carries the selection wash alone — no inset
              // ring — with its name and count in the accent and its span in the foreground ink.
              "group flex flex-col justify-center gap-0.5 rounded-md px-3 max-[700px]:px-1.5 text-left cursor-pointer border-0",
              "bg-transparent text-muted-foreground hover:text-foreground hover:bg-wash-soft",
              "aria-pressed:bg-[var(--sel-bg)] aria-pressed:text-primary-ink aria-pressed:hover:bg-[var(--sel-bg)]",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
            )}
          >
            <span className="flex items-center gap-1.5 text-body font-semibold leading-none whitespace-nowrap">
              <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
              <span className="max-[700px]:hidden max-[700px]:group-aria-pressed:inline">{REGISTER_NAMES[r]}</span>
            </span>
            <span className="font-mono text-label leading-none tabular-nums whitespace-nowrap opacity-75 group-aria-pressed:opacity-100 group-aria-pressed:text-foreground">
              <span className="max-[700px]:hidden max-[700px]:group-aria-pressed:inline">{span[r]}</span>
              {count[r] && <span className="max-[700px]:hidden ml-2 pl-2 border-l border-border group-aria-pressed:text-primary">{count[r]}</span>}
              <span className="hidden max-[700px]:inline max-[700px]:group-aria-pressed:hidden">{shortSpan[r]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
