"use client";

import type { CSSProperties, ReactNode } from "react";
import { Plus, Minus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KIND_MARK_CLASS } from "@/components/icons";

// The ONE HUD card header — every rail card leads with this shared grammar so the whole HUD
// reads as one control surface. ONE head ANATOMY on all six cards (user-agreed, Task 13
// follow-up): **eyebrow / title / INSET hairline / body** —
//   • an uppercase role EYEBROW — the bare slot noun ("METAGRAPH" / "NODE" / "SNAPSHOT" /
//     "LAYER"; the "Selected " prefix was dropped, user 2026-07-17 — the populated card now
//     wears the same slot label as its ghost state, selection is evident from the content; the
//     ‹-parent breadcrumb grammar was retired earlier, Task 13 follow-up) or a view tag
//     ("HYPERGRAPH · ABOUT"),
//   • the card's primary TITLE at ONE standard (15px / font-semibold / leading-[1.2]) — the
//     panel title, the dossier's metagraph name, the node id (mono, via a styled `title` node),
//     the snapshot ordinal (its Odometer owns the roll). Pass `titleKey` to key the `roll-in`
//     remount on a subject change (synced with the edge pulse); `aside` renders right-aligned on
//     the title row (the snapshot's live-dot/age, the node's status pill),
//   • an optional leading `icon` (panel layout only) — the kind MARK the detail cards already
//     wear (SnapshotTitle's Layers, GeoLiveTitle's Globe, MetaTitle's avatar): a small lucide glyph
//     ahead of the title, `aria-hidden`, at the SAME 14px/identity-or-structural treatment. Panel
//     cards aren't subject-bound (About/tool cards), so they take the filter accent — the same
//     colour the old per-panel beating dot used — rather than a per-subject hue. Task 23
//     (refine(hud): About + explore card heads join the lucide kind-mark language): this REPLACES
//     the old `before:` beating-dot pseudo that used to lead every panel title — the detail cards
//     never had a dot, just their mark, so a panel head with no `icon` now renders no dot either
//     (consistent with the detail-card anatomy, not a parallel convention).
//   • the INSET hairline under the head — inset by the card's padding on BOTH layouts (the
//     right-card Separator idiom; the old full-width panel border-b is gone). Full-width rules
//     don't exist inside cards anymore: inset = the ONE rule weight (head boundary AND body
//     grouping),
//   • an optional right ACTION — the +/− collapse toggle (rail tool cards) or the × close
//     (inspector/context cards), each keeping its own title/aria semantics.
//
// Still two LAYOUTS, selected by `panel` (kept only for the structural split — padded flex-row
// head with the collapse toggle vs. block-flow head with the absolute ×; behaviour of both
// consumer kinds is unchanged). The title recipe + hairline are shared between them.
const EYEBROW = "text-micro font-bold tracking-[0.1em] uppercase leading-none";
// The ONE title standard every card head uses (panel h2 and inspector h3 alike).
const TITLE = "m-0 text-title font-semibold";

// The right-rail card frame — the ONE definition of the inspector-rail Card composition. It is the
// className you hand to `<Card asChild className={RIGHT_CARD}>`: the Card baseline already supplies
// `ig-panel`, so this only carries the right-rail OVERRIDES on top of it —
//   • a positioned ancestor for CardHead's absolute × (`relative`), shrink-to-content width, and
//     re-enabled pointer events (`#rightcol` is pointer-events:none so gaps click through to the
//     scene);
//   • its identity spine SUPPRESSED (`--spine:transparent`) — the right rail's identity cue is
//     RailThread's spine in the margin, not a per-card one;
//   • the interior spacing restored to the ORIGINAL right-card look (was lost when 05-…css was
//     retired): a flat `18px` pad (overriding the Card baseline's `py-4 pl-5 pr-4`), `min-h-0`, and
//     `flex-none` so an overflowing rail scrolls instead of a card shrinking below its own content
//     and overlapping the card beneath it.
// Re-homes the old `#rightcol > .panel` + `#metapane, .rc-pane` rules (05-inspector / 12-panel).
// (`block` neutralises the Card baseline's `flex flex-col gap-4` so the card's children flow with
// their own margins — as the original block box did — rather than gaining a flex gap between the
// eyebrow and the body.)
export const RIGHT_CARD = "relative block w-auto pointer-events-auto [--spine:transparent] p-[18px] min-h-0 flex-none";

