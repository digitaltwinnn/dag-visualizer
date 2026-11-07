import type { LedgerRegister, Mode } from "@/src/store/mode";
import { easeInOutQuad } from "./cameraRig";

// THE BRIEFING (user, 2026-10-31): the tour every entry to `/` plays, one stop per 3D view, each
// in the AI's own line. Most visitors never reach a second view, so the app shows them all once and
// Skip ends it. The design is `docs/superpowers/specs/2026-10-31-briefing-design.md`. This
// module is the tour as data; `components/Briefing.tsx` runs it and `store.briefing` carries it.

/** A stop: a view, and for the Snapshots view the register it stands in. */
export type BriefingStop = { mode: Mode; register?: LedgerRegister };

/** The route: where, then now (its snapshots, then the blocks they anchor), then who, then how it
 *  changed. */
export const BRIEFING_STOPS: readonly BriefingStop[] = [
  { mode: "geo" },
  { mode: "ledger" },
  { mode: "ledger", register: "blocks" },
  { mode: "hyper" },
  { mode: "trend" },
];

/** The register a stop leaves the Snapshots view in. A stop with none names the Snapshots register,
 *  so a back-step from the blocks stop never leaves the ledger stop showing blocks. */
export const stopRegister = (stop: BriefingStop): LedgerRegister => stop.register ?? "snapshots";

/** How long a stop stands, its scene's transition included. A quarter under 6500 went too far (user
 *  2026-11-01: "25% shorter"; 2026-11-02, after reading it against the live lines of 102 to 122
 *  characters: back up to 6 seconds); 2026-11-03, "keep all timing the same but just spend 15%
 *  less time on each view", then "make it 5": 5 seconds, every other timing untouched. The pace
 *  checked out on screen (same day: "usually all characters are on screen in time with still time
 *  left"). */
export const STOP_MS = 5000;

/** How much slower the tour's words type than a note writes itself in (user, 2026-11-03: "make the
 *  text-typing 15% slower"): the whole typing clock, its ceiling included. */
export const BRIEFING_TYPE_SLOW = 1.15;

/** The longest a stop's words may run: two to three lines of the desktop caption. A longer line
 *  would need a longer stop, and a tour that outstays its welcome is the one thing it must not do. */
export const LINE_MAX = 140;

/** How much faster the choreography runs for the tour, on the clock `?slowmo` scales: a normal
 *  switch lands in over 3 seconds, which would leave a stop nothing to stand on. Slowed twice
 *  by eye from 1.5, by 20% and then 15% (user 2026-11-01), and it lands in about 3 seconds. */
export const BRIEFING_PACE = 1.09;

/** The share of a PHONE's height the words stand in. The scene frames itself in what is left, through
 *  the projection offset a phone sheet's cover already uses (`sheetShift.ts`). Wider tiers take no
 *  lift (user, 2026-11-01: "why does it actually have to move down?"): they stand in the view's own
 *  framing, so the tour's end moves nothing. */
export const BRIEFING_COVER = 0.18;

/** How long the lift stands after the tour ends, while the HUD slides back. The bars' edges are
 *  final only once they land, and easing toward a half-arrived bar reads as a dip and a rise
 *  (user 2026-11-01: "it should not move or at least be smooth and not a bounce"). */
export const BRIEFING_RELEASE_MS = 600;

/** How long the lift takes to let go, once it may (user, 2026-11-01: "a bit abrupt"). The sheet's
 *  own ease starts at full speed, right for following a finger and a snap for a scene at rest:
 *  measured 5.4px in its first frame and most of the way in 0.2s. */
export const BRIEFING_SETTLE_MS = 1100;

/** Where the scene's shift stands `elapsedMs` into letting go: eased at both ends. */
export function liftSettling(fromPx: number, toPx: number, elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / BRIEFING_SETTLE_MS));
  return t >= 1 ? toPx : fromPx + (toPx - fromPx) * easeInOutQuad(t);
}

/** THE ENDING, THREE BEATS (user, 2026-11-01: "abrupt, not smooth/designed"): a tour that stages
 *  everything one step at a time ended in one frame, the words cut and a view change, the rails, the
 *  lift and the HUD all starting together at different lengths. Now the words go, the scene moves
 *  alone, and the HUD arrives as it lands. This is the first beat, and Skip's fade too. */
export const BRIEFING_WORDS_OUT_MS = 400;

