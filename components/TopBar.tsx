"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Vitals from "@/components/topbar/Vitals";
import FilterPicker from "@/components/topbar/FilterPicker";
import EcgMark from "@/components/topbar/EcgMark";
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

  useEffect(() => {
    if (!open) return;
    // Anchor the floating picker under the filter button, just below the bar. Measured so it
    // never depends on the bar's full width (the picker is a compact popover, not a bar expansion).
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

  const face = filterFace(filter);

  return (
    <div ref={ref}>
      <div id="topbar" className={open ? "open" : ""}>
      <div className="tb-row">
        {/* Brand */}
        <div className={"tb-brand" + (live ? "" : " off")}>
          <EcgMark />
          <span className="tb-word">
            <span className="tb-word-dag">DAG</span>{" "}
            <span className="tb-word-vis">Visualizer</span>
          </span>
        </div>
        <span className="tb-div" />

        {/* Filter (toned, de-nested) */}
        <button ref={filterBtnRef} className={"tb-filter" + (open ? " active" : "")} aria-expanded={open}
          onClick={() => setOpen((o) => !o)}>
          <span className="tb-filter-k">Filter</span>
          <span className="tb-filter-dot" style={{ background: face.dot }} />
          <span className="tb-filter-name">{face.label}</span>
          <span className="tb-caret">{open ? "▴" : "▾"}</span>
        </button>

        <div className="tb-spacer" />

        {/* View switch — structural */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => { if (v) setMode(v as Mode); }}
          className="tb-views"
        >
          {VIEWS.map((v) => (
            <ToggleGroupItem key={v.id} value={v.id} title={v.name}
              className={"tb-view" + ("soon" in v && v.soon ? " soon" : "")}>
              <span className="tb-view-icon">{v.label}</span>
              <span className="tb-view-name">{v.name}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="tb-spacer" />
        <span className="tb-div" />

        {/* Vitals */}
        <Vitals />
      </div>
      </div>

      {/* Floating filter picker — a compact popover anchored under the filter button (NOT a
          full-width expansion of the bar). Lives outside #topbar so the bar's `overflow: hidden`
          can't clip it; still inside the outer ref so an outside-click closes it. */}
      {open && pop && (
        <div className="tb-filter-pop" style={{ left: pop.left, top: pop.top }}>
          <FilterPicker onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
