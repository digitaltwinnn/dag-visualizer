import type { Mode } from "@/src/store/mode";

// THE BRIEFING (user, 2026-10-31): the tour every entry to `/` plays, one stop per 3D view, each
// in the AI's own line. Most visitors never reach a second view, so the app shows them all once and
// one tap ends it. The design is `docs/superpowers/specs/2026-10-31-briefing-design.md`. This
// module is the tour as data; `components/Briefing.tsx` runs it and `store.briefing` carries it.

/** The route: where, then now, then who, then how it changed. */
export const BRIEFING_STOPS = ["geo", "ledger", "hyper", "trend"] as const satisfies readonly Mode[];

/** How long a stop stands, from the moment it is reached: a quarter under the 6500 that read the
 *  longest line at subtitle pace (user 2026-11-01: "25% shorter"). The tour's pace won over that. */
export const STOP_MS = 4875;

/** The longest a stop's words may run: two to three lines of the desktop caption. A longer line
 *  would need a longer stop, and a tour that outstays its welcome is the one thing it must not do. */
export const LINE_MAX = 140;

/** How much faster the choreography runs for the tour, on the clock `?slowmo` scales: a normal
 *  switch lands in over 3 seconds, which would leave a stop nothing to stand on. */
export const BRIEFING_PACE = 1.5;

/** The share of the viewport's height the words stand in. The scene frames itself in what is left,
 *  through the projection offset a phone sheet's cover already uses (`sheetShift.ts`). */
export const BRIEFING_COVER = 0.18;

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

/** A stop ends when its time is up AND the scene has landed, so a slow renderer, whose transition
 *  stretches in wall-clock time, still shows every view. */
export const mayAdvance = (elapsedMs: number, phase: "out" | "in" | null): boolean => elapsedMs >= STOP_MS && phase == null;
