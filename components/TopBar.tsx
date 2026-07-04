"use client";

import { useEffect, useRef, useState } from "react";
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
  { id: "hyper", label: "◆", name: "Hypergraph" },
  { id: "geo", label: "◍", name: "Geography" },
  { id: "ledger", label: "▦", name: "Snapshots" },
  { id: "status", label: "◉", name: "Network", soon: true },
  { id: "transactions", label: "⇄", name: "Transactions", soon: true },
  { id: "staking", label: "⬢", name: "Staking", soon: true },
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

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const [pop, setPop] = useState<{ left: number; top: number } | null>(null);

  const bp = useBreakpoint();
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const vitalsBtnRef = useRef<HTMLButtonElement>(null);
  const [vitalsPop, setVitalsPop] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Anchor the floating picker under the filter button, just below the bar. Measured so it
    // never depends on the bar's full width (the picker is a compact popover, not a bar expansion).
    // DETACHED on purpose (user decision 2026-07-04): an anchored "drawer" variant (top edge
    // meeting the bar + seam ruler) was tried and rejected — keep the 6px gap + its own surface.
    const bar = document.getElementById("topbar");
    const btn = filterBtnRef.current;
    if (bar && btn) {
      const br = bar.getBoundingClientRect();
      const fr = btn.getBoundingClientRect();
      setPop({ left: Math.round(fr.left), top: Math.round(br.bottom + 6) });
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Same popover pattern as the filter picker: measured + rendered OUTSIDE #topbar so its
  // `overflow: hidden` (and the containing block backdrop-filter creates) can't clip it.
  useEffect(() => {
    if (!vitalsOpen) return;
    const bar = document.getElementById("topbar");
    const btn = vitalsBtnRef.current;
    if (bar && btn) {
      const br = bar.getBoundingClientRect();
      const fr = btn.getBoundingClientRect();
      setVitalsPop({ right: Math.round(window.innerWidth - fr.right), top: Math.round(br.bottom + 6) });
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVitalsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVitalsOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [vitalsOpen]);

  // Vitals aren't shown inline on phone (no room) — closing the toggle when the breakpoint
  // changes away from phone avoids a stray open popover if the viewport is resized.
  useEffect(() => {
    if (bp !== "phone") setVitalsOpen(false);
  }, [bp]);

  const face = filterFace(filter);

  return (
    <div ref={ref}>
      <div
        id="topbar"
        className={cn(
          "fixed top-[39px] inset-x-4 z-40 flex flex-col overflow-hidden",
          "border border-border rounded-lg backdrop-blur-md",
          "bg-[linear-gradient(180deg,rgba(20,26,46,0.82),rgba(10,14,28,0.76))]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.35)]",
          // Structural spine — cyan → blue, ALWAYS this gradient. Signals "this is navigation
          // chrome", never the selected network's identity colour (only the filter dot below
          // carries identity hue).
          "before:content-[''] before:absolute before:left-0 before:top-2.5 before:bottom-2.5",
          "before:w-0.5 before:rounded-full before:opacity-85",
          "before:bg-gradient-to-b before:from-primary before:to-core-l0",
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
          <span className="font-semibold tracking-[-0.01em] text-[14px] max-[1099px]:hidden">
            <span className={live ? "text-foreground" : "text-muted-foreground opacity-70"}>DAG</span>{" "}
            <span className={cn("text-muted-foreground", !live && "opacity-70")}>Visualizer</span>
          </span>
        </div>
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

        {/* Filter (toned, de-nested) */}
        <button
          ref={filterBtnRef}
          className={cn(
            "flex items-center gap-[7px] bg-transparent border-0 cursor-pointer py-1.5 px-2 rounded-[8px]",
            "hover:bg-[rgba(90,140,255,0.10)]",
            open && "bg-[rgba(90,140,255,0.10)]",
            "max-[1099px]:min-h-11",
            "max-[699px]:p-1.5 max-[699px]:gap-[5px]",
          )}
          aria-expanded={open}
          onClick={() => { setOpen((o) => !o); setVitalsOpen(false); }}
        >
          <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground max-[940px]:hidden">Filter</span>
          <span
            className="w-[9px] h-[9px] rounded-full flex-none animate-dot-beat motion-reduce:animate-none"
            style={{ background: face.dot }}
          />
          <span className="text-[13px] text-foreground">{face.label}</span>
          <span className="text-[9px] text-muted-foreground">{open ? "▴" : "▾"}</span>
        </button>

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
          {(bp === "phone" ? VIEWS.filter((v) => !("soon" in v && v.soon)) : VIEWS).map((v) => (
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
                "group flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-[8px]!",
                "text-muted-foreground bg-transparent border-0",
                "hover:text-foreground hover:bg-[rgba(90,140,255,0.10)]",
                "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
                "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
                "max-[1099px]:min-h-11 max-[1099px]:min-w-11 max-[1099px]:justify-center",
                "max-[1120px]:px-2 max-[1120px]:py-1.5 max-[1120px]:text-[12px]",
                "max-[699px]:p-1.5 max-[699px]:min-w-0",
                "soon" in v && v.soon && "opacity-45",
              )}
            >
              <span className="text-[13px] leading-none group-data-[state=on]:text-primary">{v.label}</span>
              <span className="text-[12px] max-[1099px]:hidden">{v.name}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex-1" />
        <span className="w-px self-stretch bg-border my-1 max-[820px]:hidden" />

        {/* Vitals — inline on tablet/desktop; a toggle button on phone (popover rendered
            below, outside #topbar). */}
        <Vitals />
        {bp === "phone" && (
          <VitalsToggle ref={vitalsBtnRef} open={vitalsOpen} onClick={() => { setVitalsOpen((o) => !o); setOpen(false); }} />
        )}
      </div>
      </div>

      {/* Floating vitals popover (phone only) — same pattern as the filter picker: measured
          under its toggle button, rendered outside #topbar so overflow/backdrop-filter can't
          clip it. Reduced-motion: this is a plain conditional mount, no animated reveal. */}
      {vitalsOpen && vitalsPop && (
        <div
          className={cn(
            "fixed z-[41] py-2.5 px-3 border border-border rounded-lg backdrop-blur-[14px]",
            "bg-[linear-gradient(180deg,rgba(20,26,46,0.96),rgba(10,14,28,0.94))]",
            "shadow-[0_14px_40px_-10px_rgba(0,0,0,0.6)]",
          )}
          style={{ right: vitalsPop.right, top: vitalsPop.top }}
        >
          <VitalsCluster vertical />
        </div>
      )}

      {/* Floating filter picker — a compact popover anchored under the filter button (NOT a
          full-width expansion of the bar). Lives outside #topbar so the bar's `overflow: hidden`
          can't clip it; still inside the outer ref so an outside-click closes it. */}
      {open && pop && (
        <div
          className={cn(
            "fixed z-[41] w-[372px] p-1.5 border border-border rounded-lg backdrop-blur-[14px]",
            "bg-[linear-gradient(180deg,rgba(20,26,46,0.96),rgba(10,14,28,0.94))]",
            "shadow-[0_14px_40px_-10px_rgba(0,0,0,0.6)]",
            // Phone: the JS anchors the popover at the filter button's left edge, but a ~372px
            // panel hangs off toward the right on a ~375px screen. Center it and fit the width
            // (overrides the inline `left`; the inline `top` — just below the bar — is kept).
            "max-[699px]:!left-1/2 max-[699px]:right-auto max-[699px]:-translate-x-1/2",
            "max-[699px]:w-[min(372px,calc(100vw-24px))]",
          )}
          style={{ left: pop.left, top: pop.top }}
        >
          <FilterPicker onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
