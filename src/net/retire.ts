// WHEN THE BAKE MAY RETIRE A NETWORK (user, 2026-10-07: "when will retired at be added, can it be
// done when we bake/rebake the network?"). Pure: the bake gathers the two facts, this decides.
//
// A false retirement costs history — a retired network is no longer sampled — so ONE directory
// read is never proof: the directory can hiccup and a network can be re-listed. A retirement needs
// BOTH facts at once: the network is GONE from the live directory, and its chain has STOPPED (no
// snapshot for a week). Either fact alone is printed as a warning for a person to look at, and
// changes nothing. The date written is the day of the chain's LAST snapshot — when it really
// stopped, not when someone noticed.

/** A chain with no snapshot for this many days has stopped. */
export const RETIRE_QUIET_DAYS = 7;

export function proposeRetirement(f: {
  /** Does the live directory still list the network? */
  listed: boolean;
  /** Its chain's newest snapshot (epoch ms), or null when the chain could not be read. */
  lastSnapshotMs: number | null;
  nowMs: number;
}): { retireOn: string | null; warn: string | null } {
  const quietMs = RETIRE_QUIET_DAYS * 86_400_000;
  if (f.lastSnapshotMs == null) {
    return { retireOn: null, warn: f.listed ? null : "gone from the directory, but its chain could not be read — not retired" };
  }
  const quiet = f.nowMs - f.lastSnapshotMs >= quietMs;
  const lastDay = new Date(f.lastSnapshotMs).toISOString().slice(0, 10);
  if (!f.listed && quiet) return { retireOn: lastDay, warn: null };
  if (!f.listed) return { retireOn: null, warn: "gone from the directory but still anchoring — not retired" };
  if (quiet) return { retireOn: null, warn: `listed but silent since ${lastDay} — not retired` };
  return { retireOn: null, warn: null };
}
