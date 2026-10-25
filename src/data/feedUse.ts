import type { FeedId } from "./api";

// WHO IS READING EACH FEED, RIGHT NOW (2026-10-25 — user: "can we show which ones are active in
// the view? … I don't want an assumption based on the current situation, it should be consistent
// by code"). The pulse strip's lanes say which surfaces use a feed's data in the current view.
//
// ⚠️ MEASURED AT THE READ, NOT THE FETCH. Most feeds are fetched by background timers that run in
// every view, and one fetch serves several surfaces (the trends cache feeds the History charts AND
// the Snapshots vitals), so "who fetched" is not "who needs it". A reader HOLDS a feed for as long
// as it reads it: a HUD surface while it is mounted (`useFeedRead`, which only exists in the view
// it belongs to, so the view comes for free), a 3D view while its policy row has it drawing
// (`SceneView.feeds`, held by the Engine). `components/feedReadBoundary.test.ts` is what makes it
// structural: a file that reads a feed's data without holding it fails the suite.
//
// Reference-counted per (feed, reader), so two mounts of one surface are one reader and a release
// never drops someone else's hold.

const HOLDS = new Map<FeedId, Map<string, number>>();

/** Hold `feed` on behalf of `who` (the reader's own words, e.g. "History charts"). Returns the
 *  release; calling it twice is harmless. */
export function holdFeed(feed: FeedId, who: string): () => void {
  let byWho = HOLDS.get(feed);
  if (!byWho) HOLDS.set(feed, (byWho = new Map()));
  byWho.set(who, (byWho.get(who) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const m = HOLDS.get(feed);
    const n = (m?.get(who) ?? 0) - 1;
    if (!m) return;
    if (n > 0) m.set(who, n);
    else m.delete(who);
  };
}

/** The readers holding `feed` now, in a stable (alphabetical) order. Empty = idle here. */
export function feedReaders(feed: FeedId): string[] {
  return [...(HOLDS.get(feed)?.keys() ?? [])].sort((a, b) => a.localeCompare(b));
}
