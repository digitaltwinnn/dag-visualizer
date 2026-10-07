"use client";

import { QualifierChip } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";
import { stampParts, utcStamp } from "@/src/util/localTime";

/** A CLOCK TIME, DRAWN (user, 2026-10-07: "Oct 7, 2026, 07:22:41 PM GMT+2 … looks a lot of text,
 *  can you design these texts a bit, maybe add timezone as a tag?"). The common practice: the time
 *  in full ink, the date quieter beside it (its year only when it is not this year), and the zone
 *  as a small tag — the app's qualifier chip — since it qualifies the reading rather than being
 *  part of it. UTC rides the hover, for matching an explorer. `quietDate` is off where the stamp is
 *  a TITLE and the date is part of the headline. */
export default function Stamp({
  ms,
  seconds,
  quietDate = true,
  className,
}: {
  ms: number;
  seconds?: boolean;
  quietDate?: boolean;
  className?: string;
}) {
  const { date, time, zone } = stampParts(ms, { seconds });
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-1.5 tabular-nums", className)} title={utcStamp(ms)}>
      <span className={cn(quietDate && "text-muted-foreground")}>{date}</span>
      <span>{time}</span>
      {zone && <QualifierChip className="self-center font-normal">{zone}</QualifierChip>}
    </span>
  );
}
