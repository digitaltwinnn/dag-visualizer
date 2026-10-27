import type { Fact } from "@/src/data/noteTypes";

// THE HONESTY GATE FOR AI NOTES — one home. A free language model writes two or three sentences
// about measured data; rule 10 says every visual quantity comes from live data, and a sentence is
// a visual quantity. So the gate is MECHANICAL: every number the note states must be backed by a
// `Fact` the model was shown, within the precision it was written to ("12.2K" is 12,200 ± 50,
// "12,159" is ± 0.5), and a rejected note is never shown — the generator asks again or gives up.
//
// Pure: no store, react or I/O (the colocated test is the specification — rule 4).
//
// WHAT IT CHECKS, in the order the code does it:
//   · numeric tokens (12,159 · 12.2K · 1.5M · 37% · 2.5x / 2.5 times · 22 hours / 22h / 3 days / 45s)
//     and number words (one … twenty, "a dozen") against the facts' values;
//   · ratio words (doubled, tripled, quadrupled, halved, twice — "more than" tightens) against the
//     ratio facts. A sentence that NAMES a network is held to that network's own ratio fact:
//     "BioFi more than doubled" is false while "USDC.dag more than doubled" is true;
//   · the house vocabulary (no machine / tick / L1 snapshot / feeless / decentrali-) and the dash
//     rule (no em dash, no spaced en dash or hyphen);
//   · the sentence count.
//
// WHAT IT STRIPS FIRST, so it is never read as a number: the names it is handed (they carry dots
// and digits), the layer tokens (L0, L1, cL1, dL1, L0s), and any date phrase a `date` fact holds
// ("Oct 19", "October 19, 2026", "19 Oct", "2026-10-19"). A date NO fact holds is left in, and its
// day-of-month then has to back itself as a number — which it cannot.
//
// DIRECTION: a sentence with a falling verb (fell, dropped, down, slowed ...) reads a `%` against a
// ratio as (1-r)*100 only; a rising verb (rose, grew, up, climbed ...) as (r-1)*100 or r*100; with
// neither, or both, all three stay allowed. A `%` against a ratio also needs the sentence to NAME
// the network (else only a share fact can back it).
//
// KNOWN LIMITS, stated rather than hidden: direction is read from the sentence's verbs, not from
// which number the verb governs, and a duration is matched only against `duration`
// facts, so a count of days has to arrive as seconds.

export type NoteCheck = { ok: true } | { ok: false; reasons: string[] };

