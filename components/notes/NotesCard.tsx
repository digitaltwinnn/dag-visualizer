"use client";

import { useEffect, useId, useRef, useState } from "react";

import CardHead, { RailPane } from "@/components/CardHead";
import { AI_NOTES_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { Door, Fact, FactGroup, foldLabel } from "@/components/inspector/parts";
import { metagraphCardNetwork } from "@/components/railCards";
import { NodeStars } from "@/components/state/StateAtoms";
import { useNet } from "@/components/topbar/useNet";
import Stamp from "@/components/Stamp";
import { useFeedRead } from "@/components/useFeedRead";
import { useTickHasFilter } from "@/components/useTickHasFilter";
import { cn } from "@/lib/utils";
import type { NoteDay, NoteView } from "@/src/data/noteTypes";
import { spanPhrase } from "@/src/data/trendWindow";
import { displayNetwork, UNLISTED_ID } from "@/src/data/unlisted";
import { NET } from "@/src/net/current";
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
// `--ai-ink`, globals.css), the sparkles mark, its own place FIRST in the rail, above the ladder it
// briefs and outside every lane (user, 2026-10-27: the old details card's place) — and it never
// sits in the slab's pile, whose adjacency means containment.
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
  // Notes are written for mainnet only (the routes answer `none` everywhere else), so off mainnet
  // nothing is asked and no card stands — never a card that reads, then vanishes.
  // ⚠️ HYDRATION (I2): the server always renders mainnet, so the card's presence reads the network
  // through `useNet()` — mainnet until mounted, on the client too — and server and client agree on
  // the first render (a mismatch makes React 19 regenerate the tree and strip <html data-net>). The
  // FETCH reads the real network, so a dev network's one mainnet-faced frame asks nothing: its card
  // reads for that frame, under the boot overlay, then stands down.
  const net = useNet();
  const req: NoteReq | null = subject && net === "mainnet" ? { view: subject.view, subject: subject.subject, span } : null;
  return { subject, req, note: useNote(NET === net ? req : null) };
}

/** What the note read, as one value: a span of two days or more by its UTC days (the app's one
 *  span label), a shorter one by its length. */
function spanWords(fromMs: number, toMs: number): string {
  return toMs - fromMs >= 2 * DAY_MS ? rangeDays(fromMs, toMs) : ageWords(toMs - fromMs);
}

// THE CARD'S CONTROLS ARE DOORS (`parts.tsx` — the one way a card draws a way out, with the
// per-ground wash the user ruled). They sit flush on the card's bottom edge (RecordsDoor's foot
// geometry): the run bleeds by the card's padding below, and its last door takes the inner radius.
const DOOR_RUN = "-mb-[var(--card-pad)] [&>:last-child]:rounded-b-[calc(var(--radius)-1px)]";

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
    <Door
      lit={lit}
      wrap
      figure={rangeDays(day.dayMs, day.dayMs + DAY_MS)}
      onPointerEnter={on}
      onPointerLeave={off}
      onFocus={on}
      onBlur={off}
      onClick={() => useStore.getState().setTrendRange({ fromMs: day.dayMs, toMs: day.dayMs + DAY_MS })}
    >
      {day.caption}
    </Door>
  );
}

/** THE NOTABLE DAYS, FOLDED (user, 2026-10-27): the card leads the rail, so a run of days open by
 *  default would push History's range card down the rail. The fold is marked on its label
 *  (`foldLabel`, the app's there-is-more affordance), the count on the right edge. Keyed on the
 *  subject by the caller, so a new subject starts folded. */
function NotableDays({ days }: { days: NoteDay[] }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      {/* THE APP'S FOLD (ScheduleGroup's recipe, `inspector/cards.tsx`): one CONTROL that selects
          nothing, a keyboard-only focus outline, the touch tier's tap height, the label lifting to
          full ink on hover and when open. Phrasing content only inside a <button>: no <div>. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group mt-3 flex w-full items-center justify-between gap-2.5 touch:min-h-10 cursor-pointer select-none border-0 bg-transparent p-0 text-left outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          open ? "mb-1.5" : "mb-0",
        )}
      >
        <span className={cn("min-w-0 truncate text-label tracking-caps uppercase", open ? "text-foreground" : "text-muted-foreground group-hover:text-foreground", foldLabel(open))}>
          Notable days
        </span>
        <span className="flex-none font-mono text-body font-bold tabular-nums text-foreground">{days.length}</span>
      </button>
      {open && (
        <div id={panel} className={DOOR_RUN}>
          {/* Not keyed by day alone: one day can be two notables (a network's low and its pause;
              two networks' first day on the DAG). */}
          {days.map((d) => (
            <DayRow key={`${d.dayMs}:${d.kind}:${d.networkId ?? ""}`} day={d} />
          ))}
        </div>
      )}
    </>
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
      // THE IRIDESCENT EDGE: a 1px transparent border with three background layers — the card's own
      // fill and, under it, the opaque page ground, both clipped to the padding box, over the
      // `--ai-edge` sweep clipped to the border box, so the sweep shows only in the border ring.
      // The ground is load-bearing: `--panel-solid` is translucent, and without it the sweep tinted
      // the whole fill (user, 2026-10-27: "I like the outline but fill is too much AI color").
      className="border border-transparent [background:linear-gradient(var(--panel-solid),var(--panel-solid))_padding-box,linear-gradient(var(--background),var(--background))_padding-box,var(--ai-edge)_border-box]"
    >
      <CardHead
        eyebrow={EYEBROW}
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <AI_NOTES_ICON aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
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
          {/* No answer yet is READING (the manifest's `noteCardAbsent`): the card stands from the
              moment its subject is known. "writing…" is the server's own `pending`, a note being
              written — a GET's as soon as the loader hears it (M3), or a POST's. */}
          {res == null ? (
            <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
              <NodeStars />
              reading…
            </p>
          ) : res.state === "pending" ? (
            <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
              <NodeStars />
              writing…
            </p>
          ) : res.state === "unavailable" ? (
            <p className="m-0 text-body text-muted-foreground">Notes unavailable — try again later</p>
          ) : res.state === "request" ? (
            // The on-request kinds (the 1H pill, a brushed range): written only on the reader's ask.
            <div className={DOOR_RUN}>
              <Door label={<AI_NOTES_ICON aria-hidden className="size-3.5 text-primary" />} onClick={note.request}>
                {req.span === "1h" ? "Write notes for this hour" : "Write notes for this range"}
              </Door>
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
              {res.days.length > 0 && <NotableDays key={titleKey} days={res.days} />}
            </>
          ) : null}
        </div>
      )}
    </RailPane>
  );
}
