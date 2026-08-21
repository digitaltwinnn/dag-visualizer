import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
import ThemeController from "@/components/ThemeController";
import TopBar from "@/components/TopBar";
import BottomStream from "@/components/BottomStream";
import ExploreRail from "@/components/ExploreRail";
import Inspector from "@/components/Inspector";
import PhoneDockSweep from "@/components/PhoneDockSweep";
import RailScroll from "@/components/RailScroll";
import FollowController from "@/components/FollowController";
import RawSnapshotBridge from "@/components/RawSnapshotBridge";
import Tooltip from "@/components/Tooltip";
import HintTips from "@/components/HintTips";
import SceneCallout from "@/components/SceneCallout";
import DevCssCanary from "@/components/DevCssCanary";
import SectionShell from "@/components/SectionShell";
import DataSection from "@/components/DataSection";
import SiteFooter from "@/components/SiteFooter";

// Single-page shell in TWO LAYERS (spec 2026-08-01): SectionShell carries the fixed scene shell
// (the canvas in its own `scene` slot, since it recedes rather than hides, + the HUD as children)
// and the per-view raw data table, which surfaces out of the scene's depth when the command bar's
// RAW switch is flipped. The live/time lane is passed as its own `strip` slot so it belongs to
// neither pose and stays interactive in both. TopBar stays OUTSIDE the shell (fixed to the real
// viewport, visible in both poses), as do the non-visual bridges and the pointer-anchored Tooltip
// (a transformed ancestor would re-anchor its fixed positioning).
//
// The always-on EXPERIMENTAL banner that used to pin above the bar is GONE (user, 2026-08-09).
// A permanent ribbon spends the scene's top 28px restating one sentence that never changes — the
// instrument should not carry its own disclaimer as furniture. The disclosure moved to /about,
// which now covers it properly, and the command bar's brand mark is the route there.
export default function Home() {
  return (
    <main>
      <TopBar />
      {/* Site chrome, pinned to the real viewport like the bar — the second route to /about and
          the home of the project's own links (user, 2026-08-18). */}
      <SiteFooter />
      <SectionShell scene={<SceneCanvas />} raw={<DataSection />} strip={<BottomStream />}>
        <Blueprint />
        <BootOverlay />
        {/* The subject callout lives INSIDE the shell (user, 2026-08-16 — it painted over the
            rail cards): its z-[5] must compete in the SAME stacking context as the rails' z-10,
            and outside the shell it compared against the whole shell at z-auto instead. The
            shell's transform is IDENTITY at rest (CSS trap 2's load-bearing arrangement), so the
            Engine's canvas-rect coordinates resolve the same fixed box the rails use; during the
            depth transition the shell scales, but the callout has already hidden itself (it only
            renders in the scene pose). */}
        <SceneCallout />
        <ExploreRail />
        <Inspector />
        <PhoneDockSweep />
        <RailScroll />
      </SectionShell>
      <DataBridge />
      <FollowController />
      <RawSnapshotBridge />
      <ThemeController />
      <Tooltip />
      {/* Styled replacement for the native `title` bubble — delegated, so every title= in the
          app inherits the design (user, 2026-08-16). */}
      <HintTips />
      <DevCssCanary />
    </main>
  );
}
