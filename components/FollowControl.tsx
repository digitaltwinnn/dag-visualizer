"use client";

import LiveDot from "@/components/LiveDot";
import { selectedRow, selectionHue } from "@/components/selection";
import { NoSignalDot, PinMark } from "@/components/state/StateAtoms";
import { useNowTick } from "@/components/useNowTick";
import { filterAccent } from "@/src/data/network";
import { followToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { relativeAge } from "@/src/util/relativeAge";
import { cn } from "@/lib/utils";
import { QualifierChip } from "@/components/inspector/parts";

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
  return age ? <QualifierChip className="tabular-nums">{age}</QualifierChip> : null;
}

export default function FollowControl({ className }: { className?: string }) {
  const live = useStore((s) => s.live);
  const following = useStore((s) => s.following);
  const snap = useStore((s) => s.snap);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const filter = useStore((s) => s.filter);

  if (!live)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap", className)}>
        <NoSignalDot /> no signal
      </span>
    );

  const pinned = !following && snap != null;
  const washed = pinned;
  const label = pinned ? "pinned" : "live";
  // The age is the SHOWN snapshot's — the committed one whether pinned or following. Under a
  // metagraph filter, following lands on the newest tick THAT network anchored into
  // (`followLatest`), which may be minutes behind the global tip; the tip's age there would read
  // "live · 3s" beside a four-minute-old snapshot (rule 10: the label never overstates).
  const shown = snap?.data ?? latestSnapshot;
  const sub =
    shown ? <Age ts={shown.timestamp} /> : null;

  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
    {sub}
    <button
      type="button"
      aria-pressed={following}
      onClick={() => {
        const target = snap ?? (latestSnapshot ? ({ kind: "snapshot", title: `Global snapshot #${latestSnapshot.ordinal}`, data: latestSnapshot } as const) : null);
        if (target) applyClickActions(followToggleActions(target, following));
      }}
      // One box in every state, so the pill never changes size or place as the state flips: the
      // padding is there when it is invisible (LIVE, transparent) as when the PINNED wash makes it
      // a visible chip (user, 2026-09-26: the pinned block "looks ugly, no padding").
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-[3px] cursor-pointer select-none border border-transparent whitespace-nowrap",
        "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        washed && selectedRow(true),
      )}
      style={washed ? selectionHue(filterAccent(filter)) : undefined}
    >
      {/* The one PIN mark (`PinMark`): the explorer row, the callout and the raw layer say
          pinned with the same glyph — a hollow dot here read as a third state (user, 2026-10-09). */}
      {following ? <LiveDot /> : <PinMark className={washed ? "text-foreground" : "text-muted-foreground"} />}
      <span className={cn("text-label", washed ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </button>
    </span>
  );
}
