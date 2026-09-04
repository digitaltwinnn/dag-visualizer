"use client";
import { useEffect } from "react";
import { useStore } from "@/src/store/store";
import {
  DOC_PATHS,
  DOC_TITLES,
  docForPath,
  modeForPath,
  pathForMode,
  viewTitle,
  VIEWS,
} from "@/components/views";

// The URL↔state bridge (2026-09-04, extended for the doc overlay): the three 3D views AND the
// two doc pages are real routes (/hypergraph, /geography, /snapshots, /about, /design) so
// analytics see per-surface traffic and links deep-link — but every in-app change stays a pure
// store write on the ONE persistent canvas. A router navigation would tear down and reboot the
// WebGL engine, so this bridge uses shallow history writes instead: no navigation, no re-render,
// no teardown. @vercel/analytics patches pushState, so each step still counts as a route view.
//
// The address bar states ONE thing: the open doc page if there is one, else the active view
// (`docPage ?? mode` — the same precedence the screen itself has, since the overlay covers the
// scene). Three duties:
//  1. SEED — on mount, correct the store's default mode from the pathname (the late-seed
//     pattern: SSR and the first client render keep the default so hydration sees no mismatch,
//     and the effect lands before the engine's dynamic import resolves). The DOC seed lives in
//     DocLayer, whose `initial` prop is what the route server-rendered — one owner per axis.
//  2. PUBLISH — a store subscription pushes the derived path whenever mode or docPage changes
//     (search string preserved — ?net= and the dev flags ride along), skipped when the URL
//     already says it and when the change came from popstate. A placeholder view has no path
//     and leaves the address bar untouched; `/` is only ever the landing URL.
//  3. RESTORE — popstate maps the pathname back onto the store, so browser back/forward steps
//     views and docs alike (view granularity only — the focus ladder stays out of history).
//
// The document title follows the same beat: pushState doesn't retitle a tab, so the bridge does.
export default function RouteSync() {
  const setMode = useStore((s) => s.setMode);
  const setDocPage = useStore((s) => s.setDocPage);

  useEffect(() => {
    const seeded = modeForPath(location.pathname);
    if (seeded && seeded !== useStore.getState().mode) setMode(seeded);
  }, [setMode]);

  useEffect(() => {
    let fromPop = false;

    const unsub = useStore.subscribe((state, prev) => {
      if (state.mode === prev.mode && state.docPage === prev.docPage) return;
      const view = VIEWS.find((v) => v.id === state.mode);
      document.title = state.docPage ? DOC_TITLES[state.docPage] : view ? viewTitle(view.name) : document.title;
      if (fromPop) return;
      const path = state.docPage ? DOC_PATHS[state.docPage] : pathForMode(state.mode);
      if (path && path !== location.pathname) {
        history.pushState(null, "", path + location.search);
      }
    });

    const onPop = () => {
      const doc = docForPath(location.pathname);
      fromPop = true;
      if (doc) {
        useStore.getState().setDocPage(doc);
      } else {
        const mode = modeForPath(location.pathname);
        // setMode also clears any open doc (the store rule), which is exactly what stepping
        // back from /about to /geography means.
        if (mode) setMode(mode);
        else useStore.getState().setDocPage(null);
      }
      fromPop = false;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      unsub();
      window.removeEventListener("popstate", onPop);
    };
  }, [setMode, setDocPage]);

  return null;
}
