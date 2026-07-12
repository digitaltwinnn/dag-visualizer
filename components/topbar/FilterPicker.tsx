"use client";
import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { filterToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { hex } from "@/src/util/format";
import { cn } from "@/lib/utils";
import { SELECTED_ROW } from "@/components/selection";
import { IdentityDot } from "@/components/inspector/parts";

// The expanded filter body — a horizontal CHIP STRIP on the command bar's own surface (user,
// 2026-07-12: reversed the 2026-07-04 detached-popover decision — the bar-expansion variant is
// back, because hovering/clicking networks should read against the SCENE reacting live, and the
// popover glass sat on top of it). The bar grows downward by one row (TopBar owns the grid-rows
// collapse); this is just the strip: the `All` chip (dot + label + the mapped-network/node
// tallies), then one chip per network — identity dot + name + located count — SORTED by located
// desc so 0-located metagraphs sink to the end (dimmed with their honest 0, never hidden). The
// committed pick wears the view switch's on-state (SELECTED_ROW wash + ring — chips are
// controls, not list rows, so no trailing ✓); hovering a chip PREVIEWS its dim in the scene
// (setHoverFilter), leaving the strip clears the preview. Picking does NOT close the strip —
// exploring several networks in a row is the point; the FILTER button (or Escape) closes it.
export default function FilterPicker() {
  const filter = useStore((s) => s.filter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const metaList = useStore((s) => s.metaList);

  const rows = useMemo(
    () => [...metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0)),
    [metaList],
  );
  const totalNodes = useMemo(() => rows.reduce((s, m) => s + (m.located ?? 0), 0), [rows]);
  const mappedCount = useMemo(() => rows.filter((m) => (m.located ?? 0) > 0).length, [rows]);

  // Re-picking the COMMITTED metagraph deselects back to "all" — the tested table rule.
  const pick = (id: string) => applyClickActions(filterToggleActions(id, filter));

  const chipClass = (active: boolean, off: boolean) =>
    cn(
      "flex items-center gap-[7px] py-1.5 px-2.5 rounded-btn border-0 bg-transparent cursor-pointer",
      "text-left whitespace-nowrap transition-[background] duration-150",
      "hover:bg-wash-hover",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
      "max-[1099px]:min-h-11",
      active && SELECTED_ROW,
      off && "opacity-45",
    );

  return (
    <div
      className="flex flex-wrap items-center gap-1 mx-2 px-1.5 pb-2 pt-1.5 border-t border-border/60"
      onMouseLeave={() => setHoverFilter(null)}
    >
      <button
        type="button"
        aria-pressed={filter === "all"}
        className={chipClass(filter === "all", false)}
        onClick={() => pick("all")}
        onMouseEnter={() => setHoverFilter("all")}
      >
        <IdentityDot hue="var(--primary)" />
        <span className="text-body text-foreground">All</span>
        <span className="text-label text-muted-foreground tabular-nums">
          {mappedCount} metagraphs · {totalNodes}
        </span>
      </button>
      <span className="w-px self-stretch bg-border/60 my-1.5 mx-1" aria-hidden />
      {rows.map((m) => {
        const off = (m.located ?? 0) === 0;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={filter === m.id}
            title={`${m.name}${m.symbol ? ` · ${m.symbol}` : ""}`}
            className={chipClass(filter === m.id, off)}
            onClick={() => pick(m.id)}
            onMouseEnter={() => setHoverFilter(m.id)}
          >
            <IdentityDot hue={hex(m.color)} />
            <span className="text-body text-foreground">{m.name}</span>
            <span className="text-label text-muted-foreground tabular-nums">{m.located ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
