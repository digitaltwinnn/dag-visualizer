"use client";

import { useEffect, useRef } from "react";

import { AI_NOTES_ICON } from "@/components/icons";
import { NodeStars } from "@/components/state/StateAtoms";
import { useNet } from "@/components/topbar/useNet";
import { queryOf, type NoteReq } from "./noteLoader";
import TypedNote from "./TypedNote";
import { useMainnetNote, useWaited } from "./useAiNote";

// A SUBJECT CARD'S OWN NOTE (spec 2026-10-29-subject-notes): one note per card, scoped as the
// card's lead — the Country, Provider and Composition cards and the Range card mount this IN THE
// LEAD'S PLACE, while the Gate AI card above keeps the view's note. The request is the caller's
// (`subjectNote.ts`). It is asked AUTOMATICALLY: the selection was the gesture, so there is no door.
//
// THE NOTE TAKES THE LEAD'S PLACE (user, 2026-10-30, then "no fallback"): the card's measured lead
// ("Hosts 25% of the selection's nodes") and the note served one purpose, what this subject is to
// the whole it sits in, and the note says it better and names its span; so the lead is gone.
//
// THE LAST LINE OF THE HEAD (user, 2026-10-31, option B of six in the brainstorming companion: "not
// embedded enough in the card"): no box, no fill and no edge of its own, since a plate read as a box
// inside the card. The mark sits under the title's kind mark and the words on the title's column.
// The mark and the writing say AI (`TypedNote`). The place shows its own "reading…" while the note
// is in flight (one word, user 2026-10-30: whether the note is held or still being written is the
// cache's business, not the reader's), and nothing at all when there is no note to have (`none`:
// nothing measured; off mainnet). `unavailable` IS shown, as an instrument state (rule 10): "no note
// right now", muted, no door (user, 2026-10-30: a brushed range's note was simply missing — the Gate
// had refused the write, which `FAIL_TTL_S` remembers for 15 minutes, and a card with no lead and no
// reason read as broken; the next range's note then appeared and said nothing about the first). The
// text names its own span, so no label row.
//
// ⚠️ MODEL TEXT IS UNTRUSTED. It renders as React text, nothing else: no `dangerouslySetInnerHTML`,
// no markdown (the top card's rule).

/** How long a subject has to stand before its note is asked for (the effect below). */
const ASK_DWELL_MS = 1500;
/** 14px, its 1px inset and the row's 9px gap land the words on the title's column: the kind mark's 16 and 8. */
const MARK = <AI_NOTES_ICON aria-hidden className="ml-px mt-[3px] size-3.5 shrink-0 text-[var(--ai-mark)]" />;

export default function SubjectNote({ req }: { req: NoteReq | null }) {
  // Presence through `useNet()`, the fetch through the gate (`useMainnetNote`'s hydration rule).
  const asked = useNet() === "mainnet" ? req : null;
  const note = useMainnetNote(asked);
  const res = note.res;
  const key = asked ? queryOf(asked) : null;
  const waited = useWaited(res);
  // ONE ASK PER KEY, AFTER A DWELL (final review I1, 2026-10-29): a re-render, or the `request`
  // answer a poll reads back, never POSTs twice — and a subject that is only PASSING is never
  // asked at all. The rail pager, a deck rotation (the Range card follows the plane in front) and
  // the explorer rows change the key many times in a few seconds; each key would be its own
  // Gate write, and the free model refuses a burst (R32), leaving every key it refused dark for
  // 15 minutes (`FAIL_TTL_S`). So the ask waits `ASK_DWELL_MS` with the key unchanged.
  const askedFor = useRef<string | null>(null);
  // …per VISIT to the key: coming back to one whose note has since expired must ask again, or the
  // card reads forever.
  useEffect(() => {
    askedFor.current = null;
  }, [key]);
  useEffect(() => {
    if (key == null || res?.state !== "request" || askedFor.current === key) return;
    const t = setTimeout(() => {
      askedFor.current = key;
      note.request();
    }, ASK_DWELL_MS);
    return () => clearTimeout(t);
  }, [key, res?.state, note.request]);

  if (!asked || res?.state === "none") return null;
  // `request` is the dwell before the ask (the effect above), `pending` the server's own write in
  // flight: one word for both (above).
  const waiting = res == null || res.state === "request" || res.state === "pending" ? "reading…" : null;
  const text = res?.state === "ok" ? res.text : null;
  return (
    // `data-note-lead` stands the head's rule down (`CardHead`), so the note and the title read as one
    // block, and only while there is a note to stand in its place.
    <div data-note-lead="" className="mt-2.5 mb-3 flex gap-[9px]">
      {MARK}
      {waiting ? (
        <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
          <NodeStars tone="ai" />
          {waiting}
        </p>
      ) : res?.state === "unavailable" ? (
        <p className="m-0 text-body text-muted-foreground">no note right now</p>
      ) : (
        <TypedNote text={text!} waited={waited} className="m-0 text-body leading-snug text-foreground" />
      )}
    </div>
  );
}
