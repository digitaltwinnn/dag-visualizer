import type { NoteResponse, NoteView } from "@/src/data/noteTypes";
import { noteKeyOf, timingOf, type NoteSpan } from "./keys";
import { noteSupported } from "./sources";

// THE WARM PASS — what the quarter-hourly cron (`/api/notes/warm`, vercel.json `7,22,37,52 * * * *`) rewrites, as
// pure planning plus one bounded executor. The PLANNER is the one place that decides a warmed note
// is due: the route prefetches every candidate's record, `planPass` picks the due ones, and the
// generator rewrites each planned item unconditionally (`generateNote(…, "warm")`).
//
// A note is due when it is missing, older than its kind's refresh less `WARM_SLACK_MS`, or (hyper
// `all` only) written for a different set of networks with nodes. The slack exists because a pass
// takes minutes: a ledger note written at 10:09 is 58 minutes old at the 11:07 pass, and an exact
// one-hour refresh would leave it standing until 11:22. It stays under the 15-minute cron step, so
// the 10:52 pass (43 minutes) does not rewrite it early.
//
// PACING: one item at a time, and at least `WARM_SPACING_MS` between Gate calls (`pacedChat`),
// because the free model's burst limit is far below its stated per-minute one. A pass is bounded
// (about 26 calls), so a backlog — a cold store, a version bump — drains over several runs; an item whose
// record another writer refreshed since the plan is served, not rewritten (`seenWrittenAt`).
//
// Order: the HOURLY kinds first (ledger, History's 24h), so a pass cut short by its time budget
// still refreshes what goes stale fastest; then the daily kinds (hyper, Geography and its
// countries, History's 7d / 30d / 1y / all). Only what a note exists for is planned
// (`noteSupported`): History has no `all` subject, and an unlisted network has no note at all.
// On-request kinds (the 1h pill, a brushed range) are never warmed.

const NET = "mainnet";
/** How early a warmed note is due: more than a pass's length, well under its shortest refresh. */
export const WARM_SLACK_MS = 15 * 60_000;

export interface WarmItem {
  view: NoteView;
  subject: string;
  span: NoteSpan;
}

/** What the planner needs of a cached record (`NoteRecord`'s fields), null when there is none. */
export type CachedLookup = (key: string) => { writtenAt: number; setKey?: string } | null;

const HOURLY: [NoteView, NoteSpan][] = [["ledger", "hours"], ["trend", "24h"]];
const DAILY: [NoteView, NoteSpan][] = [["hyper", "day"], ["geo", "day"], ["trend", "7d"], ["trend", "30d"], ["trend", "1y"], ["trend", "all"]];

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
  nowMs: number, subjects: string[], countries: string[], setKey: string | null, cached: CachedLookup,
): WarmItem[] {
  return warmCandidates(subjects, countries).filter((item) => {
    const rec = cached(warmKeyOf(item));
    if (!rec) return true;
    const { refreshMs } = timingOf(item.view, item.span);
    if (refreshMs != null && nowMs - rec.writtenAt > refreshMs - WARM_SLACK_MS) return true;
    return item.view === "hyper" && item.subject === "all" && setKey != null && rec.setKey !== setKey;
  });
}

const COUNTRY_RE = /^f\.cc\.([A-Z]{2})$/;

/** The whole fleet's countries on the newest measured geo day (`readGeoDays`' `geoDays`): the
 *  `f.cc.<cc>` fields above zero, never a network's own `f.cc.<id>.<cc>`. */
export function latestCountries(geoDays: Record<string, Record<string, number>>): string[] {
  const latest = Object.keys(geoDays).sort().at(-1);
  if (!latest) return [];
  const out: string[] = [];
  for (const [field, n] of Object.entries(geoDays[latest]!)) {
    const cc = COUNTRY_RE.exec(field)?.[1];
    if (cc && n > 0) out.push(cc);
  }
  return out.sort();
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

/** A model call that keeps at least `spacingMs` between the STARTS of consecutive calls (the Gate
 *  answered 429 at about five calls in 15 s on the free model, 2026-10-27). Only a call that
 *  reaches the model waits, so a cached or empty item costs no time. For a serial caller: the
 *  warm pass runs one item at a time. */
export function pacedChat<A extends unknown[], R>(
  chat: (...args: A) => Promise<R>, spacingMs: number, now: () => number, sleep: (ms: number) => Promise<void>,
): (...args: A) => Promise<R> {
  let last: number | null = null;
  return async (...args: A) => {
    if (last != null) {
      const wait = last + spacingMs - now();
      if (wait > 0) await sleep(wait);
    }
    last = now();
    return chat(...args);
  };
}
