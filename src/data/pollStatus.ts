import type { PollHealth } from "./api";
import { relativeAge } from "@/src/util/relativeAge";

// THE FEED-STATUS RESOLVER — the MEANING half of the pulse strip (2026-08-31; review: status
// semantics were derived inline in PulseStrip's JSX, untestable and one re-derivation away
// from two surfaces disagreeing about whether the app is live — the rule-10 class). The strip
// renders these words; any future consumer (an ECG dim, a phone variant) asks the same
// question here instead of re-deriving the thresholds.
//
// The states, in precedence order:
//  - "failing"   — the LAST outcome was an error (an older success doesn't outrank fresh failure).
//  - "stale"     — silent past STALE_FACTOR × its own cadence. The 2.5 grace absorbs the
//                  measured tick jitter (global cadence 4.6–114.8s about a 28s mean) without
//                  masking a genuinely dead feed; on-demand feeds (everyMs null) never go
//                  stale — they simply state when they last ran.
//  - "ok"        — at least one success, none of the above.
//  - "acquiring" — no outcome recorded yet.
export type PollStatus = "ok" | "stale" | "failing" | "acquiring";

export const STALE_FACTOR = 2.5;

export function pollStatusOf(r: PollHealth, now: number): PollStatus {
  const errLast = r.lastErrAt != null && (r.lastOkAt == null || r.lastErrAt > r.lastOkAt);
  if (errLast) return "failing";
  if (r.lastOkAt == null) return "acquiring";
  if (r.everyMs != null && now - r.lastOkAt > r.everyMs * STALE_FACTOR) return "stale";
  return "ok";
}

// ── THE RHYTHM LANES (2026-10-25, the pulse strip's redesign — user picked "B3 with B4's next
// due"): one real time axis, a lane per feed, each poll a tick where it landed; a scheduled feed
// draws where its NEXT poll is due, so "late" is a lane whose last answer is behind that mark.
// Everything a pixel depends on is decided here, pure, so the strip is a shell over it.

/** The axis: the last two minutes, plus a little room past now for the due marks. The room was
 *  30s (now at 80% of the lane) until the same day (user: "move the 'now' much more to the right");
 *  at 10s now sits at ~92%. A slow feed's due mark appears once it is within that room; the
 *  overdue stretch never needs it, since it lies before now. */
export const PULSE_WINDOW_MS = 120_000;
export const PULSE_AHEAD_MS = 10_000;

/** Fastest first — the lanes read as tempo from top to bottom. Once-per-visit (no tempo) last;
 *  ties keep the registry's order. */
export function pulseOrder(rows: readonly PollHealth[]): PollHealth[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.tempoMs ?? Infinity) - (b.r.tempoMs ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
}

export interface PulseLane {
  /** Each beat inside the window: its position 0..1 across the WHOLE axis (window + ahead). */
  beats: { x: number; ok: boolean }[];
  /** Where the next scheduled poll is due, 0..1, or null (no schedule, or off the axis). */
  dueX: number | null;
  /** Where an overdue stretch begins — the due mark when the feed is stale, the last good answer
   *  when it is failing — or null. It always ends at now. */
  lateX: number | null;
  /** Where now sits, 0..1. */
  nowX: number;
}

export function pulseLane(r: PollHealth, now: number): PulseLane {
  const span = PULSE_WINDOW_MS + PULSE_AHEAD_MS;
  const start = now - PULSE_WINDOW_MS;
  const xOf = (t: number) => Math.min(1, Math.max(0, (t - start) / span));
  const nowX = xOf(now);
  const beats = r.beats.filter((b) => b.at >= start && b.at <= now).map((b) => ({ x: xOf(b.at), ok: b.ok }));
  const status = pollStatusOf(r, now);
  // The next poll is due one cadence after the last ATTEMPT — an error is still the poll firing.
  const last = Math.max(r.lastOkAt ?? -Infinity, r.lastErrAt ?? -Infinity);
  const due = r.everyMs != null && Number.isFinite(last) ? last + r.everyMs : null;
  const dueX = due != null && due >= start && due <= start + span ? xOf(due) : null;
  let lateX: number | null = null;
  if (status === "failing") lateX = xOf(Math.max(start, r.lastOkAt ?? start));
  else if (status === "stale" && r.everyMs != null && r.lastOkAt != null) lateX = xOf(Math.max(start, r.lastOkAt + r.everyMs));
  return { beats, dueX, lateX, nowX };
}

export type VerdictTone = "ok" | "warn" | "bad" | "acquiring";
export interface PulseVerdict {
  tone: VerdictTone;
  /** The short statement — "Live", "Snapshot reads failing", "2 feeds late". */
  title: string;
  /** One sentence of context. */
  detail: string;
}

/** THE STRIP'S ONE SENTENCE — is the app live, and if not, which feed and since when. Failing
 *  outranks late; the feeds still connecting are counted, never claimed live. */
/** `inView` narrows the sentence to the feeds the current view reads (the strip passes only those):
 *  a feed nothing here reads — possibly never fetched in this session — must not hold the verdict
 *  on "connecting", and the words say the count is this view's. */
export function pulseVerdict(rows: readonly PollHealth[], now: number, inView = false): PulseVerdict {
  const here = inView ? " in this view" : "";
  if (rows.length === 0) return { tone: "acquiring", title: "Connecting", detail: "No feed has answered yet." };
  const by = (s: PollStatus) => rows.filter((r) => pollStatusOf(r, now) === s);
  const failing = by("failing"), stale = by("stale"), acquiring = by("acquiring");
  const live = rows.length - failing.length - stale.length - acquiring.length;
  const others = (n: number) => (n === 0 ? "" : n === 1 ? ` The other feed${here} is live.` : ` The other ${n} feeds${here} are live.`);
  const since = (r: PollHealth) => (r.lastOkAt != null ? `Last good answer ${relativeAge(now - r.lastOkAt, true)} ago.` : "No good answer yet.");
  if (failing.length || stale.length) {
    const bad = failing.length > 0;
    const set = bad ? failing : stale;
    const word = bad ? "failing" : "late";
    const title = set.length === 1 ? `${set[0]!.label} ${word}` : `${set.length} feeds ${word}`;
    const detail = (set.length === 1 ? since(set[0]!) : "") + others(live);
    return { tone: bad ? "bad" : "warn", title, detail: detail.trim() };
  }
  const feeds = (n: number) => (n === 1 ? "1 feed" : `${n} feeds`);
  if (live === 0) return { tone: "acquiring", title: "Connecting", detail: `${feeds(acquiring.length)} still connecting.` };
  const tail = acquiring.length ? ` ${acquiring.length} still connecting.` : "";
  return { tone: "ok", title: "Live", detail: live === rows.length ? `All ${live} feeds${here} answered on time.` : `${feeds(live)}${here} answered on time.${tail}` };
}
