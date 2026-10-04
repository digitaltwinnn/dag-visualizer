"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { ListTree, ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { EXPLORE_ICON } from "@/components/icons";
import { useStore } from "@/src/store/store";
import { useSceneYield } from "@/components/RailShade";

// One entry in a dock's icon TRAY (user redesign 2026-07-05 — supersedes the old hint dot + the
// dot↔glyph morph, on the edge tabs AND the phone dock halves): the tray is a quiet LEGEND of the
// cards the sheet currently hosts — one `VIEW_ICONS`/`ABOUT_ICON` mark per hosted card, muted at
// rest. `active` marks a card that updated while the sheet was closed (unseen): its icon goes
// bold/vivid in the card's identity `hue` — colour alone, no beat (2026-09-28) — until the
// sheet opens (the caller clears the actives on open; the icons themselves stay — they are the
// legend, not the alert).
export type TabSignal = { id: string; icon: LucideIcon; hue?: string; active?: boolean };

// Shared one-shot pulse plumbing (switch signal + update signal ride the same mechanics):
// `useEdgePulse` debounces key changes (~1.2s — so e.g. the ledger's live snapshot follow pulses
// at most once per sweep), and the LIVE window bounds the carrier's MOUNT to the pulse window:
// PulseEdge replays its CSS animation on every mount (its keyed-remount contract), so without the
// window a sheet opened long after a pulse would replay the stale sweep on open.
// Exported so `PhoneDockSweep` (the shared full-width phone switch-sweep, page.tsx) can drive the
// SAME debounce/window semantics as the per-card carriers here, without re-deriving them.
export function usePulseWindow(key: unknown): { pulse: number; live: boolean } {
  const pulse = useEdgePulse(key);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pulse === 0) return;
    setLive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(false), 1300);
  }, [pulse]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { pulse, live };
}

// Tablet/phone edge dock for a rail's content: a slim fixed edge tab (`‹`/`›`) that opens the
// SAME content the desktop inline rail shows, inside a Sheet overlay (full-width scene stays
// behind it). Desktop never renders this — `ExploreRail`/`Inspector` branch on `useBreakpoint()`
// and keep the inline `#leftcol`/`#rightcol` path unchanged there.
//
// The Sheet primitive has no built-in close affordance, so this adds a dedicated **header row**
// (`.sheet-head`) at the top of the SheetContent: the panel label on the left (which doubles as
// the accessible `SheetTitle`) and the ✕ close (`.sheet-close`, ≥44px) on the right, ABOVE the
// hosted `children`. A floating corner ✕ would collide with the hosted cards' own top-right
// controls (CardPane's `.rc-close`, ContextCard's close, the left tool cards' `.panel-collapse`),
// so the close lives in the sheet's own chrome instead. Scrim-click + Escape still dismiss too.
//
// `signals`: the dock's icon TRAY (see `TabSignal` above) — a quiet legend of the hosted cards
// (muted icons at rest, on the edge tab as a vertical stack under the chevron, on the phone dock
// half as a horizontal row after the label), with `active` entries vivid/identity-hued and
// still (the beat they breathed on went 2026-09-28 — colour is the whole cue). PURELY visual: never opens the
// sheet itself (Global Constraint — no auto-open on a pick; the user always taps the trigger).
// Presentation-only data (icon component + a CSS colour + the active flag), so RailDock stays
// generic — each caller owns its card→icon/hue mapping and its seen-tracking (clearing actives
// when `onOpenChange` reports the open).
//
// `updateKey`: bumps once per update EVENT (whatever flagged a tray entry active) — the dock's
// outline edge replays the card-style travelling `.edge-pulse` once per bump (debounced by the
// shared `useEdgePulse`, so live snapshot ticks pulse at most once per sweep while the Layers
// icon just stays lit). Runs on the collapsed tab's scene-facing edge (tablet) and along the
// phone dock half's top edge; while the sheet is open the hosted card's own edge pulse already
// plays, so this stays a closed-state affordance.
//
// `sheetSide`: the Sheet's slide-in edge, when it should differ from the tab's screen-edge
// position (`side`) — e.g. the phone Detail dock keeps its tab on the right edge but slides the
// sheet up from the bottom. Defaults to `side`.
//
// `trigger`: the tap affordance that opens the sheet. Defaults to `"edge-tab"` (the slim `‹`/`›`
// tab on tablet). `"bottom-bar-half"` (phone only — see ExploreRail/Inspector) renders HALF of a
// single PERSISTENT full-width bar docked at the very bottom of the viewport instead: this dock's
// icon + label, occupying the left or right 50% (`.phone-dock-half--{side}`). The two halves come
// from the two separate RailDock instances (ExploreRail's Explore + Inspector's Details) but are
// styled to align pixel-perfect into one seamless strip. Same signal icons + update pulse, so
// this stays the ONE place that owns that signalling logic rather than forking it per breakpoint.
//
// The persistent bar NEVER unmounts (unlike the edge tab, which the old floating-button design
// hid while open) — tapping the ACTIVE half again collapses its own sheet (toggle), tapping the
// OTHER half switches to it. So the bar reads as the sheet's own docked header/handle: the sheet's
// content area is anchored `bottom: var(--phone-dock-h)` (i.e. directly ABOVE the bar, never
// covering it) and slides up from there, while the bar itself never moves — it just visually
// "grows" a sheet above itself. No separate `.sheet-head` row in this mode (the bar already shows
// the label); only a slim grabber up top of the sheet content remains.
//
// `open`: optional CONTROLLED mode. When provided, RailDock's
// internal `open` state is bypassed entirely — the caller (via a store field) decides when this
// dock is open, which is how the phone bar's "opening one closes the other" behaviour comes for
// free (both docks derive `open` from the same `store.phoneDock`). `onOpenChange` is still called
// on every user-driven change (tap-open, tap-active-to-collapse, Escape) either way; in controlled
// mode the caller is responsible for feeding that back into the store field. Uncontrolled
// (tablet's two independent edge docks) keeps owning its own `open` exactly as before.

/** How much of the phone's viewport the BOTTOM SECTION may take — the dock bar and the sheet
 *  above it, together (user, 2026-10-04: "don't make the bottom section any larger than let's
 *  say 60% of the view so that there is always room for the scene to show"). */
