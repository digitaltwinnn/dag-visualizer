"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { VIEW_ICONS } from "@/components/icons";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Vitals, { VitalsCluster, VitalsToggle } from "@/components/topbar/Vitals";
import FilterPicker from "@/components/topbar/FilterPicker";
import EcgMark from "@/components/topbar/EcgMark";
import { useBreakpoint } from "@/components/useBreakpoint";
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
  const cfg = metagraphById(filter);
  if (cfg) return { label: cfg.ticker || cfg.name, dot: hex(cfg.color) };
  return { label: "All", dot: "var(--primary)" };
}

export default function TopBar() {
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  // The filter strip's open state — COLLAPSED BY DEFAULT (user): it's a persistent part of the
  // bar, not a popup, but starts closed on every load/view. The FILTER button toggles it, Escape
  // closes it (picking a chip deliberately does NOT — see the strip note below). The phone effect
  // below still force-closes it if the viewport becomes phone-width after a manual open.
  const [open, setOpen] = useState(false);

  const bp = useBreakpoint();
  useEffect(() => {
    if (bp === "phone") setOpen(false);
  }, [bp]);
  // PHONE: whether the bar's vitals ROW is expanded (the bar grows downward — see below).
  // Store-held (session) because it's a user choice that persists across view switches.
  const phoneVitals = useStore((s) => s.phoneVitals);
  const setPhoneVitals = useStore((s) => s.setPhoneVitals);

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

  return (
    <div>
      {/* Fixed wrapper = the bar + the hanging view caption below it. pointer-events-none so the
          caption strip under the bar doesn't block clicks on the scene; the bar itself restores
          pointer-events-auto. On desktop the bar's edges align with the rail columns (26px, the
          rails' outer margin since the mirrored threads landed); smaller breakpoints keep 16px. */}
      <div className="fixed top-[39px] inset-x-4 min-[1100px]:inset-x-[26px] z-40 pointer-events-none">
      <div
        id="topbar"
        className={cn(
          // No resting spine — the absolute rule (user decision 2026-07-05): the bar's identity
          // cue is the ECG mark, so the old left-edge cyan→blue gradient pseudo is gone.
          "relative flex flex-col overflow-hidden pointer-events-auto",
          "border border-border rounded-lg backdrop-blur-md",
          "bg-[linear-gradient(180deg,rgba(20,26,46,0.82),rgba(10,14,28,0.76))]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.35)]",
        )}
      >
      <div
        className={cn(
          "flex items-center gap-3 py-2 px-3.5",
          "max-[1260px]:gap-2.5",
          "max-[940px]:gap-2 max-[940px]:px-2.5 max-[940px]:py-2",
          // PHONE: a 3-zone grid (left cluster | view switch | right cluster) so the switch is
          // TRULY centred in the bar. The flex layout centres it between the side clusters, and
          // those are unequal (ECG + filter ≈ 100px vs the 44px vitals toggle), which pushed the
          // switch ~28px right of centre — pre-existing, worsened by the removed funnel icon.
          // `1fr auto 1fr` keeps the sides equal (centring the middle) and degrades gracefully:
          // a long ticker just shifts the switch instead of overlapping it. Tablet/desktop keep
          // the flex row unchanged (the zone wrappers are `display: contents` there).
          "max-[699px]:gap-1.5 max-[699px]:p-2 max-[699px]:grid max-[699px]:grid-cols-[1fr_auto_1fr]",
        )}
      >
        {/* LEFT zone (phone grid): brand + filter. `contents` above 700px = invisible to the
            flex row, so tablet/desktop layout is byte-identical. */}
        <div className="contents max-[699px]:flex max-[699px]:items-center max-[699px]:gap-1.5 max-[699px]:min-w-0">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <EcgMark />
          {/* wordmark hides below 1300 (not 1210 with the labels): between 1210 and ~1300 it
                  wrapped to two lines and grew the bar (review finding) */}
              <span className="font-semibold tracking-[-0.01em] text-title whitespace-nowrap max-[1299px]:hidden">
            <span className={live ? "text-foreground" : "text-muted-foreground opacity-70"}>DAG</span>{" "}
            <span className={cn("text-muted-foreground", !live && "opacity-70")}>Visualizer</span>
          </span>
        </div>
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

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
            "max-[1099px]:min-h-11",
            "max-[699px]:p-1.5 max-[699px]:gap-[5px]",
          )}
        >
          {/* The "FILTER" text label on wide bars; on the condensed breakpoints (≤940px) it
              simply hides — the identity dot + network name ARE the control's face there (the
              lucide funnel stand-in was tried and removed: too busy, and it crowded the phone
              bar off-balance). */}
          <span className="text-micro tracking-caps uppercase text-muted-foreground max-[940px]:hidden">Filter</span>
          <span
            className="w-[9px] h-[9px] rounded-full flex-none animate-dot-beat motion-reduce:animate-none"
            style={{ background: face.dot }}
          />
          <span className="text-body text-foreground">{face.label}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        </div>

        {/* Flex spacers (tablet/desktop only) — the phone grid's 1fr columns own the spacing. */}
        <div className="flex-1 max-[699px]:hidden" />

        {/* View switch — structural. On phone there's no room for the three non-functional
            "soon" placeholders (Network/Transactions/Staking) — they're dimmed dead weight
            that helped overflow the bar, so phone shows only the 3 working views. Tablet +
            desktop keep all six. */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => { if (v) setMode(v as Mode); }}
          className="flex gap-0.5 max-[699px]:gap-0"
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
                "max-[1099px]:min-h-11 max-[1099px]:min-w-11 max-[1209px]:justify-center",
                "max-[1120px]:px-2 max-[1120px]:py-1.5 max-[1120px]:text-label",
                // Phone keeps the ≥44px touch WIDTH (the min-w-11 above still applies — the old
                // `max-[699px]:min-w-0` override made the icon-only radios too narrow to press);
                // only the padding condenses. Room is fine: phone shows just the 3 working views.
                "max-[699px]:p-1.5",
                "soon" in v && v.soon && "opacity-45",
              )}
            >
              <Icon aria-hidden className="size-4 group-data-[state=on]:text-primary" />
              <span className="text-label max-[1209px]:hidden">{v.name}</span>
            </ToggleGroupItem>
          );
          })}
        </ToggleGroup>

        <div className="flex-1 max-[699px]:hidden" />

        {/* RIGHT zone (phone grid): vitals. Mirrors the left zone (`contents` above 700px);
            `justify-self-end` pins it to the bar's right edge in the grid. */}
        <div className="contents max-[699px]:flex max-[699px]:items-center max-[699px]:gap-1.5 max-[699px]:justify-self-end">
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

        {/* Vitals — inline on tablet/desktop; a toggle button on phone that expands the bar's
            own vitals ROW below (the old floating popover read as an afterthought). */}
        <Vitals />
        {bp === "phone" && (
          <VitalsToggle open={phoneVitals} onClick={() => setPhoneVitals(!phoneVitals)} />
        )}
        </div>
      </div>

      {/* FILTER STRIP — the bar GROWS DOWNWARD by one row on its own surface (the same
          grid-rows collapse as the phone vitals row below): every network as a hoverable/
          clickable chip, so the SCENE previews the selection live while browsing (user,
          2026-07-12 — this replaces the detached popover, whose glass covered the scene).
          Picking keeps the strip open (exploring several networks in a row is the point);
          the FILTER button or Escape closes it. */}
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
            <FilterPicker />
          </div>
        </div>
      </div>

      {/* PHONE vitals row — the bar GROWS DOWNWARD by one full-width row on its own surface,
          showing the active view's vitals horizontally in the same key/value language as
          desktop (`VitalsCluster`, whose content swaps per view). Open/closed is a USER CHOICE
          persisted in the store (`phoneVitals`) — it survives view switches until explicitly
          collapsed for scene space. Calm grid-rows height transition (~0.25s; reduced motion →
          instant). The below-bar view caption is a flow sibling of the bar, so it rides down
          with the expansion automatically. */}
      {bp === "phone" && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none",
            phoneVitals ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          aria-hidden={!phoneVitals}
        >
          <div className="overflow-hidden min-h-0">
            <div className="flex items-center justify-center gap-2 mx-2 px-2 pb-2 pt-1.5 border-t border-border/60">
              <VitalsCluster align="center" />
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Selected-view label — only on the icon-only breakpoints (<1210px, where the switch
          drops its text labels — raised from 1100 when the live vitals figures grew a digit
          and the LABELED switch stopped fitting beside them, clipping the bar; user bug):
          the ACTIVE view's name as a quiet caption HANGING BELOW the
          bar, anchored under its right corner (user refinement — the centered in-bar second row
          read misaligned with the bar's buttons). Lives OUTSIDE the bar surface (a sibling in
          the fixed wrapper, so the bar's overflow-hidden can't clip it) and keeps the muted
          eyebrow language + keyed roll-in on view change (the HUD grammar). Decorative echo of
          the radiogroup's own accessible state, so aria-hidden; non-interactive (the wrapper's
          pointer-events-none passes scene clicks through the caption strip). */}
      <div className="hidden max-[1209px]:flex justify-end pr-2.5 mt-1.5" aria-hidden>
        <span key={mode} className="roll-in text-micro tracking-caps uppercase text-muted-foreground leading-none">
          {VIEWS.find((v) => v.id === mode)?.name}
        </span>
      </div>
      </div>
    </div>
  );
}
