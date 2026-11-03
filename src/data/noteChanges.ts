import type { ChangeBrief, Fact, NoteChange, NoteChangeSubject } from "@/src/data/noteTypes";
import { fact } from "@/src/data/noteFacts";

// A VIEW NOTE'S NOTABLE CHANGES (user, 2026-10-31: "notables in the other views' AI cards ... related
// to a clickable subject"): what moved over the note's span, as rows the reader can click into the
// subject that moved, the sibling of History's notable days. CODE PICKS THEM, THE MODEL WORDS THEM
// (user, 2026-11-03: "the notable-change rows all must come from AI"; they were code-worded set
// sentences until then): each builder here decides whether a move is worth a row and hands over a
// BRIEF — what the row is about and its measured figures — and the model writes the row's line from
// it, checked by the gate like a notable day's caption; a row whose line fails is dropped. A span
// where nothing moved has no rows. The chamber alone adds its extremes, each a measured fact of the
// span (user, 2026-11-01), never a move: size 0 and below, so anything that moved reads first. A
// subject card's rows (user, 2026-11-02) are its own move, then where inside it that happened.

export const NOTE_CHANGES_CAP = 3;

/** A network's pace this far from its usual (as a ratio) is a change worth a row. Wider than the
 *  note's own lead threshold: a row is a claim the reader can click, and pace is noisy. */
export const RHYTHM_CHANGE = 0.25;

/** Generic words a subject's name shares with others, never enough to say which one a line names. */
const GENERIC = new Set(["the", "and", "inc", "llc", "ltd", "gmbh", "corp", "online", "limited", "services", "technologies", "network", "networks"]);

/** DOES A ROW'S LINE NAME ITS SUBJECT? Any distinctive word of the name (three letters or more,
 *  not a generic one) as a whole word, so "Hetzner" names "Hetzner Online GmbH". A validity check on
 *  the model's line, never a rewrite: a row that names another subject than its click is dropped. */
export function namesSubject(line: string, name: string): boolean {
  const words = name.split(/[\s,.()]+/).filter((w) => w.length >= 3 && !GENERIC.has(w.toLowerCase()));
  if (!words.length) return true;
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(line));
}

/** A row waiting for its line: the brief the model words it from. */
const row = (kind: NoteChange["kind"], subject: NoteChangeSubject, size: number, about: string, facts: Fact[] = [], name?: string): NoteChange => {
  const brief: ChangeBrief = { about, facts, ...(name ? { name } : {}) };
  return { kind, subject, size, text: "", brief };
};

/** A gap far past a chain's usual widest one (`isPause`), stated against its NORMAL SPACING (user,
 *  2026-11-03: "don't compare gaps against other gaps; compare gaps against the normal spacing between
 *  snapshots"). `what` names the kind of snapshot that paused. */
export function pauseChange(name: string, gapS: number, spacingS: number, what: string, subject: NoteChangeSubject): NoteChange {
  return row("pause", subject, gapS, `${name} paused`, [fact("Pause length", gapS, "duration"), fact(`Normal spacing between ${what}`, spacingS, "duration")], name);
}

/** A rate far from its usual one, on the notable days' own bands (`notableDays.ts`), or null.
 *  `format` writes an hour's amount as the facts write it, with its unit. */
export function rateChange(name: string, now: number, usual: number, unit: string, subject: NoteChangeSubject, format?: (v: number) => string): NoteChange | null {
  if (!(usual > 0)) return null;
  const kind = now >= 2 * usual ? "high" : now <= 0.4 * usual ? "low" : null;
  return kind && row(kind, subject, Math.abs(Math.log(Math.max(now, 1e-9) / usual)), `${name} ran ${kind === "high" ? "far above" : "far below"} its usual rate`, [
    fact(`${unit} an hour, recent`, now, "amount", format),
    fact(`${unit} an hour, usual`, usual, "amount", format),
  ], name);
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
 *  `place` is a measured city, never a guess, and a row naming one carries that city's own counts
 *  (`was` nodes there). A first or a last node is an event, with no change against a start. */
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
  const moved = fact(to > from ? "Nodes gained" : "Nodes lost", size, "count");
  if (from === 0) return row("new", subject, size, `${name} gained its first nodes${where}`, [moved], name);
  if (to === 0) return row("gone", subject, size, `${name} lost its last nodes${where}`, [moved], name);
  const was = place ? place.was : from;
  const now = place ? place.was + to - from : to;
  return row(to > from ? "gained" : "lost", subject, size, `${name}'s nodes${where}`, [
    moved,
    fact(`Nodes${where} at the start of the span`, was, "count"),
    fact(`Nodes${where} at the end of the span`, now, "count"),
  ], name);
}

/** A network starting or stopping. Outranks any count: nothing else says it. */
export function eventChange(name: string, kind: "active" | "quiet", subject: NoteChangeSubject): NoteChange {
  return row(kind, subject, Number.MAX_SAFE_INTEGER, `${name} ${kind === "active" ? "became active" : "went quiet"} over the span`, [], name);
}

/** A network's pace against its usual one, seconds between snapshots: null under the threshold and
 *  wherever the two would read alike ("every 1 hour, usually 1 hour" says nothing). */
export function rhythmChange(name: string, usualS: number, recentS: number, subject: NoteChangeSubject): NoteChange | null {
  if (!(usualS > 0) || !(recentS > 0)) return null;
  const size = Math.abs(recentS / usualS - 1);
  const now = fact("Spacing between its metagraph snapshots, recent", recentS, "duration");
  const usual = fact("Spacing between its metagraph snapshots, usual", usualS, "duration");
  if (size < RHYTHM_CHANGE || now.text === usual.text) return null;
  return row(recentS < usualS ? "faster" : "slower", subject, size, `${name} ${recentS < usualS ? "sped up" : "slowed down"}`, [now, usual], name);
}

/** The span's largest global snapshot, by the snapshots it anchored (user, 2026-11-02: "more
 *  interesting" than a metagraph's). Its record is found with the note. */
export function largestGlobalChange(anchored: number): NoteChange {
  return row("peak", { kind: "self" }, 0, "The span's largest global snapshot", [fact("Metagraph snapshots it anchored", anchored, "count")]);
}

/** Who held the span's longest gap between snapshots. Below the largest snapshot on a tie of kinds. */
export function longestGapChange(name: string, seconds: number, subject: NoteChangeSubject): NoteChange {
  return row("longest", subject, -1, `${name} had the span's longest gap`, [fact("Longest gap", seconds, "duration")], name);
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
  const queues = lists.map((l) => [...l].sort((a, b) => b.size - a.size || (a.brief?.about ?? a.text).localeCompare(b.brief?.about ?? b.text)));
  const out: NoteChange[] = [];
  while (out.length < NOTE_CHANGES_CAP && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && out.length < NOTE_CHANGES_CAP) out.push(q.shift()!);
  }
  return out;
}

/** The chamber's rows: what moved, and its extremes only in the slots left. */
export const withExtremes = (moved: readonly NoteChange[], extremes: readonly NoteChange[]): NoteChange[] =>
  [...moved, ...pickChanges(extremes)].slice(0, NOTE_CHANGES_CAP);
