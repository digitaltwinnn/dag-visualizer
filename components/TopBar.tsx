"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { metagraphById } from "@/src/data/network";
import { hex } from "@/src/util/format";
import Vitals from "@/components/topbar/Vitals";
import FilterChips from "@/components/topbar/FilterChips";

// All glyphs are plain monochrome symbols (no emoji) so they respect CSS `color` / the accent.
const VIEWS = [
  { id: "hyper", label: "◆", name: "Hypergraph" },
  { id: "geo", label: "◍", name: "Geography" },
  { id: "ledger", label: "▦", name: "Snapshots" },
  { id: "status", label: "◉", name: "Network" },
  { id: "transactions", label: "⇄", name: "Transactions" },
  { id: "staking", label: "⬢", name: "Staking" },
] as const;

// Resolve the current filter to a display label + dot for the collapsed filter button.
function filterFace(filter: string): { label: string; dot: string } {
  const cfg = metagraphById(filter);
  if (cfg) return { label: cfg.ticker || cfg.name, dot: hex(cfg.color) };
  return { label: "All", dot: "var(--core)" };
}

// The unified top command bar: one centered floating capsule that holds the network
// **status + filter** (left), the **view switch** (center), and the **view-specific
// vitals** (right). Clicking the filter expands the capsule downward into the chip
// grid (one connected surface), so the filter no longer needs a slot in the left rail.
export default function TopBar() {
  const live = useStore((s) => s.live);
  const filter = useStore((s) => s.filter);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the expanded filter on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const face = filterFace(filter);
  const filtered = filter !== "all";

  // The whole bar's accent (`--tb-accent`) follows the selection, so the controls that signal
  // it — the filter pill and the active view button (outline + icon + glow) — all theme to it.
  // A selected core (a metagraph or the DAG) uses its colour; the catch-all **All** has no single
  // colour, so it leaves `--tb-accent` unset and the controls fall back to a neutral default.
  const mgCfg = metagraphById(filter);
  const accent = mgCfg ? hex(mgCfg.color) : null;
  const barAccent: CSSProperties | undefined = accent
    ? ({ ["--tb-accent"]: accent } as CSSProperties)
    : undefined;

  return (
    <div id="topbar" ref={ref} className={open ? "open" : ""} style={barAccent}>
      <div className="tb-row">
        {/* Left: an offline warning (only when down — live is the silent default) + filter */}
        <div className="tb-left">
          {!live && (
            <span className="tb-offline" title="The block-explorer feed is unreachable — data is stale.">
              <span className="tb-offline-dot" />
              No data
            </span>
          )}
          <button
            className={"tb-filter" + (open ? " active" : "")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="tb-filter-k">Filter</span>
            <span className={"tb-filter-pill" + (filtered ? " on" : "")}>
              <span className="tb-filter-dot" style={{ background: face.dot }} />
              {face.label}
            </span>
            <span className="tb-caret">{open ? "▴" : "▾"}</span>
          </button>
        </div>

        {/* Center: view switch */}
        <div className="tb-views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={mode === v.id ? "active" : ""}
              aria-pressed={mode === v.id}
              title={v.name}
              onClick={() => setMode(v.id)}
            >
              <span className="tb-view-icon">{v.label}</span>
              <span className="tb-view-name">{v.name}</span>
            </button>
          ))}
        </div>

        {/* Right: view-specific vitals */}
        <Vitals />
      </div>

      {open && (
        <div className="tb-expand">
          <FilterChips onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
