import SceneCanvas from "@/components/SceneCanvas";
import Blueprint from "@/components/Blueprint";
import BootFade from "@/components/BootFade";
import BootOverlay from "@/components/BootOverlay";
import DataBridge from "@/components/DataBridge";
import DocGate from "@/components/DocGate";
import DocLayer from "@/components/DocLayer";
import ThemeController from "@/components/ThemeController";
import TopBar from "@/components/TopBar";
import BottomStream from "@/components/BottomStream";
import ExploreRail from "@/components/ExploreRail";
import Inspector from "@/components/Inspector";
import VitalsDock from "@/components/VitalsDock";
import PhoneDockSweep from "@/components/PhoneDockSweep";
import RailScroll from "@/components/RailScroll";
import FollowController from "@/components/FollowController";
import RawSnapshotBridge from "@/components/RawSnapshotBridge";
import RouteSync from "@/components/RouteSync";
import Tooltip from "@/components/Tooltip";
import HintTips from "@/components/HintTips";
import SceneCallout from "@/components/SceneCallout";
import DevCssCanary from "@/components/DevCssCanary";
import SectionShell from "@/components/SectionShell";
import DataSection from "@/components/DataSection";
import SiteFooter from "@/components/SiteFooter";
import type { DocPage } from "@/components/views";

// THE app — one shell, rendered identically by `/`, every routed view page (app/[view]) AND the
// two doc routes (/about, /design pass `doc`, which opens the DocLayer overlay over the live
// scene). The routes differ only in metadata and that seed; which surface is showing is store
// state, seeded and published by RouteSync/DocLayer, so neither a view switch nor opening a
// document ever re-renders this tree or touches the WebGL engine.
//
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
// which now covers it properly.
export default function AppShell({ doc }: { doc?: DocPage }) {
  return (
    <main>
      {/* The staged entrance (useBootStage): command bar on `frame`, rails/dock/footer on
          `data`, vitals band on `live` — the HUD arrives in the data's own order while the
          BootOverlay hands the scene off. Each BootFade is a plain wrapper div (trap-2 safe)
          that also `inert`s its zone while hidden. The DOC overlay is deliberately outside the
          staging: it is content, not an instrument, and shows immediately while the scene forms
          behind it. */}
      <BootFade at="frame">
        <TopBar />
      </BootFade>
      {/* Site chrome, pinned to the real viewport like the bar — the doc overlay's chrome too
          (its toggles live here), so it stays OUTSIDE DocGate. */}
      <BootFade at="data">
        <SiteFooter />
      </BootFade>
      <SectionShell
        scene={<SceneCanvas />}
        raw={<DataSection />}
        strip={
          <BootFade at="live">
            <DocGate>
              <BottomStream />
            </DocGate>
          </BootFade>
        }
      >
        <Blueprint />
        <BootOverlay />
        {/* The subject callout lives INSIDE the shell (user, 2026-08-16 — it painted over the
            rail cards): its z-[5] must compete in the SAME stacking context as the rails' z-10,
            and outside the shell it compared against the whole shell at z-auto instead. The
            shell's transform is IDENTITY at rest (CSS trap 2's load-bearing arrangement), so the
            Engine's canvas-rect coordinates resolve the same fixed box the rails use; during the
            depth transition the shell scales, but the callout has already hidden itself (it only
            renders in the scene pose). */}
        <DocGate>
          <SceneCallout />
        </DocGate>
        <BootFade at="data">
          <DocGate>
            <ExploreRail />
            {/* The phone dock's middle section rides with the rails, not the band: the dock bar
                is one control split in thirds, and a missing middle would read as a broken bar. */}
            <VitalsDock />
            <Inspector />
          </DocGate>
        </BootFade>
        <DocGate>
          <PhoneDockSweep />
        </DocGate>
        <RailScroll />
      </SectionShell>
      {/* The doc overlay — over the canvas and the stood-down HUD, under the bar and footer.
          `doc` is the route's server-rendered seed, so /about's prose is in its HTML. */}
      <DocLayer initial={doc ?? null} />
      <DataBridge />
      <FollowController />
      <RawSnapshotBridge />
      <RouteSync />
      <ThemeController />
      <Tooltip />
      {/* Styled replacement for the native `title` bubble — delegated, so every title= in the
          app inherits the design (user, 2026-08-16). */}
      <HintTips />
      <DevCssCanary />
    </main>
  );
}
