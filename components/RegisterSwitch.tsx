"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
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
import { cn, TOUCH_HIT } from "@/lib/utils";
import { StateMark } from "@/components/state/StateAtoms";
import { useSceneYield } from "@/components/RailShade";
import { SlideFace } from "@/components/SlideFace";

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
  // wear (`StateMark`: the live dot and its word, or the pin alone), as the third column of its readings row (2026-11-09; it ended the name line before).
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
  // IT STEPS BACK WITH THE BAND WHILE THE HAND IS ON THE CAMERA (user, 2026-11-09: "when we drag
  // the view, also dim the new view-mode control"): the one read (`useSceneYield`) at the band's own
  // level and away tempo. Every tier, as the band: it floats over the scene the drag is turning.
  // (Above the `!on` return: a hook after it would change the hook order when the view switches.)
  const yielding = useSceneYield();
  // WHERE THE PHONE FACE'S NAME ARRIVES FROM — the view face's own rule (TopBar's `faceSlide`): a ›
  // brings the next register in from the right, ‹ from the left, keyed by the register it was armed
  // for, so a switch from anywhere else (the desktop grid, a footer link) rolls in plainly.
  const [slide, setSlide] = useState<{ to: LedgerRegister; from: "left" | "right" } | null>(null);
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
  // ON A PHONE: ONE FACE, ‹ › EITHER SIDE (user, 2026-11-08, option A of
  // `.superpowers/brainstorm/…/phone-register-switch.html` — the phone view switch's own grammar one
  // row down). Three halves never fit 360px: the unlit ones were cut to a glyph and a short span and
  // still crowded the row. The face carries the lit register whole — glyph, name, live / pinned, the
  // clock span and the count, the desktop half's exact content — and the chevrons step the registers
  // in the view's order through the one door, dimmed at an end (the plank's rule, never vanishing).
  // No pip row: the view face retired its pips for the chevrons (user, 2026-10-18: "has both … the
  // <> is more intuitive"), and this is that control.
  const at = registers.indexOf(register);
  const step = (dir: -1 | 1) => {
    const to = registers[at + dir];
    if (!to) return;
    setSlide({ to, from: dir === 1 ? "right" : "left" });
    switchLedgerRegister(to);
  };
  const slideFrom = slide && slide.to === register ? slide.from : null;
  const chevron = (dir: -1 | 1) => {
    const to = registers[at + dir];
    const Glyph = dir === -1 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={!to}
        aria-label={to ? REGISTER_NAMES[to] : dir === -1 ? "First register" : "Last register"}
        onClick={() => step(dir)}
        className={cn(
          // The view face's chevron exactly (TopBar's `viewChevron`): a 24px box, a 16px muted glyph,
          // dimmed at an end, `TOUCH_HIT`'s invisible pad for a thumb, flush to the face.
          "inline-flex items-center justify-center size-6 flex-none rounded-btn bg-transparent border-0 cursor-pointer",
          "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
          "disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          TOUCH_HIT,
        )}
      >
        <Glyph aria-hidden className="size-4" />
      </button>
    );
  };
  // TWO GLYPHED READINGS, NO DIVIDER (option A, 2026-11-08): the clock says "the last", the register's
  // glyph says what is counted; a gap parts them. NOT COLOUR-CODED (user, 2026-11-09): the count reads
  // in the row's own ink, as the span beside it.
  const readings = (r: LedgerRegister, Icon: (typeof REGISTER_ICONS)[LedgerRegister]) => (
    <>
      <Clock aria-hidden className="size-3 flex-none opacity-80" />
      <span>{bareSpan[r]}</span>
      {figure[r] && (
        <span className="ml-2 inline-flex items-center gap-1">
          <Icon aria-hidden className="size-3 flex-none opacity-80" />
          {figure[r]}
        </span>
      )}
    </>
  );
  const LitIcon = REGISTER_ICONS[register];
  // The scene's glass (`SCENE_GLASS`'s ground and blur), as a control — both presentations wear it.
  const FRAME = "rounded-lg border border-border bg-[var(--panel-solid)] backdrop-blur-[8px]";

  return (
    <div
      // A marker contract: the callout's free band starts under it (`ChromeBounds.sceneTop`).
      id="register-switch"
      data-on={phase ? "0" : "1"}
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra, 0px))", height: REGISTER_SWITCH_H }}
      className={cn(
        "absolute left-1/2 z-[5] -translate-x-1/2 w-max",
        "transition-opacity duration-200 data-[on='0']:opacity-0 data-[on='0']:pointer-events-none motion-reduce:transition-none",
        // Off (data-on 0) still wins: its attribute variant outranks the plain utility.
        yielding && "opacity-40 duration-300",
      )}
    >
      {/* THE PHONE FACE (option A): the lit register whole, ‹ › stepping the others. CSS picks the
          presentation, both stay in the DOM (the view switch's precedent). */}
      <div role="group" aria-label="Register" className={cn("hidden max-[700px]:flex h-full items-center gap-0.5 px-1", FRAME)}>
        {chevron(-1)}
        {/* THE FACE RESTS UNWASHED (user, 2026-11-09: "it keeps the focus while idle"): the selection
            wash marks the lit station among three on the desktop; on a lone face it only read as a
            pressed button that never let go. The view face above it wears none either — the glyph in
            the accent and the name in the foreground ink say which one is shown. */}
        <SlideFace
          id={register}
          from={slideFrom}
          clipClassName="px-2 py-1"
          className="flex flex-col items-center justify-center gap-1"
        >
          <span className="flex items-center justify-center gap-1.5 text-body font-semibold leading-none whitespace-nowrap text-foreground">
            <LitIcon aria-hidden className="size-3.5 flex-none text-primary" />
            {REGISTER_NAMES[register]}
          </span>
          <span className="flex items-center justify-center gap-1 font-mono text-label leading-none tabular-nums whitespace-nowrap text-foreground">
            <Clock aria-hidden className="size-3 flex-none opacity-80" />
            <span aria-hidden>{bareSpan[register]}</span>
            {figure[register] && (
              <span aria-hidden className="ml-2 inline-flex items-center gap-1">
                <LitIcon aria-hidden className="size-3 flex-none opacity-80" />
                {figure[register]}
              </span>
            )}
            {/* The state, the row's third column — the desktop half's own order (2026-11-09). */}
            <StateMark following={following} className="ml-2 font-sans leading-none" />
            {/* The readings in words for assistive tech (the desktop half's own accessible name). */}
            <span className="sr-only">{count[register] ? `${span[register]}, ${count[register]}` : span[register]}</span>
          </span>
        </SlideFace>
        {chevron(1)}
      </div>

      {/* FROM 700px UP: the segmented control, one half per register. EQUAL halves as wide as the
          widest one's content (implicit `1fr` columns keep their content minimum, and the frame sizes
          to content); the lit half in the selection fill — the view switch's own on-state. */}
      <div role="group" aria-label="Register" className={cn("max-[700px]:hidden h-full grid grid-flow-col auto-cols-fr gap-1 p-1", FRAME)}>
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
              "group flex flex-col items-center justify-center rounded-md px-3 text-center cursor-pointer border-0",
              "bg-transparent text-muted-foreground hover:text-foreground hover:bg-wash-soft",
              "aria-pressed:bg-[var(--sel-bg)] aria-pressed:text-primary-ink aria-pressed:hover:bg-[var(--sel-bg)]",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
            )}
          >
            <span className="flex items-center justify-center gap-1.5 text-body font-semibold leading-none whitespace-nowrap">
              <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
              <span>{REGISTER_NAMES[r]}</span>
            </span>
            {/* THE READINGS ROW (user, 2026-11-09: "give bottom section some margin; it almost touches the
                title; if live mode (3rd column) is not applicable (mode not selected) have the 2 columns
                centered instead of 3"). Two layers in one grid cell: an invisible SIZER holding all
                three columns — so every half is as wide as its widest form and the control never moves
                (2026-11-08: its width shifted "a bit because of live indicator") — and the visible row,
                centred over it, with the state mark on the lit half only. */}
            <span className="mt-1 grid font-mono text-label leading-none tabular-nums whitespace-nowrap">
              <span aria-hidden className="invisible [grid-area:1/1] flex items-center gap-1">
                {readings(r, Icon)}
                <StateMark following={following} className="ml-2 font-sans leading-none" />
              </span>
              <span className="[grid-area:1/1] justify-self-center flex items-center gap-1 opacity-75 group-aria-pressed:opacity-100 group-aria-pressed:text-foreground">
                {readings(r, Icon)}
                {/* THE STATE IS THE ROW'S THIRD COLUMN, on the lit half only (user, 2026-11-09), on the
                    row's line (`leading-none`: its 17px line box rode low beside the readings). */}
                {lit && <StateMark following={following} className="ml-2 font-sans leading-none" />}
              </span>
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
