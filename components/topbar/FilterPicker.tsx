"use client";
import { Fragment, useMemo } from "react";
import { useStore } from "@/src/store/store";
import { UNLISTED_ID } from "@/src/data/unlisted";
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
// (setHoverFilter), leaving the strip clears the preview. Picking CLOSES the strip (user,
// 2026-08-02 — a deliberate reversal of the 2026-07-12 "keep it open to browse several
// networks" rule: the hover preview already covers browsing without committing, and the open
// strip pushed the whole layout down over the scene you just filtered). TopBar owns the open
// state, so the close arrives as `onPicked`.
export default function FilterPicker({ onPicked }: { onPicked?: () => void }) {
  const filter = useStore((s) => s.filter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const metaList = useStore((s) => s.metaList);

  const rows = useMemo(
    () => [...metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0)),
    [metaList],
  );
  const totalNodes = useMemo(() => rows.reduce((s, m) => s + (m.located ?? 0), 0), [rows]);
  const mappedCount = useMemo(() => rows.filter((m) => (m.located ?? 0) > 0).length, [rows]);
  // The strip's three KINDS of chip get a divider between them (user, 2026-08-13): networks with
  // plottable nodes, then the catalog's 0-located ones, then unlisted — which is NOT a fourth
  // zero: its machines are unknowable rather than absent, which is why its chip says "—" below
  // and why it sits behind its own divider instead of blending into the zero group.
  const firstZero = rows.findIndex((m) => (m.located ?? 0) === 0);

  // Re-picking the COMMITTED metagraph deselects back to "all" — the tested table rule. The
  // hover PREVIEW is dropped explicitly: the strip collapses out from under the pointer, so its
  // own mouseleave can't be relied on to clear the channel.
  const pick = (id: string) => {
    applyClickActions(filterToggleActions(id, filter));
    setHoverFilter(null);
    onPicked?.();
  };

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
      className={cn(
        "flex flex-wrap items-center gap-1 mx-2 px-1.5 pb-2 pt-1.5 border-t border-border/60",
        // PHONE: the wrapped chips would otherwise fill ~a third of the screen (12 chips at
        // ≥44px tap height wrap to ~7 rows). Cap to ~4 rows and scroll the rest (user,
        // 2026-07-12) — the strip stays a bar expansion, not a takeover. `.slim-scroll` =
        // the shared slim scrollbar; overscroll-contain keeps the flick off the page.
        "max-[699px]:max-h-[192px] max-[699px]:overflow-y-auto max-[699px]:overscroll-contain slim-scroll",
      )}
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
      <span className="w-px self-stretch bg-foreground/25 my-1.5 mx-1" aria-hidden />
      {rows.map((m, i) => {
        const off = (m.located ?? 0) === 0;
        return (
          <Fragment key={m.id}>
            {i === firstZero && i > 0 && (
              <span className="w-px self-stretch bg-foreground/25 my-1.5 mx-1" aria-hidden />
            )}
            <button
              type="button"
              aria-pressed={filter === m.id}
              title={`${m.name}${m.symbol ? ` · ${m.symbol}` : ""}`}
              className={chipClass(filter === m.id, off)}
              onClick={() => pick(m.id)}
              onMouseEnter={() => setHoverFilter(m.id)}
            >
              <IdentityDot hue={hex(m.color)} />
              <span className="text-body text-foreground">{m.name}</span>
              {/* The count column belongs to the WITH-NODES group alone (user, 2026-08-13): past
                  the divider every count is 0 by construction, so the divider carries that fact
                  once and the chips drop the noise. */}
              {!off && <span className="text-label text-muted-foreground tabular-nums">{m.located ?? 0}</span>}
            </button>
          </Fragment>
        );
      })}
      {/* The UNLISTED channels (user, 2026-08-07): real anchoring state channels absent from the
          public catalog — a first-class filter like any 0-located metagraph (committing lands
          geo/hyper in their quiet-empty state, the ledger lights its unlisted lane). Neutral dot:
          no identity hue can speak for a mixed set. Behind its own divider, with NO count
          (2026-08-13): its machines are unknowable rather than absent, so neither a 0 nor a
          placeholder is a reading — the title carries the fact. */}
      <span className="w-px self-stretch bg-foreground/25 my-1.5 mx-1" aria-hidden />
      <button
        type="button"
        aria-pressed={filter === UNLISTED_ID}
        title="Anchoring state channels not in the public catalog — their machines are not knowable here"
        className={chipClass(filter === UNLISTED_ID, true)}
        onClick={() => pick(UNLISTED_ID)}
        onMouseEnter={() => setHoverFilter(UNLISTED_ID)}
      >
        <IdentityDot hue="var(--core)" />
        <span className="text-body text-foreground italic">unlisted</span>
      </button>
    </div>
  );
}
