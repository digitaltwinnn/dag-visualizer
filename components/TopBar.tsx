"use client";

import { useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { VIEW_ICONS } from "@/components/icons";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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

  // The filter picker's open state — Radix Popover owns anchoring (under the trigger, +6px),
  // outside-click and Escape now; this is just the controlled flag.
  const [open, setOpen] = useState(false);

  const bp = useBreakpoint();
  // PHONE: whether the bar's vitals ROW is expanded (the bar grows downward — see below).
  // Store-held (session) because it's a user choice that persists across view switches.
  const phoneVitals = useStore((s) => s.phoneVitals);
  const setPhoneVitals = useStore((s) => s.setPhoneVitals);

  const face = filterFace(filter);

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
          "max-[699px]:gap-1.5 max-[699px]:p-2",
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2">
          <EcgMark />
          <span className="font-semibold tracking-[-0.01em] text-title max-[1099px]:hidden">
            <span className={live ? "text-foreground" : "text-muted-foreground opacity-70"}>DAG</span>{" "}
            <span className={cn("text-muted-foreground", !live && "opacity-70")}>Visualizer</span>
          </span>
        </div>
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

        {/* Filter (toned, de-nested) — the trigger of the stock Popover below. Radix anchors the
            picker under this button; the visual face is unchanged. */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className={cn(
              "flex items-center gap-[7px] bg-transparent border-0 cursor-pointer py-1.5 px-2 rounded-btn",
              "hover:bg-wash-soft",
              open && "bg-wash-soft",
              "max-[1099px]:min-h-11",
              "max-[699px]:p-1.5 max-[699px]:gap-[5px]",
            )}
          >
            {/* The control's semantics on every breakpoint: the "FILTER" text label on wide
                bars, swapped for the lucide funnel where the label hides (≤940px) — never both. */}
            <span className="text-micro tracking-caps uppercase text-muted-foreground max-[940px]:hidden">Filter</span>
            <Filter aria-hidden className="size-3.5 flex-none text-muted-foreground hidden max-[940px]:block" />
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
          </PopoverTrigger>
          {/* The picker content — a compact DETACHED popover under the filter button (user
              decision 2026-07-04: 6px gap + its own surface, NOT a bar-expansion drawer; that
              variant was tried and rejected). Same glass recipe as before, now on the stock
              primitive: Radix owns the anchoring (side=bottom/align=start ≈ the old measured
              left-aligned +6px), outside-click, Escape, and focus (it moves focus into the
              content, which lands on the cmdk input — a strict upgrade over the old container,
              which left focus on the button; no fight observed). `avoidCollisions` +
              `collisionPadding` replace the old phone-only centering override (the panel just
              shifts to fit narrow viewports); width caps to the viewport on phone. */}
          <PopoverContent
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              "w-[372px] max-[699px]:w-[min(372px,calc(100vw-24px))] p-1.5 border border-border rounded-lg backdrop-blur-[14px]",
              "bg-[linear-gradient(180deg,rgba(20,26,46,0.96),rgba(10,14,28,0.94))]",
              "shadow-[0_14px_40px_-10px_rgba(0,0,0,0.6)]",
            )}
          >
            <FilterPicker onPick={() => setOpen(false)} />
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

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
                "max-[1099px]:min-h-11 max-[1099px]:min-w-11 max-[1099px]:justify-center",
                "max-[1120px]:px-2 max-[1120px]:py-1.5 max-[1120px]:text-label",
                // Phone keeps the ≥44px touch WIDTH (the min-w-11 above still applies — the old
                // `max-[699px]:min-w-0` override made the icon-only radios too narrow to press);
                // only the padding condenses. Room is fine: phone shows just the 3 working views.
                "max-[699px]:p-1.5",
                "soon" in v && v.soon && "opacity-45",
              )}
            >
              <Icon aria-hidden className="size-4 group-data-[state=on]:text-primary" />
              <span className="text-label max-[1099px]:hidden">{v.name}</span>
            </ToggleGroupItem>
          );
          })}
        </ToggleGroup>

        <div className="flex-1" />
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

        {/* Vitals — inline on tablet/desktop; a toggle button on phone that expands the bar's
            own vitals ROW below (the old floating popover read as an afterthought). */}
        <Vitals />
        {bp === "phone" && (
          <VitalsToggle open={phoneVitals} onClick={() => setPhoneVitals(!phoneVitals)} />
        )}
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

      {/* Selected-view label — only on the icon-only breakpoints (<1100px, where the switch
          drops its text labels): the ACTIVE view's name as a quiet caption HANGING BELOW the
          bar, anchored under its right corner (user refinement — the centered in-bar second row
          read misaligned with the bar's buttons). Lives OUTSIDE the bar surface (a sibling in
          the fixed wrapper, so the bar's overflow-hidden can't clip it) and keeps the muted
          eyebrow language + keyed roll-in on view change (the HUD grammar). Decorative echo of
          the radiogroup's own accessible state, so aria-hidden; non-interactive (the wrapper's
          pointer-events-none passes scene clicks through the caption strip). */}
      <div className="hidden max-[1099px]:flex justify-end pr-2.5 mt-1.5" aria-hidden>
        <span key={mode} className="roll-in text-micro tracking-caps uppercase text-muted-foreground leading-none">
          {VIEWS.find((v) => v.id === mode)?.name}
        </span>
      </div>
      </div>
    </div>
  );
}
