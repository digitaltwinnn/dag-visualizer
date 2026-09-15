"use client";

// THE VITALS BAND — the bottom instrument lane (2026-08-30, replacing the bar's vitals region;
// docs/superpowers/plans/2026-08-30-vitals-bottom-band.md). One slim full-width row of read-only
// info cards, per 3D view: hyper leads with a composition DONUT (the four counts are shares of
// one fleet — the one honest home for a donut), geo with its footprint numbers plus a
// nodes-by-country micro-bar row, and the ledger with its two rate cards (number + sparkline)
// beside the declicked tick bar-chart that used to be the LiveStrip.
//
// READ-ONLY BY CONSTRUCTION: the band writes no store state and takes no pointer events at all
// (`pointer-events-none` on the root — the user's rule: "no clicking etc required on any
// visualization here at the bottom"). Every route the old strip's clicks served survives
// elsewhere: the explorer rows and the global card's pager commit ticks.
//
// Colour follows rule 3: micro-charts in structural cyan; the identity hue appears only under a
// committed filter, exactly the strip's old rule — resolved once per band (useVitalsScope) and
// handed to every chart as its `accent` prop. Identity is never colour-alone: every donut
// segment is named by its legend row, every country bar by its code, every rate by its eyebrow
// (dataviz discipline).

// ⚠️ THIS FILE IS THE SHELL NOW (2026-09-15). It decides WHICH view's cells are showing, carries
// the rim and the sheet body, and owns `useVitalsScope` — the one place the accent is resolved and
// handed down. The cells themselves live in ./vitals/viewCells and the plate + micro-instruments
// in ./vitals/bandParts; between them the file had grown past 1400 lines holding three unrelated
// jobs. Splitting it changed no behaviour: the three cell sets were already separate components.

import { useStore, type Mode } from "@/src/store/store";
import RollSwap from "@/components/RollSwap";
import { filterAccent } from "@/src/data/network";
import { NoSignalDot } from "@/components/state/StateAtoms";
import { DOC_ICONS } from "@/components/icons";
import { useSceneYield } from "@/components/RailShade";
import { cn } from "@/lib/utils";
import { HyperCells, GeoCells, LedgerCells } from "@/components/vitals/viewCells";

function useVitalsScope() {
  const mode = useStore((s) => s.mode);
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const accent = (filter !== "all" ? filterAccent(filter) : null) ?? "var(--primary)";
  return { mode, live, filter, accent };
}

/** The one view→cells dispatch — a cell added or gated here reaches desktop and phone in the
 *  same edit, which is the whole point of extracting it. */
function ViewCells({ mode, accent, filter, paused = false }: { mode: string; accent: string; filter: string; paused?: boolean }) {
  return (
    <>
      {mode === "hyper" && <HyperCells accent={accent} />}
      {mode === "geo" && <GeoCells accent={accent} />}
      {mode === "ledger" && <LedgerCells accent={accent} filter={filter} paused={paused} />}
    </>
  );
}

/** The TRENDS LINK — the band's one interactive element (user, 2026-09-08: "some sort of
 *  separate control bar that sets the range + links to the separate trends page"; the range
 *  half retired 2026-09-13). A small tab riding the band's TOP edge in the file-cabinet
 *  vocabulary the Trends page itself uses: the route to the page where the elaborate,
 *  RANGEABLE versions live. It is a fixed SIBLING of the band, not a child — the band's
 *  clip-path would amputate anything protruding past its border box, and the band's
 *  `pointer-events-none` charter stays intact: the cards below remain read-only, and this tab
 *  is the one deliberate exception, OUTSIDE the plate.
 *
 *  ⚠️ UNGATED, IN EVERY VIEW THAT CARRIES THE BAND (user, 2026-09-13). It used to ride
 *  `viewPolicy.vitalsWindows` — right for a range PICKER, whose windowed cells only the ledger
 *  reads, and wrong for the link: /trends is the measured history of the whole network, so the
 *  step down the observation ladder (convention 12) is offered from wherever the band is. It
 *  therefore needs no policy row of its own; the band's own `vitalsLane` gate is its gate. */
