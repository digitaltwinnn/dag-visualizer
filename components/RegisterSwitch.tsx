"use client";

import { useSyncExternalStore } from "react";
import { REGISTER_ICONS } from "@/components/icons";
import { REGISTER_NAMES, layerPhrase, registerLine } from "@/components/views";
import { REGISTER_LAYER } from "@/src/engine/domain/viewPolicy";
import { useFollowPaused, useRegisterScope } from "@/components/useRegisterScope";
import { netKeyOf } from "@/src/engine/domain/pickActions";
import { ledgerAnchor } from "@/src/data/network";
import { useFeedRead } from "@/components/useFeedRead";
import { useNowTick } from "@/components/useNowTick";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { POLL } from "@/src/engine/config";
import { blockSpanWord, countWord, metaSnapsInWindow, snapshotSpanWord } from "@/src/data/ledgerSpan";
import { windowBlocks } from "@/src/data/blockWindow";
import { dataBlocksInWindow, settledTicks } from "@/src/data/dataStats";
import { getBlockWindow, getPastWindow, onBlockWindow, onPastWindow } from "@/src/data/pastWindow";
import type { LedgerRegister } from "@/src/store/mode";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { cn } from "@/lib/utils";
import { StateMark } from "@/components/state/StateAtoms";
import { useSceneYield } from "@/components/RailShade";
import { useBreakpoint } from "@/components/useBreakpoint";

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
// 7), in the view's own order. It stands where the motion hint used to, so the hint drops by the
// switch block's height (`registerSwitchH`) beneath it (`MotionHint`). During a view transition the
// staging band gathers on the same line, so the switch waits out the choreography (`motionPhase`) and
// fades in with the room.
// The span halves read the two windows the bridges hold: the live buffer or a past window
// (`PastWindowBridge`), and the block window (`BlockWindowBridge`, which reads it from either register
// for this reason).

/** THE LAYERED FACE (user, 2026-11-19 — option A4·1 of the design round, then readings option 2): the
 *  registers drawn as the protocol stacks them, not three equals side by side. Transaction blocks a
 *  tall tile reaching the global base (the DAG's blocks go straight into the global snapshot, a token's
 *  into its metagraph snapshot first); Data blocks on the Metagraph snapshots bar (a data block is only
 *  ever carried in one); the Global snapshot the base everything lands in, never pressable. The tiles
 *  are NAMES ONLY; the lit register's readings are stated once, in the line under the face. */
const FACE_H = 100;
/** THE PHONE'S FACE IS LOWER, THE LAYERS KEPT (user, 2026-11-20, option A of the design round: "too
 *  high in phone mode. I like the hierarchy but can we lower the height? … 'global snapshot' needs no
 *  box because it's not clickable"): two 24px tile rows, every name on one line, and the base a RULED
 *  LABEL — a hairline with "Global snapshot" set into it, no plate. (Option B, the readings in the
 *  base row, shipped for an hour and was reversed.)
 *  NO READINGS LINE, ON ANY TIER (user, the same day: "we can remove the 9 min | 326 | live if we move
 *  live to the button and ensure the other two can be included somewhere"): the lit tile wears the
 *  state mark, and the span and count are the explorer foot's (and the Data blocks band's). */
const FACE_H_PHONE = 78;
/** The switch block's whole height on a tier; the register's sentence is the caption at the scene's
 *  bottom (`#register-caption`). The one number the motion hint's drop reads, and what
 *  `#register-switch` measures, so the callout's free band starts under it. */
export function registerSwitchH(phone: boolean): number {
  return phone ? FACE_H_PHONE : FACE_H;
}
/** Where each register's tile stands in the layered face (two columns, three rows). */
const PLACE: Readonly<Record<LedgerRegister, string>> = {
  blocks: "col-start-1 row-start-1 row-span-2",
  data: "col-start-2 row-start-1",
  snapshots: "col-start-2 row-start-2",
};

