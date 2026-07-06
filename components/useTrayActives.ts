"use client";

import { useEffect, useRef, useState } from "react";
import type { RailCard } from "@/components/railCards";

// Dock tray UPDATE tracking, keyed to the rail MANIFEST (see railCards.ts). A hosted card's tray
// icon goes vivid/heartbeat ("active") when its descriptor's `subjectKey` changes while the sheet
// is CLOSED — i.e. it updated unseen. `updateKey` bumps once per such event so RailDock can replay
// its travelling edge pulse. Opening the sheet clears all actives (the updates are now seen); the
// icons themselves stay (they're the legend, not the alert).
//
// This replaces the old bespoke `{ inspect, snap, filter }`-diff in Inspector: it watches the SAME
// subjects the cards' own EdgePulses key on (the manifest carries each card's subjectKey), so the
// tray and the cards can't disagree about what "updated". A card newly becoming present (a fresh
// pick while closed) counts as an update; a pure deselect (a card going absent) announces nothing.
export function useTrayActives(cards: RailCard[]): {
  actives: ReadonlySet<string>;
  updateKey: number;
  onOpenChange: (open: boolean) => void;
} {
  const [actives, setActives] = useState<ReadonlySet<string>>(() => new Set());
  const [updateKey, setUpdateKey] = useState(0);
  const open = useRef(false);
  const mounted = useRef(false);
  const prev = useRef<Map<string, string | number | null>>(new Map());

  const present = cards.filter((c) => c.present);
  // Re-run only when a present card's identity or subject actually changes.
  const sig = present.map((c) => `${c.id}=${String(c.subjectKey)}`).join("|");

  useEffect(() => {
    const cur = new Map(present.map((c) => [c.id, c.subjectKey] as const));
    const was = prev.current;
    prev.current = cur;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (open.current) return; // visible updates aren't "unseen" — no highlight, no pulse
    const hits: string[] = [];
    for (const [id, key] of cur) {
      // Newly present (a fresh pick) OR a changed subject = an unseen update.
      if (!was.has(id) || was.get(id) !== key) hits.push(id);
    }
    if (!hits.length) return;
    setActives((p) => {
      const n = new Set(p);
      for (const id of hits) n.add(id);
      return n;
    });
    setUpdateKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const onOpenChange = (next: boolean) => {
    open.current = next;
    if (next) setActives(new Set());
  };
  return { actives, updateKey, onOpenChange };
}
