"use client";
import { useEffect } from "react";

export interface MgHue {
  id: string;
  hue?: { deg: number; oklch: string; hex: string };
}

// Sets --mg-<id> on :root so any chip/dot/thread/spine can read its metagraph's
// identity hue via var(--mg-<id>). Structural tokens are never touched (two-lane rule).
export function applyMetagraphVars(list: MgHue[]): void {
  const root = document.documentElement;
  for (const m of list) {
    if (m.hue) root.style.setProperty(`--mg-${m.id}`, m.hue.oklch);
  }
}

export function MetagraphVars({ entries }: { entries: MgHue[] }) {
  useEffect(() => {
    applyMetagraphVars(entries);
  }, [entries]);
  return null;
}
