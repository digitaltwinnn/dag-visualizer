"use client";

import { Focus, LayoutPanelLeft, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/src/store/store";

// The command bar's trailing PRESENTATION control (user, 2026-08-08 — evolving the separate
// Focus icon + RAW switch into ONE axis): how the view's information is presented, three states —
//   · SCENE — the 3D scene leads; both card rails collapse to their threads (the dots remain as
//     the minimized possibility map) and the camera leans in (cameraRig.railsDolly);
//   · CARDS — the default four-zone HUD;
//   · RAW   — the raw data layer surfaces under the view (SectionShell's depth choreography).
// One segmented control (the view-switch ToggleGroup idiom, same sizing/on-state), sitting LAST
// in the bar because it acts on everything to its left. The state derives from the two store
// fields (`section`, `railsHidden`) and each pick writes both deterministically — Escape / the
// raw layer's × still land on whichever scene presentation was active before. The SCENE segment
// is desktop-only (below 1100px the rails are dock sheets); labels hide on condensed widths,
// icons + titles carry the names there.
type PresentMode = "scene" | "cards" | "raw";

const ITEMS: { id: PresentMode; name: string; icon: typeof Focus; desktopOnly?: boolean }[] = [
  { id: "scene", name: "Scene", icon: Focus, desktopOnly: true },
  { id: "cards", name: "Cards", icon: LayoutPanelLeft },
  { id: "raw", name: "Raw", icon: Table2 },
];

export default function PresentationToggle() {
  const section = useStore((s) => s.section);
  const railsHidden = useStore((s) => s.railsHidden);
  const setSection = useStore((s) => s.setSection);
  const setRailsHidden = useStore((s) => s.setRailsHidden);
  const mode: PresentMode = section === "data" ? "raw" : railsHidden ? "scene" : "cards";
  const apply = (v: PresentMode) => {
    setSection(v === "raw" ? "data" : "scene");
    if (v !== "raw") setRailsHidden(v === "scene");
  };
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => { if (v) apply(v as PresentMode); }}
      className="flex gap-0.5"
      aria-label="How the information is presented"
    >
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <ToggleGroupItem
            key={it.id}
            value={it.id}
            title={it.name}
            className={cn(
              // The view switch's exact sizing/on-state recipe (see TopBar's note on rounded-btn!).
              "group flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn!",
              "text-muted-foreground bg-transparent border-0",
              "hover:text-foreground hover:bg-wash-soft",
              "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
              "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
              it.desktopOnly && "max-[1099px]:hidden",
            )}
          >
            <Icon aria-hidden className="size-4 group-data-[state=on]:text-primary" />
            {/* Three labelled segments are wide — labels condense away below 1560px (measured:
                they pushed the bar past the viewport at 1500), leaving icons + titles. */}
            <span className="text-micro tracking-caps uppercase max-[1559px]:hidden">{it.name}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
