"use client";

import { Clock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { REGISTER_ICONS } from "@/components/icons";
import { REGISTER_NAMES } from "@/components/views";
import { useFeedRead } from "@/components/useFeedRead";
import { useNowTick } from "@/components/useNowTick";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { POLL } from "@/src/engine/config";
import { blockSpanWord, countFigure, countWord, snapshotSpanWord } from "@/src/data/ledgerSpan";
import { windowBlocks } from "@/src/data/blockWindow";
import { dataBlocksInWindow } from "@/src/data/dataStats";
import { getBlockWindow, getPastWindow, onBlockWindow, onPastWindow } from "@/src/data/pastWindow";
import type { LedgerRegister } from "@/src/store/mode";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { cn } from "@/lib/utils";
import { StateMark } from "@/components/state/StateAtoms";

// THE REGISTER SWITCH, ON THE SCENE (D3, user 2026-11-07 — option A of
// `.superpowers/brainstorm/521282-1794046091/content/register-switch-v2.html`: "a glass switch at the
// top of the scene"). Which register the Snapshots view reads — its metagraph snapshots, the
// transaction blocks on them, or the data blocks they carry (D6, three-way) — as ONE segmented control
// centred just under the command bar, each half carrying its own SPAN so the reader sees every range
// before choosing — since 2026-11-08 (user: "too much text … '8 mins' and some range icon? | is just
// text", design option A of four) as TWO GLYPHED READINGS and no divider: a clock before the bare span
// ("8 min", "16 h"; a pinned stretch "5 h, 2d ago", a read state in its words) and the register's own
// glyph before the bare count ("244", a floor "37+") — the name line says what is counted, the glyphs
// carry the units, and the accessible name keeps every word ("Transaction blocks, last 16 h, 55
// blocks"). The words are `src/data/ledgerSpan.ts`'s, the one home the explorer's foot reads too (its
// foot keeps "last"). It rode the explorer card's control band until D3; that band keeps only the
// measure tiles.
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
  // THE LIT HALF SAYS LIVE OR PINNED (user, 2026-11-07, design round option 2 "with the 'live' text
  // also"): one live mode per view, read per register — the newest global (and the filtered
  // network's newest snapshot) in Metagraph snapshots and Data blocks, the newest block (and its
  // global) in Transaction blocks — so the register's own half wears the state mark the card heads
  // wear (`StateMark`: the live dot and its word, or the pin alone), at the end of its name line.
  const following = useStore((s) => s.following);
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
  const spans = (short: boolean, bare = false): Record<LedgerRegister, string> => {
    const snapshotSpan = snapshotSpanWord({ pastStatus, past: past?.globalSnapshots ?? null, live: [...snaps].reverse(), nowMs: now, short, bare });
    return {
      snapshots: snapshotSpan,
      blocks: blockSpanWord({ status: blockStatus, globals: blocks?.globalSnapshots ?? [], nowMs: now, around: blocks ? blocks.around : undefined, short, bare }),
      data: snapshotSpan,
    };
  };
  const span = spans(false); // the full words: the accessible name
  const bareSpan = spans(false, true); // on the glass: the clock glyph says "last"
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
  const blockCount = blockStatus?.status === "ready" && blocks?.globalSnapshots.length ? windowBlocks(blocks).length : null;
  const count: Record<LedgerRegister, string | null> = {
    snapshots: reading ? null : countWord(metaSnaps, "snapshot"),
    blocks: countWord(blockCount, "block"),
    data: reading ? null : countWord(data.count, "data block", data.read < data.total),
  };
  // The bare figure on the glass (option A): the register's glyph before it names the unit.
  const figure: Record<LedgerRegister, string | null> = {
    snapshots: reading ? null : countFigure(metaSnaps),
    blocks: countFigure(blockCount),
    data: reading ? null : countFigure(data.count, data.read < data.total),
  };
  // The phone's short form for an UNLIT half (`ledgerSpan`'s `SpanOpts`): a pinned stretch by when
  // alone, a read state in one word — measured, the full words ran the switch past the gutters.
  const shortSpan = spans(true, true);

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
              // CENTRED (user, 2026-11-08: "centre 'metagraph snapshots' / 'transaction blocks' … and the section
              // below as well"): both lines sit on the half's own axis.
              "group flex flex-col items-center justify-center gap-0.5 rounded-md px-3 max-[700px]:px-1.5 text-center cursor-pointer border-0",
              "bg-transparent text-muted-foreground hover:text-foreground hover:bg-wash-soft",
              "aria-pressed:bg-[var(--sel-bg)] aria-pressed:text-primary-ink aria-pressed:hover:bg-[var(--sel-bg)]",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
            )}
          >
            <span className="flex items-center justify-center gap-1.5 text-body font-semibold leading-none whitespace-nowrap">
              <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
              <span className="max-[700px]:hidden max-[700px]:group-aria-pressed:inline">{REGISTER_NAMES[r]}</span>
              {/* THE MARK'S ROOM IS RESERVED ON EVERY HALF (user, 2026-11-08: the control's width shifted "a
                  bit because of live indicator"): the halves are equal columns as wide as the widest, so a
                  mark only the lit half rendered moved the whole frame with each switch. An unlit half
                  carries it invisible; the phone's unlit half, which hides its name, hides it too. */}
              <StateMark following={following} className={cn("pl-1 font-normal", !lit && "invisible max-[700px]:hidden")} />
            </span>
            <span className="flex items-center justify-center gap-1 font-mono text-label leading-none tabular-nums whitespace-nowrap opacity-75 group-aria-pressed:opacity-100 group-aria-pressed:text-foreground">
              {/* TWO GLYPHED READINGS, NO DIVIDER (option A, 2026-11-08): the clock says "the last", the
                  register's glyph says what is counted; a gap parts them (a typed `|` read as text,
                  and a hairline rule vanished on the glass). */}
              <Clock aria-hidden className="size-3 flex-none opacity-80" />
              <span className="max-[700px]:hidden max-[700px]:group-aria-pressed:inline">{bareSpan[r]}</span>
              {figure[r] && (
                <span className="max-[700px]:hidden ml-2 inline-flex items-center gap-1 group-aria-pressed:text-primary">
                  <Icon aria-hidden className="size-3 flex-none opacity-80" />
                  {figure[r]}
                </span>
              )}
              <span className="hidden max-[700px]:inline max-[700px]:group-aria-pressed:hidden">{shortSpan[r]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
