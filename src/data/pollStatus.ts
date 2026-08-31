import type { PollHealth } from "./api";

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
