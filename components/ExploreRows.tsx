"use client";

// Shared explorer ROW primitives — the chrome both the Geography and Hypergraph explorers
// render identically (extracted 2026-07-12; the two files had ~identical row JSX). Each owns
// only the visual chrome; the parent supplies behaviour via callbacks + content via children,
// so the two explorers can't drift on row styling.
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SELECTED_ROW, SelectedRowMark, selectedRow, selectionHue } from "@/components/selection";
import { subjectPairing } from "@/components/useSubjectPairing";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { shortHash, CORE_HEX } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import type { NodeRow } from "@/src/data/types";

// The ONE explorer-row RIGHT-EDGE contract (2026-08-01, user: "explorer dropdown rows
// misaligned on the right edge when hover/selected; the snapshot view's top rows too"). Every
// row in every explorer, at every nesting depth, must end on the SAME vertical — the row box is
// invisible at rest, so a mismatch only surfaces when a hover/selected wash paints it, which is
// exactly when it reads as a bug. Three depths had drifted into three different edges: the
// top-level rows outset ±6px past the card body's padding, `DisclosureRow` hand-rolled a
// +6px-right calc to match them, and the leaf picker/lane rows (plain `w-full`) stopped 6px
// short — while the ledger's floor rows carried no outset at all and sat 6px inside geo/hyper's.
//
// The rule now: the OUTSET is owned by two places only — the top-level row (`ROW_OUTSET`) and
// the level-1 dropdown container (`ROW_NEST`) — and every row inside a container is a plain
// `w-full`, inheriting the edge instead of re-deriving it. Nested containers BELOW level 1 must
// NOT re-apply `ROW_NEST`'s negative margin (it would compound to +12px); they only indent.
export const ROW_OUTSET = "w-[calc(100%+12px)] -mx-1.5 pl-1.5 pr-2";
// The level-1 dropdown container: indents its rows from the left with the hairline rule, and
// extends 6px right so its `w-full` children reach the top-level row's edge. `pr-2` on the rows
// themselves then puts every trailing ✓/chevron in one column across depths.
export const ROW_NEST = "-mr-1.5 border-l border-border";

// Stable no-op for a DisclosureRow rendered without the group-pairing channel (the ledger's
// floor/lane rows) — a fresh arrow each render would be a new `set` every time.
const NO_PAIR = () => {};

// The ONE disclosure-chevron affordance, used by every explorer row that expands/collapses
// (extracted 2026-07-18 from DisclosureRow, its original/canonical treatment — a ledger fix had
// hand-copied it and dropped the hover-reveal, the exact drift a shared component prevents):
// invisible at rest, EASES IN over 150ms on row hover/focus (always visible on touch, no hover to
// reveal it — the house signal language is calm/faded, never an instant snap, 2026-07-18: geo/
// hyper's rows used to fade via `transition-opacity` while DisclosureRow's own chevron only had
// `transition-transform`, so the extraction had briefly made the fade instant everywhere; both
// opacity AND transform are now transitioned so the reveal eases in AND the open-rotation animates,
// in every consumer), rotates 90° while open. CONTRACT: the consuming row must carry the
// (unscoped) `group` class itself — `group-hover`/`group-focus-visible` below target it — and
// reserve this component's `flex-none` slot in its trailing column (e.g. next to a count) so the
// row's layout doesn't shift when the chevron is invisible.
export function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-3.5 flex-none transition-[opacity,transform] duration-150 motion-reduce:transition-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        open && "rotate-90 opacity-100",
      )}
    />
  );
}

