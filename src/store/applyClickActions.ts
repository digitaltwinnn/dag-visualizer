// The ONE executor for the pick decision table (src/engine/domain/pickActions): every caller
// — the Engine's scene clicks, GeoExplore's country/node rows, LiveStrip's bars — applies its
// actions through here, so an action kind always maps to exactly one store effect. New action
// kinds get their effect HERE (and a test in applyClickActions.test.ts), never inline in a
// caller.
import { useStore } from "./store";
import { finestRung } from "@/src/engine/domain/focusLadder";
import type { ClickAction } from "@/src/engine/domain/pickActions";
import { is3D } from "@/src/engine/domain/viewTransition";
import { scrollToShow } from "@/src/engine/domain/trendStack";
import type { MotionCause } from "@/src/store/store";

export function applyClickActions(actions: ClickAction[], opts?: { quiet?: boolean }): void {
  const st = useStore.getState();
  // Every commit states HOW it was reached (user, 2026-09-11 — the structural end of the
  // timer-based roll suppression): LOUD by default — a new subject announces itself with the
  // title roll — and QUIET only when the caller says so (the plank's first-child ∨, whose
  // gesture reads as the pile unfolding, not an arrival). CardHead freezes this per mount, so
  // a card mounting late off this commit still knows its provenance.
  st.setNavQuiet(opts?.quiet ?? false);
  for (const a of actions) {
    switch (a.kind) {
      case "filter":
        // A NEW LENS CLEARS WHAT WAS PICKED UNDER THE OLD ONE (user, 2026-10-07: "if I change the
        // filter … it should clear the details pane"): the metagraph snapshot and the network
        // picked inside a tick belonged to the previous lens. Every filter writer runs through
        // here, so the rule holds for all of them; a later step of the same click re-sets them.
        if (a.id !== st.filter) {
          if (st.metaSnap != null) st.setMetaSnap(null);
          if (st.tickNet != null) st.setTickNet(null);
        }
        st.setFilter(a.id);
        // COMMITTING a filter in the ledger (re-)enters live mode (2026-08-08 — moved here
        // from FollowController's filter-dep effect, which fired AFTER any pin whose actions
        // included a filter change and stomped the pin: the release rule's step-to-"all" and
        // a cross-network pin's filter-first both hit it). As an ORDERED action effect it
        // composes correctly: a later {kind:"snapshot", follow:false} in the same click
        // re-decides, so pins win and bare commits go live.
        if (st.mode === "ledger") st.setFollowing(true);
        break;
      case "country":
        st.setCountry(a.cc);
        break;
      case "cohort":
        st.setCohort(a.sel);
        break;
      case "composition":
        st.setComposition(a.sel);
        break;
      case "inspect":
        st.setInspect(a.pick);
        break;
      case "snapshot":
        // Selecting a snapshot sets the card subject AND the follow state (live tip
        // re-follows, older pins — snapshotSelectActions); a CLEAR (pick null, follow
        // omitted) leaves following to the FollowController.
        if (a.follow !== undefined) st.setFollowing(a.follow);
        st.setSnap(a.pick);
        break;
      case "tickNet":
        // The network INSIDE the pinned tick — the ledger's Metagraph rung. One store effect, and
        // deliberately NOT the filter's: it never re-enters live (its builders pin the tick
        // themselves) and it never leaves the Snapshots view.
        st.setTickNet(a.sel);
        break;
      case "metaSnap":
        st.setMetaSnap(a.sel);
        break;
      case "trendFocus":
        // THE HISTORY VIEW'S PLANE FOCUS — one store effect, plus the paging that makes it
        // visible. `stackPoses` moves nothing for a focus outside the visible window (its own
        // tested rule), so a plane the reader scrolled past would focus INVISIBLY: the window
        // pages to it first, by the minimum that brings it in. This is also the ONE place allowed
        // to read `trendIds` back — it is React's publish channel, off limits to components, and
        // the executor is neither React nor a second publisher.
        if (a.id !== null) {
          const scroll = scrollToShow(st.trendIds, a.id, st.trendScroll);
          if (scroll !== st.trendScroll) st.setTrendScroll(scroll);
        }
        st.setTrendFocus(a.id);
        break;
      case "trendCursor":
        st.setTrendCursor(a.ms);
        break;
    }
  }
  // THE MOTION CAUSE, stamped ONCE per click (2026-09-26): the hint (`domain/motionHint.ts`) says
  // what the scene is doing while it answers this commit, and a click that carries several
  // actions (a filter plus the snapshot under it) is about its FINEST one — the last in the
  // table's coarse→fine order. Here rather than in the setters because a setter cannot tell a
  // commit from the housekeeping around it (the paging a focus asks for is not the gesture).
  const cause = motionCauseOf(actions);
  if (cause) st.setMotionCause(landingCause(cause, useStore.getState()));
}

/** A RELEASE names where the camera LANDS, in the same words a select uses (user, 2026-09-26:
 *  "don't say 'stepping back', use the same language as when stepping in"): deselecting a node
 *  under a committed network is "Framing Dor Technologies", exactly what the network row says.
 *  The landing rung is the finest one still active AFTER the writes, so it is read off the store
 *  here rather than inferred from the actions. Releases that already name their destination
 *  (a country, a snapshot, a tile) keep their own sentence. */
function landingCause(cause: MotionCause, st: ReturnType<typeof useStore.getState>): MotionCause {
  const release =
    (cause.kind === "node" && cause.title === null) ||
    (cause.kind === "cohort" && !cause.on) ||
    (cause.kind === "composition" && !cause.on);
  if (!release || !is3D(st.mode)) return cause;
  const level = finestRung(st.mode, {
    inspectIsNode: !!st.inspect && (st.inspect.kind === "l0" || st.inspect.kind === "l1" || st.inspect.kind === "metanode"),
    cohort: st.cohort,
    composition: st.composition,
    country: st.country,
    filter: st.filter,
  });
  return { kind: "rung", level };
}

/** The cause the hint names for a click — the finest action's, or null for a click that moves nothing. */
export function motionCauseOf(actions: readonly ClickAction[]): MotionCause | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i]!;
    switch (a.kind) {
      case "filter": return { kind: "filter", id: a.id };
      case "country": return { kind: "country", cc: a.cc };
      case "cohort": return { kind: "cohort", on: a.sel != null };
      case "composition": return { kind: "composition", on: a.sel != null };
      case "inspect": return { kind: "node", title: a.pick?.title ?? null, sub: a.pick?.sub ?? null };
      case "snapshot": return { kind: "snapshot", ordinal: a.pick?.data.ordinal ?? null };
      // The tick-local network frames the same subject a committed network does, so it speaks
      // the filter's sentence ("Framing Dor Technologies").
      case "tickNet": return { kind: "filter", id: a.sel?.metaId ?? "all" };
      case "metaSnap": return a.sel ? { kind: "metaSnap", metaId: a.sel.metaId, ordinal: a.sel.ordinal } : { kind: "metaSnap", metaId: null };
      case "trendFocus": return { kind: "focus", id: a.id };
      // A cursor step moves no scene — the planes' line and the card answer it.
      case "trendCursor": return null;
    }
  }
  return null;
}
