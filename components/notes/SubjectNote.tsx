"use client";

import { useEffect, useRef } from "react";

import { AI_NOTES_ICON } from "@/components/icons";
import { NodeStars } from "@/components/state/StateAtoms";
import { useNet } from "@/components/topbar/useNet";
import { queryOf, type NoteReq } from "./noteLoader";
import { useMainnetNote } from "./useAiNote";

// A SUBJECT CARD'S OWN NOTE (spec 2026-10-29-subject-notes): one note per card, scoped as the
// card's lead — the Country, Provider and Composition cards and the Range card mount this IN THE
// LEAD'S PLACE, while the Gate AI card above keeps the view's note. The request is the caller's
// (`subjectNote.ts`). It is asked AUTOMATICALLY: the selection was the gesture, so there is no door.
//
// THE PLATE TAKES THE LEAD'S PLACE (user, 2026-10-30, design option D, then "no fallback"): the
// card's measured lead ("Hosts 25% of the selection's nodes") and the note served one purpose, what
// this subject is to the whole it sits in, and the note says it better and names its span; so the
// lead is gone and the note stands where it stood, on a faint violet plate with the mark
// (`--ai-wash` / `--ai-edge`). The plate shows its own "reading…" / "writing…" while the note is
// in flight, and nothing at all when there is none (`none`, `unavailable`, off mainnet): never
// "couldn't write" for an ask the reader did not make. The text names its own span, so no label row.
//
// ⚠️ MODEL TEXT IS UNTRUSTED. It renders as React text, nothing else: no `dangerouslySetInnerHTML`,
// no markdown (the top card's rule).

/** How long a subject has to stand before its note is asked for (the effect below). */
const ASK_DWELL_MS = 1500;
const MARK = <AI_NOTES_ICON aria-hidden className="mt-[3px] size-3.5 shrink-0 text-[var(--ai-mark)]" />;

export default function SubjectNote({ req }: { req: NoteReq | null }) {
  // Presence through `useNet()`, the fetch through the gate (`useMainnetNote`'s hydration rule).
  const asked = useNet() === "mainnet" ? req : null;
  const note = useMainnetNote(asked);
  const res = note.res;
  const key = asked ? queryOf(asked) : null;
  // ONE ASK PER KEY, AFTER A DWELL (final review I1, 2026-10-29): a re-render, or the `request`
  // answer a poll reads back, never POSTs twice — and a subject that is only PASSING is never
  // asked at all. The rail pager, a deck rotation (the Range card follows the plane in front) and
  // the explorer rows change the key many times in a few seconds; each key would be its own
  // Gate write, and the free model refuses a burst (R32), leaving every key it refused dark for
  // 15 minutes (`FAIL_TTL_S`). So the ask waits `ASK_DWELL_MS` with the key unchanged.
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (key == null || res?.state !== "request" || askedFor.current === key) return;
    const t = setTimeout(() => {
      askedFor.current = key;
      note.request();
    }, ASK_DWELL_MS);
    return () => clearTimeout(t);
  }, [key, res?.state, note.request]);

  if (!asked || res?.state === "none" || res?.state === "unavailable") return null;
  // `request` is the dwell before the ask (the effect above): nothing is being written yet, so it
  // reads as reading — "writing…" is the server's own `pending`, a write in flight.
  const waiting = res == null || res.state === "request" ? "reading…" : res.state === "pending" ? "writing…" : null;
  const text = res?.state === "ok" ? res.text : null;
  return (
    <div className="mb-2.5 flex gap-2 rounded-xs border border-[var(--ai-edge)] bg-[var(--ai-wash)] px-2.5 py-2">
      {MARK}
      {waiting ? (
        <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
          <NodeStars />
          {waiting}
        </p>
      ) : (
        <p className="m-0 text-body leading-snug text-foreground">{text}</p>
      )}
    </div>
  );
}
