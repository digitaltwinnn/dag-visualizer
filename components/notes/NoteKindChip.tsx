"use client";

import { NOTE_KIND_ICONS } from "@/components/icons";
import { QualifierChip } from "@/components/inspector/parts";
import type { NoteDay } from "@/src/data/noteTypes";
import { networkMark } from "@/components/explorer/nodeRow";
import { AI_SWEEP } from "./aiSweep";
import { NOTE_KIND_WORD } from "./noteDays";

/** A NOTABLE DAY'S KIND AS A HEAD CHIP (user, 2026-10-30: "a 2nd pill on the right side in the
 *  header"): the day's mark in its network's hue and the kind's word, the same pair the AI card's
 *  row leads with, so a Moment or Range that lands on a notable day says so where its other
 *  qualifier sits. A qualifier chip, so the fold drops it with the rest (design D). */
export default function NoteKindChip({ day }: { day: NoteDay }) {
  const Mark = NOTE_KIND_ICONS[day.kind];
  // The unlisted set keeps its mandated neutral: no single identity can speak for a mixed set.
  const hue = day.networkId ? networkMark(day.networkId).hue : undefined;
  return (
    // THE AI'S OWN EDGE (user, 2026-10-30: "if the tag comes from AI give it that color outline
    // also"): the card's iridescent sweep (`AI_SWEEP`), so a chip a model's note produced is
    // marked like the note itself, where every other qualifier chip is the card's neutral hairline.
    <QualifierChip className={AI_SWEEP}>
      {/* One flex row inside the chip's truncating span: preflight makes an svg `display:block`,
          so a bare mark beside text stood on its own line (user, 2026-10-30: "spans two rows"). */}
      <span className="flex items-center gap-1">
        <Mark aria-hidden className="size-3 flex-none" style={hue ? { color: hue } : undefined} />
        {NOTE_KIND_WORD[day.kind]}
      </span>
    </QualifierChip>
  );
}