/** How long the ending waits for a scene that never starts moving. Past a slow renderer's frame:
 *  at 2 FPS the switch's first phase shows up half a second late. */
export const BRIEFING_NO_MOTION_MS = 1000;

/** The most the ending holds the controls back behind a slow renderer, whose transition stretches
 *  in wall-clock time. Real time, and within the tour's own promise (`SCENE_WAIT_MS`). */
export const BRIEFING_LAND_MAX_MS = 6000;

/** Whether the HUD may arrive, `sinceMs` after the switch to the globe: the scene moved and landed,
 *  or there is no point waiting any longer. */
export const hasLanded = (sinceMs: number, sawMotion: boolean, phase: "out" | "in" | null): boolean =>
  sinceMs >= BRIEFING_LAND_MAX_MS || (sawMotion ? phase == null : sinceMs >= BRIEFING_NO_MOTION_MS);

/** How long the tour waits for the scene before standing down: the moment the HUD's boot ladder
 *  gives up on a dead feed (`useBootStage`), so the tour never holds the controls back longer. */
export const SCENE_WAIT_MS = 8000;

export interface BriefingEntry {
  pathname: string;
  /** The network on screen: the notes are mainnet's alone. */
  net: string;
  /** Whether this browser session has already had the tour. */
  seen: boolean;
}

/** Only the landing URL plays it, so a deep link stays the way straight in. */
export const briefsOn = ({ pathname, net, seen }: BriefingEntry): boolean => pathname === "/" && net === "mainnet" && !seen;

/** The stop after this one, or null at the end of the route. */
export const nextStop = (stop: number): number | null => (stop + 1 < BRIEFING_STOPS.length ? stop + 1 : null);

/** The stop before this one, or null at the start of the route. */
export const prevStop = (stop: number): number | null => (stop > 0 ? stop - 1 : null);

/** A stop ends when its time is up AND the scene has landed, so a slow renderer, whose transition
 *  stretches in wall-clock time, still shows every view. */
export const mayAdvance = (elapsedMs: number, phase: "out" | "in" | null): boolean => elapsedMs >= STOP_MS && phase == null;

// THE HAND-OVER (user, 2026-11-03: "if we finish the intro entirely … show some hint that they now
// landed on the real view and can interact with it", design A + D with C's gesture, brainstormed in
// the companion). A tour played to its end leaves the reader on the live view: its sign-off caption
// stands where the tour's words stood, each surface pulses its edge in turn, and one drag is traced
// across the scene. Only a tour that ENDED — Skip, Back, a key or a scene that never readied hand
// nothing over. Played once; the reader's first gesture ends it.

/** How long the hand-over stands, unless the reader moves first (8 → 6 seconds, user 2026-11-03:
 *  "remove the text a bit earlier"). */
export const HANDOVER_MS = 6000;

/** The phone Explore sheet's grow, when the tour hands over (user, 2026-11-05: "animate in like it
 *  usually does but a bit slower"). The sheet's usual entry is the 550 ms navigation tempo; this
 *  arrival, onto a cleared stage, takes a touch longer. */
export const HANDOVER_SHEET_GROW_MS = 750;

/** A surface that pulses its edge on the hand-over: the desktop's explore card, card rail and vitals
 *  band, or the phone's open sheet and its dock bar. */
export type HandoverTarget = "explore" | "rail" | "band" | "sheet" | "dock";

/** The beat between one surface's pulse and the next. */
const PULSE_GAP_MS = 500;
/** The first pulse waits for the caption to arrive. */
const PULSE_FIRST_MS = 600;

/** The surfaces in the order they pulse, each with when it starts. Coarse to fine on screen: the
 *  tool you browse with, then the facts, then the vitals — on the phone the sheet, then the dock
 *  that reaches the others. */
export function handoverPulses(phone: boolean): { target: HandoverTarget; atMs: number }[] {
  const order: HandoverTarget[] = phone ? ["sheet", "dock"] : ["explore", "rail", "band"];
  return order.map((target, i) => ({ target, atMs: PULSE_FIRST_MS + i * PULSE_GAP_MS }));
}

/** The traced drag: when it starts (a beat after the last pulse) and how long it runs, its fades
 *  included. ONE pass (user, 2026-11-03: "do it only once"). */
export function handoverHand(phone: boolean): { atMs: number; durMs: number } {
  const pulses = handoverPulses(phone);
  return { atMs: pulses[pulses.length - 1]!.atMs + 300, durMs: 2200 };
}
