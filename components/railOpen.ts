import { useStore } from "@/src/store/store";
import { ladderLevelOfSlot } from "@/components/railCards";

/** OPEN ONE RAIL CARD AS THE BOX — the one routine behind an entry's own click and an explorer row's
 *  re-box (review, 2026-10-04: the two had grown separate copies). Single-open: `collapse` names the
 *  cards that fold as this one opens (the rail passes its other committed rungs; a caller that only
 *  knows the store passes the current box, which single-open makes the only open one). View state
 *  only — nothing is committed or released.
 *
 *  A manual expand is a QUIET navigation (the never-roll-on-a-manual-expand rule, 2026-09-11): heads
 *  remounting from it skip the title roll, and the provenance lives in the store so a late-mounting
 *  card still knows it. THE CAMERA FRAMES THE BOXED RUNG (user, 2026-08-09) — for a real rung; the
 *  Engine re-walks its own ladder from it, never re-applying the row's toggle actions. */
export function openRailCard(id: string, collapse: readonly (string | null)[]): void {
  const st = useStore.getState();
  st.setNavQuiet(true);
  st.setRailCollapseMany({
    ...Object.fromEntries(collapse.filter((x): x is string => !!x && x !== id).map((x) => [x, true])),
    [id]: false,
  });
  const level = ladderLevelOfSlot(id);
  if (level) st.requestFocusRung(level);
}
