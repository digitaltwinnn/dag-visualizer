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

export const NOTES_VERSION = 6;

/** What a note covers. Hyper and Geography are a standing picture ("day"), the ledger the recent
 *  hours ("hours"); History's pills are the rest, and a brushed range is `r<fromMs>-<toMs>` after
 *  `snapSpan`, so two brushes of the same buckets share one key. */
export type NoteSpan = "day" | "hours" | "1h" | "24h" | "7d" | "30d" | "1y" | "all" | `r${number}-${number}`;

export function noteKeyOf(net: string, view: NoteView, subject: string, span: NoteSpan): string {
  return `ai:${net}:v${NOTES_VERSION}:${view}:${subject}:${span}`;
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

/** One visitor's brushed-range count for one UTC hour (`YYYY-MM-DDTHH`); `ipHash` is the first
 *  16 hex characters of HMAC-SHA256(CRON_SECRET, ip), or sha256(ip) with no secret. The raw IP
 *  is never a key. */
export function rateKeyOf(net: string, ipHash: string, hourIso: string): string {
  return `ai:${net}:rate:${ipHash}:${hourIso}`;
}

/** The global brushed-range tripwire for one UTC day. */
export function capKeyOf(net: string, dayIso: string): string {
  return `ai:${net}:cap:${dayIso}`;
}

export type NoteKind = "hyper" | "geo" | "ledger" | "trend24h" | "trendDaily" | "trend1h" | "range";

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
};

export function timingOf(view: NoteView, span: NoteSpan): { refreshMs: number | null; ttlS: number } {
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
