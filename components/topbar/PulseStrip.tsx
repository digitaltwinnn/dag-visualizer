"use client";

import { pollHealthRows } from "@/src/data/api";
import { useNowTick } from "@/components/useNowTick";

// THE PULSE STRIP — the heartbeat's own row (user, 2026-08-30: clicking the ECG "should show a
// bottom section (like the filter) with relevant information about the liveliness of the app —
// when did it last poll successfully? which polls do we have?"). The filter strip's exact
// grow-downward mechanism, one cell per FEED from the poll-health registry (src/data/api.ts):
// last success ticking live, the feed's own cadence, ok·err counts. Read-only measured facts —
// the dot derives from the stamps (ok / STALE past ~2.5× its own cadence / error when the last
// outcome failed), never a fabricated status (rule 10).
//

function ageWord(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
const everyWord = (ms: number | null): string =>
  ms == null ? "on demand" : ms >= 60_000 ? `every ${Math.round(ms / 60_000)} min` : `every ${Math.round(ms / 1000)}s`;

export default function PulseStrip() {
  const now = useNowTick(1000);
  const rows = pollHealthRows();
  return (
    <div className="flex items-stretch gap-2 mx-2 px-2 pb-2 pt-1.5 border-t border-border/60 overflow-x-auto slim-scroll">
      {rows.length === 0 && (
        <span className="text-label text-muted-foreground self-center px-1">acquiring — no polls have completed yet</span>
      )}
      {rows.map((r) => {
        const okAge = r.lastOkAt != null ? now - r.lastOkAt : null;
        const errLast = r.lastErrAt != null && (r.lastOkAt == null || r.lastErrAt > r.lastOkAt);
        // STALE: silent past ~2.5× its own cadence (on-demand feeds don't go stale — they
        // simply state when they last ran).
        const stale = !errLast && r.everyMs != null && okAge != null && okAge > r.everyMs * 2.5;
        const dot = errLast ? "var(--destructive)" : stale ? "var(--warn-soft)" : okAge != null ? "var(--success)" : "var(--muted-foreground)";
        return (
          <div key={r.id} className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-card/40 px-3 py-1.5 flex-1 basis-0 min-w-[150px]">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full flex-none" style={{ background: dot }} />
              <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground whitespace-nowrap">{r.label}</span>
            </span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-mono font-bold text-caption tabular-nums text-foreground">
                {okAge != null ? ageWord(okAge) : errLast ? "failing" : "—"}
              </span>
              <span className="text-micro text-muted-foreground">{everyWord(r.everyMs)}</span>
            </span>
            <span className="text-micro text-muted-foreground whitespace-nowrap">
              {r.target} · {r.ok.toLocaleString()} ok{r.err > 0 ? ` · ${r.err.toLocaleString()} err` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
