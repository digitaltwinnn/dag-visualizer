import type { Fact, NoteChange, NoteChangeSubject } from "@/src/data/noteTypes";

// A VIEW NOTE'S NOTABLE CHANGES (user, 2026-10-31: "notables in the other views' AI cards ... related
// to a clickable subject"): what moved over the note's span, as rows the reader can click into the
// subject that moved, the sibling of History's notable days. Code picks them and code words them
// (user: "just say 'Hetzner lost 3 nodes in <city>'"): a row is one measured move in a set sentence,
// so the model has nothing to add to it and the gate nothing to check. A span where nothing moved
// has no rows of change. The chamber alone adds its extremes, each a measured fact of the span
// (user, 2026-11-01), never a move: size 0 and below, so anything that moved reads first.

export const NOTE_CHANGES_CAP = 3;

/** A network's pace this far from its usual (as a ratio) is a change worth a row. Wider than the
 *  note's own lead threshold: a row is a claim the reader can click, and pace is noisy. */
export const RHYTHM_CHANGE = 0.25;

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How far a figure moved, in words ("down 12%"), or null when it rounds to nothing or has no start
 *  to move from. One home for a notable change and a notable day (`withDayChange`). */
export function changeWords(from: number, to: number): string | null {
  if (!(from > 0)) return null;
  const pct = Math.round((to / from - 1) * 100);
  return pct === 0 ? null : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`;
}

/** The verbs a percentage can follow ("fell 9% from …"). Any other word leaves the sentence as written. */
const MOVED = /\b(?:rose|risen|rising|grew|grown|growing|climbed|climbing|increased|increasing|fell|fallen|falling|dropped|dropping|declined|declining|decreased|decreasing|shrank|shrunk|shrinking|slipped)\s$/i;

/** HOW FAR A FIGURE MOVED, IN A NOTE (user, 2026-10-31: "also add percentages to these texts"). Code
 *  adds it to the checked note: asked of the model, a live trial wrote "[up 11%]" and failed the gate.
 *  Only where the note states a fact's own pair, as the facts write it and in its order, and a verb
 *  carries it, so the worst case is a sentence with no percentage. */
export function withMovePercents(note: string, facts: readonly Fact[]): string {
  let out = note;
  for (const to of facts) {
    if (to.pair?.end !== "to") continue;
    const from = facts.find((f) => f.pair?.key === to.pair!.key && f.pair.end === "from");
    const change = from ? changeWords(from.value, to.value) : null;
    if (!from || !change) continue;
    const percent = change.split(" ")[1]!;
    for (const said of [`from ${from.text} to ${to.text}`, `from ${from.text} in the weeks before to ${to.text}`]) {
      for (let at = out.indexOf(said); at >= 0; at = out.indexOf(said, at + said.length)) {
        if (/[\p{L}\p{N}]/u.test(out[at + said.length] ?? "") || !MOVED.test(out.slice(0, at))) continue;
        out = `${out.slice(0, at)}${percent} ${out.slice(at)}`;
        at += percent.length + 1;
      }
    }
    // A span against the one before it, the current figure first: "averaged Y, up from X".
    const said = `${change.split(" ")[0]} from ${from.text}`;
    for (let at = out.indexOf(said); at >= 0; at = out.indexOf(said, at + said.length)) {
      if (/[\p{L}\p{N}]/u.test(out[at + said.length] ?? "")) continue;
      const sentence = out.slice(out.lastIndexOf(". ", at) + 1, at);
      if (!new RegExp(`(?<![\\d.,])${to.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d])`).test(sentence)) continue;
      out = `${out.slice(0, at)}${change} ${out.slice(at + change.split(" ")[0]!.length + 1)}`;
      at += percent.length + 1;
    }
  }
  return out;
}

/** TWO WHOLE SPANS ARE NOT A START AND AN END (user, 2026-11-02). Code writes the comparison: the
 *  model keeps saying "fell to 64 from 73", and the gate sending that back cost whole notes of
 *  several figures, whose retries ran past the sentence limit. Runs before the gate, which still
 *  holds whatever this cannot reach. `before` names the span before, once, at the first comparison. */
export function withSpanComparisons(note: string, facts: readonly Fact[], before: string | null): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fig = (f: Fact) => {
    const [n, ...unit] = f.text.split(" ");
    return `${esc(n!)}${unit.length ? `(?: ${esc(unit.join(" "))})?` : ""}`;
  };
  const END = "(?!\\d|[.,]\\d)";
  let out = before ? note.replace(/\b(?:in|over) the previous span\b/gi, `in ${before}`) : note;
  const pairs: { from: Fact; to: Fact }[] = [];
  for (const to of facts) {
    if (to.pair?.end !== "to" || !to.pair.span) continue;
    const from = facts.find((f) => f.pair?.key === to.pair!.key && f.pair.end === "from");
    if (!from || from.value === to.value) continue;
    pairs.push({ from, to });
    const dir = to.value > from.value ? "up" : "down";
    out = out.replace(new RegExp(`\\bfrom ${fig(from)} to ${fig(to)}${END}`, "g"), `to ${to.text}, ${dir} from ${from.text}`);
    out = out.replace(new RegExp(`\\bto ${fig(to)}((?: (?:DAG|MB|per|a|day))*),? from ${fig(from)}${END}`, "g"), (_, tail: string) => `to ${to.text}${tail}, ${dir} from ${from.text}`);
  }
  if (!before) return out;
  if (out.includes(before)) return out.replace(new RegExp(`(?<!(?:in|over) )${esc(before)}`), `in ${before}`);
  let first: { end: number } | null = null;
  for (const { from } of pairs) {
    const m = new RegExp(`\\b(?:up|down) from ${fig(from)}(?: (?:DAG|MB))?(?: (?:per|a) day)?${END}`).exec(out);
    if (m && (!first || m.index + m[0].length < first.end)) first = { end: m.index + m[0].length };
  }
  return first ? `${out.slice(0, first.end)} in ${before}${out.slice(first.end)}` : out;
}

/** A count's move, or null when it did not. `place` is a measured city, never a guess, and a row
 *  naming one states that city's percentage: the sentence reads as the city's (`was` nodes there).
 *  A first or a last node has no percentage: the words already say all of it or none of it. */
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
  return { kind: faster ? "faster" : "slower", subject, size, text: `${name} ${faster ? "sped up" : "slowed down"}: a snapshot every ${now}, usually ${usual}` };
}

/** Who held the span's largest snapshot by fees. `fee` is as the card writes it. */
export function largestSnapshotChange(name: string, fee: string, subject: NoteChangeSubject): NoteChange {
  return { kind: "peak", subject, size: 0, text: `${name} had the largest snapshot, ${fee}` };
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
