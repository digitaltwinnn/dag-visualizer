import type { PickDescriptor, MetaSnapSel, TickNetSel } from "@/src/data/types";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";
import type { Mode } from "@/src/store/store";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { isSubjectSlot } from "@/components/railCards";

// THE RAIL'S COLLAPSE MACHINE, as pure functions (review M5, 2026-10-27). Inspector held every one of
// these decisions inline and untested — which card is the box, what a view switch pins, what counts
// as a new selection moment — and the AI notes card (R57) was the first slot to break the "exactly
// one box" invariant in ways no test could see (I1: a view switch left no box; I2: a step into a
// tick's network left two). Inspector now asks these and only renders the answer; the colocated
// test drives them through those scenarios by outcome.
//
// The vocabulary is the store's: `overrides` is `store.railCollapse` (slot → true folded / false
// open; absent = the auto rule), and the auto rule is "only the default card is open".

export interface LaneCollapseState {
  /** The view's display lane (`ladderSlotIds(mode)`), coarsest → finest. */
  lane: readonly string[];
  /** Does this slot render POPULATED right now (the manifest's `present`)? */
  present: (id: string) => boolean;
  /** The focus slot (`focusSlotId`). */
  focusId: string | null;
  /** `store.railCollapse`. */
  overrides: Readonly<Record<string, boolean | undefined>>;
}

/** The card open by default: the focus, else (nothing focusable) the first present lane card. */
export function openDefaultOf(s: LaneCollapseState): string | null {
  return s.focusId ?? s.lane.find(s.present) ?? null;
}

/** Is this card folded? Its override, else the auto rule: a present lane card other than the
 *  default rests as an entry. (A non-lane card has no auto fold.) */
export function isCollapsed(s: LaneCollapseState, id: string): boolean {
  const o = s.overrides[id];
  if (o !== undefined) return o;
  return s.lane.includes(id) && s.present(id) && id !== openDefaultOf(s);
}

/** Every open box in the lane — the invariant is that this holds exactly one card whenever any lane
 *  card is present. */
export function openBoxes(s: LaneCollapseState): string[] {
  return s.lane.filter((id) => s.present(id) && !isCollapsed(s, id));
}

/** THE BOX (`store.boxedCard`): the first open present lane card. */
export function boxedSlotOf(s: LaneCollapseState): string | null {
  return openBoxes(s)[0] ?? null;
}

/** Every standing override, cleared — a new selection moment drops the reader's +/− state and the
 *  auto rule governs again. */
export function overridesOnSelection(s: Pick<LaneCollapseState, "overrides">): Record<string, null> {
  return Object.fromEntries(Object.keys(s.overrides).map((id) => [id, null]));
}

/** WHAT A VIEW SWITCH WRITES (Inspector's mode-entry snapshot), given the ARRIVING lane with the
 *  departing overrides still standing.
 *
 *  A VIEW IS ENTERED ON ITS NOTE (user, 2026-10-29, R78: "always have the AI notes as the expanded
 *  card when entering a view … even if filtered, the note is specific so very relevant. Otherwise …
 *  no new info is actually presented"). A switch is an arrival, not a choice: the subject cards are
 *  the carried selection, the same dossier in every view, and the note is this view's reading of
 *  it — the one thing new on arrival. So when the notes slot stands, it is pinned OPEN and every
 *  present subject card pinned FOLDED to its entry (its one line still names the subject). The pins
 *  are the usual ones: a selection after the grace window clears them, and the clicked card opens
 *  by the auto rule (`focusSlotId`) with the note folding above it — a click is still answered by
 *  its own card. This supersedes, for views with a note, "EXPANDED STATE SURVIVES A VIEW SWITCH"
 *  (2026-09-04), whose point was the collapse-and-reopen cycle on every switch; the note arriving
 *  open folds a subject card once and leaves it, so that cycle does not return.
 *
 *  WITHOUT A NOTE (a view with none, off mainnet, a subject the server answered `none` for) the
 *  earlier rule holds: the departing open/closed state is pinned on the present SUBJECT cards, so
 *  the arrival's re-derive can shuffle the focus under an unchanged pile — except when the departing
 *  box was no subject card — read off the overrides, an open pin on a non-subject slot — where
 *  nothing is pinned (review I1: pinning every subject card folded beside an unpinned note left no
 *  box). Absent slots keep no pin either way (2026-10-18: a late
 *  live tick pinned shut stayed shut). */
export function overridesOnViewEntry(s: LaneCollapseState): Record<string, boolean | null> {
  const cleared = overridesOnSelection(s);
  const subjects = s.lane.filter((id) => isSubjectSlot(id) && s.present(id));
  const note = s.lane.find((id) => !isSubjectSlot(id) && s.present(id));
  if (note != null) return { ...cleared, [note]: false, ...Object.fromEntries(subjects.map((id) => [id, true])) };
  // The departing box was the note (its open pin, `false`, stands on a non-subject slot) and this
  // lane has none: pin nothing (I1).
  if (Object.entries(s.overrides).some(([id, v]) => v === false && !isSubjectSlot(id))) return cleared;
  return { ...cleared, ...Object.fromEntries(subjects.map((id) => [id, isCollapsed(s, id)])) };
}

