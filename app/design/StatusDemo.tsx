"use client";

// Node-status palette + the real pill language for /design. The bucket colours are LITERALS in
// src/data/nodeStatus.ts (a separate lane from the CSS tokens — read BUCKET_COLOR here so the
// swatches can't drift); the pills below are the REAL StatusMark / StatusBreakdown the cards
// render. Client component because those live in a "use client" module.
import { BUCKET_COLOR } from "@/src/data/nodeStatus";
import { StatusMark, StatusBreakdown } from "@/components/inspector/parts";

const BUCKETS: { label: string; color: string; note: string }[] = [
  { label: "ready", color: BUCKET_COLOR.ready, note: "the settled/healthy state" },
  { label: "in progress", color: BUCKET_COLOR.progress, note: "observing / waiting / syncing / joining" },
  { label: "down", color: BUCKET_COLOR.down, note: "offline / left / …" },
  { label: "unknown", color: BUCKET_COLOR.unknown, note: "no state reported" },
];

// Representative raw states, one per bucket, run through the REAL StatusMark (nodeStatus maps
// each to its bucket colour + exact label).
const SAMPLE_STATES = ["Ready", "WaitingForReady", "Offline", null];

export default function StatusDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* The four buckets as swatches (BUCKET_COLOR). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKETS.map((b) => (
          <div key={b.label} className="ig-panel p-3">
            <div className="h-10 rounded-md mb-2" style={{ background: b.color }} />
            <div className="text-xs font-mono">{b.label}</div>
            <div className="text-[10px] text-muted-foreground">{b.note}</div>
          </div>
        ))}
      </div>
      {/* The real pill chrome — one per bucket (StatusMark), then the rolled-up fleet
          breakdown (StatusBreakdown) the dossier renders. */}
      <div className="ig-panel p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SAMPLE_STATES.map((s, i) => <StatusMark key={i} state={s} />)}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">StatusBreakdown</span>
          <StatusBreakdown states={["Ready", "Ready", "Ready", "WaitingForReady", "Offline", null]} />
        </div>
      </div>
    </div>
  );
}
