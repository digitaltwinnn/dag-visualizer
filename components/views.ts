import type { Mode } from "@/src/store/store";
import type { LedgerRegister } from "@/src/store/mode";

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
    id: "geo",
    name: "Geography",
    slug: "geography",
    desc:
      "Every Constellation Network validator node on a 3D globe at its real location — explore " +
      "the countries, cities and hosting providers behind the $DAG hypergraph.",
  },
  {
    id: "hyper",
    name: "Hypergraph",
    slug: "hypergraph",
    desc:
      "The Constellation Network's architecture as a living 3D structure: the Global L0 core, " +
      "its validator shells, and every metagraph orbiting with its own layers.",
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
  if (seg === "") return "geo";
  const hit = REGISTER_PATHS[seg];
  if (hit) return hit.mode;
  return MODE_BY_SLUG.get(seg) ?? null;
}

/** THE SNAPSHOTS VIEW'S REGISTER PAGES (2026-11-06; three registers since D6, 2026-11-07): a register
 *  beyond the view's own is a routed PATH, not a view. A register is not a Mode (the switch must not
 *  grow a sixth button), so it lives beside `VIEWS`: the routes, the sitemap, the footer, the title
 *  and the URL bridge read this ONE map, the view switch does not. The Metagraph snapshots register
 *  IS the view (`/snapshots`), so it has no page of its own (null). */
export type RegisterPage = { name: string; slug: string; desc: string };
export const REGISTER_PAGES: Readonly<Record<LedgerRegister, RegisterPage | null>> = {
  snapshots: null,
  // The protocol's split names the two (user, 2026-11-07): a cL1 block holds `transactions`, a dL1
  // block holds data updates.
  blocks: {
    name: "Transaction blocks",
    slug: "blocks",
    desc: "The Constellation Network's block DAG in 3D: every transfer's block built on two before it, accepted into the snapshot chain.",
  },
  data: {
    name: "Data blocks",
    slug: "data-blocks",
    desc: "The Constellation Network's data blocks in 3D: every metagraph snapshot that carried data updates, marked on the snapshot chain as it anchors.",
  },
};

/** The register pages in the switch's order — the routes, the sitemap and the footer list these. */
export const REGISTER_PAGE_LIST: readonly RegisterPage[] = Object.values(REGISTER_PAGES).filter((p): p is RegisterPage => p != null);

/** The Transaction blocks register's page — the name the Briefing's stop says. */
export const BLOCKS_PAGE = REGISTER_PAGES.blocks!;

/** EACH REGISTER'S NAME (user, 2026-11-07: "Since they all converge into snapshots, the control
 *  'snapshots' should be 'metagraph snapshots'"): the switch's halves and the explorer's title. The
 *  VIEW stays "Snapshots"; only its first register is named for what it reads. */
export const REGISTER_NAMES: Readonly<Record<LedgerRegister, string>> = {
  snapshots: "Metagraph snapshots",
  blocks: REGISTER_PAGES.blocks!.name,
  data: REGISTER_PAGES.data!.name,
};

/** The scope a register's line speaks for: everything, the DAG, or one network (its ticker; `plural`
 *  for the unlisted set, which is several). */
export type RegisterLineScope = "all" | "dag" | { ticker: string; plural?: boolean };

/** WHERE THE REGISTER'S SUBJECT SITS IN A GLOBAL SNAPSHOT, one subtle line under the switch (user,
 *  2026-11-19: "how can we have uniform consistent naming for the three sections … add an extra subtle
 *  hint line to explain accepted vs stored vs anchored"; then "I feel something is out of balance";
 *  then "can we make the text specific to the filter? … no 'or' in the text anymore but perhaps 'into
 *  metagraph snapshot and then global snapshot'"). The balance is the protocol's, so every line has
 *  ONE shape — whose layer made it, its verb, where it lands, in the order it lands — rather than
 *  pretending three equals: a metagraph snapshot is the L0's output, the container; transaction blocks
 *  (cL1) and data blocks (a metagraph's dL1) are what the snapshots hold. Under a filter the line names
 *  the network and its own path. The verbs are the app's own: ANCHORED (the anchor log), ACCEPTED
 *  (Constellation's term for a block in a snapshot), CARRIED (the Global card's "Carried N data
 *  blocks"). The DAG's own snapshots carry no data blocks — the band's words for it. */
