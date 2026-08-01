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
import SectionSlider from "@/components/SectionSlider";
import DataSection from "@/components/DataSection";

// Single-page shell in TWO sections (spec 2026-08-01): SectionSlider carries the whole fixed
// scene shell (canvas + rails — section 1) and the per-view data table (section 2); the
// LiveStrip at section 1's bottom edge is the divider/drag-handle between them, passed as its
// own `divider` slot so it stays interactive while EITHER section is inert (it is the only way
// back up). TopBar + the banner stay OUTSIDE the slider (fixed to the real viewport, visible in
// both sections), as do the non-visual bridges and the pointer-anchored Tooltip (a transformed
// ancestor would re-anchor its fixed positioning).
export default function Home() {
  return (
    <main>
      <ExperimentalBanner />
      <TopBar />
      <SectionSlider dataSection={<DataSection />} divider={<BottomStream />}>
        <SceneCanvas />
        <Blueprint />
        <BootOverlay />
        <ExploreRail />
        <Inspector />
        <PhoneDockSweep />
        <RailScroll />
      </SectionSlider>
      <DataBridge />
      <FollowController />
      <RawSnapshotBridge />
      <Tooltip />
    </main>
  );
}
