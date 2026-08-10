"use client";
// The FOCUS card's SIBLING PAGER (card redesign, 2026-08-08): the materialized box grows a slim
// footer plank — ‹ n / N › on the box's OWN BOTTOM EDGE — plus a horizontal SWIPE on the card
// body, stepping among the subjects at the same rung inside the same committed parent (1-N
// relations: nodes in a cohort, countries under a filter, channel rows in a tick). The set comes
// from the pure, tested
// resolver (railSiblings.ts); every step applies its pickActions through the ONE executor, so a
// pager step and the equivalent explorer click can't drift (selection-boundary rule). This
// component is presentation + gesture ONLY.
//
// The GLOBAL snapshot's set is OPEN (user, 2026-08-09): it always steps, one tick at a time, but
// carries no `n / N` — time is ongoing, and a window into it has no total to state. Same plank,
// same gesture, minus the readout.
//
// Gesture notes: the drag engages only past a 14px mostly-horizontal threshold (clicks and the
// rail's vertical scroll stay untouched); past the ends it hard-stops short (no wrap — the strip
// is honest about the edge); a completed drag swallows the trailing click so the card underneath
// never mis-fires. Keyboard: ←/→ while focus is inside the card. The step itself swaps the
// subject in place — the card's own title roll-in + edge pulse are the arrival signal, so the
// wrapper only snaps its transform back.
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/src/store/store";
import { applyClickActions } from "@/src/store/applyClickActions";
import { siblingSet, type SiblingState } from "@/components/railSiblings";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { latestRelevant } from "@/src/data/follow";
import { getAnchor } from "@/src/data/network";
import { tickInStory } from "@/src/data/ledgerStory";
import { POLL } from "@/src/engine/config";
import { Button } from "@/components/ui/button";
import type { RailCardKind } from "@/components/railCards";

const ENGAGE_PX = 14; // horizontal travel before the drag claims the pointer
const STEP_PX = 48; // release travel that commits a step
const DRAG_LIMIT = 84; // damped travel cap mid-set
const END_LIMIT = 26; // hard-stop cap past either end (the no-wrap resistance)

