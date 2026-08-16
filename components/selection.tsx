import type { CSSProperties } from "react";
import { Check } from "lucide-react";
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
// The ONE glass container for scene-anchored labels (user, 2026-08-15 — "align the hover and
// the click card"): the hover Tooltip and the subject callout are the same species — HUD glass
// tied to a scene subject — so they share one surface recipe. Identity never tints the frame; it
// lives on the content (the hued ticker), the anchor ring and the `.edge-spine`. Lives HERE
// (beside SELECTED_ROW, the shared-recipe home) rather than in SceneCallout so the server-side
// /design page can render the specimen — a string export cannot cross a "use client" boundary.
export const SCENE_GLASS =
  "rounded-[10px] border border-border px-3 py-2 backdrop-blur-[8px] bg-[var(--panel-solid)]";

export const SELECTED_ROW =
  "text-foreground shadow-[inset_0_0_0_1px_var(--sel-border),inset_0_0_0_9999px_var(--sel-bg)]";

// The ANCESTOR strength of the same mark (2026-08-02, the facts rail's hierarchy redesign carried
// into the explorer): a committed row whose rung is no longer the FOCUS — a drilled country under
// a committed provider, a network under a composition group, a floor under a selected node — keeps
// the ✓ and the ring, at a fraction of the voice. Without it a drill-down list ends up showing
// three equally loud selections and none of them reads as "you are here". Same two inset layers,
// so it composes with the cursor/pairing washes exactly like the full-strength mark; the row's own
// rest text colour is left alone (only the focused row brightens to `text-foreground`).
export const SELECTED_ROW_ANCESTOR =
  "shadow-[inset_0_0_0_1px_var(--sel-border-dim),inset_0_0_0_9999px_var(--sel-bg-dim)]";

/** The committed-row mark at the strength this rung has earned — full for the focus rung, the
 *  ancestor strength for a coarser committed one. The ONE place callers choose between them. */
export function selectedRow(focused: boolean): string {
  return focused ? SELECTED_ROW : SELECTED_ROW_ANCESTOR;
}

/** THE SELECTION FOLLOWS THE SUBJECT'S IDENTITY (user, 2026-08-13 — "once the row is selected
 *  it's still cyan; should be metagraph color… in general if we know the metagraph use those
 *  colors"). The mark's GEOMETRY stays the one language above — wash, 1px inset ring, ✓ — and
 *  only its hue moves: this returns element-scoped overrides of the four selection tokens at the
 *  SAME alphas the cyan tokens carry (globals.css: 0.12 / 0.5 / 0.05 / 0.22), so a hued mark and
 *  the cyan one read as the same state at the same weight. Callers pass the hue exactly where
 *  their hover pairing already knows it; no hue (a country, a cohort, a global tick, "All")
 *  falls through to the tokens' own structural cyan — identity never gets invented. */
export function selectionHue(hue?: string | null): CSSProperties | undefined {
  if (!hue) return undefined;
  return {
    "--sel-bg": `color-mix(in oklch, ${hue} 12%, transparent)`,
    "--sel-border": `color-mix(in oklch, ${hue} 50%, transparent)`,
    "--sel-bg-dim": `color-mix(in oklch, ${hue} 5%, transparent)`,
    "--sel-border-dim": `color-mix(in oklch, ${hue} 22%, transparent)`,
  } as CSSProperties;
}

// The deliberate glyph cue that makes the mark unmistakably "selected" (not a stray hover): a
// monochrome Check (lucide) in the accent — the same treatment as the view switch's on-glyph
// (text-primary). Rows RESERVE the trailing slot (`pr-7` on every row) and the mark renders
// absolutely inside it (`right-2`), the stock shadcn SelectItem pattern — so counts/status stay
// column-aligned and nothing shifts when the selection moves.
// `muted` is the ✓'s half of the ANCESTOR strength above: on a coarser committed rung the check
// still says "committed" but stops competing with the focus row's own mark.
export function SelectedRowMark({ className, muted, hue }: { className?: string; muted?: boolean; hue?: string | null }) {
  return (
    <Check
      className={cn("size-3.5", muted ? "text-primary/55" : "text-primary", hue && muted && "opacity-55", className)}
      // The ✓ rides the same identity rule as the wash (selectionHue) — inline hue where the
      // subject has one, the accent otherwise; `muted` keeps its half-voice via opacity.
      style={hue ? { color: hue } : undefined}
      aria-hidden
    />
  );
}
