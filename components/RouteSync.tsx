"use client";
import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import { modeForPath, pathForMode, viewTitle, VIEWS } from "@/components/views";

// The URL↔mode bridge (2026-09-04): the three 3D views are real routes (/hypergraph, /geography,
// /snapshots) so analytics see per-view traffic and links deep-link — but a view switch must stay
// a pure store write on the ONE persistent canvas. A router navigation between view routes would
// tear down and reboot the WebGL engine (the SiteFooter plain-anchor rule), so this bridge uses
// shallow history writes instead: no navigation, no re-render, no teardown. @vercel/analytics
// patches pushState, so each step still counts as a route view.
//
// Three duties, one component, mounted once in AppShell beside the other non-visual bridges:
//  1. SEED — on mount, read location.pathname and correct the store's default mode. The same
//     late-seed pattern as the NetworkSwitch view handoff (TopBar): SSR and the first client
//     render keep the default so hydration sees no mismatch, and the effect lands before the
//     engine's dynamic import resolves, so the scene boots straight into the routed view.
//  2. PUBLISH — a store subscription pushes the view's path (search string preserved — ?net= and
//     the dev flags ride along) whenever mode changes. Skipped when the URL already says it
//     (the seed's own write) and when the change came from popstate (the loop guard). A
//     placeholder view has no path and leaves the address bar untouched. `/` is only ever the
//     landing URL: it is never pushed back onto the stack.
//  3. RESTORE — popstate maps the pathname back onto setMode, so browser back/forward steps
//     views (view granularity only — the focus ladder deliberately stays out of history).
//
// The document title follows the same beat: pushState doesn't retitle a tab, so the bridge does.
export default function RouteSync() {
  const setMode = useStore((s) => s.setMode);

  useEffect(() => {
    const seeded = modeForPath(location.pathname);
    if (seeded && seeded !== useStore.getState().mode) setMode(seeded);
  }, [setMode]);

  useEffect(() => {
    let fromPop = false;

    const unsub = useStore.subscribe((state, prev) => {
      if (state.mode === prev.mode) return;
      const view = VIEWS.find((v) => v.id === state.mode);
      if (view) document.title = viewTitle(view.name);
      if (fromPop) return;
      const path = pathForMode(state.mode);
      if (path && path !== location.pathname) {
        history.pushState(null, "", path + location.search);
      }
    });

    const onPop = () => {
      const mode = modeForPath(location.pathname);
      if (!mode) return;
      fromPop = true;
      setMode(mode);
      fromPop = false;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      unsub();
      window.removeEventListener("popstate", onPop);
    };
  }, [setMode]);

  return null;
}