const TrendsMark = DOC_ICONS.trends;

/** The Trends route as a LINK (user, 2026-09-08: "should not be part of the button-group, it
 *  should show as a link") — the site row's own link register: primary ink, normal case, the
 *  page's mark. Shared by both presentations (2026-09-08): the desktop band's floating tab and
 *  the phone Vitals sheet's row render ONE component, so a route renamed reaches both in the
 *  same edit — the ViewCells rule, applied to the control. */
function TrendsLink({ className }: { className?: string }) {
  const setDocPage = useStore((s) => s.setDocPage);
  return (
    <button
      type="button"
      onClick={() => setDocPage("trends")}
      title="The measured history behind these vitals — open the Trends page."
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 text-label text-primary/75 hover:text-primary whitespace-nowrap bg-transparent", className)}
    >
      <TrendsMark aria-hidden className="size-3.5" />
      Trends
    </button>
  );
}

function TrendsRim({ yielding, hidden }: { yielding: boolean; hidden: boolean }) {
  return (
    <div
      style={{ right: "var(--bar-margin)", bottom: "calc(var(--footer-h, 0px) + var(--vitals-h) + 6px)" }}
      // The tab rides the band's own exit (2026-09-13): it is furniture ON the lane's top edge,
      // so it leaves through the bottom with it rather than fading on its own account.
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "band-shade",
        // The pill survived the range group's retirement (user, 2026-09-13) — it is what makes
        // the link read as a thing you touch rather than a caption over the plate. Its hairline
        // is PRIMARY-TINTED, not the cards' neutral: cyan is the app's one affordance signal,
        // so a cyan-edged pill among neutral-edged plates reads as the affordance.
        "fixed z-10 flex items-stretch h-[26px] p-0.5 rounded-full border border-primary/25",
        "[background:var(--topbar-glass)] backdrop-blur-sm",
        "[transition:opacity_300ms_ease,transform_300ms_ease] motion-reduce:!transition-none",
        yielding && "opacity-40",
      )}
    >
      <TrendsLink />
    </div>
  );
}

/** The band. Mounted by BottomStream (per viewPolicy.vitalsLane + scene pose + rails visible);
 *  this component reads the mode only to pick which view's cells to lay out. */
