"use client";

import { useEffect, useRef } from "react";

import CardHead, { RailPane } from "@/components/CardHead";
import { AI_NOTES_ICON } from "@/components/icons";
import { Fact, FactGroup, SectionLabel } from "@/components/inspector/parts";
import { metagraphCardNetwork } from "@/components/railCards";
import { NodeStars } from "@/components/state/StateAtoms";
import Stamp from "@/components/Stamp";
import { useFeedRead } from "@/components/useFeedRead";
import { useTickHasFilter } from "@/components/useTickHasFilter";
import { cn } from "@/lib/utils";
import type { NoteDay, NoteView } from "@/src/data/noteTypes";
import { spanPhrase } from "@/src/data/trendWindow";
import { displayNetwork, UNLISTED_ID } from "@/src/data/unlisted";
import { cardNetwork } from "@/src/engine/domain/trendStack";
import { useStore } from "@/src/store/store";
import { rangeDays } from "@/src/util/localTime";
import { ageWords } from "@/src/util/relativeAge";
import { noteSubjectOf, type NoteSubject } from "./noteSubject";
import type { NoteReq } from "./noteLoader";
import useNote, { type NoteState } from "./useNote";

// THE AI NOTES CARD (2026-10-27) — a few sentences a model wrote about what the view is showing,
// for the subject the view stands on (`noteSubjectOf`: the network, the country, the plane), and
// for History a few notable days that each commit their own day as the range.
//
// It is CONTEXT, not a reading: the one card in the rail whose words no instrument measured. So it
// is marked as such everywhere it stands — the iridescent edge and eyebrow (`--ai-edge` /
// `--ai-ink`, globals.css), the sparkles mark, its own place LAST in the rail, outside every lane —
// and it never sits in the slab's pile, whose adjacency means containment.
//
// ⚠️ MODEL TEXT IS UNTRUSTED. It renders as React text, nothing else: no `dangerouslySetInnerHTML`,
// no markdown. The server's honesty gate checked its numbers before it was stored; nothing here
// interprets it.

const DAY_MS = 86_400_000;
/** A country subject, as `noteSubjectOf` writes it (`cc:<code>`). */
const COUNTRY_SUBJECT = /^cc:(.+)$/;
/** The eyebrow, in the AI ink: the gradient clipped to the letters. `background-image`, not the
 *  `background` shorthand — the shorthand would reset the clip `bg-clip-text` sets. */
const EYEBROW = <span className="[background-image:var(--ai-ink)] bg-clip-text text-transparent">AI notes</span>;

/** The title while the view stands on everything — what the note is ABOUT, per view. */
const RESTING_TITLE: Record<NoteView, string> = {
  hyper: "The hypergraph today",
  geo: "Where the network runs",
  ledger: "The anchoring rhythm",
  trend: "What changed",
};

/** THE NOTE ON SCREEN, one derivation for the card and the rail's manifest: the subject the view
 *  stands on, the request for its note, and the answer. Two callers share one fetch (the loader's
 *  cache and in-flight map are module-level). */
export function useAiNote(): { subject: NoteSubject | null; req: NoteReq | null; note: NoteState } {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const tickNet = useStore((s) => s.tickNet);
  const snap = useStore((s) => s.snap);
  const inspect = useStore((s) => s.inspect);
  const country = useStore((s) => s.country);
  const trendFocus = useStore((s) => s.trendFocus);
  const trendFront = useStore((s) => s.trendFront);
  const trendWindow = useStore((s) => s.trendWindow);
  const trendRange = useStore((s) => s.trendRange);
  const tickHasFilter = useTickHasFilter();

  const subject = noteSubjectOf(mode, {
    metagraphNetwork: metagraphCardNetwork({ mode, filter, tickNet, snap, tickHasFilter, trendFocus, trendFront, inspect }),
    country,
    trendCard: cardNetwork(filter, trendFocus, trendFront),
    unlisted: (id) => id === UNLISTED_ID,
  });
  // History's note is over the span on screen: the brushed range, else the window pill.
  const span = subject?.view === "trend" ? (trendRange ? `r${trendRange.fromMs}-${trendRange.toMs}` : trendWindow) : null;
  const req: NoteReq | null = subject ? { view: subject.view, subject: subject.subject, span } : null;
  return { subject, req, note: useNote(req) };
}

/** What the note read, as one value: a span of two days or more by its UTC days (the app's one
 *  span label), a shorter one by its length. */
function spanWords(fromMs: number, toMs: number): string {
  return toMs - fromMs >= 2 * DAY_MS ? rangeDays(fromMs, toMs) : ageWords(toMs - fromMs);
}

