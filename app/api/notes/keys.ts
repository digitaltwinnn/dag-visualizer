import type { NoteView } from "@/src/data/noteTypes";
import { pickRangeTier } from "@/src/data/trendWindow";

// THE KEY GRAMMAR OF AI NOTES — one home. Notes live in their OWN key family, `ai:*`, never under
// `t:` (a trends rebuild wipes that prefix) or `geo:` (a location gauge cannot be re-derived): a
// note is a cache entry, losable and rewritable, and the families must not share a fate.
//
// A note's key is `ai:{net}:v{NOTES_VERSION}:{view}:{subject}:{span}`. Changing a prompt or a facts
// shape bumps NOTES_VERSION, which orphans every stored note at once (their TTLs reap them).
//
// Everything is UTC and the caller supplies the date strings; nothing here reads a clock.

export const NOTES_VERSION = 53; // 53: rows open their snapshots, a day carries its measure, a row needs a move worth one (2026-11-02)

/** What a note covers. Hyper and Geography are a standing picture ("day"), the ledger the recent
 *  hours ("hours"); History's pills are the rest, and a brushed range is `r<fromMs>-<toMs>` after
 *  `snapSpan`, so two brushes of the same buckets share one key. */
export type NoteSpan = "day" | "hours" | "1h" | "24h" | "7d" | "30d" | "90d" | "1y" | "all" | `r${number}-${number}`;

export function noteKeyOf(net: string, view: NoteView, subject: string, span: NoteSpan): string {
  return `ai:${net}:v${NOTES_VERSION}:${view}:${subject}:${span}`;
}

/** THE FOUR NOTES THE BRIEFING READS (`components/notes/briefingNote.ts`), which also carry its one
 *  short line: every view at its widest, and History over its resting window. */
export function isBriefingNote(view: NoteView, subject: string, span: NoteSpan): boolean {
  return view === "trend" ? subject === "dag" && span === "30d" : subject === "all";
}

/** The singleflight lock for one note key: a sibling of the note, in the same family. */
export function lockKeyOf(noteKey: string): string {
  return `${noteKey}:lock`;
}

/** A recent FAILURE of one note key (R38): a read or request whose write failed holds the key for
 *  `FAIL_TTL_S` (generate.ts), so the next reader is answered `unavailable` from the store instead
 *  of paying for another model call. A sibling of the note, in the same family. */
export function failKeyOf(noteKey: string): string {
  return `${noteKey}:fail`;
}

/** The day's counters (a hash: generated, rejected, capped, ...), by UTC day `YYYY-MM-DD`. */
export function statsKeyOf(net: string, dayIso: string): string {
  return `ai:${net}:stats:${dayIso}`;
}

/** One visitor's count of limited notes (a brushed range, a subject note) for one UTC hour (`YYYY-MM-DDTHH`); `ipHash` is the first
 *  16 hex characters of HMAC-SHA256(CRON_SECRET, ip), or sha256(ip) with no secret. The raw IP
 *  is never a key. */
export function rateKeyOf(net: string, ipHash: string, hourIso: string): string {
  return `ai:${net}:rate:${ipHash}:${hourIso}`;
}

/** The global tripwire for the limited notes (a brushed range, a subject note) for one UTC day. */
export function capKeyOf(net: string, dayIso: string): string {
  return `ai:${net}:cap:${dayIso}`;
}

export type NoteKind = "hyper" | "geo" | "ledger" | "trend24h" | "trendDaily" | "trend1h" | "range" | "subject";

/** What a subject names, for the prompt's question: the view itself (`all`, `dag`, a network), a
 *  country (`cc:XX`, `<net>/cc:XX`), a provider (`isp:<key>`, `<net>/isp:<key>`) or a network's
 *  node make-up (`<net>/type:<roleKey>`). Shape only: `params.ts` is what validates a subject. */
/** THE SUBJECT TAILS, one home: what follows the optional `<net>/` scope. `params.ts` validates a
 *  request against them and `sources.ts` reads the selection back out, so the two cannot drift. */
export const CC_TAIL_RE = /^cc:([A-Z]{2})$/;
export const ISP_TAIL_RE = /^isp:([a-z0-9-]{1,48})$/;
export const TYPE_TAIL_RE = /^type:((?:l0|cl1|dl1)(?:\+(?:l0|cl1|dl1)){0,2}|none)$/;

/** `span` is THE SPAN FACET (user, 2026-10-30): History's `<net>/span` over a pill, the Range
 *  card's note while it stands on the window — the same facts as the view note, a complementary
 *  question (the span as a stretch of time), so the two cards never say one note twice. */
export type SubjectKind = "view" | "country" | "provider" | "type" | "span";

