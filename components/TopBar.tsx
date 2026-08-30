"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { VIEW_ICONS } from "@/components/icons";
import { useStore } from "@/src/store/store";
import { displayNetwork } from "@/src/data/unlisted";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VitalsStripRow } from "@/components/VitalsBand";
import FilterPicker from "@/components/topbar/FilterPicker";
import EcgMark from "@/components/topbar/EcgMark";
import PresentationToggle from "@/components/topbar/PresentationToggle";
import ThemeToggle from "@/components/topbar/ThemeToggle";
import NetworkSwitch, { NET_SWITCH_VIEW } from "@/components/topbar/NetworkSwitch";
import NetLink from "@/components/NetLink";
import { useBreakpoint } from "@/components/useBreakpoint";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import type { Mode } from "@/src/store/store";

const VIEWS = [
  { id: "hyper", name: "Hypergraph" },
  { id: "geo", name: "Geography" },
  { id: "ledger", name: "Snapshots" },
  { id: "status", name: "Network", soon: true },
  { id: "transactions", name: "Transactions", soon: true },
  { id: "staking", name: "Staking", soon: true },
] as const;

// Collapsed filter face: a small identity dot + the network name in neutral text (no filled
// chip). All → a neutral cyan dot. Identity is the ONLY colour the filter carries.
function filterFace(filter: string): { label: string; dot: string } {
  // ONE lookup for catalog metagraphs AND the unlisted pseudo-network (src/data/unlisted.ts —
  // the one-home design, 2026-08-07).
  const net = displayNetwork(filter);
  if (net) return { label: net.ticker, dot: net.hue };
  return { label: "All", dot: "var(--primary)" };
}

