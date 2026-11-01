import type { NoteResponse, NoteView } from "@/src/data/noteTypes";
import { noteKeyOf, subjectKindOf, timingOf, type NoteSpan } from "./keys";
import { noteSupported } from "./sources";

// THE WARM PASS — what the quarter-hourly cron (`/api/notes/warm`, vercel.json `7,22,37,52 * * * *`) rewrites, as
// pure planning plus one bounded executor. The PLANNER is the one place that decides a warmed note
// is due: the route prefetches every candidate's record, `planPass` picks the due ones, and the
// generator rewrites each planned item unconditionally (`generateNote(…, "warm")`).
//
// A note is due when it is missing, older than its kind's refresh less `WARM_SLACK_MS`, (hyper `all`
// only) written for a different set of networks with nodes, or, for Hypergraph's and Geography's
// networks and the whole network, written under a held node count that has since moved, at most
// hourly per note (user, 2026-10-31: notes should feel dynamic). A daily note otherwise disagrees
// with the live card beside it for up to a day. The key is the HELD level, the median of the last
// six hourly samples and the very reading the note states, so a bad hour moves nothing and a real
// change arrives in about three hours; a layer change at one count, or a node moving country,
// still waits for the daily rewrite. A record with no key, a visitor's, gets one rewrite to earn a
// baseline. The slack exists because a pass
// takes minutes: a ledger note written at 10:09 is 58 minutes old at the 11:07 pass, and an exact
// one-hour refresh would leave it standing until 11:22. It stays under the 15-minute cron step, so
// a note written early in the 10:07 pass is not rewritten by the 10:52 one (45 minutes old, under
// the 50 that make it due), even one that starts late: equal to the step, a :52 run a few seconds
// late would rewrite it, and an item could settle into a 45-minute cycle.
//
// PACING: `WARM_CONCURRENCY` items at a time and at least `WARM_SPACING_MS` between the starts of
// Gate calls (`pacedChat`), sized for the paid model: a cold store or a version bump fills in one
// pass, and a pass cut short by its budget hands the rest to the next. An item whose record another
// writer refreshed since the plan is served, not rewritten (`seenWrittenAt`).
//
// Order: the HOURLY kinds first (ledger, History's 24h), so a pass cut short by its time budget
// still refreshes what goes stale fastest; then the daily kinds (hyper, Geography and its
// countries, History's 7d / 30d / 1y / all). Only what a note exists for is planned
// (`noteSupported`): History has no `all` subject, and the unlisted set has a note in History alone.
// On-request kinds (the 1h pill, a brushed range) are never warmed.

const NET = "mainnet";
/** How early a warmed note is due: more than a pass's length (300 s at most), and under the
 *  15-minute cron step (see the header), so its shortest refresh is never cut a step short. */
export const WARM_SLACK_MS = 10 * 60_000;

export interface WarmItem {
  view: NoteView;
  subject: string;
  span: NoteSpan;
}

/** What the planner needs of a cached record (`NoteRecord`'s fields), null when there is none. */
export type CachedLookup = (key: string) => { writtenAt: number; setKey?: string; driftKey?: string } | null;

/** A network's or the whole network's held node count, by subject (`HyperFacts.driftKeys`). */
export type DriftKeys = Record<string, string>;

/** At most this often a note is rewritten because its numbers moved, less the slack. */
const DRIFT_MIN_MS = 3_600_000;

/** The key speaking for a note, or null: Hypergraph's and Geography's networks and the whole
 *  network, the first rollout. A warmed country and History stay on their clock. */
export function driftKeyOf(item: WarmItem, drift: DriftKeys | null): string | null {
  if ((item.view !== "hyper" && item.view !== "geo") || subjectKindOf(item.subject) === "country") return null;
  return drift?.[item.subject] ?? null;
}

const HOURLY: [NoteView, NoteSpan][] = [["ledger", "hours"], ["trend", "24h"]];
const DAILY: [NoteView, NoteSpan][] = [["hyper", "day"], ["geo", "day"], ["trend", "7d"], ["trend", "30d"], ["trend", "90d"], ["trend", "1y"], ["trend", "all"]];

/** Every warmable note for these subjects and countries (`["DE", …]`), in pass order. */
export function warmCandidates(subjects: string[], countries: string[]): WarmItem[] {
  const out: WarmItem[] = [];
  for (const [view, span] of [...HOURLY, ...DAILY]) {
    const subs = view === "geo" ? [...subjects, ...countries.map((cc) => `cc:${cc}`)] : subjects;
    for (const subject of subs) if (noteSupported(view, subject, span, NET)) out.push({ view, subject, span });
  }
  return out;
}

export function warmKeyOf(item: WarmItem): string {
  return noteKeyOf(NET, item.view, item.subject, item.span);
}

/** THE PASS: the candidates that are due. `setKey` is the current networks-with-nodes key (sorted
 *  ids, as the hyper digest stores it); null when it could not be read, which compares nothing. */
export function planPass(
  nowMs: number, subjects: string[], countries: string[], setKey: string | null, cached: CachedLookup, drift: DriftKeys | null = null,
): WarmItem[] {
  return warmCandidates(subjects, countries).filter((item) => {
    const rec = cached(warmKeyOf(item));
    if (!rec) return true;
    const { refreshMs } = timingOf(item.view, item.span, item.subject);
    if (refreshMs != null && nowMs - rec.writtenAt > refreshMs - WARM_SLACK_MS) return true;
    if (item.view === "hyper" && item.subject === "all" && setKey != null && rec.setKey !== setKey) return true;
    const key = driftKeyOf(item, drift);
    return key != null && rec.driftKey !== key && nowMs - rec.writtenAt > DRIFT_MIN_MS - WARM_SLACK_MS;
  });
}

export interface PassResult {
  planned: number;
  /** Finished: written (`ok`) or nothing to describe (`none`). */
  done: number;
  /** Not written: unavailable, held by another writer (`pending`), or threw. */
  failed: number;
}

/** Run the plan with at most `concurrency` items at once, starting no new item once `budgetMs`
 *  has passed since `start` (the HANDLER's start: the prefetch and planning spend the same 300 s
 *  as the items; an item already running finishes). Items never started are neither done nor
 *  failed: the next pass plans them again. */
export async function executePass(
  items: WarmItem[],
  run: (item: WarmItem) => Promise<NoteResponse>,
  opts: { now: () => number; start: number; budgetMs: number; concurrency: number },
): Promise<PassResult> {
  const { start } = opts;
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < items.length && opts.now() - start < opts.budgetMs) {
      const item = items[next++]!;
      try {
        const res = await run(item);
        if (res.state === "ok" || res.state === "none") done++;
        else failed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, items.length) }, worker));
  return { planned: items.length, done, failed };
}

/** A model call that keeps at least `spacingMs` between the STARTS of consecutive calls. Each caller
 *  reserves its slot before it waits, so items running side by side queue rather than all reading
 *  the same last start. Only a call that reaches the model waits, so a cached or empty item costs
 *  no time. */
export function pacedChat<A extends unknown[], R>(
  chat: (...args: A) => Promise<R>, spacingMs: number, now: () => number, sleep: (ms: number) => Promise<void>,
): (...args: A) => Promise<R> {
  let next = 0;
  return async (...args: A) => {
    const t = now();
    const at = Math.max(t, next);
    next = at + spacingMs;
    if (at > t) await sleep(at - t);
    return chat(...args);
  };
}