export default function RailPager({ slot, children }: { slot: RailCardKind; children: ReactNode }) {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  const inspect = useStore((s) => s.inspect);
  const snap = useStore((s) => s.snap);
  const metaSnap = useStore((s) => s.metaSnap);
  const selNodes = useStore((s) => s.selNodes);
  const metaList = useStore((s) => s.metaList);
  const leaderboard = useStore((s) => s.leaderboard);
  const snapshotExact = useStore((s) => s.snapshotExact);
  const following = useStore((s) => s.following);
  // The global chain's window — the SAME buffer and cap the LiveStrip plots, so the plank and the
  // bars step the same sequence in the same direction. Subscribed unconditionally (hooks are), but
  // a tick only re-renders THIS wrapper: `children` keeps its element identity, so the card
  // underneath doesn't re-render with it.
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);

  const set = useMemo(() => {
    // The two live reads railSiblings can't make itself (network singleton + the story rule), done
    // ONLY for the slot that uses them — the tick window is irrelevant to every other card.
    const liveOrd = slot === "snap" ? (latestRelevant("all")?.ordinal ?? null) : null;
    const ticks =
      slot === "snap"
        ? snaps.map((d) => ({
            data: d,
            isLiveTip: d.ordinal === liveOrd,
            inStory: tickInStory(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]),
          }))
        : [];
    const state: SiblingState = {
      mode,
      filter,
      country,
      cohort,
      composition,
      inspect,
      snap,
      metaSnap,
      selNodes,
      metaList,
      countries: leaderboard?.countries ?? [],
      exactRows: metaSnap ? (snapshotExact[metaSnap.globalOrdinal]?.rows ?? null) : null,
      following,
      ticks,
    };
    return siblingSet(slot, state);
  }, [slot, mode, filter, country, cohort, composition, inspect, snap, metaSnap, selNodes, metaList, leaderboard, snapshotExact, following, snaps]);

  // --- swipe state (refs drive the gesture; dx/drag state drive the transform) ---
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const engaged = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const step = (dir: -1 | 1) => {
    const it = set?.items[set.index + dir];
    if (it) applyClickActions(it.actions);
  };

  if (!set) return <>{children}</>;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    engaged.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current;
    if (!st || e.pointerId !== st.id) return;
    const ddx = e.clientX - st.x;
    const ddy = e.clientY - st.y;
    if (!engaged.current) {
      // Mostly-horizontal past the threshold — otherwise leave scroll/click alone.
      if (Math.abs(ddx) < ENGAGE_PX || Math.abs(ddx) < Math.abs(ddy) * 1.2) return;
      engaged.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(st.id);
    }
    const atEnd = (ddx < 0 && set.index >= set.items.length - 1) || (ddx > 0 && set.index <= 0);
    const lim = atEnd ? END_LIMIT : DRAG_LIMIT;
    setDx(Math.max(-lim, Math.min(lim, ddx * 0.55)));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current;
    if (!st || e.pointerId !== st.id) return;
    start.current = null;
    if (engaged.current && e.type === "pointerup") {
      const ddx = e.clientX - st.x;
      if (ddx <= -STEP_PX) step(1);
      else if (ddx >= STEP_PX) step(-1);
    }
    setDragging(false);
    setDx(0);
  };
  // A drag that travelled must not fire the card's click (the collapse toggle spans the head).
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (!engaged.current) return;
    engaged.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    e.preventDefault();
    step(e.key === "ArrowLeft" ? -1 : 1);
  };

  const prev = set.items[set.index - 1];
  const next = set.items[set.index + 1];
  return (
    <div onKeyDown={onKeyDown}>
      <div
        // `relative` + the pb utility make this wrapper the plank's frame: it is the card's own
        // box (a block wrapper around a single block card), so `absolute bottom-0` lands the plank
        // ON the card's bottom edge, INSIDE the glass (user, 2026-08-09 — a plank hugging the box
        // from outside read as a second frame under it). The card must RESERVE that strip, and the
        // pad lives here rather than in RIGHT_CARD because only a paged card needs it:
        // `[&>.ig-panel]:pb-[var(--pager-strip)]` compiles to a (0,2,0) rule in the SAME utilities
        // layer as RIGHT_CARD's `p-[18px]` (0,1,0), so specificity decides and it wins — the
        // equivalent globals.css recipe would have to sit unlayered to beat the utility at all
        // (CSS trap 1). 36 rather than 30 (2026-08-10) to seat the divider below with 6px of air
        // either side.
        // ONE number, TWO consumers: `--foot-bleed` hands the same 36 to `Foot`, whose base plate
        // full-bleeds to the panel's bottom edge. Without it the plate would stop at the default
        // 18 and leave the plank floating on bare glass below its own ground; with it the plank
        // and its hairline (siblings of the panel, so painted after it) ride ON the plate.
        className="relative touch-pan-y select-none transition-transform duration-200 ease-out motion-reduce:transition-none [--pager-strip:36px] [--foot-bleed:var(--pager-strip)] [&>.ig-panel]:pb-[var(--pager-strip)]"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
        {/* The plank's own DIVISION (user, 2026-08-10). The card-density redesign made the foot a
            small muted mono column, which left a CONTROL sitting directly under DATA at the same
            visual weight — the plank read as one more foot row. This is one inset hairline, the
            same device Foot uses and at the same inset as every other resting division (the head
            rule, the Fact separators), NOT a frame around the plank: the chrome-less rule below
            still holds — no fill, no border, no rule OF ITS OWN.
            The inset is ARITHMETIC, not an eyeball (CLAUDE.md): this wrapper is the positioning
            containing block, so an absolute inset measures from the card's BORDER box — 1px
            border + RIGHT_CARD's 18px pad = 19px to reach the same left edge as the Separators
            above. At 18 the hairline overhung them by a pixel on each side, which on a 1px rule
            directly under another 1px rule is the one place that reads. */}
        <div aria-hidden className="pointer-events-none absolute bottom-[30px] inset-x-[19px] h-px bg-border" />
        {/* CHROME-LESS by rule: the redesign's grammar is ONE materialized box, so the plank adds
            no fill or border of its own — it is quiet type on the card's own glass, inset to the
            SAME 19px as the hairline above and the body's own rows (border + content pad, measured
            from this wrapper's border box — see the arithmetic note above). At 18 the chevrons'
            hover wash overhung the content edge by a pixel on each side. The label is the POSITION
            ALONE (`n / N`); the parent's name would repeat the ancestor entry one card up, and it
            stays reachable as the group's title/aria label. `pointer-events-auto` because the plank
            is a sibling of the card, not a descendant, and `#rightcol` is pointer-events:none. */}
        <div
          role="group"
          aria-label={set.open ? `Step through ${set.parentLabel}` : `Siblings in ${set.parentLabel}`}
          title={set.parentLabel}
          className="pointer-events-auto absolute bottom-1 inset-x-[19px] flex h-5 items-center gap-1"
        >
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5"
            disabled={!prev}
            onClick={() => step(-1)}
            aria-label={prev ? `Previous: ${prev.label}` : "Previous"}
            title={prev?.label}
          >
            <ChevronLeft aria-hidden />
          </Button>
          {/* An OPEN set shows NO position (user, 2026-08-09): the global chain is ongoing, so
              `n / N` would state a total the window doesn't have. The spacer keeps the chevrons on
              the card's own content edges, identical to the counted variant. */}
          <div className="min-w-0 flex-1 truncate text-center text-micro uppercase tracking-caps text-muted-foreground tabular-nums">
            {set.open ? "" : `${set.index + 1} / ${set.items.length}`}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5"
            disabled={!next}
            onClick={() => step(1)}
            aria-label={next ? `Next: ${next.label}` : "Next"}
            title={next?.label}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