/** WHAT THE NOTE'S STAND-DOWN WRITES (review 2026-10-29). A view is entered while its note is still
 *  being READ — the slot stands, reading — and the entry pins it open with every present subject
 *  card folded. If that read then answers `none` or `unavailable`, the notes slot leaves the lane
 *  and the pins alone would hold a lane of folded cards with NO BOX, a state nothing else can
 *  produce (the invariant `openBoxes` states), until the next selection moment dropped them. So
 *  when no notes slot is present and an open pin still stands on one — the entry's — every
 *  override is dropped and the auto rule governs: the focus rung opens. Nothing is written while
 *  the note stands, or when no such pin rests on it. */
export function overridesOnNoteStandDown(s: LaneCollapseState): Record<string, null> {
  if (s.lane.some((id) => !isSubjectSlot(id) && s.present(id))) return {};
  if (!Object.entries(s.overrides).some(([id, v]) => v === false && !isSubjectSlot(id))) return {};
  return overridesOnSelection(s);
}

/** The deepest card of the UNBROKEN RUN OF SUBJECT CARDS from the first present one (Inspector's
 *  next-rung step: the ghost directly below it opens its first child). The AI notes card tops the
 *  lane but is no subject, so it neither starts the run nor leaves a gap that ends it. */
export function subjectRunEnd(lane: readonly string[], present: (id: string) => boolean): string | null {
  let deepest: string | null = null;
  for (const id of lane) {
    if (!isSubjectSlot(id)) continue;
    if (present(id)) deepest = id;
    else if (deepest !== null) break;
  }
  return deepest;
}

/** The slice of the store a SELECTION MOMENT is made of. */
export interface SelectionKeyState {
  mode: Mode;
  filter: string;
  country: string | null;
  cohort: CohortSel | null;
  composition: CompositionSel | null;
  inspect: PickDescriptor | null;
  trendCursorMs: number | null;
  trendRange: { fromMs: number; toMs: number } | null;
  trendFocus: string | null;
  tickNet: TickNetSel | null;
  following: boolean;
  snap: { data: { ordinal: number } } | null;
  metaSnap: MetaSnapSel | null;
}

/** THE SELECTION MOMENT — when this key changes, the rail's +/− overrides are dropped (after a view
 *  switch's grace window) and the auto "only the focus card is open" rule governs again. The
 *  overrides are scoped to ONE moment (user, 2026-08-02: they used to be permanent, in every view).
 *  Every committed subject is in it; the two live-advancing ordinals are guarded while following, so
 *  the heartbeat never drops the reader's +/−. */
export function railSelectionKey(s: SelectionKeyState): string {
  return [
    s.mode,
    s.filter,
    s.country ?? "",
    s.cohort ? `${s.cohort.cc}|${s.cohort.city}|${s.cohort.isp}` : "",
    s.composition ? `${s.composition.netId}|${s.composition.key}` : "",
    s.inspect ? (hoverKeyOf(s.inspect) ?? "") : "",
    // HISTORY'S OWN SUBJECT (2026-09-19). Picking an instant is a new selection moment like any
    // other, and it has to be IN this key or the mode-entry snapshot pins the cursor card shut
    // forever: that snapshot writes `instant: true` on arrival (the slot is not yet present), and
    // nothing else in this view is a selection change that would drop it. Unguarded on purpose,
    // unlike the two live-advancing ordinals below — a cursor never advances by itself, and the
    // timeline writes it at most once per bucket.
    s.trendCursorMs ?? "",
    // …and the RANGE, the cursor's parent (2026-10-07), for the same reason.
    s.trendRange ? `${s.trendRange.fromMs}-${s.trendRange.toMs}` : "",
    // …and the PLANE FOCUS, which names the Metagraph card here (2026-10-07): a row click is a
    // new selection moment, or a fold override from before it keeps the card shut.
    s.trendFocus ?? "",
    // THE NETWORK COMMITTED INSIDE A PINNED TICK (review I2, 2026-10-27): a selection commit like
    // the plane focus. Missing, a step into the tick's network re-pinned the same ordinal and moved
    // nothing here, so a hand-opened notes box survived beside the arriving Metagraph card — two
    // boxes. A pinned tick's ordinal never advances, so it needs no follow guard.
    s.tickNet ? `${s.tickNet.metaId}@${s.tickNet.globalOrdinal}` : "",
    // While FOLLOWING, the auto-advancing ordinals are NOT a new selection moment — the heartbeat
    // must not drop the user's +/− overrides every ~4s (item 8; advanceSnap already keeps the
    // recency stack still for the same reason). Guards BOTH live-advanced cards: the global
    // (advanceSnap) AND the metagraph snapshot (advanceMetaSnap — found live 2026-08-08: its
    // unguarded ordinal re-materialized the focus card on every heartbeat in live metagraph mode).
    s.following ? (s.snap ? "live" : "") : (s.snap?.data.ordinal ?? ""),
    s.following ? (s.metaSnap ? "live" : "") : s.metaSnap ? `${s.metaSnap.metaId}:${s.metaSnap.ordinal}` : "",
  ].join("§");
}