export default function RegisterSwitch() {
  const mode = useStore((s) => s.mode);
  const registers = VIEW_POLICIES[mode].registers;
  const on = registers.length > 1;
  useFeedRead(["global", "api-blocks", "exact", "metasnaps"], "RegisterSwitch", on); // the data-block count reads the exact reads, a network's snapshot count the anchor index
  const register = useStore((s) => s.ledgerRegister);
  const phone = useBreakpoint() === "phone";
  // The line under the face speaks for the filter (user, 2026-11-19), and a register the filtered
  // network makes no subject for (`registerRuns`: UP runs no dL1) stays a plain, pressable half whose
  // readings name the layer it lacks ("no dL1") — not greyed out (user, same day: "the explanation in
  // the vitals section + 'no dL1' in the switcher + the hint text is clear enough"). Opened, the line,
  // the band and the explorer say why; a filter never moves the register.
  const { scope: lineScope, runs } = useRegisterScope("RegisterSwitch");
  // The lit register's follow is N/A where the network runs no such layer (`useFollowPaused`): its
  // half's state mark says "n/a", never live.
  const paused = useFollowPaused("RegisterSwitch");
  const filter = useStore((s) => s.filter);
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
  const exactMiss = useStore((s) => s.exactMiss);
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
  // SCENE MODE TAKES IT WITH THE BAR (user, 2026-11-09: "yes"): a register is a setting of the view,
  // and the view switch it belongs beside leaves with the bar, so the scene stands alone with the one
  // toggle back. It slides out through the top on the bar's own tempos (0.3s away, 0.18s back).
  const sceneOnly = useStore((s) => s.railsHidden);
  if (!on) return null;

  // The Data blocks register reads the Metagraph snapshots register's own source (the live buffer or
  // a past window), so its span is the same words.
  const snapshotSpan = snapshotSpanWord({ pastStatus, past: past?.globalSnapshots ?? null, live: [...snaps].reverse(), nowMs: now });
  const span: Record<LedgerRegister, string> = {
    snapshots: snapshotSpan,
    blocks: blockSpanWord({ status: blockStatus, globals: blocks?.globalSnapshots ?? [], nowMs: now, around: blocks ? blocks.around : undefined }),
    data: snapshotSpan,
  };
  // THE LIT TILE'S ACCESSIBLE NAME keeps the readings the face no longer draws — each register's own
  // subject counted under the filter, the explorer foot's own figures (`metaSnapsInWindow`).
  const sourceTicks = past ? past.globalSnapshots : [...snaps].reverse();
  const reading = pastStatus === "loading" || pastStatus === "failed";
  const inScope = (metaId: string): boolean => filter === "all" || netKeyOf(metaId) === filter;
  const metaSnaps = metaSnapsInWindow(sourceTicks, filter, (ts) => ledgerAnchor(ts)?.metaCounts, inScope);
  // The settled window, as the band and the explorer foot count it: a read in flight is arriving.
  const data = dataBlocksInWindow(settledTicks(sourceTicks, snapshotExact, exactMiss), snapshotExact, inScope);
  const blockCount = blockStatus?.status === "ready" && blocks?.globalSnapshots.length ? windowBlocks(blocks).length : null;
  const count: Record<LedgerRegister, string | null> = {
    snapshots: reading ? null : countWord(metaSnaps.count, "snapshot", metaSnaps.floor),
    blocks: countWord(blockCount, "block"),
    data: reading ? null : countWord(data.count, "data block", data.read < data.total),
  };
  const spoken = (r: LedgerRegister): string =>
    !runs(r) ? `no ${layerPhrase(REGISTER_LAYER[r] ?? "dl1")}` : count[r] ? `${span[r]}, ${count[r]}` : span[r];
  // The scene's glass (`SCENE_GLASS`'s ground and blur), as a control — both presentations wear it.
  const FRAME = "rounded-lg border border-border bg-[var(--panel-solid)] backdrop-blur-[8px]";

  // THE CAPTION'S VISIBILITY follows the switch's own (the transition, a drag, scene mode).
  const away = cn(
    "transition-[opacity,translate] duration-200 data-[on='0']:opacity-0 data-[on='0']:pointer-events-none motion-reduce:transition-none",
    yielding && "opacity-40 duration-300",
  );

  return (
    <>
    <div
      // A marker contract: the callout's free band starts under it (`ChromeBounds.sceneTop`).
      id="register-switch"
      data-on={phase ? "0" : "1"}
      style={{ top: "calc(var(--rail-top) + var(--topbar-extra, 0px))", height: registerSwitchH(phone) }}
      className={cn(
        "absolute left-1/2 z-[5] -translate-x-1/2 w-max max-[700px]:w-[min(360px,calc(100vw-32px))]",
        away,
        sceneOnly && "-translate-y-[calc(100%+var(--rail-top)+var(--topbar-extra,0px))] opacity-0 pointer-events-none duration-300 ease-[ease]",
      )}
    >
      {/* THE LAYERED FACE (A4·1), ON EVERY TIER (user, 2026-11-19: "I want the layered switcher also on
          phone" — the phone's single face with ‹ › went). Two columns, three rows: Transaction blocks
          the tall tile at the left, down to the base; Data blocks over Metagraph snapshots at the
          right; the Global snapshot the base across both, a ruled label, not a control. On the phone the
          names take the label step and may wrap, never shortened. */}
      <div
        role="group"
        aria-label="Register"
        style={{ height: phone ? FACE_H_PHONE : FACE_H }}
        // On the phone the right column takes more of the width, so "Metagraph snapshots" stays one
        // line; every name holds ONE line since 2026-11-20 (option A), the live dot alone beside the
        // lit one, and the phone's tile padding is 6px so the lit "Transaction blocks" fits at 360px.
        className={cn("grid grid-cols-2 max-[700px]:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] grid-rows-[1fr_1fr_auto] max-[700px]:grid-rows-[24px_24px_1fr] gap-[3px] p-1", FRAME)}
      >
        {registers.map((r) => {
          const Icon = REGISTER_ICONS[r];
          return (
            <button
              key={r}
              type="button"
              aria-pressed={register === r}
              onClick={() => switchLedgerRegister(r)}
              className={cn(
                PLACE[r],
                // H1 (user, 2026-11-20: "a hairline … to show it's a 'layer'", no extra height): every tile
                // stands on its own hairline ledge, the lit one's in the accent — a slab resting on the
                // layer below, the base's own rule repeated up the stack.
                "group flex items-center justify-center gap-1.5 max-[700px]:gap-1 rounded-t-md rounded-b-[2px] px-4 max-[700px]:px-1.5 cursor-pointer border-0 border-b border-border",
                "aria-pressed:border-[color-mix(in_oklch,var(--primary)_60%,transparent)]",
                "text-body max-[700px]:text-label font-semibold leading-none whitespace-nowrap",
                "bg-transparent text-muted-foreground hover:text-foreground hover:bg-wash-soft",
                "aria-pressed:bg-[var(--sel-bg)] aria-pressed:text-primary-ink aria-pressed:hover:bg-[var(--sel-bg)]",
                "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                // NO `TOUCH_HIT` (review I3): its pad reaches 10px past a tile, so on the phone's 3px
                // gaps it covered a quarter of the neighbour's tile and mis-routed a tap.
              )}
            >
              <Icon aria-hidden className="size-3.5 flex-none group-aria-pressed:text-primary" />
              <span>{REGISTER_NAMES[r]}</span>
              {/* LIVE RIDES THE LIT TILE (2026-11-20): the register's follow state, where its readings
                  line said it — the live dot (its word on the desktop), the pin, or n/a. */}
              {register === r && (
                <StateMark following={following} na={paused} bare={phone} className="ml-1 max-[700px]:ml-0 font-normal leading-none" />
              )}
              {register === r && <span className="sr-only">, {spoken(r)}</span>}
            </button>
          );
        })}
        {/* THE GROUND: where every register's subject lands, so it is drawn and never pressed — a
            ruled label on every tier: the hairline the tiles stand on, the ground's name set into it
            (the phone's option A, 2026-11-20; the desktop's plate went the same way on 2026-11-23,
            user: "give the … global snapshot section the style of phone (hairline)"). */}
        <div className="col-span-2 row-start-3 flex items-center gap-2 px-1 py-1 max-[700px]:py-0 select-none">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="text-label uppercase tracking-caps text-muted-foreground leading-none">Global snapshot</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
      </div>

    </div>

    {/* THE CAPTION (layout option 3): the register's sentence (`registerLine`) moved off the top to the
        scene's bottom, just above the vitals band (the dock on the phone), a caption under the picture.
        A marker contract like the switch's: the callout's free band ends above it
        (`ChromeBounds.captionTop`). */}
    <p
      id="register-caption"
      data-on={phase ? "0" : "1"}
      className={cn(
        "absolute left-1/2 z-[5] -translate-x-1/2 m-0 pointer-events-none select-none",
        "bottom-[calc(var(--bottom-reserve,0px)+8px)] max-[700px]:bottom-[calc(var(--phone-dock-h,0px)+10px)]",
        "rounded-full px-3.5 py-1.5 max-[700px]:rounded-xl bg-[color-mix(in_oklch,var(--background)_82%,transparent)] backdrop-blur-[6px]",
        "text-center text-label text-muted-foreground leading-snug whitespace-nowrap",
        "max-[700px]:w-[min(340px,calc(100vw-32px))] max-[700px]:whitespace-normal max-[700px]:text-balance",
        away,
        sceneOnly && "opacity-0",
      )}
    >
      {registerLine(register, lineScope, runs(register))}
    </p>
    </>
  );
}