export default function TopBar() {
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  // The filter strip's open state — COLLAPSED BY DEFAULT (user): it's a persistent part of the
  // bar, not a popup, but starts closed on every load/view. The FILTER button toggles it, Escape
  // closes it, and picking a chip closes it too (user, 2026-08-02 — see the strip note below).
  // The phone effect below still force-closes it if the viewport becomes phone-width after a
  // manual open.
  const [open, setOpen] = useState(false);

  const bp = useBreakpoint();
  useEffect(() => {
    if (bp === "phone") setOpen(false);
  }, [bp]);

  // Consume the NetworkSwitch's one-shot view handoff (see its header): a network switch is a
  // hard reload, and the view you were on survives it. Runs once on mount, BEFORE the engine's
  // dynamic import resolves, so the scene boots straight into the carried view rather than
  // transitioning to it. An effect, not a store initial value — SSR renders the default view,
  // and a differing first client render is a hydration mismatch, which React 19 answers by
  // regenerating the tree (the data-net trap, CLAUDE.md "The three networks").
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(NET_SWITCH_VIEW);
      if (saved != null) sessionStorage.removeItem(NET_SWITCH_VIEW);
    } catch {
      return; /* storage unavailable — nothing carried */
    }
    if (saved != null && VIEWS.some((v) => v.id === saved)) setMode(saved as Mode);
  }, [setMode]);

  const face = filterFace(filter);

  // Publish the strip's rendered height as `--topbar-extra` (globals.css) so the RAILS slide
  // down under the grown bar instead of being overlapped — the strip is a bigger bar, not a
  // popup (user, 2026-07-12). ResizeObserver keeps it honest when the chips re-wrap.
  const stripInner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripInner.current;
    const apply = () =>
      document.documentElement.style.setProperty("--topbar-extra", open && el ? `${el.offsetHeight}px` : "0px");
    apply();
    const ro = el ? new ResizeObserver(apply) : null;
    if (el && ro) ro.observe(el);
    return () => {
      ro?.disconnect();
      document.documentElement.style.setProperty("--topbar-extra", "0px");
    };
  }, [open]);

  // DEV-ONLY overflow alarm. The bar is `overflow-hidden` (the filter strip needs the rounded
  // clip), so when its row stops fitting nothing breaks visibly — the trailing control just
  // vanishes off the right edge, and the only way to notice is to resize and look. That has now
  // shipped twice (the labeled switch at 1100, then at 1210). Every breakpoint in the JSX below is
  // tuned against measured content, so measured content is what should complain when it drifts.
  const barRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const el = barRow.current;
    if (!el) return;
    const check = () => {
      // Two failure shapes since the grid promotion: the ROW overflowing its box, and a ZONE
      // being crushed below its content (the left zone's min-w-0 lets the grid shrink it, so
      // the row's own scrollWidth stays clean while the brand/filter get clipped inside it).
      let over = el.scrollWidth - el.clientWidth;
      for (const zone of el.children) {
        if (zone instanceof HTMLElement) over = Math.max(over, zone.scrollWidth - zone.clientWidth);
      }
      if (over > 0)
        console.warn(
          `[TopBar] the command bar overflows by ${over}px at ${window.innerWidth}px — ` +
            "a control is being clipped. Raise a breakpoint in components/TopBar.tsx.",
        );
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      {/* Fixed wrapper = the bar + the hanging view caption below it. pointer-events-none so the
          caption strip under the bar doesn't block clicks on the scene; the bar itself restores
          pointer-events-auto. On desktop the bar's edges align with the rail columns (26px, the
          rails' outer margin since the mirrored threads landed); smaller breakpoints keep 16px.
          `top-14px` since the experimental banner was retired (user, 2026-08-09): the bar was at
          39px to clear the banner's 28px ribbon plus an 11px breather, and it now floats at the
          viewport edge with a breather of its own — close to the 16px side inset, so the glass
          sits in an even frame. Everything below rides `--rail-top`, which moved by the same 25px. */}
      <div className="fixed top-[14px] inset-x-4 min-[1100px]:inset-x-[26px] z-40 pointer-events-none">
      <div
        id="topbar"
        className={cn(
          // No resting spine — the absolute rule (user decision 2026-07-05): the bar's identity
          // cue is the ECG mark, so the old left-edge cyan→blue gradient pseudo is gone.
          "relative flex flex-col overflow-hidden pointer-events-auto",
          "border border-border rounded-lg backdrop-blur-md",
          "[background:var(--topbar-glass)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.35)]",
        )}
      >
      <div
        ref={barRow}
        className={cn(
          // A 3-zone grid at EVERY width (left cluster | view switch | right cluster) so the
          // switch is TRULY centred in the bar. Flex spacers only centre it when the side
          // clusters are equal-width — they never are (the phone measured the symptom first:
          // ECG + filter ≈ 100px vs a 44px toggle pushed the switch ~28px right of centre) —
          // and the NetworkSwitch made the right zone heavier still. `1fr auto 1fr`
          // (minmax(auto,1fr)) keeps the sides equal while both fit and degrades as flex did
          // past that: a long ticker shifts the switch instead of overlapping it; the dev
          // overflow alarm below arbitrates. Promoted from the phone tier 2026-08-21 — the
          // zone wrappers were already in the DOM as `display: contents` above 700px.
          "grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 px-3.5",
          "max-[1260px]:gap-2.5",
          "max-[940px]:gap-2 max-[940px]:px-2.5 max-[940px]:py-2",
          "max-[700px]:gap-1.5 max-[700px]:p-2",
        )}
      >
        {/* LEFT zone: brand + filter. A real flex container at every width now that the grid
            is the base layout — the in-zone gaps mirror the row's own gap steps. */}
        <div className="flex items-center gap-3 max-[1260px]:gap-2.5 max-[940px]:gap-2 max-[700px]:gap-1 min-w-0">
        {/* Brand — AND the one route to /about (user, 2026-08-09, replacing the always-on
            experimental banner). The identity mark is the honest affordance for "what is this
            thing?": clicking the app's own name to read what it is, who made it and that it's
            unofficial needs no new chrome in a bar that has none to spare, and it works at every
            breakpoint because the ECG mark survives when the wordmark hides. A plain <a>, not a
            Link: /about is a separate document with its own scroll, and the app is a long-lived
            WebGL tab — a client-side route change would tear the engine down and rebuild it on
            return, so the full navigation is the cheaper one. */}
        <NetLink
          href="/about"
          title="About DAG Visualizer, an unofficial community project"
          className={cn(
            "flex items-center gap-2 rounded-btn -mx-1 px-1 py-0.5 no-underline",
            "hover:bg-wash-soft transition-colors duration-150 motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          )}
        >
          <EcgMark />
          {/* Wordmark hides below 1439. The thresholds in this bar are MEASURED, not guessed —
              the bar is `overflow-hidden`, so anything that doesn't fit is silently clipped off
              the right edge, and the first thing to go is the presentation toggle (user bug,
              2026-08-09: "the right view type buttons go out of view"). Measured needs, at the
              vitals cluster's present 250px: labels + wordmark → 1392px; labels alone → 1257px.
              So the wordmark waits for 1439 and the labels for 1299, each with real slack. (`max-[N]`
              compiles to `not (min-width: N)` — EXCLUSIVE, so N itself is already the wide face.)
              Raise them together with any part that grows; the dev overflow warning in the effect
              above shouts if they drift again. */}
              <span className="font-semibold tracking-[-0.01em] text-title whitespace-nowrap max-[1439px]:hidden">
            <span className={live ? "text-foreground" : "text-muted-foreground opacity-70"}>DAG</span>{" "}
            <span className={cn("text-muted-foreground", !live && "opacity-70")}>Visualizer</span>
          </span>
        </NetLink>
        <span className="w-px self-stretch bg-border my-1 max-[860px]:hidden" />

        {/* Filter (toned, de-nested) — toggles the ATTACHED filter strip below (user,
            2026-07-12: reversed the 2026-07-04 detached-popover decision; the strip lives on
            the bar's own surface so the scene reacts in the open while you hover networks). */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="filter-strip"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          className={cn(
            "flex items-center gap-[7px] bg-transparent border-0 cursor-pointer py-1.5 px-2 rounded-btn",
            "hover:bg-wash-soft",
            open && "bg-wash-soft",
            // The 44px tap minimum keys on the POINTER, not the width (user, 2026-08-14 —
      // resizing a desktop window smaller made the bar GROW): a coarse pointer is a
      // touch device wherever the window edge sits; a fine pointer never needs it.
      "pointer-coarse:min-h-11",
            // PHONE: the face must fit its grid column beside the fixed 3×44px switch (user,
            // 2026-08-15 — the button used to run UNDER the switch and read as unclickable):
            // trimmed paddings/gaps, and `min-w-0` + the label's truncate below so a long
            // ticker ellipsizes inside its own column instead of overlapping the neighbour.
            "min-w-0 max-[700px]:px-1 max-[700px]:py-1.5 max-[700px]:gap-[4px]",
          )}
        >
          {/* The "FILTER" text label on wide bars; on the condensed breakpoints (≤940px) it
              simply hides — the identity dot + network name ARE the control's face there (the
              lucide funnel stand-in was tried and removed: too busy, and it crowded the phone
              bar off-balance). It goes ACCENT while the strip is open — the same on-state the
              RAW label wears when its layer is showing (user, 2026-08-02): both are the bar's
              two "this control is currently doing something" words, so they speak one language. */}
          <span
            className={cn(
              "text-micro tracking-caps uppercase max-[940px]:hidden",
              "transition-colors duration-150 motion-reduce:transition-none",
              open ? "text-primary" : "text-muted-foreground",
            )}
          >
            Filter
          </span>
          <span
            className="w-[9px] h-[9px] rounded-full flex-none animate-dot-beat motion-reduce:animate-none"
            style={{ background: face.dot }}
          />
          <span className="text-body text-foreground truncate">{face.label}</span>
          {/* No chevron on phone (user, 2026-08-15 — the face must fit a 99px grid column
              beside the fixed 3×44 switch, and the ticker is the part that must survive):
              the open state still reads from the face's wash + the strip itself, and
              `aria-expanded` carries it for AT. The truncate above stays as the safety for
              a ticker longer than the column. */}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 flex-none text-muted-foreground transition-transform motion-reduce:transition-none",
              "max-[700px]:hidden",
              open && "rotate-180",
            )}
          />
        </button>
        </div>

        {/* View switch — structural. On phone there's no room for the three non-functional
            "soon" placeholders (Network/Transactions/Staking) — they're dimmed dead weight
            that helped overflow the bar, so phone shows only the 3 working views. Tablet +
            desktop keep all six. */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => { if (v) setMode(v as Mode); }}
          className="flex gap-0.5 max-[700px]:gap-0"
        >
          {(bp === "phone" ? VIEWS.filter((v) => !("soon" in v && v.soon)) : VIEWS).map((v) => {
            const Icon = VIEW_ICONS[v.id as Mode];
            return (
            <ToggleGroupItem
              key={v.id}
              value={v.id}
              title={v.name}
              className={cn(
                // The design OWNS its sizing/rounding here (not inherited from the shadcn
                // toggle primitive): explicit h-9 (== today's rendered 36px — the primitive's
                // default is the same, but the bar now states it) and `rounded-[8px]!` — the
                // important variant beats toggle-group.tsx's `data-[spacing=0]:rounded-none`
                // (class+attribute specificity) so ALL buttons, incl. the middle ones' hover/on
                // fill, get the intended 8px corners (was: middle square, first/last 10px).
                "group flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn!",
                "text-muted-foreground bg-transparent border-0",
                "hover:text-foreground hover:bg-wash-soft",
                "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
                "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
                "pointer-coarse:min-h-11 pointer-coarse:min-w-11 max-[1299px]:justify-center",
                "max-[1120px]:px-2 max-[1120px]:py-1.5 max-[1120px]:text-label",
                // Phone keeps the ≥44px touch WIDTH (the min-w-11 above still applies — the old
                // `max-[700px]:min-w-0` override made the icon-only radios too narrow to press);
                // only the padding condenses. Room is fine: phone shows just the 3 working views.
                "max-[700px]:p-1.5",
                // The three "soon" placeholders also stand down on a NARROW TABLET (700–859px):
                // measured, the six-icon switch needs 771px and the bar is clipped below that, so
                // the first thing sacrificed is the dead weight — same argument the phone makes,
                // one breakpoint up. The threshold is the DIVIDERS' own `max-[860px]` so the
                // condensed and the full face change on one line. Tablet ≥860 and desktop keep six.
                // (Raised from 820 on 2026-08-21 when ThemeToggle landed beside PresentationToggle:
                // measured 32px overflow at 820px; 860px is clean with slack, breakeven ~853px.)
                "soon" in v && v.soon && "opacity-45 max-[860px]:hidden",
              )}
            >
              <Icon aria-hidden className="size-4 group-data-[state=on]:text-primary" />
              <span className="text-label max-[1299px]:hidden">{v.name}</span>
            </ToggleGroupItem>
          );
          })}
        </ToggleGroup>

        {/* RIGHT zone: presentation + theme + network. The vitals LEFT the bar (2026-08-30 —
            the bottom VitalsBand is their home now; docs/superpowers/plans/
            2026-08-30-vitals-bottom-band.md), so the zone is the control group alone. On phone
            the vitals still ride the filter strip below as a second row, unchanged. */}
        <div className="flex items-center gap-3 max-[1260px]:gap-2.5 max-[940px]:gap-2 max-[700px]:gap-1.5 justify-self-end">

        {/* PRESENTATION — the bar's trailing group: the SCENE⇄HUD chrome toggle + the RAW
            layer toggle, adjacent as one pair (user, 2026-08-30 — re-split along the store's
            own axes; the 2026-08-08 one-axis control flattened two independent axes into three
            states). It sits in the COMMAND bar (this zone's scope is the whole instrument)
            rather than the live lane. */}
        <span className="w-px self-stretch bg-border my-1 max-[860px]:hidden" />
        <PresentationToggle />

        {/* Theme — the "how it looks" control, riding beside presentation with no divider of
            its own (it reads as part of that group, not a fourth zone). On PHONE it rides the
            filter strip's second row instead, same as NetworkSwitch below — otherwise it would
            render twice (bar + open strip) at once. */}
        <div className="contents max-[700px]:hidden">
          <ThemeToggle />
        </div>

        {/* Network switch — the RIGHT edge of the bar, one past the presentation toggle: the
            network acts on everything INCLUDING presentation, so the edge escalates in scope
            and the bar reads as a valley — brand (what this app is) and network (which chain)
            at the outer edges, the most specific controls in the middle. On PHONE it rides
            the filter strip's second row instead (see the strip below) — in this zone it
            starved the filter face's word out of the bar (measured at 360-390, 2026-08-21). */}
        <span className="w-px self-stretch bg-border my-1 max-[860px]:hidden" />
        <div className="contents max-[700px]:hidden">
          <NetworkSwitch />
        </div>
        </div>
      </div>

      {/* FILTER STRIP — the bar GROWS DOWNWARD by one row on its own surface (the same
          grid-rows collapse as the phone vitals row below): every network as a hoverable/
          clickable chip, so the SCENE previews the selection live while browsing (user,
          2026-07-12 — this replaces the detached popover, whose glass covered the scene).
          Picking a chip CLOSES the strip again (user, 2026-08-02 — reversed the earlier
          keep-it-open rule: hovering already previews a network without committing, so the
          strip's job is done the moment you commit one, and leaving it open kept the whole
          layout pushed down over the scene you just filtered); the FILTER button or Escape
          closes it too. */}
      <div
        id="filter-strip"
        className={cn(
          "grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        aria-hidden={!open}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        <div className={cn("overflow-hidden min-h-0", !open && "invisible")}>
          <div ref={stripInner}>
            <FilterPicker onPicked={() => setOpen(false)} />
            {/* PHONE: the vitals ride the SAME strip as a second row (user, 2026-08-15) — one
                dropdown control on the filter face instead of a separate 44px toggle starving
                the bar row. Inside `stripInner`, so the published `--topbar-extra` height and
                the rails' slide-down already account for it. Same key/value language as the
                desktop cluster; the hairline is the phone vitals row's own border-t device. */}
            {bp === "phone" && (
              <div className="flex items-center justify-center gap-2 mx-2 px-2 pb-2 pt-1.5 border-t border-border/60">
                {/* The band's own cards, horizontally scrollable (user pick, 2026-08-30 — one
                    vitals design on every tier; the bare-number cluster is retired). Gated on
                    the band's own policy flag so a flat view's row carries controls alone. */}
                {VIEW_POLICIES[mode].vitalsLane && <VitalsStripRow />}
                {/* The phone home of the network switch (its bar slot is desktop/tablet-only):
                    the strip row is the one place the bar grows, and it has the width the
                    right zone doesn't. */}
                <span className="w-px self-stretch bg-border my-1" />
                <NetworkSwitch />
                <ThemeToggle />
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Selected-view label — only on the icon-only breakpoints (<1300, where the switch drops
          its text labels; this threshold MUST track the labels' own, see the wordmark note above:
          it was 1100, then 1210 when the vitals figures grew a digit, and 1300 since the measured
          fit showed 1210–1256 was still clipping the bar's right edge — user bug):
          the ACTIVE view's name as a quiet caption HANGING BELOW the
          bar, anchored under its right corner (user refinement — the centered in-bar second row
          read misaligned with the bar's buttons). Lives OUTSIDE the bar surface (a sibling in
          the fixed wrapper, so the bar's overflow-hidden can't clip it) and keeps the muted
          eyebrow language + keyed roll-in on view change (the HUD grammar). Decorative echo of
          the radiogroup's own accessible state, so aria-hidden; non-interactive (the wrapper's
          pointer-events-none passes scene clicks through the caption strip). */}
      <div className="hidden max-[1299px]:flex justify-end pr-2.5 mt-1.5" aria-hidden>
        <span key={mode} className="roll-in text-micro tracking-caps uppercase text-muted-foreground leading-none">
          {VIEWS.find((v) => v.id === mode)?.name}
        </span>
      </div>
      </div>
    </div>
  );
}