export function registerLine(register: LedgerRegister, scope: RegisterLineScope, runs = true): string {
  if (!runs) return registerAbsence(register, scope);
  if (scope === "all") {
    if (register === "snapshots") return "Each metagraph's L0 snapshots, anchored into the global snapshot";
    if (register === "blocks") return "The DAG's cL1 blocks accepted into the global snapshot, a metagraph's into its snapshot first";
    return "Each metagraph's dL1 blocks, carried in its snapshot into the global snapshot";
  }
  if (scope === "dag") {
    if (register === "snapshots") return "The DAG's L0 makes the global snapshots the metagraphs anchor into";
    if (register === "blocks") return "The DAG's cL1 blocks, accepted into the global snapshot";
    return "The DAG's own snapshots carry no data blocks";
  }
  const whose = scope.plural ? `${scope.ticker}'` : `${scope.ticker}'s`;
  const its = scope.plural ? "their metagraph snapshots" : "its metagraph snapshot";
  if (register === "snapshots") return `${whose} L0 snapshots, anchored into the global snapshot`;
  if (register === "blocks") return `${whose} cL1 blocks, accepted into ${its} and then the global snapshot`;
  return `${whose} dL1 blocks, carried in ${its} into the global snapshot`;
}

/** THE REGISTER HAS NO SUBJECT UNDER THIS FILTER (user, 2026-11-19 — UP runs no dL1, Digital Evidence
 *  no cL1): ONE sentence, said by the line under the switch, the band, the explorer and RAW alike, and
 *  the register stays where it is (a filter never moves the view). `viewPolicy.registerRuns` decides;
 *  this is only the words. The DAG's keeps the band's own sentence. */
/** A LAYER, NAMED FOR A READER (user, 2026-11-19: "say no currency layer (cL1) and no data layer
 *  (dL1)"): the word for what it does and its code, the one phrase the switch's readings and the
 *  register's sentence share. */
export function layerPhrase(layer: "cl1" | "dl1"): string {
  return layer === "cl1" ? "currency layer (cL1)" : "data layer (dL1)";
}

export function registerAbsence(register: LedgerRegister, scope: RegisterLineScope): string {
  if (scope === "dag" && register === "data") return "The DAG's own snapshots carry no data blocks";
  const who = scope === "all" ? "This network" : scope === "dag" ? "The DAG" : scope.ticker;
  const runs = scope !== "all" && scope !== "dag" && scope.plural ? "run" : "runs";
  if (register === "blocks") return `${who} ${runs} no ${layerPhrase("cl1")}, so it makes no transaction blocks`;
  if (register === "data") return `${who} ${runs} no ${layerPhrase("dl1")}, so it makes no data blocks`;
  return `${who} anchors no snapshots`;
}

/** Paths that name a mode AND a register of it. */
const REGISTER_PATHS: Record<string, { mode: Mode; register: LedgerRegister }> = Object.fromEntries(
  (Object.entries(REGISTER_PAGES) as [LedgerRegister, RegisterPage | null][])
    .filter(([, p]) => p != null)
    .map(([register, p]) => [p!.slug, { mode: "ledger" as Mode, register }]),
);

/** The register a pathname names: the Snapshots view's own `/snapshots` is its first register,
 *  a register page its register, any other path none. */
export function registerForPath(pathname: string): LedgerRegister | null {
  const seg = pathname.replace(/^\/+|\/+$/g, "");
  const hit = REGISTER_PATHS[seg];
  if (hit) return hit.register;
  return modeForPath(pathname) === "ledger" ? "snapshots" : null;
}

/** The path a mode publishes to the address bar — null only for a mode with no slug (none today). */
export function pathForMode(mode: Mode): string | null {
  const v = VIEWS.find((x) => x.id === mode);
  return v?.slug ? `/${v.slug}` : null;
}

/** The path the address bar shows for a mode and, in the Snapshots view, its register. */
export function pathFor(mode: Mode, register: LedgerRegister): string | null {
  const page = mode === "ledger" ? REGISTER_PAGES[register] : null;
  return page ? `/${page.slug}` : pathForMode(mode);
}

/** The name the document title carries for a mode and its register: a register page's own name,
 *  else the view's. */
export function titleNameFor(mode: Mode, register: LedgerRegister): string | undefined {
  const page = mode === "ledger" ? REGISTER_PAGES[register] : null;
  return page?.name ?? VIEWS.find((v) => v.id === mode)?.name;
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
// A view's data belongs to the raw layer through its `viewPolicy.rawSurface` row, never here.
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
