"use client";

import { NOTE_KIND_ICONS } from "@/components/icons";
import { QualifierChip } from "@/components/inspector/parts";
import type { NoteDay } from "@/src/data/noteTypes";
import { identityHudCss } from "@/src/palette/identity";
import { NOTE_KIND_WORD } from "./noteDays";

/** A NOTABLE DAY'S KIND AS A HEAD CHIP (user, 2026-10-30: "a 2nd pill on the right side in the
 *  header"): the day's mark in its network's hue and the kind's word, the same pair the AI card's
 *  row leads with, so a Moment or Range that lands on a notable day says so where its other
 *  qualifier sits. A qualifier chip, so the fold drops it with the rest (design D). */
export default function NoteKindChip({ day }: { day: NoteDay }) {
  const Mark = NOTE_KIND_ICONS[day.kind];
  const hue = day.networkId ? identityHudCss(day.networkId) : undefined;
  return (
    <QualifierChip className="gap-1">
      <Mark aria-hidden className="size-3 flex-none" style={hue ? { color: hue } : undefined} />
      {NOTE_KIND_WORD[day.kind]}
    </QualifierChip>
  );
}
