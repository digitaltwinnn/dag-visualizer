"use client";

import { Focus, LayoutPanelLeft, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";

// The command bar's trailing PRESENTATION group — TWO controls since 2026-08-30 (user: "scene
// vs hud [is] a toggle; raw is still separate because that's unrelated"), splitting the one
// 3-state axis of 2026-08-08 back along the store's own seams:
//   · SCENE ⇄ HUD — one two-state toggle over `railsHidden`: the same scene, chrome off/on.
//     Desktop-only as a PAIR (below 1100px the rails are dock sheets and SCENE has no meaning).
//   · RAW — its own pressed toggle over `section`: not a third dressing but a different LAYER
//     (SectionShell's depth choreography, with its own Escape/× exits). Because the two axes are
//     now independent controls, popping out of RAW RESTORES whichever presentation you had —
//     rails hidden or not — instead of flattening onto one.
// The two sit adjacent with no divider, so they still read as one presentation group (the
// 2026-08-08 unification's real complaint was two controls reading unrelated — adjacency keeps
// the pairing, the split keeps the axes honest). Same sizing/on-state recipe as the view switch;
// labels condense below 1650px (measured, see the span note).
const SEG = cn(
  "group flex items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn!",
  "text-muted-foreground bg-transparent border-0",
  "hover:text-foreground hover:bg-wash-soft",
  "data-[state=on]:text-foreground data-[state=on]:bg-[var(--sel-bg)]",
  "data-[state=on]:shadow-[inset_0_0_0_1px_var(--sel-border)]",
);

export default function PresentationToggle() {
  const section = useStore((s) => s.section);
  const railsHidden = useStore((s) => s.railsHidden);
  const setSection = useStore((s) => s.setSection);
  const setRailsHidden = useStore((s) => s.setRailsHidden);
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="How the information is presented">
      {/* SCENE ⇄ HUD — ONE toggle button (user, 2026-08-30, round 2: the two-segment group
          looked identical to the old radio at icon-only widths — "a toggle" means one button
          that flips). It shows the CURRENT presentation and presses on Scene (the non-default,
          chrome-hidden state); the title names what a click does. Stays live while RAW is open:
          it then states (and edits) what the raw layer will return to. */}
      <button
        type="button"
        aria-pressed={railsHidden}
        title={railsHidden ? "Scene: just the 3D — click for the HUD cards" : "HUD: the info cards — click for just the 3D"}
        onClick={() => setRailsHidden(!railsHidden)}
        className={cn(
          SEG,
          "max-[1099px]:hidden",
          railsHidden && "text-foreground bg-[var(--sel-bg)] shadow-[inset_0_0_0_1px_var(--sel-border)] [&>svg]:text-primary",
        )}
      >
        {railsHidden ? <Focus aria-hidden className="size-4" /> : <LayoutPanelLeft aria-hidden className="size-4" />}
        <span className="text-micro tracking-caps uppercase max-[1649px]:hidden">{railsHidden ? "Scene" : "HUD"}</span>
      </button>
      {/* RAW — the layer toggle. aria-pressed, not a radio segment: it pushes a different
          surface in and pops it out, and the pair to its left survives the round trip. */}
      <button
        type="button"
        aria-pressed={section === "data"}
        title="Raw: the data behind the view"
        onClick={() => setSection(section === "data" ? "scene" : "data")}
        className={cn(SEG, section === "data" && "text-foreground bg-[var(--sel-bg)] shadow-[inset_0_0_0_1px_var(--sel-border)] [&>svg]:text-primary")}
      >
        <Table2 aria-hidden className="size-4" />
        <span className="text-micro tracking-caps uppercase max-[1649px]:hidden">Raw</span>
      </button>
    </div>
  );
}
