// The shared node status system: colour = the semantic BUCKET (lane-clean green/amber/red/
// muted), text = the exact lifecycle stage. One vocabulary for every status readout
// (vitals Ready%, explorer rows, node card, dossier footer).

export type StatusBucket = "ready" | "progress" | "down" | "unknown";
export interface NodeStatus { bucket: StatusBucket; color: string; label: string; }

// The bucket colour lane. These REFERENCE the structural CSS tokens (globals.css) rather than
// re-stating hexes (user, 2026-07-12 — they used to be independent literals, e.g. progress was
// #ffd166, byte-identical to --warn-soft, so they could silently drift from the tokens). Values
// are `var(--…)` strings — DOM-only (the 3D scene never colours by status), and the status pill
// composes their alpha with `color-mix`, so a `var()` works where the old hex-append couldn't.
//   ready → --success · progress → --warn-soft · down → --destructive · unknown → --muted-foreground
export const BUCKET_COLOR: Record<StatusBucket, string> = {
  ready: "var(--success)",
  progress: "var(--warn-soft)",
  down: "var(--destructive)",
  unknown: "var(--muted-foreground)",
};

// Map each raw lifecycle state to its bucket + a short label. In-progress states collapse to
// a plain-language stage word (observing / waiting / syncing / joining).
const PROGRESS: Record<string, string> = {
  Observing: "observing",
  WaitingForObserving: "observing",
  WaitingForReady: "waiting",
  ReadyToDownload: "syncing",
  WaitingForDownload: "syncing",
  DownloadInProgress: "syncing",
  StartingSession: "joining",
  SessionStarted: "joining",
};

export function nodeStatus(state?: string | null): NodeStatus {
  if (state === "Ready") return { bucket: "ready", color: BUCKET_COLOR.ready, label: "ready" };
  if (state && state in PROGRESS)
    return { bucket: "progress", color: BUCKET_COLOR.progress, label: PROGRESS[state] };
  if (state === "Offline" || state === "Leaving")
    return { bucket: "down", color: BUCKET_COLOR.down, label: state.toLowerCase() };
  return { bucket: "unknown", color: BUCKET_COLOR.unknown, label: "unknown" };
}

export function statusBreakdown(
  states: (string | null | undefined)[],
): Record<StatusBucket, number> {
  const b: Record<StatusBucket, number> = { ready: 0, progress: 0, down: 0, unknown: 0 };
  for (const s of states) b[nodeStatus(s).bucket]++;
  return b;
}

// Per-exact-label counts within a single bucket, most-populous first (ties keep first-seen
// order). Lets a dossier card spell out an amber group as "3 syncing" / "2 waiting · 1 syncing"
// instead of collapsing it to a bare bucket count — colour still comes from the bucket.
export function labelBreakdown(
  states: (string | null | undefined)[],
  bucket: StatusBucket,
): { label: string; count: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of states) {
    const st = nodeStatus(s);
    if (st.bucket !== bucket) continue;
    if (!counts.has(st.label)) order.push(st.label);
    counts.set(st.label, (counts.get(st.label) || 0) + 1);
  }
  return order
    .map((label) => ({ label, count: counts.get(label)! }))
    .sort((a, b) => b.count - a.count);
}

// The status TABLE'S rows, one derivation for both status surfaces (the dossier's "by node
// status" schedule and the vitals band's Node status cell, 2026-09-10 — extracted from the
// dossier component so the two can't drift): the non-zero buckets in lifecycle order, the
// amber "progress" and red "down" buckets spelled out by their exact lifecycle state(s)
// instead of collapsing to the bucket word (the dossier said "down" while the node card said
// "leaving", user 2026-07-12); colour is always the BUCKET's.
export const BUCKET_WORD: Record<StatusBucket, string> = {
  ready: "ready",
  progress: "in progress",
  down: "down",
  unknown: "unknown",
};
export interface StatusItem { label: string; count: number; color: string }
export function statusItems(states: (string | null | undefined)[]): StatusItem[] {
  const b = statusBreakdown(states);
  const order: StatusBucket[] = ["ready", "progress", "down", "unknown"];
  return order
    .filter((k) => b[k] > 0)
    .flatMap((k) =>
      k === "progress" || k === "down"
        ? labelBreakdown(states, k).map((it) => ({ ...it, color: BUCKET_COLOR[k] }))
        : [{ label: BUCKET_WORD[k], count: b[k], color: BUCKET_COLOR[k] }],
    );
}
