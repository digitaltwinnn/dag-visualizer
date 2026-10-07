import type { Mode } from "@/src/store/store";

// ONE home for the interface's VIEW VOCABULARY: id, user-facing name, and — for the three live
// 3D views — the URL slug and the search-facing copy their route serves. Consumed by the top-bar
// view switch (TopBar), the URL↔state bridge (RouteSync), the routed pages (app/[view]) and the
// footer's view links (FooterViewLinks), so a view's name, slug and mark can never disagree
// between the command bar, the address bar and the footer.
//
// THE PLACEHOLDER HAS A ROUTE TOO: `/soon` (user, 2026-10-03). It was routeless from 2026-09-04 —
// "a shareable link to a preview isn't worth a route" — so switching to it left the address bar on
// the PREVIOUS view's URL: the bar said /trends over the Coming-soon gallery, and a reload or a
// shared link opened History instead (test pass, same day). A URL that names what is on screen is
// worth more than the link's value. It is a real static route like the others (`app/[view]`), so a
// hard navigation lands on it; what it does NOT get is a place in the sitemap or the footer's view
// links, and its page asks not to be indexed — `LISTED_VIEWS` is that narrower list.
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
      "Live snapshot anchoring in 3D: watch each metagraph create its snapshots and anchor them into " +
      "the Constellation Network's global snapshots as they happen.",
  },
  {
    id: "trend",
    name: "History",
    slug: "trends",
    desc:
      "The Constellation Network's measured history in 3D: one chart per metagraph, stacked " +
      "through time, with a shared cursor reading every chain at the same moment.",
  },
  // ONE consolidated entry (user, 2026-09-04): three dimmed dead buttons spent bar width saying
  // the same nothing — the generic soon view's Blueprint gallery names what is coming instead.
  {
    id: "soon",
    name: "Coming soon",
    slug: "soon",
    desc: "What is being built next for the DAG Visualizer, sketched as wireframes.",
    soon: true,
  },
];

/** Every view with a URL, in switch order — the pages under app/[view] and the path↔mode maps. */
export const ROUTED_VIEWS = VIEWS.filter((v): v is ViewDef & { slug: string; desc: string } => v.slug != null);

/** The views worth LISTING — the sitemap and the footer's view links. The placeholder has a URL
 *  but is not a destination anyone should be sent to. */
export const LISTED_VIEWS = ROUTED_VIEWS.filter((v) => !v.soon);

const MODE_BY_SLUG = new Map<string, Mode>(ROUTED_VIEWS.map((v) => [v.slug, v.id]));

/** The mode a pathname names: `/` is the default view, a routed slug its view, anything else null. */
export function modeForPath(pathname: string): Mode | null {
  const seg = pathname.replace(/^\/+|\/+$/g, "");
  if (seg === "") return "hyper";
  return MODE_BY_SLUG.get(seg) ?? null;
}

/** The path a mode publishes to the address bar — null only for a mode with no slug (none today). */
export function pathForMode(mode: Mode): string | null {
  const v = VIEWS.find((x) => x.id === mode);
  return v?.slug ? `/${v.slug}` : null;
}

/** The document title a view carries once the app is past first load (RouteSync + route metadata). */
export function viewTitle(name: string): string {
  return `${name} — DAG Visualizer`;
}

// ── The DOC OVERLAY's half of the vocabulary (2026-09-04) ────────────────────────────────────
// Docs render inside the app as the DocLayer overlay; DOC_PAGES is their ONE registry — slug,
// title — and everything else derives (the DocPage type, the path/title maps, docForPath), so
// adding a doc page is: one entry here, its component in components/docs/ + DocLayer's map, a
// thin route file passing `doc`, and a footer DocToggle if it should be reachable there. The
// engine's bare stage, both transition signals and the roll grammar follow automatically.
//
// ⚠️ A DOC PAGE IS PROSE OVER THE BARE STAGE, AND THE REGISTRY IS ONLY FOR THAT (2026-09-18).
// The Trends document was a third entry until the measured history got a VIEW of its own; it is
// that view's RAW register now (`viewPolicy.rawSurface`, rendered by
// datasection/DocumentSurface), not an overlay. The two flags it needed — `scoped`, which kept
// the command bar's filter up over it, and `routeless`, which gave it no URL of its own — left
// with it: a document reached through RAW keeps the bar's ordinary face by construction, and it
// is its view's URL that the address bar states. Don't reintroduce either for a surface that is
// really a view's second register; give it a policy row instead.
export type DocDef = {
  label: string;
  title: string;
};

export const DOC_PAGES = {
  about: { label: "About", title: "About — DAG Visualizer" },
} satisfies Record<string, DocDef>;

export type DocPage = keyof typeof DOC_PAGES;

/** Every doc page's route — the overlay is a real URL, so the footer and the Pages section can
 *  hand out honest hrefs (middle-click and new-tab keep working). */
export const DOC_PATHS = Object.fromEntries(
  (Object.keys(DOC_PAGES) as DocPage[]).map((k) => [k, `/${k}`]),
) as Record<DocPage, string>;

export const DOC_TITLES = Object.fromEntries(
  (Object.keys(DOC_PAGES) as DocPage[]).map((k) => [k, DOC_PAGES[k].title]),
) as Record<DocPage, string>;

/** The doc page a pathname names, or null — derived from the registry, never a second list. */
export function docForPath(pathname: string): DocPage | null {
  const seg = pathname.replace(/^\/+|\/+$/g, "");
  return seg in DOC_PAGES ? (seg as DocPage) : null;
}