export default function VitalsBand({ hidden = false }: { hidden?: boolean }) {
  const { mode, live, filter, accent } = useVitalsScope();
  // The band does NOT inset by the tablet sheets any more (user, 2026-09-04 — "the bottom bar
  // should behave the same as the top bar; the collapsible card panels go over the bar instead
  // of pushing it smaller"). The 2026-09-04 tablet pass had it reflowing by the sheets' measured
  // sceneCover; reversed the same day: the sheets OVERLAY both bars now, and a partially covered
  // read-only card is the same accepted cost the command bar already pays. `sceneCover` itself
  // stays published — the callout's placement still reads it.
  // The band steps back with the rails while the user's hand is on the camera (user, 2026-08-30)
  // — the same one read the RailShade dims on, at the recipe's own tempos (away 0.3s, the return
  // faster: it answers a gesture already finished).
  const yielding = useSceneYield();
  // THE BAND NEVER PAINTS UNDER AN OPEN SHEET (user, 2026-09-04 — "sometimes I see flickering
  // when the explore and bottom bar overlap"). The overlay decision above stands: the sheets
  // cover the band. But the sheet's glass is translucent, so a band that kept PAINTING under
  // it bled through — a steady shimmer as its numbers tick beneath the frost, and a full
  // double-exposure whenever the yield dim drops the sheet to 0.4 (screenshot-caught: the
  // band's METAGRAPHS rows interleaved with the explore card's). The paint is clipped by the
  // sheets' own published covers instead — the same `sceneCover` channel the callout reads —
  // with the --bar-margin arithmetic left to CSS max(), and the clip rides the band's own
  // 300ms edge transition so it tracks the sheet's slide. Desktop and phone publish 0 cover,
  // so the inset collapses to identity there.
  const coverL = useStore((s) => s.sceneCoverL);
  const coverR = useStore((s) => s.sceneCoverR);
  return (
    <>
      <TrendsRim yielding={yielding} hidden={hidden} />
      <section
      id="vitalsband"
      aria-label="View vitals"
      style={{
        ["--cover-l" as string]: `${coverL}px`,
        ["--cover-r" as string]: `${coverR}px`,
      }}
      // The SCENE toggle's exit (2026-09-13): the band leaves through the BOTTOM edge it lives
      // against, the way each rail leaves through its own — see the `.band-shade` recipe. It
      // stays MOUNTED while hidden (BottomStream's two gates), because a component that
      // unmounts has no exit to animate.
      data-hidden={hidden ? "" : undefined}
      className={cn(
        "band-shade",
        // pointer-events-none: the band is a read-only instrument — orbit drags pass through it.
        // --bar-margin, THE COMMAND BAR'S OWN INSET (globals.css), so the two bars bracket the
        // scene as a matched pair. At desktop it resolves to --rail-margin, which keeps the band's
        // edges aligned with the rail cards and off the RailThread rulers living in that gutter
        // (user, 2026-08-30: the band "sits on top of the rail of the side panels"); on TABLET the
        // rails are edge tabs, so there is nothing to align with and the lane takes the wider inset
        // instead (user, 2026-09-01).
        // A FIXED HEIGHT, not content height (--vitals-h; see its token note). `items-stretch`
        // below then makes every card in every view exactly this tall, so switching views moves
        // nothing at this edge. The PHONE strip does not take it — that presentation is a scrolling
        // row inside the command bar, sized by its own rules.
        // FLUSH onto the footer strip (user, 2026-09-04 — "the space between the two is just
        // noise"): the band's bottom edge sits directly on the footer's top edge, so the two
        // read as one instrument in two rows — the lit plate above, the flat veil underline
        // below, distinguished by the transparency difference the two glass tokens already
        // carry. The old +4px air gap is gone.
        "fixed z-10 inset-x-[var(--bar-margin)] bottom-[var(--footer-h,0px)] h-[var(--vitals-h)] pointer-events-none",
        // ⚠️ THE PLATE IS THE LANE'S, NOT EACH CARD'S (user, 2026-09-01: the band "feels ununiform
        // between screens because the amount of screen space they claim depends on the number of
        // vitals and the size"). Measured at 1600px: hyper and geo hold 1096px of a 1548px lane
        // while the ledger holds 1482, so switching views moved the band's own left edge 193px —
        // the CONTENTS varied, which is honest, but so did the instrument containing them, which
        // is not. One plate makes the lane constant by construction: only the divisions inside it
        // move, and the leftover reads as quiet plate rather than as a row that failed to fill.
        //
        // It is the COMMAND BAR's plate, deliberately — same `--topbar-glass`, same `--bar-margin`,
        // same radius — so the two bars now bracket the scene as an actual matched pair rather than
        // as a bar and a scattering of chips (user, 2026-09-01: "the bottom bar should be the same
        // exactly as the top bar").
        "rounded-lg border border-border/60 [background:var(--topbar-glass)] backdrop-blur-sm",
        "[clip-path:inset(0_max(0px,calc(var(--cover-r)-var(--bar-margin)))_0_max(0px,calc(var(--cover-l)-var(--bar-margin))))]",
        // ⚠️ The cell-targeting rules (card flattening, section dividers) moved ONTO the
        // RollSwap wrapper below (2026-09-04, the no-pop swap): they are `[&>*]` selectors, and
        // the wrapper between this section and the cells would otherwise be their new subject.
        // Their rationale lives at the wrapper. Layout stays here; the wrapper centres WITHIN it.
        "flex items-stretch px-1.5 py-1",
        // ⚠️ ONE transition statement, as an arbitrary PROPERTY. Utility pairs here silently
        // eat each other: twMerge groups every `transition-*` class, so the old
        // `transition-[left,right]` line was DROPPED by the later `transition-opacity` (found
        // 2026-09-04 while wiring the clip — computed transition-property read "opacity"
        // alone), and the comma'd arbitrary-value form is the DocLayer trap that never
        // compiles. The shorthand carries each property's own tempo: the yield dim's 180ms
        // return, and 300ms for the edges + clip so they track the sheet's slide; the
        // yielding arm's duration-300 overrides all of them to the away tempo while the hand
        // is on the camera. motion-reduce carries `!` — a variant loses to an equal-weight
        // single class on stylesheet order alone (CSS trap 4).
        "[transition:opacity_180ms_ease-out,transform_300ms_ease,left_300ms_ease-out,right_300ms_ease-out,clip-path_300ms_ease-out]",
        "motion-reduce:!transition-none",
        yielding && "opacity-40 duration-300",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center"><NoSignalDot /></span>}
      {/* The no-pop swap (RollSwap): the PLATE persists, the cells roll — and the wrapper takes
          over the row's cell-targeting rules (flatten, dividers, stretch), which is why the
          section above no longer carries them: an element between a `[&>*]` and its subjects
          silently retargets it at the wrapper. */}
      <RollSwap
        swapKey={mode as Mode}
        render={(m) => <ViewCells mode={m} accent={accent} filter={filter} paused={hidden} />}
        className={cn(
          "flex-1 min-w-0 flex items-stretch justify-center gap-0",
          "[&>*]:rounded-none [&>*]:border-0 [&>*]:backdrop-blur-none [&>*]:[background:none]",
          "[&>*+*]:border-l [&>*+*]:border-border/60 [&>*+*]:rounded-none",
        )}
      />
      {/* NO filter-scope hairline (user, 2026-08-30 — removed): unlike the old bar cluster's
          bare numbers, the band's own charts already wear the identity accent under a filter,
          so the scope is stated by the vitals themselves. */}
    </section>
    </>
  );
}

/** The PHONE home of the vitals (user, 2026-09-03 — the dock's third section): the SAME cards,
 *  stacked full-width in the Vitals sheet. This replaces the filter strip's second row
 *  (2026-08-30's option 1), which rode the top bar's grow-downward slot and so appeared under
 *  WHICHEVER strip opened — including the pulse strip, where a row of view vitals had nothing to
 *  do with what was asked for ("it feels confusing as it's not related to the actual dropdown").
 *  The dock parallels the desktop band: vitals live on the bottom edge on every tier. Vertical
 *  because the sheet has height to spend and a stacked read beats a sideways thumb-scroll; the
 *  band's equal horizontal share is overridden — in a column every card takes the sheet's full
 *  width, which is what `[&>*]:flex-none [&>*]:basis-auto` on the wrapper below says. */
export function VitalsSheetBody() {
  const { mode, live, filter, accent } = useVitalsScope();
  return (
    <div
      className={cn(
        "flex flex-col items-stretch min-w-0",
        // The bar tracks fill the column's middle — see MicroBars' `--bar-track-max` note.
        "[--bar-track-max:none]",
        !live && "saturate-[.45]",
      )}
    >
      {!live && <span className="self-center flex-none mb-2"><NoSignalDot /></span>}
      {/* The link, in the sheet's own register (2026-09-08): an in-flow full-width pill at
          thumb height above the cards — the sheet is interactive (unlike the band), so it
          simply sits in the column. Ungated like the desktop tab (2026-09-13). */}
      <div className="flex items-stretch h-10 p-0.5 mb-2 flex-none rounded-full border border-primary/25 [background:var(--topbar-glass)]">
        <TrendsLink className="flex-1 justify-center" />
      </div>
      {/* The no-pop swap — the cell-targeting `[&>*]` rules ride the wrapper for the same
          retargeting reason the band's do (see the desktop section above). */}
      <RollSwap
        swapKey={mode as Mode}
        render={(m) => <ViewCells mode={m} accent={accent} filter={filter} />}
        className={cn(
          "flex flex-col items-stretch gap-2 min-w-0",
          "[&>*]:w-full [&>*]:max-w-none [&>*]:flex-none [&>*]:basis-auto",
        )}
      />
    </div>
  );
}

