"use client";

import { useEffect, useId, useRef, useState } from "react";

import CardHead, { RailPane } from "@/components/CardHead";
import { AI_NOTES_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { Door, Fact, FactGroup, foldLabel } from "@/components/inspector/parts";
import { NodeStars } from "@/components/state/StateAtoms";
import Stamp from "@/components/Stamp";
import { useFeedRead } from "@/components/useFeedRead";
import { cn } from "@/lib/utils";
import type { NoteDay, NoteView } from "@/src/data/noteTypes";
import { spanPhrase } from "@/src/data/trendWindow";
import { displayNetwork } from "@/src/data/unlisted";
import { useStore } from "@/src/store/store";
import { rangeDays } from "@/src/util/localTime";
import { ageWords } from "@/src/util/relativeAge";
import { useAiNote } from "./useAiNote";

// THE AI NOTES CARD (2026-10-27) — a few sentences a model wrote about what the view is showing,
// for the subject the view stands on (`noteSubjectOf`: the network, the country, the plane), and
// for History a few notable days that each commit their own day as the range.
//
// It is CONTEXT, not a reading: the one card in the rail whose words no instrument measured, marked
// as such — the `--ai-ink` eyebrow and the sparkles mark on both tiers, and the iridescent
// `--ai-edge` outline on the open box.
//
// ⚠️ A TOP CARD, PART OF THE STACK — NOT A SUBJECT CARD (user, 2026-10-27, R57: "a top card, part
// of the stack. Not as a so-called subject card, so if there is a true subject card (metagraph,
// snapshot, whatever) by default that will have the focus still, with the AI card header subtly
// sitting on top as per current stack design"). It is the FIRST slot of every note view's lane
// (`railCards.DISPLAY_LANE`, no ladder rung): in the slab, on the thread, under the rail's
// single-open accordion like every card. At rest — no subject card present — it is the focus and
// the one open box; once a subject card stands, the focus is that card's (`focusSlotId`) and this
// one rests as the pile's top ENTRY, its eyebrow and title only, dimmed with distance like any
// committed ancestor. Clicking the entry opens it the way any entry opens. (Two earlier homes were
// rejected the same day: a card leading the rail outside the lane — "not part of [the ladder] (no
// rung), so the relationship feels a bit off" — and the note inside whichever subject card was on
// top — "it shows up in various cards is not logical for a user".)
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

/** THE NOTABLE DAYS, FOLDED (user, 2026-10-27): the card tops the lane, so a run of days open by
 *  default would push History's subject cards down the rail. The fold is marked on its label
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
      // THE IRIDESCENT EDGE — on the open BOX only: the resting entry stays as subtle as every
      // ancestor entry, its AI-ink eyebrow mark enough (R57). A 1px transparent border with three
      // background layers — the card's own fill and, under it, the opaque page ground, both clipped
      // to the padding box, over the `--ai-edge` sweep clipped to the border box, so the sweep
      // shows only in the border ring.
      // The ground is load-bearing: `--panel-solid` is translucent, and without it the sweep tinted
      // the whole fill (user, 2026-10-27: "I like the outline but fill is too much AI color").
      // ONE EDGE ON BOTH GROUNDS (review M1): in the slab the open box also draws `--box-rule`, the
      // paper's heavier inset ring (globals.css, Print) — a second hairline inside the sweep. The
      // sweep already says "this is the open one", so this card states the token transparent on
      // itself (dark's arm already is); the slab rule, its lift and ambient are untouched.
      className={
        collapsed
          ? undefined
          : "border border-transparent [--box-rule:transparent] [background:linear-gradient(var(--panel-solid),var(--panel-solid))_padding-box,linear-gradient(var(--background),var(--background))_padding-box,var(--ai-edge)_border-box]"
      }
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
              written — a GET's as soon as the loader hears it (M3), or a POST's. `none` and
              `unavailable` never reach here: the slot stands down (R67). */}
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
