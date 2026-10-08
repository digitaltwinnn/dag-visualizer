"use client";
import { Fragment, useMemo } from "react";
import { useStore } from "@/src/store/store";
import { UNLISTED_ID } from "@/src/data/unlisted";
import { filterToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { identityHudCss } from "@/src/palette/identity";
import { cn } from "@/lib/utils";
import { SELECTED_ROW, selectionHue } from "@/components/selection";
import { IdentityDot } from "@/components/inspector/parts";

// The expanded filter body — a list of NETWORK ROWS on the command bar's own surface (rows since
// 2026-10-08, design A1; chips before that). Originally a horizontal CHIP STRIP (user,
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

  // ONE NETWORK PER ROW (user, 2026-10-08, design A1 — `docs/superpowers/design/2026-10-08-ui-ux-tuning-4/
  // a-filter.html`: the wrapped chips of every width "look unorganized"). Each network is a row —
  // its dot and name on the left, its node count on ONE right edge, the explorer's own row — in a
  // grid of equal columns: one on a phone, as many 300px columns as fit above it, so the one rule
  // serves both tiers. The three groups (networks with nodes, the catalog's without, unlisted) are
  // hairlines across the grid, no captions; the vertical bars went with the chips. Sorted by
  // located desc; THE COMMITTED NETWORK LEADS ITS GROUP so it is on screen without scrolling.
  const rows = useMemo(() => {
    const sorted = [...metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0));
    const i = sorted.findIndex((m) => m.id === filter);
    if (i > 0) {
      const [me] = sorted.splice(i, 1);
      const first = sorted.findIndex((m) => ((m.located ?? 0) === 0) === ((me!.located ?? 0) === 0));
      sorted.splice(first < 0 ? sorted.length : first, 0, me!);
    }
    return sorted;
  }, [metaList, filter]);
  const totalNodes = useMemo(() => rows.reduce((s, m) => s + (m.located ?? 0), 0), [rows]);
  const firstZero = rows.findIndex((m) => (m.located ?? 0) === 0);

  // Re-picking the COMMITTED metagraph deselects back to "all" — the tested table rule. The
  // hover PREVIEW is dropped explicitly: the strip collapses out from under the pointer, so its
  // own mouseleave can't be relied on to clear the channel.
  const pick = (id: string) => {
    applyClickActions(filterToggleActions(id, filter));
    setHoverFilter(null);
    onPicked?.();
  };

  const rowClass = (active: boolean, off: boolean) =>
    cn(
      // The dot centres on the row; name and count share a BASELINE inside their own full-width
      // group (user, 2026-10-03: "the numbers in the filter don't seem to align well with the
      // text" — two faces at two sizes, centred, line up their boxes, not their letters).
      "flex items-center gap-2 min-w-0 h-9 px-2.5 rounded-btn border-0 bg-transparent cursor-pointer",
      "text-left whitespace-nowrap transition-[background] duration-150",
      "hover:bg-wash-hover",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
      // The 44px tap minimum keys on the POINTER, not the width (user, 2026-08-14).
      "pointer-coarse:min-h-11",
      active && SELECTED_ROW,
      off && "opacity-65",
    );
  /** A row's name and count: one full-width baseline group, the count on the right edge. */
  const NAME_COUNT = "flex flex-1 min-w-0 items-baseline justify-between gap-2";
  const Rule = () => <span className="col-span-full h-px bg-border/70 my-0.5" aria-hidden />;

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-2 gap-y-0.5 mx-2 px-1.5 pb-1.5 pt-1 border-t border-border/60",
        // PHONE: one column, about half the screen, the rest scrolls (`.slim-scroll` = the shared
        // slim scrollbar; overscroll-contain keeps the flick off the page). The strip stays a bar
        // expansion, not a takeover.
        "max-[700px]:grid-cols-1 max-[700px]:max-h-[50vh] max-[700px]:overflow-y-auto max-[700px]:overscroll-contain slim-scroll",
      )}
      onMouseLeave={() => setHoverFilter(null)}
    >
      <button
        type="button"
        aria-pressed={filter === "all"}
        className={rowClass(filter === "all", false)}
        onClick={() => pick("all")}
        onMouseEnter={() => setHoverFilter("all")}
      >
        <IdentityDot hue="var(--primary)" />
        <span className={NAME_COUNT}>
          <span className="min-w-0 truncate text-body text-foreground">All</span>
          {/* ONE count like every other row: the node total. Mono: a count is machine data, and these
              print the same node counts the explorer rows print (user, 2026-09-14). */}
          <span className="font-mono text-label text-muted-foreground tabular-nums">{totalNodes}</span>
        </span>
      </button>
      {rows.map((m, i) => {
        const off = (m.located ?? 0) === 0;
        return (
          <Fragment key={m.id}>
            {i === firstZero && i > 0 && <Rule />}
            <button
              type="button"
              aria-pressed={filter === m.id}
              className={rowClass(filter === m.id, off)}
              // The committed row's wash/ring speak the metagraph's own hue (selection.tsx ·
              // selectionHue); "All" and unlisted keep the structural cyan — no single identity.
              style={filter === m.id ? selectionHue(identityHudCss(m.id)) : undefined}
              onClick={() => pick(m.id)}
              onMouseEnter={() => setHoverFilter(m.id)}
            >
              <IdentityDot hue={identityHudCss(m.id)} />
              <span className={NAME_COUNT}>
                <span className="min-w-0 truncate text-body text-foreground">{m.name}</span>
                {/* The count column belongs to the WITH-NODES group alone (user, 2026-08-13): past
                    the rule every count is 0 by construction, so the rule carries that fact once. */}
                {!off && <span className="font-mono text-label text-muted-foreground tabular-nums">{m.located ?? 0}</span>}
              </span>
            </button>
          </Fragment>
        );
      })}
      {/* The UNLISTED channels (user, 2026-08-07): real anchoring state channels absent from the
          public catalog — a first-class filter like any 0-located metagraph. Neutral dot: no
          identity hue can speak for a mixed set. Behind its own rule, with NO count (2026-08-13):
          its machines are unknowable rather than absent, so neither a 0 nor a placeholder is a
          reading — the title carries the fact. */}
      <Rule />
      <button
        type="button"
        aria-pressed={filter === UNLISTED_ID}
        className={rowClass(filter === UNLISTED_ID, true)}
        onClick={() => pick(UNLISTED_ID)}
        onMouseEnter={() => setHoverFilter(UNLISTED_ID)}
      >
        <IdentityDot hue="var(--core)" />
        <span className={NAME_COUNT}>
          <span className="min-w-0 truncate text-body text-foreground italic">unlisted</span>
        </span>
      </button>
    </div>
  );
}
