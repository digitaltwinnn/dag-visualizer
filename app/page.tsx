import SceneCanvas from "@/components/SceneCanvas";
import DataBridge from "@/components/DataBridge";
import StatsHeader from "@/components/StatsHeader";
import BottomStream from "@/components/BottomStream";
import LeftColumn from "@/components/LeftColumn";
import ViewToggle from "@/components/ViewToggle";
import Inspector from "@/components/Inspector";
import FollowController from "@/components/FollowController";
import Tooltip from "@/components/Tooltip";

// Single-page shell. The 3D scene is one persistent canvas; views (hyper/geo/ledger)
// and panels will be driven by store state in later phases.
export default function Home() {
  return (
    <main>
      <SceneCanvas />
      <DataBridge />
      <StatsHeader />
      <ViewToggle />
      <LeftColumn />
      <Inspector />
      <BottomStream />
      <FollowController />
      <Tooltip />
    </main>
  );
}