const SECTION_MAX = 0.6;
/** The tallest the phone sheet may stand: the section's share of the viewport, less the dock bar
 *  the sheet sits on. The bar's height is read back from the sheet's own `bottom` (it is anchored
 *  at `--phone-dock-h`, which carries the safe-area inset and so has no number to restate here);
 *  the fallback is that token's base, for the one frame before the sheet is in the document. */
function sectionCeilingPx(sheet: HTMLElement | null): number {
  const dock = (sheet ? parseFloat(getComputedStyle(sheet).bottom) : NaN) || 56;
  return Math.round(window.innerHeight * SECTION_MAX) - dock;
}

export default function RailDock({
  side,
  label,
  style,
  children,
  signals,
  updateKey,
  barGeom,
  barIcon,
  trayCompact,
  onOpenChange,
  sheetSide,
  trigger = "edge-tab",
  open: openProp,
  sheetPx,
  onSheetPx,
  seedPx,
  exchange,
  signalKey,
  onCoverPx,
}: {
  side: "left" | "right";
  label: string;
  style?: CSSProperties;
  children: ReactNode;
  signals?: TabSignal[];
  updateKey?: unknown;
  onOpenChange?: (open: boolean) => void;
  sheetSide?: "left" | "right" | "bottom";
  trigger?: "edge-tab" | "bottom-bar-half";
  /** Bar-half positioning override (width + x classes). The default is the two-half layout keyed
   *  on `side`; the three-section dock (Explore | Vitals | Details, 2026-09-03) passes thirds —
   *  geometry is the CALLERS' one shared decision, so RailDock never tracks how many sections
   *  the bar currently holds. */
  barGeom?: string;
  /** The bar half's own leading mark — defaults to the side-keyed Explore/Details pair. */
  barIcon?: ReactNode;
  /** Thirds-width bar halves: the icon legend cannot fit (measured 166px in a 130px section),
   *  but the `active` cue it carried should not vanish with it — compact renders ONE small dot
   *  (the first active's hue) while any hosted card holds an unseen update, and nothing at
   *  rest. Fixed width by construction, so the overflow the full tray caused cannot return. */
  trayCompact?: boolean;
  open?: boolean;
  // Bottom-sheet drag (phone): the caller-held height override in px + its setter — the
  // finger's height WHILE A DRAG IS LIVE, null otherwise (the sheet then stands at its content's
  // fit; a release clears it — 2026-10-04). Store-backed (`store.phoneSheetPx`) because the
  // History tether re-measures against it. RailDock
  // stays store-free — it just reads/writes through these props.
  sheetPx?: number | null;
  onSheetPx?: (px: number | null) => void;
  // AN EXCHANGE (phone, 2026-09-28 — user: "when I switch from explore to vitals it fully
  // collapses and then expands again; take the new section's height into account"): the two
  // props that turn two sheets' entry-and-exit into ONE height motion. `seedPx` is the height
  // the entry STARTS from — the caller passes the other docks' published covers, so a sheet
  // opening while another was up begins at that sheet's height and eases to its own fit instead
  // of growing from the dock. `exchange` says another dock is taking over, so the closing sheet
  // unmounts at once rather than playing its 420ms shrink underneath the arriving one.
  seedPx?: number | null;
  exchange?: boolean;
  // TABLET switch-signal carrier: RailThread (the desktop view/filter-switch pulse's home) is
  // desktop-only, so below 1100px the switch had no visible carrier. The caller passes the SAME
  // subject key RailThread uses (`${mode}|${filter}`) and RailDock plays the SAME travelling
  // `.edge-pulse` recipe (shared `useEdgePulse` — one pulse per change, debounced, mount-skipped,
  // reduced-motion → CSS static blink) on the tablet edge-tab's spine-equivalent: the open sheet's
  // `.ig-sheet-edge` identity spine, or — while the sheet is closed — the edge tab's scene-facing
  // edge. PHONE (bar-half mode) no longer reads this: the two dock halves used to each replay
  // their own half-width sweep from their screen edge toward the shared seam, which read as two
  // sweeps meeting in the middle rather than one — that carrier moved to `PhoneDockSweep`
  // (page.tsx), a single full-width overlay spanning both halves, so the switch reads as ONE
  // continuous left-edge→right-edge sweep. `updateKey`'s per-half carrier (below) is unaffected —
  // a card update is genuinely local to its own half.
  signalKey?: unknown;
  // How many px of the CANVAS this dock's sheet covers while open — 0 when closed, and 0 for a
  // BOTTOM sheet, which takes height rather than width. Below 1100px the sheet OVERLAYS the
  // full-viewport canvas instead of sitting beside it, so anything the Engine places against the
  // canvas rect needs to know what it can't actually see (`store.sceneCover*`, consumed today by
  // the subject callout). Reported through a prop for the same reason `sheetPx` is: RailDock stays
  // store-free, and the CALLER decides which side of the store this lands on.
  onCoverPx?: (px: number) => void;
}) {
  const [openState, setOpen] = useState(false);
  const open = openProp ?? openState;
  // Sheets portal to document.body, so they DON'T ride the SectionShell scene layer — while the
  // raw data layer is up they'd float over the table. Gate them off in that pose (the phone bar
  // rides the scene layer and fades with it); the internal open state is kept, so returning to
  // the scene restores what was open. The tablet edge TAB fades with the HUD — no gate needed.
  const section = useStore((s) => s.section);
  const shellVisible = section === "scene";
  const isBarHalf = trigger === "bottom-bar-half"; // = the PHONE branch (ExploreRail/Inspector)
  // PHONE ONLY takes the commit-flight half of the yield (`flight`). The tablet edge-tab sheet is
  // dismissed by the same tab that opened it and the scene keeps full width behind it, so that
  // tier has its own step-aside exactly as desktop has SCENE mode; the phone sheet is 60vh of a
  // small viewport over a persistent dock bar. Both tiers still dim under the user's own hand.
  const yielding = useSceneYield({ flight: isBarHalf });
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  // LIVE CONTENT FIT (user, 2026-09-03: "determine and grow the size of the section based on
  // its contents" — superseding 2026-08-16's one-shot open fit, whose no-resizing-while-up rule
  // assumed content only changes when data does; with the phone explorers opening collapsed,
  // content now changes exactly when the USER expands a card, and a sheet that holds 60vh of
  // glass over a two-head chooser — or clips the card just opened — answers their gesture with
  // nothing). The fit is LOCAL state, never the store: `sheetPx` (the store) now means the
  // DRAG-chosen height alone, and a drag wins over the fit until the sheet fully closes
  // (`phoneSheetPx` resets there, so every open re-fits). Height changes ride the sheet's own
  // 380ms spring transition below, so growth eases; the FIRST measure lands in a layout effect
  // before paint, so opening never plays a 60vh→fit settle. ONE CEILING, `sectionCeilingPx`
  // (user, 2026-10-04: "don't make the bottom section any larger than let's say 60% of the
  // view so that there is always room for the scene to show … the bottom section is scrollable
  // so that should be fine"). It retires the 2026-09-28 ceiling at the expanded snap (~80% of
  // the viewport, so a card fit whole): a card taller than the ceiling scrolls inside the
  // sheet, and the scene above always keeps its share.
  // ⚠️ A CALLBACK REF AS STATE, not a ref — the same portal trap the canvas-cover publisher
  // below records: the sheet's content mounts a commit LATER than the `open` that reveals it,
  // so an effect keyed on `open` alone runs against null and fits nothing (measured: the sheet
  // held its 60vh default over a two-head chooser). The node arriving AS state re-runs the
  // effect in the content's own mount commit — still before that commit paints.
  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const [fitPx, setFitPx] = useState<number | null>(null);
  // THE ENTRY IS A GROW, NOT A SLIDE (user, 2026-09-03, three rounds: the translateY slide read
  // as coming from the screen bottom through the dock's translucent glass; the rise-and-fade
  // that replaced it read as appearing at the TOP, because the whole box materialized at its
  // final height and the top edge is what the eye catches). What "appears from the dock" means
  // mechanically: the bottom edge stays pinned at the dock's top and the HEIGHT grows 0 → fit,
  // riding the sheet's own height transition. 'grow' holds a slower 550ms clock (the navigation
  // tempo) so the entry never borrows the 380ms drag-snap physics; a drag started mid-entry
  // wins instantly (`dragging` forces transition-none below).
  //
  // ⚠️ 'pre' IS ARMED ON THE OPEN FLIP, NOT IN THE CONTENT'S COMMIT. The content mounts a commit
  // LATER than the `open` that reveals it (the portal trap, again), so a zero set from the
  // content's own effect arrives after the CSS default has painted — measured, the sheet painted
  // at 506px and the "grow" ran backwards. Armed on the flip, the zero is already in the style
  // prop of the content's FIRST render; the fit effect then paints one zero frame (double-rAF)
  // before releasing 'grow', so the transition has a real starting edge. (A direct DOM write in
  // the ref callback was tried between the two: an inline arrow ref refires every render and
  // clobbers React's own style writes — state is the only clean owner of this height.)
  const [entry, setEntry] = useState<null | "pre" | "grow">(null);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  // ⚠️ THE SEED IS CAPTURED ON THE OPEN FLIP, in this layout effect's own closure. The closing
  // dock publishes its cover as 0 in the SAME commit's passive effects, so by the time this
  // sheet's content renders the store already reads 0 and a seed taken then starts the entry
  // from the dock (measured: 427 → 25 → 257). The render that flips `open` still saw the other
  // dock's height, and that is the value the entry starts from.
  const seedRef = useRef(0);
  useLayoutEffect(() => {
    if (isBarHalf && open) {
      seedRef.current = seedPx ?? 0;
      setEntry("pre");
    }
    // `seedPx` is read on the flip only, on purpose (the note above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isBarHalf]);
  // The content-follow flag (see `apply` in the fit effect below).
  const [tracking, setTracking] = useState(false);
  const trackT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef(0);
  useEffect(() => () => { if (trackT.current) clearTimeout(trackT.current); }, []);
  // THE EXIT MIRRORS THE ENTRY (user, 2026-09-03: "appears nicely but disappears immediately"):
  // the sheet shrinks back into the dock, then unmounts. It has to be a LAGGED unmount rather
  // than a close-side animation, because a close can arrive from outside this component's own
  // handler — the other dock section opening (the store's mutual exclusion), the tap-outside
  // recognizer, Escape — and Radix unmounts a controlled sheet the moment `open` is false.
  // While `exiting`, the sheet stays mounted at height 0 (the same transition the grow rides,
  // downhill) and the real unmount follows on the transition's own clock. A reopen mid-exit
  // cancels the timer and grows from wherever the shrink had reached. Section-to-section
  // switches read as an exchange: the old sheet sinks into the dock as the new one rises.
  // ⚠️ `exiting` is derived DURING RENDER (the getDerivedStateFromProps pattern), not in an
  // effect: an effect runs a commit after the close, and by then Radix has already unmounted
  // the content — measured, the "shrink" was a fresh remount sitting at zero. Flipped in the
  // same render, the Sheet's `open || exiting` never goes false until the shrink has run.
  const [exiting, setExiting] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    // An EXCHANGE skips the shrink: the arriving sheet starts at this one's height (`seedPx`
    // on its side), so the exit would only ever play hidden behind it.
    if (isBarHalf && !open && !exchange) setExiting(true);
    if (open) setExiting(false);
  }
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => setExiting(false), 420);
    return () => clearTimeout(t);
  }, [exiting]);
  useLayoutEffect(() => {
    if (!isBarHalf || !open || !fitEl) {
      setFitPx(null);
      return;
    }
    // Measured, not guessed (2026-09-03): the bar-half sheet has NO header row — its chrome is
    // the grabber band + paddings, 45px live (the old 96 was the labelled/×'d tablet sheet's
    // number, and its excess showed up as a band of dead glass under the last card).
    const CHROME = 46;
    const apply = () => {
      const cap = sectionCeilingPx(fitEl.closest<HTMLElement>('[data-slot="sheet-content"]'));
      setFitPx(Math.min(cap, Math.max(170, fitEl.offsetHeight + CHROME)));
      // CONTENT THAT IS ITSELF ANIMATING IS FOLLOWED, NOT EASED (user, 2026-09-28: the card's
      // collapse "doesn't animate properly"). A card collapsing runs HeightEase's 650ms, and the
      // observer fires every frame of it; each tick re-targeted the sheet's own 380ms transition,
      // so the glass lagged and stuttered behind the card. Two ticks inside one short window mean
      // the content is moving on a clock of its own, and the sheet then tracks it frame by frame
      // with its transition suspended (`tracking` → `!transition-none`, the drag's own device),
      // releasing a beat after the ticks stop. A one-shot change (a drill swapping the list) is a
      // single tick and keeps the eased transition. Ticks during the entry never count — the
      // observer's own first notification would otherwise cancel the grow.
      const now = performance.now();
      if (entryRef.current === null && now - lastTick.current < 120) {
        setTracking(true);
        if (trackT.current) clearTimeout(trackT.current);
        trackT.current = setTimeout(() => setTracking(false), 160);
      }
      lastTick.current = now;
    };
    apply();
    // Release the grow only after a zero frame has PAINTED (double-rAF) — releasing in this same
    // commit would flush zero and target into one paint window and the transition would never
    // run. The slower clock holds through the entry, then hands back to the snap tempo.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setEntry("grow")); });
    const settle = setTimeout(() => setEntry(null), 750);
    const ro = new ResizeObserver(apply);
    ro.observe(fitEl);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(settle);
      setEntry(null);
    };
  }, [open, isBarHalf, fitEl]);
  // Drag beats fit; fit beats the CSS default; the exit's zero beats both, and the entry starts
  // from the seed (another dock's height on an exchange, else the dock's own zero).
  const heightPx = isBarHalf ? (exiting ? 0 : entry === "pre" ? seedRef.current : sheetPx ?? fitPx) : null;
  const handleOpenChangeRef = useRef(handleOpenChange);
  handleOpenChangeRef.current = handleOpenChange;

  // ── Canvas cover (tablet) ──────────────────────────────────────────────────────────────────
  // Publish the WIDTH this sheet takes off the canvas while it's up. Measured rather than assumed:
  // the sheet's width is a CSS decision (`SHEET_SIDE` + the caller's `style`), so reading it back
  // keeps this from becoming a second home for that number. Only the width is needed, so the
  // slide-in transform is irrelevant — a translateX doesn't change `offsetWidth`, and there's no
  // wait-for-the-animation timing to get wrong. A bottom sheet reports 0: it takes height, and the
  // callout declines on phone outright anyway.
  // ⚠️ The sheet mounts in a LATER commit than the one that opens it — radix portals its
  // content and `Presence` gates it on its own state, so an effect keyed on `open` alone runs
  // with a null ref and publishes 0 forever (measured: both sheets up, `offsetWidth` 300/320,
  // store still 0). The node therefore arrives through a callback ref as STATE, which re-runs
  // this effect when it lands, and a ResizeObserver carries every later width change — including
  // a tier switch, which a window-resize listener would also have caught, and a token change,
  // which it would not.
  const [sheetEl, setSheetEl] = useState<HTMLDivElement | null>(null);
  const onCoverRef = useRef(onCoverPx);
  onCoverRef.current = onCoverPx;
  const isBottom = (sheetSide ?? side) === "bottom";
  const covering = open && shellVisible && !isBottom;
  useEffect(() => {
    if (isBottom) return; // the bottom arm publishes its HEIGHT below, from state
    // The SIDE arm's publisher, captured for its own release — the bottom arm's note has why: one
    // RailDock survives the tier step with swapped props, so at cleanup the ref may already hold
    // the other arm's callback and a zero sent through it lands on the wrong cover.
    const cover = onCoverRef.current;
    if (!covering || !sheetEl) {
      cover?.(0);
      return;
    }
    const publish = () => cover?.(Math.round(sheetEl.offsetWidth));
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(sheetEl);
    return () => {
      ro.disconnect();
      cover?.(0);
    };
  }, [covering, sheetEl, isBottom]);
  // ── Canvas cover (phone) — the HEIGHT this bottom sheet takes (2026-09-28) ───────────────
  // Published from STATE, not measured: `heightPx` is the sheet's target (0 while the grow is
  // armed and while it exits, the fit or the drag otherwise), and the Engine eases the scene's
  // shift toward it on its own clock — publishing every ResizeObserver tick of the 550ms grow
  // would have the projection chase the glass. Same callback as the side arm's width: the dock
  // reports the dimension it takes, the caller says which cover it is.
  useEffect(() => {
    if (!isBottom) return;
    onCoverRef.current?.(open && shellVisible ? (heightPx ?? 0) : 0);
  }, [isBottom, open, shellVisible, heightPx]);
  // The release must reach the BOTTOM cover's own publisher. ⚠️ Not `onCoverRef.current` at cleanup
  // time (found 2026-09-28, user: "works for vitals, but not for explorer"): ExploreRail and
  // Inspector keep ONE RailDock across the phone→tablet step and only swap its props, so when
  // `isBottom` flips false the ref already holds the TABLET side-sheet callback — the zero went to
  // the left/right cover and the phone's bottom cover stayed up, holding the scene shifted on a
  // desktop with no sheet. The Vitals dock unmounts off phone, which is why it never showed.
  // Captured when the bottom arm starts, released through the same function.
  useEffect(() => {
    if (!isBottom) return;
    const publish = onCoverRef.current;
    return () => publish?.(0);
  }, [isBottom]);

  // ── Tap-outside dismiss (phone bar-half only, user 2026-08-15) ─────────────────────────────
  // A TAP on the scene collapses the open bottom sheet, the same dismissal the bar-half toggle
  // performs (selection untouched — dismissing only collapses). Phone only: on tablet both edge
  // docks can be open over an interactive scene and a pick UPDATES Details, so outside-tap
  // dismissal would fight that (the `onInteractOutside` preventDefault below keeps standing for
  // both tiers — radix knows no tap-from-drag). Three decisions carry this:
  // - Tap ≠ drag. Orbiting behind the open sheet is a supported phone flow (the sheet dims via
  //   `useSceneYield` exactly for it), so only a stationary down→up pair dismisses — same
  //   discipline as the Engine's own drag suppression and `tapZoom`.
  // - The tap is CONSUMED: it closes the sheet and does nothing else. The Engine picks on
  //   `click` (canvas listener), so eating the click at window capture phase stops a tap on a
  //   hub/tile from toggling selection while the sheet closes — one gesture, one answer.
  //   OrbitControls rides pointer events, which pass through untouched, so no stuck drag state.
  // - Only CANVAS taps qualify. The top bar, the dock bar and the sheet itself keep their own
  //   behaviour — the user said "on the scene", and eating chrome taps would break navigation.
  useEffect(() => {
    if (!isBarHalf || !open || !shellVisible) return;
    let down: { x: number; y: number; t: number; id: number } | null = null;
    let eat = 0;
    const onDown = (e: PointerEvent) => {
      if (down) {
        // A second pointer is a pinch, not a tap — the pair is invalidated.
        down = null;
        return;
      }
      down = e.target instanceof HTMLCanvasElement ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) {
        down = null;
        return;
      }
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 500;
      down = null;
      if (!tap) return;
      // Windowed, not a bare flag: if the browser never delivers the click, a stale eat must
      // not swallow the NEXT real one (the Engine's own eat-flag learned the same lesson).
      eat = performance.now() + 400;
      handleOpenChangeRef.current(false);
    };
    const onClick = (e: MouseEvent) => {
      if (performance.now() > eat) return;
      eat = 0;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [isBarHalf, open, shellVisible]);

  // ── Bottom-sheet drag (phone, grabber-initiated) ────────────────────────────────────────────
  // Standard mobile sheet gesture, v1 GRABBER-ONLY by design: the sheet body owns touch scroll,
  // so only the grabber (a dedicated ≥44px handle with `touch-action:none`) initiates a drag —
  // no drag/scroll arbitration needed. Pointer events, no dependency: capture on the grabber,
  // the sheet follows the finger live (height written through `onSheetPx`, transition suspended
  // while dragging), and a release either DISMISSES or lets go: there is one resting height, the
  // content's fit under `sectionCeilingPx`, so a release that does not dismiss clears the
  // override and the sheet springs back to it (2026-10-04 — the expanded ~80vh detent went with
  // the 60% ceiling, and the default detent with it: a second resting height had nothing left
  // to be). A fast downward flick (velocity over the last ~120ms) dismisses regardless of
  // position. A plain tap (no real movement) keeps today's tap-to-collapse. Reduced motion: the snap is instant (the transition class is
  // motion-reduce-suppressed); the drag itself is direct manipulation and stays.
  const [dragging, setDragging] = useState(false);
  // THE SPRING IS THE DRAG RELEASE'S ALONE (user, 2026-09-28: "the transition is just too
  // aggressive" — content re-fits and the entry grow rode the same overshooting curve, so a
  // drill into a longer list landed 30px past its height and settled back). A finger letting go
  // wants the detent physics; content arriving does not. `snapping` is true for one snap's
  // clock after a release, and only then does the height ride `--ease-spring`.
  const [snapping, setSnapping] = useState(false);
  const snapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armSnap = () => {
    setSnapping(true);
    if (snapT.current) clearTimeout(snapT.current);
    snapT.current = setTimeout(() => setSnapping(false), 400);
  };
  useEffect(() => () => { if (snapT.current) clearTimeout(snapT.current); }, []);
  const drag = useRef<{ startY: number; startH: number; moved: boolean; samples: { t: number; y: number }[]; el: HTMLElement } | null>(null);
  const MIN_PX = 90;
  // Rubber-band past the drag range (user, 2026-08-15 — the native "final touches"): beyond
  // [MIN_PX, the ceiling] the height keeps tracking with progressive resistance toward a short
  // asymptote instead of hard-clamping, and the release snap pulls it back on the spring. Same
  // curve as RailPager's — identity-sloped at 0, never reaching the asymptote.
  const RUBBER_PX = 36;
  const rubber = (over: number, d: number) => d * (1 - 1 / (over / d + 1));
  const grabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget.closest<HTMLElement>('[data-slot="sheet-content"]');
    if (!el) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no active pointer (synthetic events) — the move/up handlers still work via bubbling */
    }
    drag.current = {
      startY: e.clientY,
      startH: el.getBoundingClientRect().height,
      moved: false,
      samples: [{ t: performance.now(), y: e.clientY }],
      el,
    };
    setDragging(true);
  };
  const grabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY; // up = grow
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    const raw = d.startH + dy;
    const max = sectionCeilingPx(d.el);
    const h = raw > max ? max + rubber(raw - max, RUBBER_PX) : raw < MIN_PX ? MIN_PX - rubber(MIN_PX - raw, RUBBER_PX) : raw;
    onSheetPx?.(Math.round(h));
    d.samples.push({ t: performance.now(), y: e.clientY });
    if (d.samples.length > 10) d.samples.shift();
  };
  const grabUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      // Plain tap on the grabber — today's tap-to-collapse, unchanged.
      onSheetPx?.(null);
      handleOpenChange(false);
      return;
    }
    const h = d.el.getBoundingClientRect().height;
    // The height the sheet rested at when the finger took it — what "well below" is measured from.
    const rest = Math.min(d.startH, sectionCeilingPx(d.el));
    // Downward flick velocity (px/ms, positive = down) over the last ~120ms of the gesture.
    const now = performance.now();
    const past = d.samples.find((s) => now - s.t <= 120) ?? d.samples[0]!;
    const vy = (e.clientY - past.y) / Math.max(1, now - past.t);
    // MOMENTUM-PROJECTED settle (user, 2026-08-15): the choice reads where the throw would land
    // (~160ms of release velocity carried forward), not where the finger stopped. The hard
    // flick-dismiss rule stays on top: a genuine throw down closes from anywhere.
    const hp = h - vy * 160;
    if (vy > 0.5 || hp < rest * 0.55) {
      // Fast flick down, or projected to land well below where it rested → dismiss (same as retap).
      onSheetPx?.(null);
      handleOpenChange(false);
      return;
    }
    // Not a dismiss: let go, and the sheet springs back to its content's fit.
    armSnap();
    onSheetPx?.(null);
  };
  // A completed drag also fires a click on the grabber — swallow it so it doesn't re-collapse.
  const grabClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return; // pointer-driven click: pointerup already handled tap-vs-drag
    // Keyboard activation (Enter/Space, detail 0): the grabber's original collapse affordance.
    onSheetPx?.(null);
    handleOpenChange(false);
  };

  // ── Edge pulses: the view/filter SWITCH signal + the hosted-card UPDATE signal ──────────────
  // Two channels, one shared recipe/tempo (see `usePulseWindow`). The carrier wrapper is a 3px
  // positioning context for the `.edge-pulse` recipe, sitting where the spine-equivalent runs,
  // `--spine` carrying the identity hue (the caller's --filter-accent rides in on the same style
  // object). `short` marks a SHORT host (the collapsed tab, the dock half's top edge): the
  // travelling segment scales to ~45% of the track (`--pulse-len`) so the sweep still reads there
  // instead of blinking the whole line at once.
  const switchP = usePulseWindow(signalKey);
  const updateP = usePulseWindow(updateKey);
  const pulseSpan = (p: { pulse: number; live: boolean }, cls: string, short = false) =>
    p.live && (
      <span
        className={cn("absolute w-[3px] pointer-events-none z-[43]", short && "[--pulse-len:45%]", cls)}
        style={{ ...style, ["--spine" as string]: "var(--filter-accent, var(--primary))" } as CSSProperties}
        aria-hidden
      >
        <PulseEdge pulseKey={p.pulse} />
      </span>
    );

  // The icon TRAY (see the `signals` prop doc): the hosted cards' legend. Muted at rest; an
  // `active` (updated-unseen) icon goes vivid in its identity hue and STAYS STILL (user,
  // 2026-09-28, tablet and phone: "colour AND movement when they are updated; only colour is
  // enough" — the dot-beat heartbeat it breathed on is gone, the compact dot's too). Vertical stack on the edge tab,
  // horizontal row on the phone dock half. The frame is FIXED-SIZE for 3 icons (user refinement:
  // the two edge trays mirror each other's geometry exactly and never grow/shrink as hosted
  // cards change — fewer icons = empty slots), sized 3 × 14px icons + 2 gaps. Renders whenever
  // the caller provides a tray at all (even momentarily empty), keeping the frame stable.
  // aria-hidden — the trigger keeps its accessible label.
  const firstActive = signals?.find((t) => t.active);
  const tray = signals && trayCompact ? (
    firstActive ? (
      <span
        aria-hidden="true"
        className="size-1.5 flex-none rounded-full"
        style={{ background: firstActive.hue ?? "var(--primary)" }}
      />
    ) : null
  ) : signals && (
    <span
      className={cn(
        "flex items-center pointer-events-none flex-none",
        isBarHalf ? "gap-1.5 w-[54px] justify-start" : "flex-col gap-2 h-[58px] justify-start",
      )}
      aria-hidden="true"
    >
      {signals.map(({ id, icon: Icon, hue, active }) => (
        <Icon
          key={id}
          strokeWidth={active ? 2.25 : 1.75}
          className={cn(
            "size-3.5 flex-none",
            active
              ? "drop-shadow-[0_0_4px_currentColor]"
              : "text-muted-foreground opacity-60",
          )}
          style={active ? { color: hue ?? "var(--primary)" } : undefined}
        />
      ))}
    </span>
  );
  // The [icons legend] | [open control] split (user refinement): the chevron serves a different
  // purpose than the card icons (open affordance vs contents legend), so a hairline separates
  // the two sections — the app's inset-hairline idiom — and the chevron sits at the END of the
  // tray (bottom on edge tabs, trailing on the phone dock half), subtly dimmer than the icons'
  // active states. The WHOLE tray stays one ≥44px tap target.
  // Bar halves render NO rule at all (user, 2026-09-03, second round: with the trays standing
  // down at thirds the hairline only separated a label from its own chevron — "I think we can
  // remove the hairline"; the first round made it structural for consistency, and the consistent
  // answer that survived review is none). The tablet edge tab keeps its tray-gated rule: there
  // it divides two stacked GROUPS, which is a real division.
  const trayRule = signals && !isBarHalf && (
    <span
      className={cn("flex-none bg-border", isBarHalf ? "w-px h-4" : "h-px w-4")}
      aria-hidden="true"
    />
  );
  return (
    <>
      {isBarHalf ? (
        // Phone persistent bottom bar HALF: hidden except on phone (<700px). The two halves (this
        // dock's + the other rail's) tile into one seamless full-width strip docked at bottom:0;
        // the ACTIVE half reads as selected (shared cyan --sel-* language + a cyan top accent).
        // Rebased on the themed ToggleGroup primitive (user-approved 2026-07-05): a one-item
        // `type="single"` group per half — the primitive's NATIVE deselect-on-reclick is exactly
        // the dock's tap-to-open / retap-to-collapse semantics, so no hand-rolled toggle handler.
        // Each half is its own group (the two halves live in two separate RailDock instances —
        // ExploreRail's and Inspector's); their mutual exclusion stays where it was, in the shared
        // controlled `open` (`store.phoneDock`), which RailDock never owned anyway.
        <ToggleGroup
          type="single"
          value={open ? "open" : ""}
          onValueChange={(v) => handleOpenChange(v === "open")}
          className={cn(
            // pb env: --phone-dock-h carries the safe-area inset (globals.css) so the BAR grows
            // under a home indicator; the padding keeps the tappable content in the 56px band
            // above it rather than centring into the indicator's strip. Zero on flat bottoms.
            "fixed z-[42] bottom-0 h-[var(--phone-dock-h)] pb-[env(safe-area-inset-bottom,0px)] hidden max-[700px]:flex rounded-none",
            barGeom ?? (side === "left" ? "w-1/2 left-0" : "w-1/2 right-0"),
            // The raw data layer is presented: the dock belongs to the scene shell (RailDock
            // renders inside it), which has receded and dimmed behind the layer — so the bar
            // would sit under the raw table pointing at a hidden rail.
            // Overrides the phone-breakpoint `max-[700px]:flex` above (same twMerge group+variant,
            // so the later class wins) — a bare `hidden` wouldn't, the variant would still show it.
            !shellVisible && "max-[700px]:hidden",
          )}
        >
          <ToggleGroupItem
            value="open"
            aria-label={`${label} panel`}
            className={cn(
              // The half fills its group; `!` beats the primitive's first/last rounding + the
              // toggle baseline's hover/on fills (this design owns its selection language).
              // `relative` = the positioning context for the top-edge update-pulse carrier.
              // The on-state cyan tint targets `>svg` (the half's OWN EXPLORE_ICON/ListTree mark
              // only) — the tray icons inside the span keep their muted/identity colours.
              "relative w-full h-full rounded-none! items-center justify-center gap-2 cursor-pointer",
              // THE DOCK IS THE BOTTOM BAR, SO IT WEARS THE BAR'S PLATE (light-theme pass, 2026-10-03).
              // It was `--panel-light` — 40% white on paper — and its open half swapped that for the
              // 12% selection wash ALONE, so both let the scene's grey foot through: grey tabs and a
              // grey-green active one under a white sheet. `--topbar-glass` is the command bar's own
              // plate on both grounds; the open half lays the selection wash OVER it rather than
              // instead of it. Arbitrary `background` properties, not `bg-[…]`: the token is a
              // gradient (CSS trap 3).
              "[background:var(--topbar-glass)] border border-[var(--thread-faint)] backdrop-blur-[8px]",
              "text-body font-semibold tracking-[0.02em] text-muted-foreground",
              "hover:[background:var(--topbar-glass)] hover:text-muted-foreground",
              "data-[state=on]:text-foreground data-[state=on]:[background:linear-gradient(var(--sel-bg),var(--sel-bg)),var(--topbar-glass)]",
              "data-[state=on]:shadow-[inset_0_2px_0_var(--sel-border)] data-[state=on]:[&>svg]:text-[var(--primary)]",
            )}
          >
            {barIcon ?? (side === "left" ? <EXPLORE_ICON size={18} strokeWidth={1.75} aria-hidden="true" /> : <ListTree size={18} strokeWidth={1.75} aria-hidden="true" />)}
            <span>{label}</span>
            {/* [icons legend], and NO trailing chevron (user, 2026-09-28): the icon and the word
                already read as a button, the open half says so with its wash and top accent, and
                the sheet's own grabber says it drags. The ∧/∨ restated the open state and cost the
                tray its width. */}
            {tray}
            {trayRule}
            {/* Hosted-card UPDATE signal only: a travelling pulse along the half's TOP edge — the
                shared vertical recipe rotated onto the horizontal edge (the mask/geometry live in
                the carrier's local coords, so the soft tips + sweep rotate with it), sweeping from
                THIS half's screen edge toward the centre seam — genuinely local to this half's own
                card. The view/filter SWITCH signal is NOT rendered per-half here (see the
                `signalKey` doc) — it rides `PhoneDockSweep`'s single full-width overlay instead,
                so the two halves don't each play a competing half-sweep. */}
            {pulseSpan(
              updateP,
              cn(
                "h-[50vw] top-[3px]",
                side === "left" ? "left-0 origin-top-left -rotate-90" : "right-0 origin-top-right rotate-90",
              ),
              true,
            )}
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        // Tablet edge tab (700–1099px only; hidden on desktop AND phone): a slim rectangular TRAY
        // docked to the screen edge — the hosted cards' icon legend (a FIXED 3-slot frame, so the
        // left + right trays mirror each other's height exactly) over a hairline, over the
        // chevron (the open affordance). Width holds the ≥44px tap target (w-11); the fixed
        // column means icons never collide with the chevron and the geometry never shifts.
        <button
          className={cn(
            "fixed z-[39] top-1/2 -translate-y-1/2 w-11 min-h-[56px] hidden flex-col items-center justify-center gap-2 py-2.5 cursor-pointer",
            "bg-[var(--panel)] border border-border text-foreground backdrop-blur-[14px]",
            "min-[700px]:max-[1099px]:flex",
            side === "left" ? "left-0 rounded-r-[var(--radius)] border-l-0" : "right-0 rounded-l-[var(--radius)] border-r-0",
          )}
          aria-label={`${label} panel`}
          // The edge tab is hidden the instant its own sheet opens, so it can only ever mean
          // "open" (the bar half's open/collapse toggle is ToggleGroup's native deselect above).
          onClick={() => handleOpenChange(true)}
        >
          {/* [icons legend] above the hairline, [open control] below — see the trayRule doc. */}
          {tray}
          {trayRule}
          {side === "left" ? (
            <ChevronLeft size={20} className="flex-none opacity-70" aria-hidden />
          ) : (
            <ChevronRight size={20} className="flex-none opacity-70" aria-hidden />
          )}
          {/* CLOSED-state pulses down the tab's scene-facing edge (the sheet's spine-equivalent
              while there's no sheet on screen): the view/filter SWITCH signal + the hosted-card
              UPDATE signal — both short-host scaled. */}
          {!open && pulseSpan(switchP, cn("inset-y-1", side === "left" ? "right-0" : "left-0"), true)}
          {!open && pulseSpan(updateP, cn("inset-y-1", side === "left" ? "right-0" : "left-0"), true)}
        </button>
      )}
      {/* NON-MODAL (`modal={false}`): on tablet the left "Explore" and right "Details" edge docks
          can be open at the SAME time, and the 3D scene between them stays interactive (picking
          still works — which is how interacting with the scene/Explore updates Details). No focus
          trap, no scrim (see `overlay={false}`), and outside-pointer no longer force-closes it —
          the user decides when each closes (its own ✕ / Escape / bar-half toggle). On phone the
          two bar-half docks are mutually exclusive via the CONTROLLED `open` prop (driven by
          `store.phoneDock` from the caller), not by anything in here — RailDock itself still just
          renders whatever `open` it's given. */}
      <Sheet open={(open || exiting) && shellVisible} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          ref={setSheetEl}
          side={sheetSide ?? side}
          // The phone bottom sheet's height is always stated inline — the finger's while a drag
          // is live (`sheetPx`), else the content's fit — and both stay under `sectionCeilingPx`.
          style={heightPx != null ? { ...style, height: heightPx, maxHeight: "none" } : style}
          overlay={false}
          // The HUD's step-back while the camera moves (`useSceneYield`). Both tiers yield to the
          // user's own hand; only the PHONE half also yields to a commit flight (see the call site
          // above). The dock BAR and the edge tabs stay solid: they're the handles. The recipe is
          // in globals.css.
          data-dim={yielding ? "" : undefined}
          // Phone bar-half variant: the sheet sits DIRECTLY ABOVE the persistent dock bar (never
          // covers it — the bar is its visible header/handle), so offset it up by the bar height.
          // `!` beats the base `bottom-0` from the bottom-side placement in sheet.tsx. A drag's
          // release snap animates the height on the shared `--ease-spring` (user, 2026-08-15 —
          // the detent lands with the same physics as the pager; suspended while the finger
          // drags, instant under reduced motion). ONLY the snap (2026-09-28, `snapping`): the
          // entry grow takes the house entrance curve and a content re-fit a plain ease-out,
          // because a spring overshoots and content arriving is not a finger letting go.
          // `opacity` rides the same list so the scene-yield dim isn't stranded
          // by this element-level `transition-property` — it takes the sheet's own tempo
          // rather than the rails' 0.3s, which is the honest trade for not fighting the cascade.
          className={
            isBarHalf
              ? cn(
                  "!bottom-[var(--phone-dock-h)]",
                  // DENSER GLASS ON PHONE (2026-10-02): the sheet is the reading surface there and the
                  // camera often sits close behind it — at `--panel-light` a bright stack of chips
                  // showed through the collapsed card heads. The desktop panel's own fill and a
                  // stronger blur keep it glass without the scene competing with the text.
                  "!bg-[var(--panel)] !backdrop-blur-[14px]",
                  // The slide keyframe never plays on the bar half — the entry is the height
                  // grow above ('!': the animate utility is a (0,2,0) variant, the documented
                  // escape). Reduced motion collapses the grow too (transition-none).
                  "!animate-none",
                  dragging || tracking
                    ? "!transition-none"
                    : cn(
                        "motion-reduce:!transition-none",
                        // The exit takes a plain decel ease, not the spring: a spring front-loads
                        // its travel (measured, 280→29 in 120ms of a 380ms clock), which is the
                        // "disappears immediately" the exit exists to fix. Exits run a touch
                        // quicker than the 550ms entry, per standard motion practice.
                        exiting
                          ? "transition-[height,opacity] duration-[420ms] ease-out"
                          : snapping
                            ? "transition-[height,opacity] ease-[var(--ease-spring)] duration-[380ms]"
                            : entry === "grow"
                              ? "transition-[height,opacity] duration-[550ms] ease-[var(--ease-roll)]"
                              : "transition-[height,opacity] duration-[380ms] ease-out",
                      ),
                )
              : undefined
          }
          // Don't let a pointer-down/interaction OUTSIDE the sheet (e.g. on the scene, or on the
          // OTHER open dock) dismiss it — radix's DismissableLayer would auto-close a non-modal
          // dialog on any outside pointer-down, drag included, which would make the tablet docks
          // fight + close on every scene pick and orbit start. Dismissal is explicit (✕ / Escape
          // / bar-half toggle) — plus, on phone only, the tap-outside recognizer above, which
          // knows a tap from a drag where radix doesn't.
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
        >
          {/* Tablet switch-signal, OPEN state: the pulse rides the sheet's own `.ig-sheet-edge`
              identity spine (its screen-edge side) — same recipe/tempo as the desktop
              RailThread pulse, full-length segment (a tall host). Edge-tab (tablet) mode only;
              the phone bar-half sheet carries no spine (accepted). */}
          {!isBarHalf && pulseSpan(switchP, cn("inset-y-2", side === "left" ? "left-0" : "right-0"))}
          {sheetSide === "bottom" && (
            // Centred grabber bar (36×4) with a ≥44px tap target — the sheet's DRAG handle
            // (follow-the-finger + snap, see the drag block above) and still the plain
            // tap-to-collapse affordance. `touch-action:none` so the browser never turns the
            // drag into a page scroll; keyboard activation still collapses (grabClick).
            <button
              type="button"
              className={cn(
                "self-center w-11 h-11 mx-0 -mt-[22px] -mb-[18px] flex items-center justify-center cursor-grab active:cursor-grabbing",
                "p-0 border-none bg-none [-webkit-tap-highlight-color:transparent] [touch-action:none]",
                // The app's focus language (a 1px accent outline), not the platform's white box.
                "outline-none rounded-md focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
                "before:content-[''] before:w-9 before:h-1 before:rounded-[2px] before:bg-border",
              )}
              aria-label={`Collapse ${label} panel`}
              onPointerDown={grabDown}
              onPointerMove={grabMove}
              onPointerUp={grabUp}
              onPointerCancel={grabUp}
              onClick={grabClick}
            />
          )}
          {isBarHalf ? (
            // The persistent bar half already shows the label + icon tray visibly — no redundant
            // header row (no ✕ either; the bar half itself is the close affordance, via the toggle
            // above). SheetTitle stays for the accessible dialog name only.
            <SheetTitle className="sr-only">{label}</SheetTitle>
          ) : (
            // Sheet's own chrome (label + close), ABOVE the hosted content so the ✕ never overlaps a
            // hosted card's top-right control. The close is ≥44px.
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="m-0 text-body font-semibold tracking-[0.02em] uppercase text-foreground opacity-90 [text-shadow:0_1px_2px_var(--scrim-shadow)]">
                {label}
              </SheetTitle>
              {/* The sheet's × on the same ghost-Button baseline as CardHead's card close (muted,
                  no box — the old hand-rolled panel-boxed button is gone), just kept ≥44px since
                  it's the sheet's primary touch dismiss. */}
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Close ${label} panel`}
                title={`Close ${label} panel`}
                onClick={() => handleOpenChange(false)}
                // The ghost recipe's own hover wash, like every other icon control (user, 2026-10-03:
                // "the details and explore pane × does not have the fill effect on hover like other
                // buttons do") — this one had it switched OFF by three overrides.
                className="flex-none w-11 h-11 rounded-md leading-none cursor-pointer text-muted-foreground"
              >
                <X aria-hidden className="size-5" />
              </Button>
            </div>
          )}
          {/* The cards scroll in an inner body so the sheet itself is `overflow: visible` — that lets
              the bottom sheet paint its instrument ruler ABOVE its top edge (outside the element).
              Native scrollbar hidden, momentum kept (like #rightcol). `sheet-cards` (globals.css)
              suppresses the hosted cards' per-card spines/right-edges — the sheet's own
              `.ig-sheet-edge` spine is the single identity cue (no double spine); the transient
              edge PULSE still plays on each card's own edge. */}
          <div className="sheet-cards flex-1 min-h-0 flex flex-col gap-[var(--rail-gap)] overflow-y-auto overscroll-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {/* fitRef is the height-measuring wrapper — and it must repeat the column+gap recipe,
                or it swallows the cards into one block child and the sheet's gap separates
                nothing: hosted cards rendered flush (user, 2026-08-30 — "zero gap between the
                cards", tablet/phone only, desktop's #leftcol has no such wrapper). The gaps are
                part of the content height, so the fit measurement stays honest. */}
            <div ref={setFitEl} className="flex flex-col gap-[var(--rail-gap)] max-[700px]:pb-2">{children}</div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
