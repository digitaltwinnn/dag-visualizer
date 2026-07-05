"use client";

import type { ReactNode } from "react";
import { Plus, Minus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { KIND_MARK_CLASS } from "@/components/icons";

// The ONE HUD card header — every rail card leads with this shared grammar so the whole HUD
// reads as one control surface. ONE head ANATOMY on all six cards (user-agreed, Task 13
// follow-up): **eyebrow / title / INSET hairline / body** —
//   • an uppercase role EYEBROW — one simple "Selected <subject>" label ("SELECTED NETWORK" /
//     "SELECTED NODE" / "SELECTED SNAPSHOT"; the ‹-parent breadcrumb grammar was retired, Task 13
//     follow-up) or a view tag ("HYPERGRAPH · ABOUT"),
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
      <span key={titleKey} className="roll-in">
        {title}
      </span>
    ) : (
      title
    );
  const eyebrowClass = cn(EYEBROW, eyebrowMuted ? "text-muted-foreground" : "text-accent");

  if (panel) {
    const Icon = icon;
    return (
      <>
        <div className="flex items-start justify-between gap-2 py-[var(--panel-pad-y)] px-[var(--panel-pad-x)]">
          <div className="flex flex-col gap-[3px] min-w-0">
            {eyebrow && <span className={cn("block", eyebrowClass)}>{eyebrow}</span>}
            <h2 className={cn(TITLE, "inline-flex items-center gap-2 min-w-0")}>
              {Icon && (
                <Icon
                  aria-hidden
                  className={KIND_MARK_CLASS}
                  style={{ color: "var(--filter-accent, var(--accent))" }}
                />
              )}
              {rolled}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-none pt-px">
            {caption != null && (
              <span className="text-micro text-muted-foreground text-right tabular-nums">{caption}</span>
            )}
            {onToggle && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="w-5 h-[18px] p-0 rounded-md leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                title={collapsed ? "Expand" : "Collapse"}
                aria-expanded={!collapsed}
                onClick={onToggle}
              >
                {collapsed ? <Plus aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
              </Button>
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
  // the hairline is inset by construction. The title row clears the absolute × via pr when a
  // close is present.
  return (
    <>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          title={closeTitle}
          aria-label={closeTitle}
          onClick={onClose}
          className="absolute top-[10px] right-[10px] size-auto rounded-md py-0.5 px-2 leading-none cursor-pointer text-muted-foreground hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent"
        >
          <X aria-hidden className="size-4" />
        </Button>
      )}
      {eyebrow && <span className={cn("block mb-2 pr-[22px]", eyebrowClass)}>{eyebrow}</span>}
      {title != null && (
        <>
          <div className={cn("flex items-center gap-2 min-w-0", onClose && "pr-[22px]")}>
            <h3 className={cn(TITLE, "text-foreground min-w-0")}>{rolled}</h3>
            {aside != null && <span className="ml-auto flex-none">{aside}</span>}
          </div>
          {subtitle != null && (
            <div className="mt-1 text-label leading-none text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {subtitle}
            </div>
          )}
          <div className="border-b border-border mt-2 mb-2.5" aria-hidden />
        </>
      )}
    </>
  );
}
