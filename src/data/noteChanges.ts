import type { NoteChange, NoteChangeSubject } from "@/src/data/noteTypes";

// A VIEW NOTE'S NOTABLE CHANGES (user, 2026-10-31: "notables in the other views' AI cards ... related
// to a clickable subject"): what moved over the note's span, as rows the reader can click into the
// subject that moved, the sibling of History's notable days. Code picks them and code words them
// (user: "just say 'Hetzner lost 3 nodes in <city>'"): a row is one measured move in a set sentence,
// so the model has nothing to add to it and the gate nothing to check. A span where nothing moved
// has no rows of change. The chamber alone adds its extremes, each a measured fact of the span
// (user, 2026-11-01), never a move: size 0 and below, so anything that moved reads first. A subject
// card's rows (user, 2026-11-02) are its own move, then where inside it that happened.

export const NOTE_CHANGES_CAP = 3;

/** A network's pace this far from its usual (as a ratio) is a change worth a row. Wider than the
 *  note's own lead threshold: a row is a claim the reader can click, and pace is noisy. */
export const RHYTHM_CHANGE = 0.25;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How far a figure moved, in words ("down 12%"), or null when it rounds to nothing or has no start
 *  to move from. A notable change row's own words (a row is code-worded by design). */
export function changeWords(from: number, to: number): string | null {
  if (!(from > 0)) return null;
  const pct = Math.round((to / from - 1) * 100);
  return pct === 0 ? null : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`;
}

/** A gap far past a chain's usual widest one (`isPause`). The words are the facts' own. */
export function pauseChange(name: string, gap: string, usual: string, seconds: number, subject: NoteChangeSubject): NoteChange {
  return { kind: "pause", subject, size: seconds, text: `${name} paused for ${gap}, the longest gap is usually ${usual}` };
}

/** A rate far from its usual one, on the notable days' own bands (`notableDays.ts`), or null. */
export function rateChange(name: string, now: number, usual: number, nowText: string, usualText: string, subject: NoteChangeSubject): NoteChange | null {
  if (!(usual > 0)) return null;
  const kind = now >= 2 * usual ? "high" : now <= 0.4 * usual ? "low" : null;
  return kind && { kind, subject, size: Math.abs(Math.log(Math.max(now, 1e-9) / usual)), text: `${name} ran at ${nowText} an hour, usually ${usualText}` };
}

/** The smallest share of a count a move of two or more nodes takes to be worth a row. */
const MOVE_MIN_SHARE = 0.05;
/** The share a single node takes to: one of a handful is a change of shape, one of dozens is churn. */
const ONE_NODE_MIN_SHARE = 0.2;

/** Whether a move is an event rather than churn (user, 2026-11-02: "'United States lost 1 node, down
 *  3%' -> how is that notable?"). The note can still state it; a row claims something happened. */
const worthARow = (from: number, delta: number): boolean => {
  const size = Math.abs(delta);
  return size / from >= (size === 1 ? ONE_NODE_MIN_SHARE : MOVE_MIN_SHARE);
};

/** A count's move, or null when it did not, or moved too little to be worth a row (`worthARow`).
 *  `place` is a measured city, never a guess, and a row naming one states that city's percentage:
 *  the sentence reads as the city's (`was` nodes there). A first or a last node is always an event,
 *  and has no percentage: the words already say all of it or none of it. */
export function countChange(
  name: string,
  from: number,
  to: number,
  subject: NoteChangeSubject,
  place?: { city: string; was: number } | null,
): NoteChange | null {
  if (from === to) return null;
  const size = Math.abs(to - from);
  const where = place ? ` in ${place.city}` : "";
  if (from > 0 && to > 0 && !worthARow(place?.was || from, to - from)) return null;
  if (from === 0) return { kind: "new", subject, size, text: `${name} gained its first ${size === 1 ? "node" : count(size, "node")}${where}` };
  if (to === 0) return { kind: "gone", subject, size, text: `${name} lost its last ${size === 1 ? "node" : count(size, "node")}${where}` };
  const by = place ? changeWords(place.was, place.was + to - from) : changeWords(from, to);
  return { kind: to > from ? "gained" : "lost", subject, size, text: `${name} ${to > from ? "gained" : "lost"} ${count(size, "node")}${where}${by ? `, ${by}` : ""}` };
}

/** A network starting or stopping. Outranks any count: nothing else says it. */
export function eventChange(name: string, kind: "active" | "quiet", subject: NoteChangeSubject): NoteChange {
  return { kind, subject, size: Number.MAX_SAFE_INTEGER, text: `${name} ${kind === "active" ? "became active" : "went quiet"}` };
}

function spacingWords(seconds: number): string {
  if (seconds < 60) return count(Math.round(seconds), "second");
  if (seconds < 3600) return count(Math.round(seconds / 60), "minute");
  return count(Math.round(seconds / 3600), "hour");
}

/** A network's pace against its usual one, seconds between snapshots: null under the threshold and
 *  wherever the two would read alike ("every 1 hour, usually 1 hour" says nothing). */
export function rhythmChange(name: string, usualS: number, recentS: number, subject: NoteChangeSubject): NoteChange | null {
  if (!(usualS > 0) || !(recentS > 0)) return null;
  const size = Math.abs(recentS / usualS - 1);
  const now = spacingWords(recentS);
  const usual = spacingWords(usualS);
  if (size < RHYTHM_CHANGE || now === usual) return null;
  const faster = recentS < usualS;
  return { kind: faster ? "faster" : "slower", subject, size, text: `${name} ${faster ? "sped up" : "slowed down"}: a metagraph snapshot every ${now}, usually ${usual}` };
}

/** The span's largest global snapshot, by the snapshots it anchored (user, 2026-11-02: "more
 *  interesting" than a metagraph's). Its record is found with the note; until then, or where it
 *  cannot be, the row is a statement. */
export function largestGlobalChange(anchored: number): NoteChange {
  return { kind: "peak", subject: { kind: "self" }, size: 0, text: `The largest global snapshot anchored ${anchored} metagraph snapshots` };
}

/** Who held the span's longest gap between snapshots. Below the largest snapshot on a tie of kinds. */
export function longestGapChange(name: string, seconds: number, subject: NoteChangeSubject): NoteChange {
  return { kind: "longest", subject, size: -1, text: `${name} had the longest gap, ${spacingWords(seconds)}` };
}

type Sites = Readonly<Record<string, number>>;

/** Where a provider's whole change happened: the one city its `f.site.<cc>.<city>.<key>` counts moved
 *  in, by exactly `delta`, between two measured days. Null when it spread over cities, when part of
 *  it has no city on record, or without both days: the row then names no place rather than guess. */
export function siteOfChange(keys: ReadonlySet<string>, now: Sites | undefined, then: Sites | undefined, delta: number): { cc: string; city: string; was: number } | null {
  if (!now || !then) return null;
  const moved = new Map<string, number>();
  const was = new Map<string, number>();
  const tally = (sites: Sites, sign: number) => {
    for (const [field, n] of Object.entries(sites)) {
      const [, , cc, city, key] = field.split(".");
      if (!cc || !city || !key || !keys.has(key)) continue;
      const at = `${cc}.${city}`;
      moved.set(at, (moved.get(at) ?? 0) + sign * n);
      if (sign < 0) was.set(at, (was.get(at) ?? 0) + n);
    }
  };
  tally(now, 1);
  tally(then, -1);
  const places = [...moved].filter(([, d]) => d !== 0);
  if (places.length !== 1 || places[0]![1] !== delta) return null;
  const at = places[0]![0];
  const [cc, city] = at.split(".");
  return { cc: cc!, city: decodeURIComponent(city!), was: was.get(at) ?? 0 };
}

/** Each provider's move at each place in the stored sites, for the places `keep` holds. Both days or
 *  nothing, as `siteOfChange`: a place missing on one is read as a move only when the day was stored. */
export function siteMoves(now: Sites | undefined, then: Sites | undefined, keep: (cc: string, key: string) => boolean): { cc: string; city: string; key: string; from: number; to: number }[] {
  if (!now || !then) return [];
  const moves = new Map<string, { cc: string; city: string; key: string; from: number; to: number }>();
  const tally = (sites: Sites, end: "from" | "to") => {
    for (const [field, n] of Object.entries(sites)) {
      const [, , cc, city, key] = field.split(".");
      if (!cc || !city || !key || !keep(cc, key)) continue;
      const at = `${cc}.${city}.${key}`;
      const m = moves.get(at) ?? { cc, city: decodeURIComponent(city), key, from: 0, to: 0 };
      m[end] += n;
      moves.set(at, m);
    }
  };
  tally(then, "from");
  tally(now, "to");
  return [...moves.values()].filter((m) => m.from !== m.to);
}

/** The rows to show: each list's biggest in turn, so no one kind of subject fills them. */
export function pickChanges(...lists: (readonly NoteChange[])[]): NoteChange[] {
  const queues = lists.map((l) => [...l].sort((a, b) => b.size - a.size || a.text.localeCompare(b.text)));
  const out: NoteChange[] = [];
  while (out.length < NOTE_CHANGES_CAP && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && out.length < NOTE_CHANGES_CAP) out.push(q.shift()!);
  }
  return out;
}

/** The chamber's rows: what moved, and its extremes only in the slots left. */
export const withExtremes = (moved: readonly NoteChange[], extremes: readonly NoteChange[]): NoteChange[] =>
  [...moved, ...pickChanges(extremes)].slice(0, NOTE_CHANGES_CAP);
