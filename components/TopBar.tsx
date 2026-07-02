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

  useEffect(() => {
    if (!open) return;
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
    <div id="topbar" ref={ref} className={open ? "open" : ""}>
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
        <button className={"tb-filter" + (open ? " active" : "")} aria-expanded={open}
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

      {open && (
        <div className="tb-expand">
          <FilterPicker onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
