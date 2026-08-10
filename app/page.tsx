import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
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