// The UNBOXED ancestor entry — the card-redesign's (2026-08-08) second presentation tier. Only the
// FOCUS rung materializes as a full glass panel; every coarser committed rung sheds its box and
// rests as this quiet one-line entry (eyebrow + title via CardHead's collapsed layout), pinned to
// the thread. `.rail-entry` is a MARKER CLASS the RailThread queries (alongside `.ig-panel`) to
// place its node dots and the depth-reach connectors — rename only with that consumer. The 18px
// horizontal pad matches RIGHT_CARD's flat pad so entry titles align with box content. It wears a
// solid-leaning glass (user, 2026-08-08, twice-strengthened — bare text, then the faint `--panel`
// fill, both fought the bright 3D scene): `--panel-solid` + light blur, NO border/shadow (a border
// would re-box it). The ladder's distance-dim rides `--entry-dim` (set by Inspector's rung
// wrapper) so fill + text fade together — and HOVER lifts the entry (user, 2026-08-08: a hover
// previews the materialization; full expand-on-hover was rejected — it shifts layout under the
// pointer): the dim RELEASES to full luminance AND a small brightness boost rides on top, so
// entries resting at dim 1 (the anchor-adjacent ones — found live: the metagraph-snapshot entry
// had nothing to release) still visibly respond. Click does the actual expand.
const RAIL_ENTRY =
  "rail-entry relative block w-auto pointer-events-auto [--spine:transparent] px-[18px] py-1.5 min-h-0 flex-none rounded-md bg-[var(--panel-solid)] [backdrop-filter:blur(10px)] opacity-[var(--entry-dim,1)] hover:opacity-100 hover:brightness-[1.18] transition-[opacity,filter] duration-150 motion-reduce:transition-none";
// Exported for the LEFT rail's entry-tier cards (AboutView — the collapsed About sheds its box
// into the same grammar, 2026-08-08); the right rail routes through RailPane below.
export { RAIL_ENTRY };

