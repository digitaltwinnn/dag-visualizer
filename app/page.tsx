import AppShell from "@/components/AppShell";

// The landing route: the app at its default view. The three 3D views are also real routes
// (app/[view] — /hypergraph, /geography, /snapshots) rendering this same shell with per-view
// metadata; in-app view switches move between them by shallow pushState (components/RouteSync),
// never by navigation, so the WebGL engine survives every switch. `/` keeps the layout's own
// SEO metadata and is never pushed back onto the history stack.
export default function Home() {
  return <AppShell />;
}
