"use client";

import { useEffect, useRef } from "react";

import { AI_NOTES_ICON } from "@/components/icons";
import { SectionLabel } from "@/components/inspector/parts";
import { NodeStars } from "@/components/state/StateAtoms";
import { useNet } from "@/components/topbar/useNet";
import { Separator } from "@/components/ui/separator";
import { queryOf, type NoteReq } from "./noteLoader";
import { useMainnetNote } from "./useAiNote";

// A SUBJECT CARD'S OWN NOTE (spec 2026-10-29-subject-notes): one note per card, scoped as the
// card's lead — the Country, Provider and Composition cards and the Range card mount this under
// their lead, while the Gate AI card above keeps the view's note. The request is the caller's
// (`subjectNote.ts`). It is asked AUTOMATICALLY: the selection was the gesture, so there is no
// door, and a write that fails (`unavailable`) or a subject with nothing measured (`none`) shows
// nothing — never "couldn't write" for an ask the reader did not make.
//
// ⚠️ MODEL TEXT IS UNTRUSTED. It renders as React text, nothing else: no `dangerouslySetInnerHTML`,
// no markdown (the top card's rule).

const WAIT = "m-0 flex items-center gap-2 text-body text-muted-foreground";
/** How long a subject has to stand before its note is asked for (above). */
const ASK_DWELL_MS = 1500;

export default function SubjectNote({ req, span }: { req: NoteReq | null; span: string | null }) {
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
  return (
    // The block closes with the card's own rhythm (a rule's `my-2`), so whatever follows — the
    // card's next rule, the Range card's facts — sits clear of the text.
    <div className="mb-2">
      <Separator className="my-2" />
      <SectionLabel
        label={
          <span className="inline-flex items-center gap-1.5">
            <AI_NOTES_ICON aria-hidden className="size-3.5 text-[var(--ai-mark)]" />
            Constellation Gate AI
          </span>
        }
        unit={span}
        className="mb-1.5"
      />
      {res == null || res.state === "request" ? (
        // `request` is the dwell before the ask (the effect above): nothing is being written yet,
        // so it reads as reading — "writing…" is the server's own `pending`, a write in flight.
        <p className={WAIT}>
          <NodeStars />
          reading…
        </p>
      ) : res.state === "pending" ? (
        <p className={WAIT}>
          <NodeStars />
          writing…
        </p>
      ) : res.state === "ok" ? (
        <p className="m-0 text-body leading-snug text-foreground">{res.text}</p>
      ) : null}
    </div>
  );
}
