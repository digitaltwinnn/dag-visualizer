import type { Mode } from "@/src/store/store";

// ONE home for the interface's VIEW VOCABULARY: id, user-facing name, and — for the three live
// 3D views — the URL slug and the search-facing copy their route serves. Consumed by the top-bar
// view switch (TopBar), the URL↔mode bridge (RouteSync), the routed pages (app/[view]) and the
// doc pages' shared header (SiteHeader), so a view's name, slug and mark can never disagree
// between the command bar, the address bar and the marketing pages.
//
// The placeholder views deliberately carry NO slug (user decision, 2026-09-04): a shareable link
// to `preview · in development` isn't worth a route, and with `dynamicParams = false` a pushState
// URL that a hard navigation would 404 on is worse than no URL at all. Switching to a placeholder
// view leaves the address bar where it was.
//
// The type-only Mode import erases at compile (the aboutCopy precedent), so server pages can
// import this module without dragging the store into their bundle.
export type ViewDef = {
  id: Mode;
  name: string;
  /** URL slug (`/hypergraph`), only for routed views. */
  slug?: string;
  /** Search-facing description for the routed view's metadata. */
  desc?: string;
  soon?: true;
};

export const VIEWS: readonly ViewDef[] = [
  {
    id: "hyper",
    name: "Hypergraph",
    slug: "hypergraph",
    desc:
      "The Constellation Network's architecture as a living 3D structure: the Global L0 core, " +
      "its validator shells, and every metagraph orbiting with its own layers.",
  },
  {
    id: "geo",
    name: "Geography",
    slug: "geography",
    desc:
      "Every Constellation Network validator node on a 3D globe at its real location — explore " +
      "the countries, cities and hosting providers behind the $DAG hypergraph.",
  },
  {
    id: "ledger",
    name: "Snapshots",
    slug: "snapshots",
    desc:
      "Live snapshot anchoring in 3D: watch each metagraph seal its ledger and anchor it into " +
      "the Constellation Network's global snapshots as they happen.",
  },
  { id: "status", name: "Network", soon: true },
  { id: "transactions", name: "Transactions", soon: true },
  { id: "staking", name: "Staking", soon: true },
];

/** The routed subset, in switch order — the pages under app/[view] and the sitemap read this. */
export const ROUTED_VIEWS = VIEWS.filter((v): v is ViewDef & { slug: string; desc: string } => v.slug != null);

const MODE_BY_SLUG = new Map<string, Mode>(ROUTED_VIEWS.map((v) => [v.slug, v.id]));

/** The mode a pathname names: `/` is the default view, a routed slug its view, anything else null. */
export function modeForPath(pathname: string): Mode | null {
  const seg = pathname.replace(/^\/+|\/+$/g, "");
  if (seg === "") return "hyper";
  return MODE_BY_SLUG.get(seg) ?? null;
}

/** The path a mode publishes to the address bar — null for the routeless placeholder views. */
export function pathForMode(mode: Mode): string | null {
  const v = VIEWS.find((x) => x.id === mode);
  return v?.slug ? `/${v.slug}` : null;
}

/** The document title a view carries once the app is past first load (RouteSync + route metadata). */
export function viewTitle(name: string): string {
  return `${name} — DAG Visualizer`;
}
