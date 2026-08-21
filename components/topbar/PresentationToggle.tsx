"use client";

import { Focus, LayoutPanelLeft, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/src/store/store";

// The command bar's trailing PRESENTATION control (user, 2026-08-08 — evolving the separate
// Focus icon + RAW switch into ONE axis): how the view's information is presented, three states
// named for WHICH LAYER OF THE INSTRUMENT LEADS (the house registers — user rejected "cards":
// it named the furniture, not the state; HUD is the project's own word for the info overlay) —
//   · SCENE — just the 3D, browsed freely; both card rails collapse to their threads (the dots
//     remain as the minimized possibility map) and the camera leans in (cameraRig.railsLean);
//   · HUD   — the default four-zone overlay: the info cards over the scene;
//   · RAW   — the data behind the view (SectionShell's depth choreography).
// One segmented control (the view-switch ToggleGroup idiom, same sizing/on-state), sitting
// last-but-one in the bar: it acts on everything to its left, and the NetworkSwitch to its
// right acts on everything INCLUDING this toggle — the right edge escalates in scope (see
// the multi-network design §5). The state derives from the two store
// fields (`section`, `railsHidden`) and each pick writes both deterministically — Escape / the
// raw layer's × still land on whichever scene presentation was active before. The SCENE segment
// is desktop-only (below 1100px the rails are dock sheets); labels condense below 1560px,
// icons + titles carry the names there.
type PresentMode = "scene" | "cards" | "raw";

const ITEMS: { id: PresentMode; name: string; title: string; icon: typeof Focus; desktopOnly?: boolean }[] = [
  { id: "scene", name: "Scene", title: "Scene: just the 3D, rails collapse to their threads", icon: Focus, desktopOnly: true },
  { id: "cards", name: "HUD", title: "HUD: the info cards over the scene", icon: LayoutPanelLeft },
  { id: "raw", name: "Raw", title: "Raw: the data behind the view", icon: Table2 },
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
            title={it.title}
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
