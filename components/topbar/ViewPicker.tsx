"use client";

import { ABOUT } from "@/components/aboutCopy";
import { VIEW_ICONS } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VIEWS } from "@/components/views";
import { cn } from "@/lib/utils";
import { useStore, type Mode } from "@/src/store/store";

// THE VIEW LIST AS A STRIP TENANT (2026-09-28) — the phone's view switch, opened from the one
// button that stands in the switch's slot below 700px. A segmented control cannot scale: every
// view added cost the phone bar 44px it did not have (History made the row five icons wide and the
// filter button ran under the first tab — the bar's own overflow alarm had been warning about it
// since), and hiding entries per tier is a patch that the next view undoes. So the phone does what
// the bar already did twice: the settings trio folded under one gear (2026-09-08), the filter's
// chips live in the grow-downward strip rather than a popover (2026-07-12). The list is the
// strip's THIRD tenant — filter, pulse, views — mutually exclusive by the same `strip` enum, on the
// bar's own surface, wrapping as the roster grows. Picking a view CLOSES the strip (the filter
// chips' rule): the switch's job is done the moment you commit one.
//
// It is the SAME control as the desktop switch — a single-select radiogroup over `VIEWS` writing
// `setMode` — laid out with room for the names the bar had to drop. The item recipe mirrors the
// bar's switch item (icon, label, the committed-selection on-state), so the two presentations read
// as one control at two tiers; the dimmed soon entry rides along at the weight it has everywhere.
// ONE VIEW PER ROW (user, 2026-10-08, design B1 — the filter strip's A1 rows, so the bar's two
// lists are one control): the view's glyph and name on the left, and on the row's right edge what
// the view is FOR — the About page's own title for it ("How the network is built"), said once
// there and once here rather than a third phrasing.
export default function ViewPicker({ onPicked }: { onPicked?: () => void }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <ToggleGroup
      type="single"
      value={mode}
      aria-label="View"
      onValueChange={(v) => {
        if (!v) return;
        setMode(v as Mode);
        onPicked?.();
      }}
      // The filter strip's own frame (mx/px/pb/pt and the hairline) so the three tenants share one
      // inset; `w-auto flex-col items-stretch` undoes the primitive's `w-fit` single row.
      className="w-auto flex-col items-stretch gap-0.5 mx-2 px-1.5 pb-1.5 pt-1 border-t border-border/60"
    >
      {VIEWS.map((v) => {
        const Icon = VIEW_ICONS[v.id as Mode];
        return (
          <ToggleGroupItem
            key={v.id}
            value={v.id}
            className={cn(
              "group flex w-full items-center justify-start gap-2.5 h-9 py-1.5 px-2.5 rounded-btn!",
              "text-muted-foreground bg-transparent border-0",
              "hover:text-foreground hover:bg-wash-soft",
              "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
              "touch:min-h-11",
              v.soon && "opacity-65",
            )}
          >
            <Icon aria-hidden className="size-4 flex-none group-data-[state=on]:text-primary" />
            <span className="text-body">{v.name}</span>
            <span className="ml-auto min-w-0 truncate text-label text-muted-foreground">{ABOUT[v.id as Mode].title}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