export function subjectKindOf(subject: string): SubjectKind {
  const tail = subject.slice(subject.indexOf("/") + 1);
  if (tail.startsWith("cc:")) return "country";
  if (tail.startsWith("isp:")) return "provider";
  if (subject.includes("/") && tail.startsWith("type:")) return "type";
  if (subject.includes("/") && tail === "span") return "span";
  return "view";
}

/** A SUBJECT NOTE: one selection's note, written on request and never warmed. Every scoped form
 *  (`<net>/...`) and a fleet provider are one; a fleet country `cc:XX` is NOT — it is the warmed
 *  kind Geography had before subject notes, and keeps its timing. */
export function isSubjectNote(subject: string): boolean {
  return subject.includes("/") || subject.startsWith("isp:");
}

const H = 3_600_000;
/** Freshness per kind: `refreshMs` is how old a note may be before the warm pass rewrites it
 *  (`warm.ts`, null = never warmed: written only when asked), `ttlS` how long the store keeps it. */
export const KIND_TIMING: Record<NoteKind, { refreshMs: number | null; ttlS: number }> = {
  hyper: { refreshMs: 24 * H, ttlS: 72 * 3600 },
  geo: { refreshMs: 24 * H, ttlS: 72 * 3600 },
  ledger: { refreshMs: H, ttlS: 6 * 3600 },
  trend24h: { refreshMs: H, ttlS: 6 * 3600 },
  trendDaily: { refreshMs: 24 * H, ttlS: 72 * 3600 },
  trend1h: { refreshMs: null, ttlS: 900 },
  range: { refreshMs: null, ttlS: 30 * 86_400 },
  // Asked for, never warmed: a subject note lives a day, as long as its figures stand, and the
  // next reader to ask after that writes it again.
  subject: { refreshMs: null, ttlS: 24 * 3600 },
};

/** The subject decides first: a subject note has one timing whatever its view. */
export function timingOf(view: NoteView, span: NoteSpan, subject = ""): { refreshMs: number | null; ttlS: number } {
  if (isSubjectNote(subject)) {
    // A SPAN FACET over a short pill lives as long as that pill's figures stand (review 2026-10-30):
    // a day-old note saying "over the last hour" is a stale reading presented as live. Asked, never
    // warmed, whatever the pill: `refreshMs` stays null, so a read never writes one.
    const short = subjectKindOf(subject) === "span" ? (span === "1h" ? KIND_TIMING.trend1h : span === "24h" ? KIND_TIMING.trend24h : null) : null;
    return short ? { refreshMs: null, ttlS: short.ttlS } : KIND_TIMING.subject;
  }
  if (span.startsWith("r")) return KIND_TIMING.range;
  if (view === "hyper") return KIND_TIMING.hyper;
  if (view === "geo") return KIND_TIMING.geo;
  if (view === "ledger") return KIND_TIMING.ledger;
  if (span === "24h") return KIND_TIMING.trend24h;
  if (span === "1h") return KIND_TIMING.trend1h;
  return KIND_TIMING.trendDaily;
}

const STEP_MS = { "5m": 300_000, "1h": 3_600_000, "1d": 86_400_000 } as const;
const MIN_SPAN_MS = STEP_MS["5m"];

/** A BRUSHED RANGE, SNAPPED so that near-identical brushes share one note (the key space is
 *  otherwise unbounded). It snaps OUTWARD to a whole bucket of the tier the range is charted at
 *  (`pickRangeTier`), then clamps the end to the last WHOLE bucket before `nowMs` (a raw `nowMs`
 *  would give a brush ending now a new key on every call). Snapping outward can carry a range
 *  across a tier boundary (10:01 to 10:01 + 2 days is 5m, but 10:00 to 10:05 + 2 days is 1h), so
 *  the tier is picked again on the snapped span and, if it got coarser, the span snaps again: a
 *  snapped span re-snaps to itself. Null for a range that is not one: reversed or empty, starting in
 *  the future, or shorter than one 5-minute bucket after snapping. */
export function snapSpan(fromMs: number, toMs: number, nowMs: number): { fromMs: number; toMs: number } | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (toMs <= fromMs || fromMs > nowMs) return null;
  let from = fromMs;
  let to = toMs;
  let step = 0;
  for (let i = 0; i < 3; i++) {
    const next = STEP_MS[pickRangeTier(from, to)];
    if (next <= step) break;
    step = next;
    from = Math.floor(from / step) * step;
    to = Math.ceil(to / step) * step;
  }
  to = Math.min(to, Math.floor(nowMs / step) * step);
  if (to - from < MIN_SPAN_MS) return null;
  return { fromMs: from, toMs: to };
}
