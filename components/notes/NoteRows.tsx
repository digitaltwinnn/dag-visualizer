"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Door } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";
import { useFeedRead } from "@/components/useFeedRead";
import { focusPreviews } from "@/components/useSubjectPairing";
import { latestTickOf } from "@/src/data/ladderLevels";
import { getNetwork } from "@/src/data/network";
import type { NotableKind, NoteChange, NoteChangeKind, NoteDay, NoteResponse, NoteView } from "@/src/data/noteTypes";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { rangeDays } from "@/src/util/localTime";
import { commitNoteDay } from "./commitNoteDay";
import { changeActions, changeHover, staysOnCard } from "./noteChangeTarget";
import NoteKindCoin from "./NoteKindCoin";
import NoteText from "./NoteText";
import { NOTE_KIND_WORD, daysByDate } from "./noteDays";

// A NOTE'S ROWS: the notable days and changes under its text, on the top card's foot and under a
// subject card's note alike (user, 2026-11-02: "explicit as addition to the overall text").

const DAY_MS = 86_400_000;

// THE CARD'S CONTROLS ARE DOORS (`parts.tsx` — the one way a card draws a way out, with the
// per-ground wash the user ruled). They sit flush on the card's bottom edge (RecordsDoor's foot
// geometry): the run bleeds by the card's padding below, and its last door takes the inner radius.
/** The most coins the foot stacks: enough to say what kinds are inside, in the row's own height. */
const STACK_MAX = 3;
const LAST_ROW = "[&>:last-child]:rounded-b-[calc(var(--radius)-1px)]";
export const DOOR_RUN = `-mb-[var(--card-pad)] ${LAST_ROW}`;

/** One notable day: DATE AND KIND LEAD (user, 2026-10-30, design option B of four in the
 *  brainstorming companion), then the caption. The date is the door's label at a fixed width so
 *  the rows align; the kind mark is the one coin every surface draws (`NoteKindCoin`, design C); the
 *  caption WRAPS rather than truncating (no hover reveals text here, the tooltip rule), and the
 *  prompt keeps it to a short clause since the row already says the date and the kind. Hover
 *  previews the day (`hoverNoteDay`), a click commits it as History's range. */
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
      tone="ai"
      lit={lit}
      wrap
      label={
        <span className="inline-flex items-center gap-2">
          <span className="w-[3.4em] text-label tabular-nums">{rangeDays(day.dayMs, day.dayMs + DAY_MS)}</span>
          <NoteKindCoin kind={day.kind} row />
          <span className="sr-only">{NOTE_KIND_WORD[day.kind]}</span>
        </span>
      }
      onPointerEnter={(e) => e.pointerType === "mouse" && on()}
      onPointerLeave={off}
      onFocus={() => focusPreviews() && on()}
      onBlur={off}
      onClick={() => commitNoteDay(day)}
    >
      <NoteText text={day.caption} />
    </Door>
  );
}

/** ONE NOTABLE CHANGE (user, 2026-10-31): what moved over the note's span, the kind's coin then a
 *  sentence code wrote, so unlike a day's caption it is never the model's. The row is the subject's:
 *  it commits and hovers what the view's explorer row for that subject does (`noteChangeTarget`).
 *  A subject with nothing to open is listed all the same, in the same style, and takes no click. */
