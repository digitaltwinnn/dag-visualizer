"use client";
import { pollHealthRows } from "@/src/data/api";
import { neverConnected } from "@/src/data/pollShare";
import { useNowTick } from "@/components/useNowTick";

/** Whether the network has never answered this session (`neverConnected` — its header says what
 *  that is and is not). The poll-health registry is a plain module, not a store, so the read is
 *  refreshed on a slow tick: the state it reports changes at most once, a few seconds after boot. */
export function useNoSignal(): boolean {
  useNowTick(2000);
  return neverConnected(pollHealthRows());
}

/** The one sentence a surface says in that state. */
export const NO_SIGNAL_COPY = "No signal. This network is not answering; still trying.";
