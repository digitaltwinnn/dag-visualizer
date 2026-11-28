"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import useSubmitters from "@/components/useSubmitters";
import { DED_ID } from "@/src/data/submitters";

// THE ONE WRITER OF THE ORGANISATION PALETTE (`store.submitterPalette`, 2026-11-27): the Data blocks
// chamber bands each Digital Evidence box by its organisations, and which of them wear a hue is the
// read route's `palette` (the busiest of all time) — fetched data that lives in React's cache, so a
// bridge carries it to the Engine, which hands it to the chamber as plain data (scene/ never reads
// the store). It reads only while the Snapshots view is in the Data blocks register, the one place
// bands are drawn; elsewhere it asks nothing and leaves the last palette standing (nothing draws it).
// A fresh array is published only when the ids change: the Engine's change signal is `!==`.
// `components/publishChannelBoundary.test.ts` holds it to the one writer.
export default function SubmitterPaletteBridge() {
  const drawn = useStore((s) => s.mode === "ledger" && s.ledgerRegister === "data");
  const { data } = useSubmitters(drawn ? { net: DED_ID, window: "24h" } : null, "SubmitterPaletteBridge");
  const sent = useRef<string | null>(null);
  const ids = data?.palette;
  useEffect(() => {
    if (!ids) return;
    const key = ids.join(",");
    if (key === sent.current) return;
    sent.current = key;
    useStore.getState().publishSubmitterPalette([...ids]);
  }, [ids]);
  return null;
}
