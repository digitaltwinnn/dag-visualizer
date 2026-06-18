import SceneCanvas from "@/components/SceneCanvas";
import DataBridge from "@/components/DataBridge";
import StatsHeader from "@/components/StatsHeader";
import SnapshotRibbon from "@/components/SnapshotRibbon";
import FilterPanel from "@/components/FilterPanel";
import ViewToggle from "@/components/ViewToggle";
import Inspector from "@/components/Inspector";

// Single-page shell. The 3D scene is one persistent canvas; views (hyper/geo/ledger)
// and panels will be driven by store state in later phases.
export default function Home() {
  return (
    <main>
      <SceneCanvas />
      <DataBridge />
      <StatsHeader />
      <ViewToggle />
      <FilterPanel />
      <Inspector />
      <SnapshotRibbon />
    </main>
  );
}
