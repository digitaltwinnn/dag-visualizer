"use client";

import LiveDot from "@/components/LiveDot";
import { selectedRow, selectionHue } from "@/components/selection";
import { NoSignalDot, PinMark, PinnedMark } from "@/components/state/StateAtoms";
import { useNowTick } from "@/components/useNowTick";
import { filterAccent } from "@/src/data/network";
import { blockFollowActions, followToggleActions } from "@/src/engine/domain/pickActions";
import { registerOf } from "@/src/engine/domain/viewPolicy";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { relativeAge } from "@/src/util/relativeAge";
import { cn } from "@/lib/utils";
import { QualifierChip } from "@/components/inspector/parts";
import { useFeedRead } from "@/components/useFeedRead";

// THE LIVE / PINNED SWITCH — one component (user, 2026-09-29: "if a snapshot is pinned, it shows in
// the explorer but not in the snapshot card; … it should show pinned in both"). The Snapshots
// explorer's head and the global snapshot card's aside were two builds of the same control: the
// explorer's said "pinned" on the selection wash, the card's a bare "◷ 12s", so a pin read as
// pinned on the left and as merely old on the right. Both rendered this for three days;
// since 2026-10-02 (B1, `docs/superpowers/design/2026-10-02-heading-pin-foot`) THE CARD ALONE
// owns it and the scene callout mirrors it — with the three statements side by side, two was the
// call. The explorer's selected-row wash says which tick is pinned.
//
// Three states, one box that never changes size: LIVE (the beating dot, the live tip's ticking
// age), PINNED (a hollow dot on the selection wash in the filter's hue, the pinned snapshot's age),
// and OFF (following off with nothing pinned — no age, since one would read as live). The write
// goes through `followToggleActions` + the one executor.

/** `5s ago`, ticking — its own component so the clock re-renders this chip alone.
 *
 *  ⚠️ A CHIP OF ITS OWN, NOT A CLAUSE (user, 2026-10-03: "design the mid dots — likely two separate
 *  facts to show instead of a combined text"). The control read "live · 5s ago": a STATE you can
 *  press and a READING you cannot, glued by a dot inside one button. They are two things now — the
 *  age is the qualifier chip the leads use for a value that moves, and the pill beside it is the
 *  control alone. */
function Age({ ts }: { ts: string }) {
  const now = useNowTick(1000);
  const age = relativeAge(now - Date.parse(ts));
  // `data-yields`: a reading, so a folded ENTRY drops it (CardHead) and the ordinal beside it keeps
  // its width; the open box, the explorer's foot and the callout still show it.
  return age ? (
    <span data-yields="" className="contents">
      <QualifierChip className="tabular-nums">{age}</QualifierChip>
    </span>
  ) : null;
}

// THE CONTROL RIDES THE SUBJECT LIVE FOLLOWS (D3, user 2026-11-07: "live mode should be applied to
// the block and not the snapshot"). In the Snapshots register live follows the newest global, so the
// Global snapshot card carries the control (`subject: "snapshot"`); in the Blocks register live follows
// the newest BLOCK, so the Block card carries it (`subject: "block"`, its write `blockFollowActions`)
// and the Global snapshot card keeps only its age — it shows the block's accepting global, and its
// live or pinned state is the block's, said once on the card that owns it.
export default function FollowControl({ className, subject = "snapshot" }: { className?: string; subject?: "snapshot" | "block" }) {
  useFeedRead(["global"], "FollowControl");
  const live = useStore((s) => s.live);
  const following = useStore((s) => s.following);
  const snap = useStore((s) => s.snap);
  const block = useStore((s) => s.block);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const filter = useStore((s) => s.filter);
  const blocksRegister = useStore((s) => registerOf(s.mode, s.ledgerRegister) === "blocks");

  // The Global snapshot card in the Blocks register: its age, no control (the Block card has it).
  if (subject === "snapshot" && blocksRegister) {
    return snap ? (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
        <Age ts={snap.data.timestamp} />
      </span>
    ) : null;
  }

  if (!live)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap", className)}>
        <NoSignalDot /> no signal
      </span>
    );

  const pinned = !following && (subject === "block" ? block != null : snap != null);
  const washed = pinned;
  // The age is the SHOWN snapshot's — the committed one whether pinned or following. Under a
  // metagraph filter, following lands on the newest tick THAT network anchored into
  // (`followLatest`), which may be minutes behind the global tip; the tip's age there would read
  // "live · 3s" beside a four-minute-old snapshot (rule 10: the label never overstates).
  const shown = snap?.data ?? latestSnapshot;
  // The Block card's head already states the block's height as its chip; the age is its tick's,
  // and the Global snapshot card states it — the control stands alone there.
  const sub =
    shown && subject === "snapshot" ? <Age ts={shown.timestamp} /> : null;

  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
    {sub}
    <button
      type="button"
      aria-pressed={following}
      onClick={() => {
        const target = snap ?? (latestSnapshot ? ({ kind: "snapshot", title: `Global snapshot #${latestSnapshot.ordinal}`, data: latestSnapshot } as const) : null);
        if (!target) return;
        const b = useStore.getState().block;
        if (subject === "block") {
          if (b) applyClickActions(blockFollowActions(b, target, following));
          return;
        }
        applyClickActions(followToggleActions(target, following, b));
      }}
      // One box in every state, so the pill keeps its height and place as the state flips: the
      // padding is there when it is invisible (LIVE, transparent) as when the PINNED wash makes it
      // a visible chip (user, 2026-09-26: the pinned block "looks ugly, no padding"). Pinned is the
      // icon alone (`PinnedMark`), so it is the narrower of the two.
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-[3px] cursor-pointer select-none border border-transparent whitespace-nowrap",
        "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        washed && selectedRow(true),
      )}
      style={washed ? selectionHue(filterAccent(filter)) : undefined}
    >
      {/* The one PIN mark (`PinMark`): the explorer row, the callout and the raw layer say
          pinned with the same glyph — a hollow dot here read as a third state (user, 2026-10-09). */}
      {pinned ? (
        <PinnedMark className="text-foreground" />
      ) : (
        <>
          {following ? <LiveDot /> : <PinMark className="text-muted-foreground" />}
          <span className="text-label text-muted-foreground">live</span>
        </>
      )}
    </button>
    </span>
  );
}
