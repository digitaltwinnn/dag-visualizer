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
// never mis-fires. It commits on RELEASE TRAVEL or on a FLICK — a fast short throw is the dominant
// phone paging gesture, and without a velocity rule it read as "the swipe didn't work" (the card
// sprang back and nothing happened). Keyboard: ←/→ while focus is inside the card. A committed
// step plays the ACCORDION (user, 2026-08-16, superseding the 2026-08-15 out/blank/in
// follow-through): the outgoing card is snapshotted as a sanitized static clone and the two
// slide together on the shared `--ease-spring` — old out the throw side, new in from the other —
// so the step reads as adjacent cards moving while the lane still holds exactly ONE live card.
// The plank's chevrons and the arrow keys ride the same path, so every step speaks one
// directional language. A cancelled drag snaps back on the same spring. The store commit runs
// before the slide starts, with both cards at rest — the measured 233ms subject-swap stall
// (store write, engine focus/camera, Inspector re-render) lands where nothing is animating.
//
// The drag transform is written STRAIGHT TO THE NODE, not through React state (2026-08-13): a
// `setDx` per pointermove re-rendered this wrapper 60-120×/s mid-drag, and it subscribes to a
// dozen store slices plus the snapshot feed. `children` keeps its element identity either way, so
// the card underneath never re-rendered — the cost was all in the wrapper, and it was the literal
// smoothness the gesture was being judged on.
//
// ⚠️ SHADCN'S CAROUSEL (Embla) WAS CONSIDERED AND DECLINED (user, 2026-08-13 — "the card swipe is
// handcoded and I'd still like to challenge that … it looks much smoother and is designed for
// exactly this type of UI interaction right?"). The primitive is adopted where its model fits —
// `Command`, `ScrollArea`, and `Table` MINUS its scroll container — and this is the same test with
// the opposite answer. Embla's product is a translated track of N RENDERED slides, and this pager
// renders ONE card:
//   - to get its smoothness you must render the neighbours, and a neighbour here is a fully
//     populated rail card for a DIFFERENT subject — its own data reads, its own `titleKey` roll-in
//     and edge pulse, and its own `.ig-panel`, which `RailThread` measures and the slab's `:has()`
//     selects. Three panels in the lane is three thread dots and three slab members for one rung;
//     those markers are contracts, not styling.
//   - the index here is DERIVED from committed store state (`siblingSet`), while Embla owns its own
//     selected snap and emits `select` — two sources of truth to keep in sync in both directions.
//   - the global snapshot's set is OPEN and its window SHIFTS: every new tick drops the oldest, so
//     every slide index moves under a component that thinks in indices.
//   - and what the track would buy — a new card sliding in — is a second arrival signal competing
//     with the title roll-in and edge pulse that already answer the step.
// The actionable half of the challenge was the FEEL, which is the flick and the render fix above.
import {
  useEffect,
  useMemo,
  useRef,
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
const DRAG_LIMIT = 84; // rubber-band asymptote mid-set
const END_LIMIT = 26; // rubber-band asymptote past either end (the no-wrap resistance)
// The travel damping (0.55) is DELIBERATE and stays: there is no neighbour rendered behind the
// card, so a 1:1 follow would promise a reveal that isn't there. The drag is an affordance saying
// "you are pulling something that will change", not a spatial transition.
const DAMP = 0.55;
// Progressive resistance toward an asymptote `d` (the iOS rubber-band curve) — identity-sloped at
// 0 so the drag starts 1:1 with the damped travel, never reaching `d` so there is no hard stop.
const rubber = (x: number, d: number) => Math.sign(x) * d * (1 - 1 / (Math.abs(x) / d + 1));
// The accordion slide's tempo — one spring for both cards (the shared gesture physics).
// 380 → 560 (user, 2026-08-16: "a bit smoother, it feels too rushed") — the spring curve does
// most of its travel early, so the longer clock reads as calm follow-through, not slowness.
// THE COMMITTED SLIDE'S CLOCK (user, 2026-08-30, two rounds: "animates too quickly", then
// "still as quick"). The culprit was never the duration but the curve's HEAD: the spring covered
// ~77% of its travel in the first quarter, and the first replacement ease-out still measured 55%
// by 200ms — a fast start reads as a snap whatever follows it. An S-CURVE is what actually slows
// the eye: slow in, cross mid-window, slow out (~15% covered at quarter time, measured), over a
// slightly longer window. The CANCEL snap-back keeps the spring — a rubber band springing home
// is exactly that gesture, and its different feel is what says "didn't commit".
const SLIDE_MS = 820;
const SLIDE_EASE = "cubic-bezier(0.45, 0.05, 0.25, 1)";
const FLICK_V = 0.35; // px/ms at release — a throw this fast commits regardless of travel. Measured
// live rather than guessed: a deliberate slow pull the user means to cancel runs ~0.11 px/ms, and a
// quick 30px throw ~0.42-0.6, so the gate sits between them (Hammer's own swipe default is 0.3).
const FLICK_MS = 90; // velocity is measured over this trailing window, never off one sample:
// a finger that pauses before lifting reads ~0 (correctly — a pause then lift is not a flick),
// but a genuine throw's last sample can land 2ms before pointerup and read as noise either way.

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

  // --- swipe state: ALL refs. Nothing here re-renders — the transform is written to the node. ---
  const wrap = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const engaged = useRef(false);
  /** Trailing pointer samples inside FLICK_MS, oldest first — the release velocity's baseline. */
  const trail = useRef<{ x: number; t: number }[]>([]);

  /** Write the drag offset straight to the node. `animate: false` suppresses the class's own
   *  transition so the card tracks the finger; `true` restores it for the snap back. At rest the
   *  inline transform is REMOVED rather than zeroed — an identity transform would still make this
   *  wrapper a containing block for any fixed descendant (CSS trap 2), and `none` interpolates, so
   *  the snap back still animates. */
  const setTx = (x: number, animate: boolean) => {
    const el = wrap.current;
    if (!el) return;
    el.style.transition = animate ? "" : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
  };

  const step = (dir: -1 | 1) => {
    const it = set?.items[set.index + dir];
    if (it) applyClickActions(it.actions);
  };

  // THE ACCORDION (user, 2026-08-16 — "draw the new card already next to the old and move it";
  // supersedes the out/blank/in follow-through of 2026-08-15). The lane still holds exactly ONE
  // live card (the Embla decline stands): the outgoing card is snapshotted as a STATIC DOM
  // clone — sanitized of `.ig-panel`/`.rail-entry`/ids so the RailThread's measurement and the
  // slab's `:has()` selectors can't see it — the store commits immediately (the subject-swap
  // work lands while both cards are still at rest), and then clone and real card slide together
  // on the shared spring: old out the throw side, new in from the other. `pending` holds the
  // visual cleanup; a new pointerdown finishes it instantly (the commit has already run, so a
  // swipe can never silently not-commit).
  const pending = useRef<{ t: ReturnType<typeof setTimeout>; fin: () => void } | null>(null);
  useEffect(() => () => { if (pending.current) { clearTimeout(pending.current.t); pending.current.fin(); } }, []);
  const settlePending = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.t);
    p.fin();
  };
  const commitStep = (dir: -1 | 1) => {
    if (!set?.items[set.index + dir]) return;
    const el = wrap.current;
    const parent = el?.parentElement;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || !parent || reduced) {
      // Reduced motion: the swap is instant — the title roll-in's own guard handles the rest.
      step(dir);
      setTx(0, false);
      return;
    }
    settlePending();
    const w = el.offsetWidth;
    const dragged = el.style.transform; // carry the finger's displacement into the slide
    const clone = el.cloneNode(true) as HTMLElement;
    for (const n of clone.querySelectorAll("[id]")) n.removeAttribute("id");
    for (const n of clone.querySelectorAll(".ig-panel, .rail-entry")) n.classList.remove("ig-panel", "rail-entry");
    clone.classList.remove("ig-panel", "rail-entry");
    clone.setAttribute("aria-hidden", "true");
    clone.style.cssText = `position:absolute;left:0;top:0;width:${w}px;margin:0;pointer-events:none;transition:none;`;
    clone.style.transform = dragged;
    const prevPos = parent.style.position;
    const prevOverflow = parent.style.overflow;
    parent.style.position = "relative";
    parent.style.overflow = "hidden"; // clip the adjacent slide to the lane
    parent.appendChild(clone);
    step(dir); // the heavy subject swap runs NOW, with both cards visible and at rest
    el.style.transition = "none";
    el.style.transform = `translateX(${dir * w}px)`; // the new card waits just offstage
    void el.offsetWidth; // flush, so both start their slide together
    el.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}`;
    el.style.transform = "";
    clone.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity ${SLIDE_MS}ms ease-out`;
    clone.style.transform = `translateX(${-dir * w}px)`;
    clone.style.opacity = "0.5"; // a light fade as it leaves — motion carries the story
    const fin = () => {
      clone.remove();
      parent.style.position = prevPos;
      parent.style.overflow = prevOverflow;
      el.style.transition = "none";
      el.style.transform = "";
    };
    pending.current = { fin, t: setTimeout(() => { pending.current = null; fin(); }, SLIDE_MS + 40) };
  };

  if (!set) return <>{children}</>;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    settlePending();
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    engaged.current = false;
    trail.current = [{ x: e.clientX, t: e.timeStamp }];
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
      e.currentTarget.setPointerCapture(st.id);
    }
    const t = e.timeStamp;
    trail.current.push({ x: e.clientX, t });
    while (trail.current.length > 1 && t - trail.current[0].t > FLICK_MS) trail.current.shift();
    const atEnd = (ddx < 0 && set.index >= set.items.length - 1) || (ddx > 0 && set.index <= 0);
    // Progressive rubber-band toward the limit (was a hard clamp): resistance grows with travel
    // and the limit is an asymptote, so the pull never hits a wall — the END limit is short and
    // firm (the no-wrap answer), the mid-set one longer and softer.
    setTx(rubber(ddx * DAMP, atEnd ? END_LIMIT : DRAG_LIMIT), false);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current;
    if (!st || e.pointerId !== st.id) return;
    start.current = null;
    if (engaged.current && e.type === "pointerup") {
      const ddx = e.clientX - st.x;
      const base = trail.current[0];
      const dt = base ? e.timeStamp - base.t : 0;
      const v = base && dt >= 12 ? (e.clientX - base.x) / dt : 0;
      // A flick commits at any travel past the engage threshold, but only in the direction the
      // drag actually went — a fast throw BACK at the end of a long pull is a cancel, not a step,
      // and the travel rule below still answers it.
      const flick =
        Math.abs(v) >= FLICK_V && Math.abs(ddx) >= ENGAGE_PX && Math.sign(v) === Math.sign(ddx);
      if (Math.abs(ddx) >= STEP_PX || flick) {
        commitStep(ddx < 0 ? 1 : -1);
        trail.current.length = 0;
        return; // commitStep owns the motion from here — no snap-back on top of the follow-through
      }
    }
    trail.current.length = 0;
    setTx(0, true);
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
    commitStep(e.key === "ArrowLeft" ? -1 : 1);
  };

  const prev = set.items[set.index - 1];
  const next = set.items[set.index + 1];
  return (
    <div onKeyDown={onKeyDown}>
      <div
        ref={wrap}
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
        className="relative touch-pan-y select-none transition-transform duration-[380ms] ease-[var(--ease-spring)] motion-reduce:transition-none [--pager-strip:36px] [--foot-bleed:var(--pager-strip)] [&>.ig-panel]:pb-[var(--pager-strip)]"
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
            onClick={() => commitStep(-1)}
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
            onClick={() => commitStep(1)}
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
