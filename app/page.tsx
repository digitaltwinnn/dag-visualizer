import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
import ExperimentalBanner from "@/components/ExperimentalBanner";
import TopBar from "@/components/TopBar";
import BottomStream from "@/components/BottomStream";
import ExploreRail from "@/components/ExploreRail";
import Inspector from "@/components/Inspector";
import RailScroll from "@/components/RailScroll";
import FollowController from "@/components/FollowController";
import RawSnapshotBridge from "@/components/RawSnapshotBridge";
import Tooltip from "@/components/Tooltip";

// Single-page shell. The 3D scene is one persistent canvas; views (hyper/geo/ledger)
// and panels are driven by store state. The top command bar (status + filter + view
// switch + view-specific vitals) is one centered capsule.
export default function Home() {
  return (
    <main>
      <SceneCanvas />
      <Blueprint />
      <BootOverlay />
      <ExperimentalBanner />
      <DataBridge />
      <TopBar />
      <ExploreRail />
      <Inspector />
      <RailScroll />
      <BottomStream />
      <FollowController />
      <RawSnapshotBridge />
      <Tooltip />
    </main>
  );
}