const MONTHS = [
  ["jan", "january"], ["feb", "february"], ["mar", "march"], ["apr", "april"], ["may", "may"],
  ["jun", "june"], ["jul", "july"], ["aug", "august"], ["sep", "september"], ["oct", "october"],
  ["nov", "november"], ["dec", "december"],
] as const;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, "a dozen": 12,
};
// Word boundaries both sides, so "none", "someone", "often" and "tone" produce no token.
const NUMBER_WORD_RE = new RegExp(`\\b(?:${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

const LAYER_RE = /\b[cd]?L[01]s?\b/g;
// `\b` at the START only: "ticks" and "machines" are the words banned, "sticky" is not "tick".
const BANNED_RE = /\bmachine|\btick|\bL1 snapshot|\bfeeless|\bdecentrali/gi;
// QUANTITY WORDS THE GATE CANNOT CHECK fail closed: with no token produced, nothing would be
// compared and "Thirty networks" or "BioFi grew threefold" would pass unread. The ratio words it
// DOES check (doubled, tripled, quadrupled, halved, twice) are exempted by `unverifiable`.
const UNVERIFIABLE_RE =
  /\b(?:thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens|half|halves|quarters?)\b|\b\w+fold\b|\b(?:doubl|tripl|quadrupl|halv)\w*|(?<!\ba )\bdozen\b/gi;
const CHECKED_RATIO_WORDS = new Set(["doubled", "tripled", "quadrupled", "halved"]);
function unverifiable(s: string): string[] {
  return [...s.matchAll(UNVERIFIABLE_RE)].map((m) => m[0]).filter((w) => !CHECKED_RATIO_WORDS.has(w.toLowerCase()));
}
const DASH_RE = /—|\s[–-]\s/;

// A numeric token: digits with thousands commas and decimals, then an optional unit. A single
// letter unit must stand alone (22h, 12.2K, 45s) so "3rd" or "2nd" stay plain numbers.
const TOKEN_RE =
  /(?<![\w.])(\d+(?:,\d{3})*(?:\.\d+)?)(?:(%|×|(?:x|[hdms]|[kb])(?![a-z]))|\s*percent\b|\s+(times|hours?|hrs?|days?|minutes?|mins?|seconds?|secs?)\b)?/gi;

type Cls = "plain" | "pct" | "x" | "dur";
interface Tok { raw: string; cls: Cls; value: number; tol: number }

const UNIT_SECONDS: Record<string, number> = { h: 3600, d: 86400, m: 60, s: 1 };
const MAGNITUDE: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, b: 1e9, B: 1e9 };

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const written = m[1].replace(/,/g, "");
    const n = parseFloat(written);
    const dot = written.indexOf(".");
    const half = 0.5 * Math.pow(10, -(dot < 0 ? 0 : written.length - dot - 1));
    const unit = m[2] ?? m[3] ?? (/percent/i.test(m[0]) ? "%" : "");
    const raw = m[0].trim();
    if (unit === "%" || /^percent$/i.test(unit)) out.push({ raw, cls: "pct", value: n, tol: half });
    else if (unit === "×" || /^(x|times)$/i.test(unit)) out.push({ raw, cls: "x", value: n, tol: half });
    else if (MAGNITUDE[unit]) out.push({ raw, cls: "plain", value: n * MAGNITUDE[unit], tol: half * MAGNITUDE[unit] });
    else if (unit) {
      const secs = UNIT_SECONDS[unit.toLowerCase().charAt(0)];
      out.push({ raw, cls: "dur", value: n * secs, tol: half * secs });
    } else out.push({ raw, cls: "plain", value: n, tol: half });
  }
  return out;
}

/** Which way a sentence says a quantity moved, so a `%` is read in that direction only. */
type Dir = "rise" | "fall" | "none";
const FALL_RE = /\b(fell|fall|falls|dropped|drop|declined|decline|decreased|decrease|down|lower|slowed|shrank)\b/i;
const RISE_RE = /\b(rose|rise|rises|grew|grow|increased|increase|up|higher|climbed)\b/i;
function direction(s: string): Dir {
  const fall = FALL_RE.test(s), rise = RISE_RE.test(s);
  return fall && !rise ? "fall" : rise && !fall ? "rise" : "none";
}

/** The values a fact can honestly back for each way of writing a number. `ratios` is the set of
 *  ratio facts THIS sentence may cite (see `checkNote`), not every ratio fact there is. */
function candidates(f: Fact, cls: Cls, ratios: readonly Fact[], dir: Dir): number[] {
  const isRatio = f.kind === "ratio" && ratios.includes(f);
  switch (cls) {
    case "plain": return f.kind === "count" || f.kind === "amount" ? [f.value] : [];
    case "pct":
      if (f.kind === "share") return [f.value * 100];
      if (!isRatio) return [];
      return dir === "fall" ? [(1 - f.value) * 100]
        : dir === "rise" ? [(f.value - 1) * 100, f.value * 100]
        : [(f.value - 1) * 100, (1 - f.value) * 100, f.value * 100];
    case "x": return isRatio ? [f.value] : [];
    case "dur": return f.kind === "duration" ? [f.value] : [];
  }
}

function backed(t: Tok, facts: readonly Fact[], ratios: readonly Fact[], dir: Dir): boolean {
  return facts.some((f) =>
    candidates(f, t.cls, ratios, dir).some((v) => Math.abs(v - t.value) <= t.tol + 1e-9 * Math.max(1, Math.abs(v))));
}

// RATIO WORDS. `ok` is the bare word's floor; `more` is "more than <word>", which must clear the
// word's own mark rather than sit at its floor.
const RATIO_WORDS: Record<string, { ok: (r: number) => boolean; more: (r: number) => boolean }> = {
  doubled: { ok: (r) => r >= 1.95, more: (r) => r > 2 },
  tripled: { ok: (r) => r >= 2.95, more: (r) => r > 3 },
  quadrupled: { ok: (r) => r >= 3.95, more: (r) => r > 4 },
  halved: { ok: (r) => r > 0 && r <= 0.55, more: (r) => r > 0 && r < 0.5 },
  twice: { ok: (r) => r >= 1.9 && r <= 2.1, more: (r) => r > 2 },
};
const RATIO_WORD_RE = /\b(more than )?(doubled|tripled|quadrupled|halved|twice)\b/gi;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regex for every name, longest first so "Hetzner Online GmbH" wins over "Hetzner". Lookarounds
 *  instead of `\b`, because a name may start or end on a non-word character. */
function nameRe(names: readonly string[]): RegExp | null {
  const live = names.filter((n) => n.trim()).sort((a, b) => b.length - a.length).map(escape);
  return live.length ? new RegExp(`(?<![\\w])(?:${live.join("|")})(?![\\w])`, "gi") : null;
}

function datePhrases(facts: readonly Fact[]): RegExp[] {
  const out: RegExp[] = [];
  for (const f of facts) {
    if (f.kind !== "date") continue;
    const d = new Date(f.value);
    const [short, long] = MONTHS[d.getUTCMonth()];
    const mon = short === "sep" ? "(?:sept?|september)" : `(?:${short}|${long})`;
    const day = String(d.getUTCDate());
    const year = `(?:,?\\s+${d.getUTCFullYear()})?`;
    const ord = "(?:st|nd|rd|th)?";
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
    out.push(
      new RegExp(`\\b${mon}\\.?\\s+${day}${ord}(?!\\d)${year}`, "gi"),
      new RegExp(`(?<![\\d,.])${day}${ord}\\s+${mon}\\b${year}`, "gi"),
      new RegExp(iso, "g"),
    );
  }
  return out;
}

/** Sentences, split on `.`/`!`/`?` before whitespace or the end — except a dot inside a name. */
function sentences(text: string, nameRegex: RegExp | null): string[] {
  const spans: [number, number][] = [];
  if (nameRegex) for (const m of text.matchAll(nameRegex)) spans.push([m.index, m.index + m[0].length]);
  const out: string[] = [];
  let from = 0;
  for (const m of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    out.push(text.slice(from, m.index + m[0].length));
    from = m.index + m[0].length;
  }
  out.push(text.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

export function checkNote(
  text: string,
  facts: readonly Fact[],
  names: readonly string[],
  opts?: { maxSentences?: number },
): NoteCheck {
  const reasons: string[] = [];
  const maxSentences = opts?.maxSentences ?? 3;
  const nameRegex = nameRe(names);
  const stripNames = (s: string) => (nameRegex ? s.replace(nameRegex, " ") : s);
  const dates = datePhrases(facts);

  if (!text.trim()) return { ok: false, reasons: ["the note is empty"] };

  const bare = stripNames(text);
  for (const m of bare.matchAll(BANNED_RE)) reasons.push(`banned word "${m[0]}"`);
  for (const w of unverifiable(bare)) reasons.push(`unverifiable quantity word: ${w}`);
  if (DASH_RE.test(bare)) reasons.push("contains a dash used as punctuation");

  const parts = sentences(text, nameRegex);
  if (parts.length > maxSentences) reasons.push(`${parts.length} sentences, at most ${maxSentences}`);

  const ratios = facts.filter((f) => f.kind === "ratio");
  for (const sentence of parts) {
    // Names first: the ratio words below are held to the networks the sentence names.
    const named = names.filter((n) => n.trim() && new RegExp(nameRe([n])!.source, "i").test(sentence));
    let s = stripNames(sentence).replace(LAYER_RE, " ");
    for (const re of dates) s = s.replace(re, " ");

    // A sentence that names a network may cite only THAT network's ratio facts, for ratio words and
    // for `x`/`%` tokens alike. One that names none may cite any ratio for `x` and a ratio word, but
    // a bare `%` there is a share or nothing: it cannot borrow an unrelated network's ratio.
    const own = named.length
      ? ratios.filter((f) => named.some((n) => f.label.toLowerCase().includes(n.toLowerCase())))
      : ratios;
    const pctRatios = named.length ? own : [];
    const dir = direction(s);

    const digits = s.replace(NUMBER_WORD_RE, (w) => ` ${NUMBER_WORDS[w.toLowerCase()]} `);
    for (const t of tokens(digits))
      if (!backed(t, facts, t.cls === "pct" ? pctRatios : own, dir)) reasons.push(`"${t.raw}" is not backed by any measured fact`);

    for (const m of s.matchAll(RATIO_WORD_RE)) {
      const rule = RATIO_WORDS[m[2].toLowerCase()];
      if (!own.some((f) => (m[1] ? rule.more(f.value) : rule.ok(f.value))))
        reasons.push(`"${m[0]}" is not backed by a ratio fact${named.length ? ` for ${named.join(", ")}` : ""}`);
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}