// A single-open DISCLOSURE row (geo's country-cohort, hyper's composition group): the button
// chrome + the trailing affordance (the ✓ when it holds the selection while collapsed, else the
// hover-revealed chevron that rotates when open). `children` = the row's own middle content
// (which should end with an `ml-auto` count so it and the affordance sit right).
// `on` = the row itself is a COMMITTED selection (geo's cohort rung, the country-row idiom) —
// wears the selection mark + the ✓ unconditionally (it wins over `holdsSel`, the collapsed-holds-a-
// selected-node case, when both are true). `focused` says whether that rung is the FINEST committed
// one: the focus rung wears the full mark, a coarser committed rung the ancestor strength
// (`selectedRow`) — see components/useLadderFocus.ts.
//
// GROUP PAIRING (optional, `groupKey` + the `hoverGroup` channel): the same bidirectional
// scene↔HUD coupling `NodePickerRow` has, for the two GROUP rungs — geo's provider cohort and
// hyper's composition group. Their right-rail cards write the same scalar channel, so hovering
// the card lights this row and vice versa (user, 2026-08-02: the metagraph + node cards flashed
// their explorer row, the group cards didn't — one language, no exceptions). Callers keep their
// own `onHoverEnter`/`onHoverLeave` for the member-id glow (`hoverCohort`); the two compose.
// The ledger's floor/lane rows pass no group props, so the pairing stays inert there.
export function DisclosureRow({
  open,
  on,
  focused,
  holdsSel,
  title,
  onToggle,
  previewOnly,
  onHoverEnter,
  onHoverLeave,
  groupKey,
  hoverGroup,
  setHoverGroup,
  hue,
  children,
}: {
  open: boolean;
  on?: boolean;
  focused?: boolean;
  holdsSel: boolean;
  title: string;
  onToggle: () => void;
  /** PREVIEW-ONLY: the row still HOVERS — it keeps its wash and still writes whatever channel its
   *  caller previews on the scene — but it neither opens nor commits (user, 2026-08-10). It is the
   *  row's answer to being out of the committed lens, so it drops the chevron (the affordance is
   *  the promise; there is nothing to open), takes the cursor back to `default`, and mutes its
   *  words a step so the state reads AT REST — the chevron is invisible until hover, so without
   *  the mute an inactive row looks exactly like a live one right up until you click it. Its
   *  identity dot stays at full hue: it did anchor here, and identity is not a state. */
  previewOnly?: boolean;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  groupKey?: string;
  hoverGroup?: string | null;
  setHoverGroup?: (key: string | null) => void;
  hue?: string;
  children: React.ReactNode;
}) {
  const pair = subjectPairing<string>(
    hoverGroup ?? null,
    groupKey ?? null,
    setHoverGroup ?? NO_PAIR,
    hue ?? "var(--primary)",
  );
  return (
    <button
      type="button"
      className={cn(
        "group relative flex items-center gap-2 w-full py-[5px] pl-2 pr-2 my-px rounded-sm border border-transparent bg-transparent text-left text-foreground-dim transition-colors duration-[140ms]",
        "hover:bg-wash-hover",
        previewOnly ? "cursor-default text-muted-foreground" : "cursor-pointer hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        on && selectedRow(focused ?? true),
        pair.paired && pair.className,
      )}
      // The selection follows the subject's identity (selection.tsx · selectionHue): the same
      // hue the pairing already carries re-hues the committed wash/ring; rows without one (a
      // cohort, a country) fall through to the structural cyan tokens.
      style={{ ...((on || holdsSel) ? selectionHue(hue) : undefined), ...pair.style }}
      aria-expanded={previewOnly ? undefined : open}
      aria-disabled={previewOnly || undefined}
      title={title}
      onClick={previewOnly ? undefined : onToggle}
      // Focus mirrors hover 1:1 (2026-08-13): the preview pairing must ride the keyboard route
      // too, or the scene↔HUD language is mouse-only. Same writers, four event props.
      onMouseEnter={() => {
        pair.onMouseEnter();
        onHoverEnter?.();
      }}
      onMouseLeave={() => {
        pair.onMouseLeave();
        onHoverLeave?.();
      }}
      onFocus={() => {
        pair.onFocus();
        onHoverEnter?.();
      }}
      onBlur={() => {
        pair.onBlur();
        onHoverLeave?.();
      }}
    >
      {children}
      {previewOnly ? (
        // The chevron's own reserved slot, kept empty — the DisclosureChevron contract says the row
        // owns this width, and a preview-only row sits directly among live siblings, so dropping it
        // would shift their count column against each other.
        <span aria-hidden className="size-3.5 flex-none" />
      ) : on || (holdsSel && !open) ? (
        <SelectedRowMark className="flex-none" muted={on && focused === false} hue={hue} />
      ) : (
        <DisclosureChevron open={open} />
      )}
    </button>
  );
}

// The leaf PICKER row — "Node <id>" — the terminal subject in both explorers. Computes its own
// identity hue + the scene↔row hover pairing (same in both); the parent supplies the select. The
// hover raises the NODE channel and nothing else (user, 2026-08-02): geo used to preview the
// node's country border here too, so a node hover lit a subject the row isn't about.
export function NodePickerRow({
  row,
  selected,
  hoverNodeId,
  setHoverNodeId,
  onSelect,
}: {
  row: NodeRow;
  selected: boolean;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
  onSelect: () => void;
}) {
  const hoverKey = hoverKeyOf(row.pick);
  const hue = row.pick.kind === "metanode" && row.pick.meta ? identityHudHex(row.pick.meta.id) : CORE_HEX;
  const pair = subjectPairing(hoverNodeId, hoverKey, setHoverNodeId, hue);
  return (
    <button
      className={cn(
        "nb-row relative flex items-center gap-2 w-full py-1 pl-2 pr-7 my-px rounded-sm border border-transparent bg-transparent cursor-pointer text-left text-foreground-dim transition-colors duration-[140ms]",
        "hover:bg-wash-hover hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
        // Always the FULL mark: the node is the finest rung in every ladder, so a selected node
        // row is by definition the focus — it never needs the ancestor strength.
        selected && SELECTED_ROW,
        pair.paired && pair.className,
      )}
      style={{ ...(selected ? selectionHue(hue) : undefined), ...pair.style }}
      title={`${row.label} · ${row.state ?? "—"}`}
      onClick={onSelect}
      onMouseEnter={pair.onMouseEnter}
      onFocus={pair.onFocus}
    >
      {/* Just "Node" + the mono id — the row is a pure picker; the parent row carries the
          composition / place / provider. */}
      <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className="flex-none text-label">Node</span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-label text-muted-foreground">
          {row.id ? shortHash(row.id) : row.label}
        </span>
      </span>
      {selected && <SelectedRowMark className="absolute right-2" hue={hue} />}
    </button>
  );
}
