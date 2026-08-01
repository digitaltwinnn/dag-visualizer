"use client";

import { Switch } from "@/components/ui/switch";
import { useStore } from "@/src/store/store";
import { cn } from "@/lib/utils";

// The command bar's trailing RAW switch: the one control that surfaces the raw data layer under
// the current view (SectionShell owns the depth choreography). A Switch, not a chevron — the layer
// is a STATE of the instrument you toggle, not a place you navigate to, and the light/dark-mode
// idiom says that in one glyph (user, 2026-08-01; it replaced the drag/wheel/chevron navigation,
// whose scroll gesture competed with the 3D camera controls). It lives in the COMMAND bar because
// that is the HUD's command scope — it acts on the whole instrument, not on the live/time lane
// (user, 2026-08-01: moved out of the LiveStrip).
//
// Renders in every view — every view has a raw layer, even if the placeholder ones only own an
// honest "in development" line. `section` is UI state, not a selection, so the selection-boundary
// rule doesn't apply here. The "RAW" word hides on the condensed breakpoints exactly like the
// FILTER label does; the accessible name + title carry it there.
export default function RawToggle() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const open = section === "data";
  return (
    <label
      title="Raw data layer"
      className="flex-none flex items-center gap-2 cursor-pointer select-none max-[940px]:gap-1.5"
    >
      <span
        className={cn(
          "text-micro tracking-caps uppercase transition-colors duration-150 motion-reduce:transition-none",
          "max-[940px]:hidden",
          open ? "text-primary" : "text-muted-foreground",
        )}
      >
        Raw
      </span>
      <Switch
        size="sm"
        checked={open}
        onCheckedChange={(next) => setSection(next ? "data" : "scene")}
        aria-label="Show the raw data layer"
      />
    </label>
  );
}
