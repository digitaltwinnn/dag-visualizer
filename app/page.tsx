import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
import ExperimentalBanner from "@/components/ExperimentalBanner";
import TopBar from "@/components/TopBar";
import BottomStream from "@/components/BottomStream";
import ExploreRail from "@/components/ExploreRail";
import Inspector from "@/components/Inspector";
import PhoneDockSweep from "@/components/PhoneDockSweep";
import RailScroll from "@/components/RailScroll";
import FollowController from "@/components/FollowController";
import RawSnapshotBridge from "@/components/RawSnapshotBridge";
import Tooltip from "@/components/Tooltip";
import SectionShell from "@/components/SectionShell";
import DataSection from "@/components/DataSection";

// Single-page shell in TWO LAYERS (spec 2026-08-01): SectionShell carries the fixed scene shell
// (the canvas in its own `scene` slot, since it recedes rather than hides, + the HUD as children)
// and the per-view raw data table, which surfaces out of the scene's depth when the command bar's
// RAW switch is flipped. The live/time lane is passed as its own `strip` slot so it belongs to
// neither pose and stays interactive in both. TopBar + the banner stay OUTSIDE the shell (fixed to
// the real viewport, visible in both poses), as do the non-visual bridges and the pointer-anchored
// Tooltip (a transformed ancestor would re-anchor its fixed positioning).
export default function Home() {
  return (
    <main>
      <ExperimentalBanner />
      <TopBar />
      <SectionShell scene={<SceneCanvas />} raw={<DataSection />} strip={<BottomStream />}>
        <Blueprint />
        <BootOverlay />
        <ExploreRail />
        <Inspector />
        <PhoneDockSweep />
        <RailScroll />
      </SectionShell>
      <DataBridge />
      <FollowController />
      <RawSnapshotBridge />
      <Tooltip />
    </main>
  );
}
