"use client";
import { useCallback, useEffect, useState } from "react";
import type { NoteVia } from "@/components/railCards";
import type { NoteResponse } from "@/src/data/noteTypes";
import { netUrl } from "@/src/net/current";
import { createNoteLoader, queryOf, type NoteReq } from "./noteLoader";

// The AI note, client side. NOT a network feed (no `FEEDS` row, no `useFeedRead`): it is written
// context, fetched per subject. The fetch / poll / give-up rules live in `noteLoader.ts`; this is
// the React wrapper: it follows the `useTrendsWindow` idiom (one module-level cache and in-flight
// map shared by every consumer), and `request()` is the reader's gesture for the on-request kinds
// (the 1H pill, a brushed range) — the only thing that ever POSTs.

const loader = createNoteLoader({
  urlOf: netUrl,
  fetchImpl: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
});

export interface NoteState {
  /** Null until the first answer (or while `req` is null). */
  res: NoteResponse | null;
  /** Which path `res` came by: "request" once the reader's gesture has answered (R68: a failed
   *  write then keeps the card, with the door again), "read" for every GET answer. */
  via: NoteVia;
  /** Ask for the note to be written; shows `pending` until the answer lands. */
  request: () => void;
}

/** A null `req` skips the fetch entirely, for a surface whose subject is conditional. */
export default function useNote(req: NoteReq | null): NoteState {
  const key = req ? queryOf(req) : null;
  const [state, setState] = useState<{ key: string | null; res: NoteResponse | null; via: NoteVia }>(() => ({
    key,
    res: req ? loader.peek(req) : null,
    via: "read",
  }));
  // The subject changed: show the held answer for it (or nothing) in the same render, never the last one's.
  const res = state.key === key ? state.res : req ? loader.peek(req) : null;
  const via: NoteVia = state.key === key ? state.via : "read";

  const view = req?.view;
  const subject = req?.subject;
  const span = req?.span;

  useEffect(() => {
    if (!view || !subject || key == null) return;
    let dead = false;
    // A GET that answers `pending` is a note being written: say so while the loader polls (M3).
    const onPending = () => {
      if (!dead) setState({ key, res: { state: "pending" }, via: "read" });
    };
    void loader.get({ view, subject, span }, onPending).then((r) => {
      if (!dead) setState({ key, res: r, via: "read" });
    });
    return () => {
      dead = true;
    };
  }, [key, view, subject, span]);

  const request = useCallback(() => {
    if (!view || !subject || key == null) return;
    setState({ key, res: { state: "pending" }, via: "request" });
    void loader.request({ view, subject, span }).then((r) => setState((prev) => (prev.key === key ? { key, res: r, via: "request" } : prev)));
  }, [key, view, subject, span]);

  return { res, via, request };
}