function ChangeRow({ change, view, onCard }: { change: NoteChange; view: NoteView; onCard?: boolean }) {
  useFeedRead(["clusters", "api-geo"], "Notable change");
  useFeedRead(["global", "metasnaps"], "Notable change", view === "ledger");
  const selNodes = useStore((s) => s.selNodes);
  const hover = changeHover(change, selNodes);
  const lit = useStore((s) => {
    if (!hover) return false;
    if (hover.channel === "filter") return s.hoverFilter === hover.key;
    if (hover.channel === "metaSnap") return s.hoverMetaSnap === hover.key;
    if (hover.channel === "snap") return s.hoverSnapOrd === Number(hover.key);
    return (hover.channel === "country" ? s.hoverCountry : s.hoverGroup) === hover.key;
  });
  const actions = () => {
    const s = useStore.getState();
    const net = view === "ledger" ? getNetwork() : null;
    const id = change.subject.kind === "network" ? change.subject.id : null;
    const state = {
      filter: s.filter,
      railNet: s.railNet,
      country: s.country,
      cohort: s.cohort,
      composition: s.composition,
      hasInspect: !!s.inspect,
      metaSnap: s.metaSnap,
      following: s.following,
      pinnedOrdinal: s.following ? null : (s.snap?.data.ordinal ?? null),
      inspect: s.inspect,
      tickNet: s.tickNet,
      block: s.block,
      ledgerNet: ledgerNetwork({ filter: s.filter, tickNet: s.tickNet, snapOrdinal: s.snap?.data.ordinal ?? null }),
    };
    const acts = changeActions(change, view, state, s.selNodes, net && id ? latestTickOf(net.metaSnaps, net.globalSnapshots, id) : null);
    return onCard && acts && !staysOnCard(acts) ? null : acts;
  };
  const preview = (on: boolean) => {
    if (!hover) return;
    const s = useStore.getState();
    if (hover.channel === "filter") return s.setHoverFilter(on ? hover.key : null);
    if (hover.channel === "metaSnap") return s.setHoverMetaSnap(on ? hover.key : null);
    if (hover.channel === "snap") return s.setHoverSnapOrd(on ? Number(hover.key) : null);
    if (hover.channel === "group") {
      s.setHoverGroup(on ? hover.key : null);
      s.setHoverCohort(on ? (hover.nodes ?? null) : null);
    }
    if (hover.channel === "country" || hover.cc) s.setHoverCountry(on ? (hover.cc ?? hover.key) : null);
  };
  // A row can leave under the pointer: its click moves the note on. Nothing else clears a hover.
  const held = useRef(false);
  const release = useRef(preview);
  release.current = preview;
  useEffect(() => () => {
    if (held.current) release.current(false);
  }, []);
  const on = () => {
    held.current = true;
    preview(true);
  };
  const off = () => {
    held.current = false;
    preview(false);
  };
  return (
    <Door
      tone="ai"
      lit={lit}
      wrap
      still={actions() == null}
      label={<NoteKindCoin kind={change.kind} row />}
      onPointerEnter={(e) => e.pointerType === "mouse" && on()}
      onPointerLeave={off}
      onFocus={() => focusPreviews() && on()}
      onBlur={off}
      onClick={() => {
        const acts = actions();
        if (acts) applyClickActions(acts);
      }}
    >
      <NoteText text={change.text} />
    </Door>
  );
}

/** A NOTE'S ROWS, ON THE CARD'S FOOT (user, 2026-10-31, option B of five). The card tops the lane, so
 *  a run of rows open by default would push the view's subject cards down the rail (2026-10-27), and
 *  a label floating between the note and the rows belonged to neither. Folded, they are one door on
 *  the card's bottom edge, the "Snapshot records" recipe, their coins stacked to say what is inside.
 *  Open, they unfold below it (same day: a control left under its own list "looks strange"), so the
 *  chevron says the plain thing: down to open, up to close. Keyed on the subject by the caller, so a
 *  new subject starts folded. */
function NoteRows({ word, kinds, onCard, children }: { word: string; kinds: readonly (NotableKind | NoteChangeKind)[]; onCard?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={onCard ? "mt-2.5" : cn("mt-3", DOOR_RUN)}>
      <Door
        tone="ai"
        expanded={open}
        controls={panel}
        onClick={() => setOpen((o) => !o)}
        label={
          <span aria-hidden className="inline-flex [&>:not(:first-child)]:-ml-[5px]">
            {kinds.slice(0, STACK_MAX).map((k, i) => (
              <NoteKindCoin key={i} kind={k} />
            ))}
          </span>
        }
        glyph={<ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />}
      >
        {kinds.length} notable {word}{kinds.length === 1 ? "" : "s"}
      </Door>
      {open && (
        <div id={panel} className={LAST_ROW}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A note's rows. `subject` keys the fold, so a new subject starts folded. `onCard` is a subject
 *  card's: the rows sit under the note, not on the card's foot, and never close the card. */
export function NoteFoot({ res, view, subject, onCard }: { res: Extract<NoteResponse, { state: "ok" }>; view: NoteView; subject: string; onCard?: boolean }) {
  return (
    <>
      {res.days.length > 0 && (
        <NoteRows key={subject} word="day" kinds={daysByDate(res.days).map((d) => d.kind)} onCard={onCard}>
          {/* Not keyed by day alone: one day can be two notables (a network's low and its
              pause; two networks' first day on the DAG). */}
          {daysByDate(res.days).map((d) => (
            <DayRow key={`${d.dayMs}:${d.kind}:${d.networkId ?? ""}`} day={d} />
          ))}
        </NoteRows>
      )}
      {res.changes?.length ? (
        <NoteRows key={subject} word="change" kinds={res.changes.map((c) => c.kind)} onCard={onCard}>
          {res.changes.map((c) => (
            <ChangeRow key={c.text} change={c} view={view} onCard={onCard} />
          ))}
        </NoteRows>
      ) : null}
    </>
  );
}
