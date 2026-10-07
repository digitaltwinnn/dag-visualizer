import { METAGRAPHS } from "@/src/net/current";
import { metagraphById } from "@/src/data/network";

// WHAT THE COMMITTED FILTER DOES TO THE MEASURED HISTORY — ONE HOME (2026-09-19).
//
// The measured history has TWO REGISTERS (convention 12): the History view's stack of chart
// planes and the Trends DOCUMENT behind that view's RAW toggle. Both read the same store, so both
// meet the same four states — every network, one network, and the two commits the trends store
// has nothing for. Those last two are the reason this module exists: the store keys its series
// per LISTED metagraph, so the base ledger (which anchors metagraph snapshots rather than
// producing them) and the unlisted channels (the ones the catalog does not name) genuinely have
// no per-network record here. That is a FACT to state, never an empty list to draw (rule 10).
//
// The two registers were already answering it differently: the document said so in words while
// the stack rendered nothing at all. Sharing the classification AND the sentences is what keeps
// them from drifting again — and the sentences split in two, because the FACT is the same
// wherever it is said while the ROUTE has to name a gesture available on the surface saying it
// (the empty-state rule).
//
// Pure: the catalog is static data and the colocated test is the specification (rule 4 —
// dataExportCoverage enforces the sibling).

/** The four states a committed filter puts the measured history in. */
export type TrendScope = "all" | "network" | "empty-dag" | "empty-unlisted";

/** The scopes with nothing measured to draw. */
export type EmptyScope = Extract<TrendScope, "empty-dag" | "empty-unlisted">;

/** The networks the charts draw under this filter, in catalog order — every catalog metagraph at
 *  "all", the committed one alone under a commit, and NOTHING for the two empty scopes. The
 *  ranking is a separate question (`rankByLast`): this says which chains are in scope at all. */
export function trendRoster(filter: string): string[] {
  return METAGRAPHS.filter((m) => m.id && (filter === "all" || m.id === filter)).map((m) => m.id!);
}

/** Which state the filter puts the view in.
 *
 *  Anything that is not "all" and not a catalog metagraph is an UNLISTED channel: the pseudo
 *  network the chamber's unknown lane commits, and any raw channel address reached the same way.
 *  They differ from the base ledger only in why the catalog does not carry them, which is exactly
 *  what the two sentences below say. */
export function trendScope(filter: string): TrendScope {
  if (filter === "all") return "all";
  if (filter === "dag") return "empty-dag";
  return metagraphById(filter) ? "network" : "empty-unlisted";
}

/** THE SCENE'S ROSTER AND SCOPE (2026-09-26; user: "is the History view the right place to show
 *  the hypergraph data we have?" — it is). The stack draws the HYPERGRAPH'S OWN plane under the
 *  DAG filter, from the global series every other surface already reads (the Moment card's
 *  "across the whole network", the band's overview line, the document's Hypergraph tab), so
 *  the view's roster under "dag" is the one id `dag` and its scope is a network's. Under "all"
 *  the roster stays the metagraphs: a global line one order of magnitude taller in front of the
 *  layers it sums is what the shared scale exists to compare against, not include. The DOCUMENT
 *  keeps `trendRoster`/`trendScope` as they are — its Metagraphs tab has nothing for the DAG and
 *  its Hypergraph tab is the same chart's other register. */
export function stackRoster(filter: string): string[] {
  return filter === "dag" ? ["dag"] : trendRoster(filter);
}
export type ViewScope = Exclude<TrendScope, "empty-dag">;
export function viewScope(filter: string): ViewScope {
  // `trendScope` answers "empty-dag" for "dag" alone, which the branch above takes first.
  return filter === "dag" ? "network" : (trendScope(filter) as ViewScope);
}

/** THE FACT — why this scope has no chart. Said verbatim in both registers: it is a property of
 *  the trends store, not of the surface asking. */
const FACT: Record<EmptyScope, string> = {
  "empty-dag":
    "The base ledger anchors metagraph snapshots rather than producing them, so it has no chart of its own here.",
  // ONLY THEIR SNAPSHOT COUNT IS KNOWN (the Unlisted audit, 2026-10-07 — this said "no measured
  // history", which was false: the global count less every listed network IS their history, and the
  // Snapshots measure draws it). Every other measure is kept per listed network, so this sentence is
  // only ever shown for those.
  "empty-unlisted":
    "Unlisted channels are the ones the catalog does not name, so only the snapshots they anchor are measured. That count is the global total less every listed network.",
};

/** THE ROUTE — where the reading does live, named as a gesture the reader can make on THIS
 *  surface. The document has its own Hypergraph tab; the view reaches the same prose through RAW.
 *  The unlisted route is the same sentence in both, because the answer is the same view either
 *  way and inventing a second phrasing would be drift with extra steps. */
const ROUTE: { document: Record<EmptyScope, string>; view: Record<Exclude<EmptyScope, "empty-dag">, string> } = {
  document: {
    "empty-dag": "Its own history is the Hypergraph tab above.",
    "empty-unlisted": "Pick Snapshots as the measure to see it.",
  },
  // The VIEW never asks about "empty-dag": `viewScope` scopes the DAG as a network there (its
  // own plane, 2026-09-26), so that route has no sentence to say.
  view: {
    "empty-unlisted": "Pick Snapshots as the measure to see it.",
  },
};

/** The two sentences a scope with nothing to draw says, or null where there IS something.
 *  Returned as a PAIR rather than one string so a caller can set them on their own lines where
 *  the surface has the room, and join them where it does not. */
export function scopeEmptyCopy(
  scope: TrendScope,
  surface: "view" | "document",
): { fact: string; route: string } | null {
  if (scope === "all" || scope === "network") return null;
  if (surface === "view") return scope === "empty-dag" ? null : { fact: FACT[scope], route: ROUTE.view[scope] };
  return { fact: FACT[scope], route: ROUTE.document[scope] };
}
