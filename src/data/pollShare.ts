// The share of a feed's polls that succeeded, as a reader would say it — the pulse strip's one
// health reading (user, 2026-10-03: "'237 ok · 2 failed' — perhaps a percentage is better?").
//
// Two honesty rules (rule 10): it never says "100%" while anything failed, and it keeps one decimal
// from 99 up, where the whole-number reading would hide the very failures the card exists to show.
// FLOORED there, never rounded: 2 failures in 2,000 is 99.9%, not "100.0%".
export function okShare(ok: number, err: number): string {
  const total = ok + err;
  if (!(total > 0)) return "—";
  if (err <= 0) return "100%";
  const pct = (ok / total) * 100;
  if (pct >= 99) return `${Math.min(99.9, Math.floor(pct * 10) / 10).toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/** HAS THE NETWORK EVER ANSWERED? True only when the global-snapshot feed has FAILED at least once
 *  and never succeeded — a dead network met on a cold start (found on TestNet during its outage,
 *  test pass 2026-10-03). It is deliberately narrower than "not live":
 *
 *   · before the first poll has returned it is false, so a normal boot never flashes it;
 *   · after one success it is false for good, so a later drop keeps the last-known readings
 *     (desaturated, with the no-signal dot) rather than blanking numbers that were real.
 *
 *  What it gates: surfaces that would otherwise print a COUNT of nothing — "0 nodes", "0 located"
 *  — as if it had been measured (rule 10: absent data is an instrument state, never a number). */
export function neverConnected(rows: readonly { id: string; ok: number; err: number }[]): boolean {
  const g = rows.find((r) => r.id === "global");
  return !!g && g.ok === 0 && g.err > 0;
}
