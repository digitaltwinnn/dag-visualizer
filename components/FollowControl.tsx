"use client";

import LiveDot from "@/components/LiveDot";
import { selectedRow, selectionHue } from "@/components/selection";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { useNowTick } from "@/components/useNowTick";
import { filterAccent } from "@/src/data/network";
import { followToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { relativeAge } from "@/src/util/relativeAge";
import { cn } from "@/lib/utils";

// THE LIVE / PINNED SWITCH — one component (user, 2026-09-29: "if a snapshot is pinned, it shows in
// the explorer but not in the snapshot card; … it should show pinned in both"). The Snapshots
// explorer's head and the global snapshot card's aside were two builds of the same control: the
// explorer's said "pinned" on the selection wash, the card's a bare "◷ 12s", so a pin read as
// pinned on the left and as merely old on the right. Both render this now.
//
// Three states, one box that never changes size: LIVE (the beating dot, the live tip's ticking
// age), PINNED (a hollow dot on the selection wash in the filter's hue, the pinned snapshot's age),
// and OFF (following off with nothing pinned — no age, since one would read as live). `preview`
// is the explorer's extra: hovering any other snapshot shows the PINNED state it would enter,
// dashed, naming the ordinal. The write goes through `followToggleActions` + the one executor.

/** `· 5s ago`, ticking — its own component so the clock re-renders this span alone. */
function Age({ ts }: { ts: string }) {
  const now = useNowTick(1000);
  const age = relativeAge(now - Date.parse(ts));
  return age ? <>· {age}</> : null;
}

export default function FollowControl({ preview = false, className }: { preview?: boolean; className?: string }) {
  const live = useStore((s) => s.live);
  const following = useStore((s) => s.following);
  const snap = useStore((s) => s.snap);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const filter = useStore((s) => s.filter);

  if (!live)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap", className)}>
        <NoSignalDot /> no signal
      </span>
    );

  const liveOrd = latestSnapshot?.ordinal ?? null;
  const previewOrd = preview && hoverSnapOrd != null && hoverSnapOrd !== liveOrd ? hoverSnapOrd : null;
  const pinned = !following && snap != null;
  const washed = pinned && previewOrd == null;
  const label = previewOrd != null || pinned ? "pinned" : "live";
  const shown = pinned ? snap!.data : latestSnapshot;
  const sub =
    previewOrd != null ? previewOrd.toLocaleString() : !following && !pinned ? "· off" : shown ? <Age ts={shown.timestamp} /> : null;

  return (
    <button
      type="button"
      aria-pressed={following}
      title={following ? "Following the live snapshot — click to pin the one on screen" : "Follow the live snapshot"}
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
        previewOrd != null && "border-dashed border-border",
        className,
      )}
      style={washed ? selectionHue(filterAccent(filter)) : undefined}
    >
      {following && previewOrd == null ? (
        <LiveDot />
      ) : (
        <span className={cn("flex-none w-2 h-2 rounded-full border", washed ? "border-primary/80" : "border-muted-foreground/70")} />
      )}
      <span className={cn("text-label", washed ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      {sub && <span className="tabular-nums text-label text-muted-foreground">{sub}</span>}
    </button>
  );
}
