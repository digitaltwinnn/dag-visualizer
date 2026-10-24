"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import CardHead from "@/components/CardHead";
import { Card } from "@/components/ui/card";
import { EXPLORE_ICON } from "@/components/icons";

// The ONE explorer-card chrome, rendered by `components/explorer/Explorer.tsx` alone since
// 2026-09-26 (every tool card is a description handed to that component; before that the three
// explorers rendered this directly) — extracted (2026-07-18) because the three had drifted on their
// own hand-rolled chrome: the ledger card wore a stray bottom separator geo didn't have, and a
// code review found a stuck-hover bug the chrome should structurally prevent (a row that
// commits a selection can self-unmount under the pointer, so its own `mouseleave` never fires).
// GEO IS THE REFERENCE LOOK (user cited it as correct) — every measurement here is copied
// verbatim from GeoExplore's pre-extraction JSX. The shell owns:
//   - the Card frame (`sig-right` edge signal + the filter-accent spine var, `flex-none` +
//     no inner overflow so the RAIL scrolls, not the card — geo's treatment, now everyone's),
//   - CardHead (panel layout, the `EXPLORE_ICON` mark, the bare "Explore" eyebrow; the +/−
//     collapse it carried left on 2026-10-23 — user: "don't need it"),
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
// file is chrome only — a `components/explorerShell.test.ts` grep asserts every explorer renders
// `<Explorer` and that only `Explorer.tsx` renders this shell, so a future explorer can't
// hand-roll its own chrome silently.
/** The body's horizontal inset, and the bleed a full-width block inside it uses to cancel it (the
 *  explorer's control band and plate foot) — ONE number, `--shell-inset`, set on the shell's root
 *  and read by both utilities, so the pair cannot drift (review, 2026-10-24, twice). Static
 *  strings: Tailwind reads them as written. */
export const SHELL_INSET_VAR = "[--shell-inset:14px]"; // the ONE number, set on the body
export const SHELL_INSET_X = "px-[var(--shell-inset)]";
export const SHELL_BLEED_X = "-mx-[var(--shell-inset)]";

export default function ExplorerShell({
  id,
  title,
  hint,
  onLeave,
  aside,
  children,
}: {
  id: string;
  title: ReactNode;
  // The leading usage-hint line (geo's "hover or click one to see…" copy). `null` renders no
  // hint line at all (GeoExplore's quiet-empty state, which has nothing to browse yet).
  //
  // ⚠️ ONE SHAPE, ALL THREE EXPLORERS (user, 2026-08-12 — "apply this approach consistently"):
  // **what the card holds and its ordering. "Open one for" what the next level down shows.**
  // Both halves are load-bearing. The ordering is a fact about the list the reader can't get any
  // other way (hyper was silently sorted by fleet size and said so nowhere), and the "open one
  // for" half is what makes the row's disclosure worth using — geo named its rows and stopped,
  // so the same gesture was explained in one view and not the other. The second half names the
  // CHILD ROWS, never the leaf two rungs down: geo opens onto cohorts (city × provider), not
  // nodes, and a hint that skips a rung misdescribes the click it exists to explain. The two
  // halves are TWO SENTENCES, not a dash clause — the app-wide plain-writing rule (user,
  // 2026-08-12), stated in full on components/railCards.ts's ghost-hint block.
  hint: ReactNode | null;
  // Container-level hover cleanup — see the file comment. Optional: most explorers' committed
  // rows stay rendered after a click (no self-unmount hazard), so most callers omit it.
  onLeave?: () => void;
  /** Passed to the head's TITLE row, right-aligned (CardHead's panel `aside`) — where the right
   *  rail's cards put theirs. It rode the eyebrow row for a round while the titles were
   *  "X breakdown" and too wide to share the row (2026-09-28). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      asChild
      className={cn("sig-right flex flex-col flex-none gap-0 p-0 [--spine:var(--filter-accent,var(--primary))]", SHELL_INSET_VAR)}
    >
      <aside id={id}>
        <CardHead
          panel
          icon={EXPLORE_ICON}
          title={title}
          eyebrow="Explore"
          aside={aside}
        />
        <div className="flex flex-col">
          {hint != null && (
            <div className={cn("pt-2 pb-1 text-label text-muted-foreground", SHELL_INSET_X)}>{hint}</div>
          )}
          <div className={cn("flex flex-col pt-1.5 pb-2", SHELL_INSET_X)} onMouseLeave={onLeave}>
            {children}
          </div>
        </div>
      </aside>
    </Card>
  );
}
