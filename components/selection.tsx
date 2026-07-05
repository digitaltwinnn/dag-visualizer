import { cn } from "@/lib/utils";

// The ONE committed-selection language for LIST ROWS (user-agreed: the filter picker's design,
// shared by every row list — the picker's committed metagraph, GeoExplore's selected node row,
// its drilled country row). Mirrors the view switch's on-state (`--sel-bg` wash + a 1px inset
// `--sel-border` ring) so "this is the active one" reads identically across the HUD.
//
// Both layers ride ONE box-shadow (the ring + a full-bleed inset wash) instead of `background`/
// `border` on purpose: the TRANSIENT states a selected row must compose with are background-based
// (cmdk's `data-[selected=true]` cursor wash, the identity-hued `.nb-row.subject-paired` hover
// pairing), and box-shadow is an independent property — cursor/pairing tint under the mark, and
// the selection returns untouched when they leave. A `background` recipe would either vanish
// under them (specificity) or fight them (one property).
export const SELECTED_ROW =
  "text-foreground shadow-[inset_0_0_0_1px_var(--sel-border),inset_0_0_0_9999px_var(--sel-bg)]";

// The deliberate glyph cue that makes the mark unmistakably "selected" (not a stray hover): a
// monochrome ✓ in the accent — the same treatment as the view switch's on-glyph (text-primary).
// Rows RESERVE the trailing slot (`pr-7` on every row) and the mark renders absolutely inside it
// (`right-2`), the stock shadcn SelectItem pattern — so counts/status stay column-aligned and
// nothing shifts when the selection moves.
export function SelectedRowMark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[12px] leading-none text-primary", className)} aria-hidden>
      ✓
    </span>
  );
}
