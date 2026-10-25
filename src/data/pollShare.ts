// Whether the network has ever answered — read off the poll-health registry. (The share of a
// feed's polls that succeeded, `okShare`, lived here too until the pulse strip's rhythm lanes,
// 2026-10-25: the lanes draw each failure where it happened, so the percentage had no reader.)

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
