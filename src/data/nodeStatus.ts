// The shared node status system: colour = the semantic BUCKET (lane-clean green/amber/red/
// muted), text = the exact lifecycle stage. Replaces the old 6-colour nodeStateColor.
// See docs/superpowers/specs/2026-07-01-geo-node-card-design.md.

export type StatusBucket = "ready" | "progress" | "down" | "unknown";
export interface NodeStatus { bucket: StatusBucket; color: string; label: string; }

export const BUCKET_COLOR: Record<StatusBucket, string> = {
  ready: "#36e29a",
  progress: "#ffd166",
  down: "#ff6b6b",
  unknown: "#9aa6c2",
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
