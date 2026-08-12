"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";

// The ONE explorer-card chrome, rendered by all three left-rail tool cards (GeoExplore,
// HyperExplore, LedgerPanel) — extracted (2026-07-18) because the three had drifted on their
// own hand-rolled chrome: the ledger card wore a stray bottom separator geo didn't have, and a
// code review found a stuck-hover bug the chrome should structurally prevent (a row that
// commits a selection can self-unmount under the pointer, so its own `mouseleave` never fires).
// GEO IS THE REFERENCE LOOK (user cited it as correct) — every measurement here is copied
// verbatim from GeoExplore's pre-extraction JSX. The shell owns:
//   - the Card frame (`sig-right` edge signal + the filter-accent spine var, `flex-none` +
//     no inner overflow so the RAIL scrolls, not the card — geo's treatment, now everyone's),
//   - CardHead (panel layout, the `EXPLORE_ICON` mark, the bare "Explore" eyebrow, the +/−
//     collapse state — the shell owns `collapsed`, not the caller),
//   - the leading usage-hint line (title-leads-the-card idiom; `hint` is the copy prop — pass
//     `null` to suppress it, e.g. GeoExplore's quiet-empty state),
//   - the padded body: `flex flex-col` + geo's inset (`pt-1.5 px-[14px] pb-2`), whose direct
//     children ARE the explorer's bespoke rows — no extra wrapping div, no trailing separator;
//     the card ends where this body ends.
// The body also carries a container-level `onLeave` hook (`onMouseLeave`) — the structural
// fix for the stuck-hover class of bug: a row can clear its own hover on a plain pointer
// mouseleave, but if a click makes that row (or its whole disclosure) vanish out from under
// the pointer — a committed selection re-filtering the row list — the browser never fires
// that row's mouseleave, and the hover channel it set sticks. The body boundary is the
// backstop every explorer gets for free; a caller with such a hazard passes `onLeave` to
// clear whatever hover channels its rows set (LedgerPanel is the first — see its own comment).
// Explorer-SPECIFIC content (rows, groupings, empty states) is the caller's `children`; this
// file is chrome only — a `components/explorerShell.test.ts` grep asserts all three explorers
// render `<ExplorerShell`, so a future explorer can't hand-roll its own chrome silently.
export default function ExplorerShell({
  id,
  title,
  hint,
  onLeave,
  children,
}: {
  id: string;
  title: ReactNode;
  // The leading usage-hint line (geo's "hover or click one to see…" copy). `null` renders no
  // hint line at all (GeoExplore's quiet-empty state, which has nothing to browse yet).
  //
  // ⚠️ ONE SHAPE, ALL THREE EXPLORERS (user, 2026-08-12 — "apply this approach consistently"):
  // **what the card holds and its ordering — "open one for" what the next level down shows.**
  // Both halves are load-bearing. The ordering is a fact about the list the reader can't get any
  // other way (hyper was silently sorted by fleet size and said so nowhere), and the "open one
  // for" half is what makes the row's disclosure worth using — geo named its rows and stopped,
  // so the same gesture was explained in one view and not the other. The second half names the
  // CHILD ROWS, never the leaf two rungs down: geo opens onto cohorts (city × provider), not
  // nodes, and a hint that skips a rung misdescribes the click it exists to explain.
  hint: ReactNode | null;
  // Container-level hover cleanup — see the file comment. Optional: most explorers' committed
  // rows stay rendered after a click (no self-unmount hazard), so most callers omit it.
  onLeave?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Card
      asChild
      className="sig-right flex flex-col flex-none gap-0 p-0 [--spine:var(--filter-accent,var(--primary))]"
    >
      <aside id={id}>
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title={title}
          eyebrow="Explore"
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div className={cn("flex flex-col", collapsed && "hidden")}>
          {hint != null && (
            <div className="pt-2 px-4 pb-1 text-label text-muted-foreground">{hint}</div>
          )}
          <div className="flex flex-col pt-1.5 px-[14px] pb-2" onMouseLeave={onLeave}>
            {children}
          </div>
        </div>
      </aside>
    </Card>
  );
}
