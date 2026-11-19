"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import { getBlockWindow, onBlockWindow } from "@/src/data/pastWindow";
import { windowReadProgress } from "@/src/data/blockReads";
import { blockChainOf } from "@/src/data/blockWindow";
import { readsBlockWindow, registerOf } from "@/src/engine/domain/viewPolicy";
import { SCENE_GLASS } from "@/components/selection";
import { useFeedRead } from "@/components/useFeedRead";
import { cn } from "@/lib/utils";

// THE DAG BRAID IS ON ITS WAY (user, 2026-11-19: "the dag appeared many seconds later without a hint
// … give a hint that it's coming" — option "on the pane"). The Transaction blocks register lays the
// braid out ONCE, when every read the window wants has landed (2026-11-07: "draw it once properly"),
// and on a cold window that is many seconds: the window itself, then ~52 snapshot reads. So the pane
// stands empty from the moment the register is entered and this one quiet line sits on it, its count
// rising — "Reading the blocks… 24 of 52", the words the explorer and the band already say — until
// the braid draws in and it fades.
//
// THE CALLOUT'S SPLIT: this owns the words; the Engine (`_syncBraidHint`) places it on the pane's
// centre each frame and decides when it shows (`data-on`), since only the scene knows the braid is
// still unlaid. The count is `windowReadProgress`, in blocks — the vitals band's own unit — and the
// same settling the chamber waits for, so the line reaches its total exactly as the braid draws.

export default function BraidHint() {
  const on = useStore((s) => readsBlockWindow(registerOf(s.mode, s.ledgerRegister)));
  const reads = useStore((s) => s.blockReads);
  const miss = useStore((s) => s.blockReadMiss);
  const exactMiss = useStore((s) => s.exactMiss);
  const filter = useStore((s) => s.filter);
  useFeedRead(["api-blocks", "exact"], "BraidHint", on);
  const [w, setW] = useState(getBlockWindow);
  useEffect(() => onBlockWindow(() => setW(getBlockWindow())), []);
  if (!on) return null;
  // The count is the WINDOW BEING READ's: across a filter change the held window is still the old
  // network's, so until the new one answers the line says only that the blocks are being read.
  const { read, total } = windowReadProgress(w && w.chain === blockChainOf(filter) ? w : null, reads, miss, exactMiss);
  return (
    <div
      id="braid-hint"
      data-on="0"
      role="status"
      aria-live="polite"
      className="fixed left-0 top-0 z-[5] pointer-events-none select-none opacity-0 data-[on=1]:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
    >
      <div className={cn(SCENE_GLASS, "-translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-body leading-none text-muted-foreground")}>
        {total > 0 ? `Reading the blocks… ${read.toLocaleString()} of ${total.toLocaleString()}` : "Reading the blocks…"}
      </div>
    </div>
  );
}
