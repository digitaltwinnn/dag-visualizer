"use client";

import CardHead, { RailPane } from "@/components/CardHead";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { AI_NOTES_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { Door, QualifierChip } from "@/components/inspector/parts";
import { NodeStars } from "@/components/state/StateAtoms";
import { cn } from "@/lib/utils";
import { spanPhrase } from "@/src/data/trendWindow";
import { useStore } from "@/src/store/store";
import { AI_CARD_TITLE, noteSpanWords } from "./noteSubject";
import { DOOR_RUN, NoteFoot } from "./NoteRows";
import TypedNote from "./TypedNote";
import { useAiNote, useWaited } from "./useAiNote";

// THE AI NOTES CARD (2026-10-27) — a few sentences a model wrote about what the view is showing,
// the VIEW's note at the Metagraph rung's scope (`noteSubjectOf`: the network, else everything; in
// History over the window pill), with History's few
// notable days that each commit their own day as the range, and the other views' notable changes
// that each commit their own subject, both folded into the card's foot. It HOLDS under a drill (spec 2026-10-29-subject-notes): a committed country,
// provider, make-up or brushed range carries its own note inside its own card (`SubjectNote`).
//
// It is CONTEXT, not a reading: the one card in the rail whose words no instrument measured, marked
// as such — the sparkles mark in the AI hue (`--ai-mark`) at the title's left on both tiers, and the
// iridescent `--ai-edge` outline on the open box. THE TITLE NAMES THE PRODUCT (user, 2026-10-29:
// "Constellation Gate AI, this is the product and I'd like to promote it a bit") — Gate AI,
// Constellation's own AI product, writes the notes (`app/api/notes/gate.ts`), so the card wears its
// name rather than the generic "AI notes"; "notes" stays the word for what it writes (the doors, the
// About copy).
//
// ⚠️ A TOP CARD, PART OF THE STACK — NOT A SUBJECT CARD (user, 2026-10-27, R57: "a top card, part
// of the stack. Not as a so-called subject card, so if there is a true subject card (metagraph,
// snapshot, whatever) by default that will have the focus still, with the AI card header subtly
// sitting on top as per current stack design"). It is the FIRST slot of every note view's lane
// (`railCards.DISPLAY_LANE`, no ladder rung): in the slab, on the thread, under the rail's
// single-open accordion like every card. At rest — nothing CHOSEN; a card the view seats by itself,
// History's window range or Snapshots' live tick, is no choice (R70) — it is the focus and the one
// open box; once a chosen subject card stands, the focus is that card's (`focusSlotId`) and this
// one rests as the pile's top ENTRY, its eyebrow and title only, dimmed with distance like any
// committed ancestor. Clicking the entry opens it the way any entry opens. (Two earlier homes were
// rejected the same day: a card leading the rail outside the lane — "not part of [the ladder] (no
// rung), so the relationship feels a bit off" — and the note inside whichever subject card was on
// top — "it shows up in various cards is not logical for a user".)
//
// ⚠️ MODEL TEXT IS UNTRUSTED. It renders as React text, nothing else: no `dangerouslySetInnerHTML`,
// no markdown. The server's honesty gate checked its numbers before it was stored; nothing here
// interprets it.

/** THE RAIL'S OWN HEAD GRAMMAR (user, 2026-10-29: "re-use the same card structure as the others in
 *  the rung"): a TITLE with a kind mark at its left, a QUALIFIER CHIP as the aside, the note where
 *  every card puts its first descriptive line ("Anchored by 4 metagraphs") — and NO EYEBROW (user:
 *  "remove 'note', 'Constellation Gate AI' is the title"): the product's name is the whole head,
 *  the one card in the pile that is not a kind of subject. The title is the product's name on both tiers — the subject is the subject
 *  card's to name, and "What changed" was no datum — and the sparkles mark in the AI hue at its left
 *  is what says this is the one card a model wrote (it is no `data-kindmark`: the fold keeps it on
 *  purpose). The chip is the span the note covers, in the explorer's span words (`noteSpanWords`;
 *  History's is the window pill on screen), to the right like the dossier's ticker (user: "a
 *  pill-type of element to the right like on other cards"), so the body carries no Span row and no
 *  Written row ("implied by 'last 6 hours'"). */

/** The door that asks for the on-request window note (the 1H pill): the first ask, and the ask
 *  again after a write that failed (R68). A brushed range's note is the Range card's, asked
 *  without a door (`SubjectNote`). */
function RequestDoor({ onClick }: { onClick: () => void }) {
  return (
    <div className={DOOR_RUN}>
      <Door tone="ai" label={<AI_NOTES_ICON aria-hidden className="size-3.5 text-primary" />} onClick={onClick}>
        Write notes for this hour
      </Door>
    </div>
  );
}

export default function NotesCard({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { subject, req, note } = useAiNote();
  const trendWindow = useStore((s) => s.trendWindow);
  // THE ARRIVAL PULSE every rail card plays (user, 2026-10-30: "AI card is missing the animation
  // on the left side when the card becomes active"), in the AI hue rather than the filter's.
  const pulseKey = useEdgePulse(subject ? `${subject.view}:${subject.subject}` : null);
  const waited = useWaited(note.res);
  if (!subject || !req) return null;

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
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <AI_NOTES_ICON aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--ai-mark)]")} />
            <span className="truncate">{AI_CARD_TITLE}</span>
          </span>
        }
        titleKey={titleKey}
        // The span the note covers, the head's qualifier: History's is the window pill, the other
        // views' their fixed read (`noteSpanWords`). (After `title`: tooltipBoundary reads a `title=`
        // as the nearest preceding element's, and a chip in the aside would have claimed it.)
        aside={<QualifierChip>{subject.view === "trend" ? spanPhrase(trendWindow, null) : noteSpanWords(subject.view)}</QualifierChip>}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div>
          {/* No answer yet is READING (the manifest's `noteCardAbsent`): the card stands from the
              moment its subject is known. ONE WAITING WORD (user, 2026-10-30: "the reading/writing
              distinction is not really relevant to the user, writing is purely technical for our
              cache strategy"): a held note and one the model is still writing (the server's
              `pending`, M3) both read as the card reading its note. `none` and a read's
              `unavailable` never reach here: the slot stands down (R67). */}
          {res == null || res.state === "pending" ? (
            <p className="m-0 flex items-center gap-2 text-body text-muted-foreground">
              <NodeStars tone="ai" />
              reading…
            </p>
          ) : res.state === "request" ? (
            // The on-request window (the 1H pill): written only on the reader's ask.
            <RequestDoor onClick={note.request} />
          ) : res.state === "unavailable" ? (
            // Only the reader's own ask reaches here (a read's `unavailable` stands the slot down,
            // `noteCardAbsent`): the gesture is answered on the card, with the same door again (R68).
            <>
              <p className="m-0 mb-2.5 text-body text-muted-foreground">Couldn&apos;t write notes just now</p>
              <RequestDoor onClick={note.request} />
            </>
          ) : res.state === "ok" ? (
            <>
              {/* The text alone (user, 2026-10-29): no Written row — the span under the title says
                  what it covers, and the note is rewritten on its own cadence. */}
              <TypedNote text={res.text} waited={waited} className="m-0 text-body leading-snug text-foreground" />
              <NoteFoot res={res} view={subject.view} subject={titleKey} />
            </>
          ) : null}
        </div>
      )}
      <PulseEdge pulseKey={pulseKey} rail="right" off={collapsed} hue="var(--ai-mark)" />
    </RailPane>
  );
}
