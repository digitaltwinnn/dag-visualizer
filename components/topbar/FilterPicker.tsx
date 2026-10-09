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

  // CHIPS IN A ROW ABOVE 700px, ROWS IN A COLUMN ON THE PHONE (user, 2026-10-09: "the dropdown
  // makes sense on phone, but in normal and tablet mode keep it as before, just put them after each
  // other horizontally"). Design A1 (2026-10-08) had made every tier a grid of 300px row columns;
  // the chip strip is back for the wide tiers — one chip after another, wrapping, the three groups
  // split by a vertical bar — and the phone keeps the one-column rows under a hairline, half the
  // screen, the rest scrolling. ONE element list wears both: the arms below name the shell's own
  // 700 boundary (CSS trap 8), never two renders of the same networks.
  const rowClass = (active: boolean, off: boolean) =>
    cn(
      // The chip (user, 2026-08-14: tightened one step each — py-1, px-2, gap 6). The dot centres;
      // name and count share a BASELINE inside their own group (user, 2026-10-03: two faces at two
      // sizes, centred, line up their boxes, not their letters).
      "flex items-center gap-1.5 py-1 px-2 min-w-0 rounded-btn border-0 bg-transparent cursor-pointer",
      // The phone's ROW: taller, roomier, the count on the right edge (NAME_COUNT).
      "max-[700px]:h-9 max-[700px]:py-0 max-[700px]:px-2.5 max-[700px]:gap-2",
      "text-left whitespace-nowrap transition-[background] duration-150",
      "hover:bg-wash-hover",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
      // The 44px tap floor on the touch tier (`touch:`, one home).
      "touch:min-h-11",
      active && SELECTED_ROW,
      off && "opacity-65",
    );
  /** A name and its count: one baseline group — beside each other in a chip, the count on the row's
   *  right edge on the phone. */
  const NAME_COUNT = "inline-flex items-baseline gap-1.5 max-[700px]:flex max-[700px]:flex-1 max-[700px]:min-w-0 max-[700px]:justify-between max-[700px]:gap-2";
  /** THE GROUP DIVIDER (user, 2026-08-13: networks with nodes | the catalog's without | unlisted) —
   *  a vertical bar between chips, a hairline across the phone's column. `phone` false draws the bar
   *  alone: the rows carry no rule after "All". */
  const Divider = ({ phone = true }: { phone?: boolean }) => (
    <>
      <span className="w-px self-stretch bg-foreground/25 my-1.5 mx-1 max-[700px]:hidden" aria-hidden />
      {phone && <span className="hidden max-[700px]:block col-span-full h-px bg-border/70 my-0.5" aria-hidden />}
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 mx-2 px-1.5 pb-1.5 pt-1 border-t border-border/60",
        // PHONE: one column, about half the screen, the rest scrolls (`.slim-scroll` = the shared
        // slim scrollbar; overscroll-contain keeps the flick off the page). The strip stays a bar
        // expansion, not a takeover.
        "max-[700px]:grid max-[700px]:grid-cols-1 max-[700px]:gap-x-2 max-[700px]:gap-y-0.5 max-[700px]:max-h-[50vh] max-[700px]:overflow-y-auto max-[700px]:overscroll-contain slim-scroll",
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
      <Divider phone={false} />
      {rows.map((m, i) => {
        const off = (m.located ?? 0) === 0;
        return (
          <Fragment key={m.id}>
            {i === firstZero && i > 0 && <Divider />}
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
      <Divider />
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