// The ONE right-rail pane frame — every facts-rail pane renders through this switch:
//   • `entry` false → the full glass panel (Card baseline supplies `.ig-panel`; RIGHT_CARD the
//     rail overrides; `.sig-left` the scene-facing signal edge; `animate-card-in` plays the
//     materialize moment on mount — which is exactly the entry→box swap, since RailPane changes
//     the element structure and React remounts the subtree).
//   • `entry` true → the unboxed RAIL_ENTRY above (no glass, no signal edge — the pairing wash
//     has its own `.rail-entry.subject-paired` recipe in globals.css).
// Pairing className/style/handlers ride the outer element in both tiers, so scene↔HUD hover
// pairing survives the swap.
export function RailPane({
  entry = false,
  id,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  entry?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  if (entry) {
    return (
      <aside id={id} className={cn(RAIL_ENTRY, className)} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {children}
      </aside>
    );
  }
  return (
    <Card asChild className={cn(RIGHT_CARD, "sig-left", "animate-card-in motion-reduce:animate-none", className)}>
      <aside id={id} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {children}
      </aside>
    </Card>
  );
}

export default function CardHead({
  eyebrow,
  title,
  titleKey,
  aside,
  subtitle,
  panel = false,
  icon,
  caption,
  collapsed,
  onToggle,
  onClose,
  closeTitle = "Clear selection",
  eyebrowMuted = false,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  // Panel-layout-only leading kind mark — see the anatomy note above. Not used by the inspector
  // layout: those cards fold their icon straight into the `title` node themselves (SnapshotTitle
  // etc.), since their mark is identity/subject-hued rather than the flat filter accent every
  // panel head shares.
  icon?: LucideIcon;
  titleKey?: string | number;
  // Right-aligned companion on the TITLE row (the snapshot's live-dot / relative age, the node's
  // status pill) — the head's aside area, so bodies don't render their own title rows.
  aside?: ReactNode;
  // A SUBTLE one-line subtitle under the title row, above the hairline (the slot owns the
  // standard styling: small/muted/truncated — the node card's demoted id hash). Pass a bare node;
  // a consumer component may render null (e.g. no-location fallback) and the empty block is inert.
  subtitle?: ReactNode;
  panel?: boolean;
  caption?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  // One baseline close label — every dismissible card's × reads "Clear selection" (the default);
  // don't reintroduce per-card variants ("Close" / "Deselect").
  closeTitle?: string;
  // NO SIGNAL: the feed behind this card is unreachable — dim the eyebrow to muted (was
  // `.no-signal .panel-eyebrow`/`.insp-eyebrow`, restored here since the frame owns the eyebrow
  // and the card body's own `.no-signal` wrapper no longer sits as its ancestor).
  eyebrowMuted?: boolean;
}) {
  const rolled =
    titleKey != null ? (
      // `min-w-0 max-w-full` bounds this inline-block wrapper to its parent's width so a long
      // title inside (e.g. a provider's "City · Long Provider GmbH") can actually truncate — an
      // unbounded inline-block shrinks to content and lets the inner `.truncate` overflow the card
      // (surfaced once the ladder lane narrows the deeper cards, 2026-07-19).
      <span key={titleKey} className="roll-in min-w-0 max-w-full">
        {title}
      </span>
    ) : (
      title
    );
  const eyebrowClass = cn(EYEBROW, eyebrowMuted ? "text-muted-foreground" : "text-accent");

  if (panel) {
    const Icon = icon;
    // Collapsible heads follow the WAI-ARIA disclosure pattern: the HEADING wraps a real toggle
    // <button> (aria-expanded), and the button's hit area is stretched over the ENTIRE head row
    // (after:inset-0 against the head's `relative`) — the whole bar is the tap target (≥44px on
    // touch, where hunting for a 20px "−" was the pain point). The +/− stays as the state
    // INDICATOR only: decorative, aria-hidden, brightening on head hover via `group`.
    const toggleable = !!onToggle;
    const titleRow = (
      <>
        {Icon && (
          <Icon
            aria-hidden
            className={KIND_MARK_CLASS}
            style={{ color: "var(--filter-accent, var(--accent))" }}
          />
        )}
        {rolled}
      </>
    );
    return (
      <>
        <div
          className={cn(
            "flex items-start justify-between gap-2 py-[var(--panel-pad-y)] px-[var(--panel-pad-x)]",
            toggleable && "relative group",
          )}
        >
          <div className="flex flex-col gap-[3px] min-w-0">
            {eyebrow && <span className={cn("block", eyebrowClass)}>{eyebrow}</span>}
            <h2 className={cn(TITLE, "inline-flex items-center gap-2 min-w-0")}>
              {toggleable ? (
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  title={collapsed ? "Expand" : "Collapse"}
                  onClick={onToggle}
                  className="appearance-none bg-transparent border-0 p-0 m-0 [font:inherit] text-inherit text-left inline-flex items-center gap-2 min-w-0 rounded-sm focus-visible:outline-1 focus-visible:outline-ring/60 after:absolute after:inset-0 after:cursor-pointer after:content-['']"
                >
                  {titleRow}
                </button>
              ) : (
                titleRow
              )}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-none pt-px">
            {caption != null && (
              <span className="text-micro text-muted-foreground text-right tabular-nums">{caption}</span>
            )}
            {toggleable && (
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-5 h-[18px] leading-none text-muted-foreground group-hover:text-foreground"
              >
                {collapsed ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
              </span>
            )}
          </div>
        </div>
        {/* The head hairline — INSET by the card's padding (the shared rule weight; the old
            full-width border-b is gone). A separate element so the inset doesn't eat the head's
            padding box. */}
        <div className="mx-[var(--panel-pad-x)] border-b border-border" aria-hidden />
      </>
    );
  }

  // Inspector layout — block-flow head inside the card's own padding (RIGHT_CARD p-[18px]), so
  // the hairline is inset by construction. Only the EYEBROW clears the absolute corner controls
  // (they share the card's top edge); the title row sits BELOW them and runs to the content
  // edge, so its aside (status pill, live dot, site link) ends flush with the ×'s glyph and the
  // body's right-aligned columns (user, 2026-07-12 — the 22px title-row clearance double-inset
  // the aside ~40px from the card edge while everything else aligned at ~18px). Right cards are
  // COLLAPSIBLE too (user, 2026-07-12): expanded (the BOX), the +/− rides the eyebrow line and
  // the × floats at the corner. COLLAPSED (the unboxed ENTRY, card-redesign 2026-08-08) the
  // chrome disappears entirely — no ×, no +/− (user: it read as clutter on a one-line entry);
  // the WHOLE entry is one invisible stretched toggle (aria-expanded, sr-only label), so a click
  // anywhere re-materializes it as the box. Deselection of an entry happens by stepping down
  // from the box / clear-all, not per-entry chrome.
  const entryMode = !!collapsed && !!onToggle;
  return (
    <>
      {onClose && !entryMode && (
        <Button
          variant="ghost"
          size="icon-xs"
          title={closeTitle}
          aria-label={closeTitle}
          onClick={onClose}
          className="absolute top-[10px] right-[10px] z-10 size-auto rounded-md py-0.5 px-2 leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
        >
          <X aria-hidden className="size-4" />
        </Button>
      )}
      <div className={cn(onToggle && "relative group")}>
        {entryMode && (
          <button
            type="button"
            aria-expanded={false}
            title="Expand"
            onClick={onToggle}
            className="absolute inset-0 z-[1] appearance-none bg-transparent border-0 p-0 m-0 cursor-pointer rounded-sm focus-visible:outline-1 focus-visible:outline-ring/60"
          >
            <span className="sr-only">Expand</span>
          </button>
        )}
        {(eyebrow || (onToggle && !entryMode)) && (
          <div className={cn("flex items-start justify-between gap-2 mb-2", onClose && !entryMode && "pr-[30px]")}>
            {/* `data-eyebrow` is RailThread's read: on an unboxed ENTRY the thread runs its
                depth-reach connector at the EYEBROW's height (user, 2026-08-08 — the entry's
                vertical centre put the line through the title-row aside's space). */}
            {eyebrow ? <span data-eyebrow="" className={cn("block", eyebrowClass)}>{eyebrow}</span> : <span />}
            {onToggle && !entryMode && (
              // -mt aligns the glyph's centre with the ×'s (the × floats at the card corner,
              // outside this row's flow — measured, not eyeballed).
              <button
                type="button"
                aria-expanded={!collapsed}
                title={collapsed ? "Expand" : "Collapse"}
                onClick={onToggle}
                className="appearance-none bg-transparent border-0 p-0 -mt-[7px] -mb-1 inline-flex items-center justify-center w-5 h-[18px] leading-none text-muted-foreground group-hover:text-foreground rounded-sm focus-visible:outline-1 focus-visible:outline-ring/60 after:absolute after:inset-0 after:cursor-pointer after:content-['']"
              >
                {collapsed ? <Plus className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
              </button>
            )}
          </div>
        )}
        {title != null && (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <h3 className={cn(TITLE, "text-foreground min-w-0")}>{rolled}</h3>
              {/* z-10 lifts the aside (site link) above the head's stretched toggle overlay. */}
              {aside != null && <span className="ml-auto flex-none relative z-10">{aside}</span>}
            </div>
            {subtitle != null && (
              // No leading-none here: the node card's subtitle carries bordered code pills
              // (RoleChips) that need the natural line box — a collapsed line + overflow-hidden
              // clipped their borders.
              <div className="mt-1 text-label text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {subtitle}
              </div>
            )}
          </>
        )}
      </div>
      {title != null && !collapsed && <div className="border-b border-border mt-2 mb-2.5" aria-hidden />}
    </>
  );
}