// THE CARD'S ROWS ARE DOORS (`parts.tsx` Door's recipe — the full-bleed row on the wash ladder
// every control in a card wears), stated here because a notable day's row needs what the Door does
// not carry: the hover pair, a lit state, and a readable figure on its right. The last row sits on
// the card's bottom edge and picks up its inner radius (RecordsDoor's foot geometry).
const ROW = cn(
  "flex w-[calc(100%+2*var(--card-pad))] items-center gap-2.5 -mx-[var(--card-pad)] px-[var(--card-pad)] py-2 touch:min-h-11",
  "border-t border-wash-strong text-left text-body text-foreground cursor-pointer last:rounded-b-[calc(var(--radius)-1px)]",
  "hover:[background:light-dark(var(--wash-hover),var(--wash-soft))]",
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
);
const ROW_REST = "[background:light-dark(var(--wash-soft),var(--wash-faint))]";
// LIT is the hover wash, held: the timeline's day mark (or this row) hovers the same day.
const ROW_LIT = "[background:light-dark(var(--wash-hover),var(--wash-soft))]";

/** One notable day: the caption, and its UTC day. Hover previews the day (`hoverNoteDay`), a
 *  click commits it as History's range. */
function DayRow({ day }: { day: NoteDay }) {
  const lit = useStore((s) => s.hoverNoteDay === day.dayMs);
  // THE ROW CLEARS ONLY WHAT IT SET: a row unmounting under the pointer (a new note, the card
  // closing) leaves no hover behind — nothing else clears this channel — but must not clear a day
  // another surface lit in the meantime.
  const mine = useRef(false);
  useEffect(
    () => () => {
      const st = useStore.getState();
      if (mine.current && st.hoverNoteDay === day.dayMs) st.setHoverNoteDay(null);
    },
    [day.dayMs],
  );
  const on = () => {
    mine.current = true;
    useStore.getState().setHoverNoteDay(day.dayMs);
  };
  const off = () => {
    mine.current = false;
    useStore.getState().setHoverNoteDay(null);
  };
  return (
    <button
      type="button"
      className={cn(ROW, lit ? ROW_LIT : ROW_REST)}
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      onClick={() => useStore.getState().setTrendRange({ fromMs: day.dayMs, toMs: day.dayMs + DAY_MS })}
    >
      <span className="min-w-0 flex-1">{day.caption}</span>
      <span className="flex-none text-muted-foreground tabular-nums">{rangeDays(day.dayMs, day.dayMs + DAY_MS)}</span>
    </button>
  );
}

export default function NotesCard({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { subject, req, note } = useAiNote();
  const trendWindow = useStore((s) => s.trendWindow);
  const trendRange = useStore((s) => s.trendRange);
  // A country is named off the located fleet's own rows — the country card's one source.
  const cc = subject ? (COUNTRY_SUBJECT.exec(subject.subject)?.[1] ?? null) : null;
  useFeedRead(["clusters", "api-geo"], "AI notes", cc != null);
  const countryName = useStore((s) => (cc ? (s.selNodes.find((r) => r.cc === cc)?.country ?? cc) : null));
  if (!subject || !req) return null;

  const title =
    subject.view === "trend" || subject.subject === "all"
      ? RESTING_TITLE[subject.view]
      : (countryName ?? displayNetwork(subject.subject)?.name ?? subject.subject);
  const res = note.res;
  const titleKey = `${subject.view}:${subject.subject}`;

  return (
    <RailPane
      entry={collapsed}
      // THE IRIDESCENT EDGE: a 1px transparent border with two background layers — the card's own
      // solid fill clipped to the padding box over the `--ai-edge` sweep clipped to the border box,
      // so the sweep shows only in the border ring.
      className="border border-transparent [background:linear-gradient(var(--panel-solid),var(--panel-solid))_padding-box,var(--ai-edge)_border-box]"
    >
      <CardHead
        eyebrow={EYEBROW}
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <AI_NOTES_ICON aria-hidden className="size-4 flex-none text-[var(--filter-accent,var(--primary))]" />
            <span className="truncate">{title}</span>
          </span>
        }
        titleKey={titleKey}
        // History's note is over the span on screen, named in the explorer's own span words.
        subtitle={subject.view === "trend" ? spanPhrase(trendWindow, trendRange) : undefined}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          {res == null || res.state === "pending" ? (
            <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
              <NodeStars />
              writing…
            </p>
          ) : res.state === "unavailable" ? (
            <p className="m-0 text-body text-muted-foreground">Notes unavailable — try again later</p>
          ) : res.state === "request" ? (
            // The on-request kinds (the 1H pill, a brushed range): written only on the reader's ask.
            <div className="-mb-[var(--card-pad)]">
              <button type="button" onClick={note.request} className={cn(ROW, ROW_REST)}>
                <AI_NOTES_ICON aria-hidden className="size-3.5 flex-none text-primary" />
                {req.span === "1h" ? "Write notes for this hour" : "Write notes for this range"}
              </button>
            </div>
          ) : res.state === "ok" ? (
            <>
              <p className="m-0 text-body leading-snug text-foreground">{res.text}</p>
              <FactGroup className="mt-2.5">
                <Fact label="Written">
                  <Stamp ms={res.writtenAt} />
                </Fact>
                <Fact label="Span">{spanWords(res.spanFrom, res.spanTo)}</Fact>
              </FactGroup>
              {res.days.length > 0 && (
                <>
                  <SectionLabel label="Notable days" className="mt-3 mb-1.5" />
                  <div className="-mb-[var(--card-pad)]">
                    {res.days.map((d) => (
                      <DayRow key={d.dayMs} day={d} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </RailPane>
  );
}
