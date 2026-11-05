"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { netUrl } from "@/src/net/current";
import { POLL } from "@/src/engine/config";
import { reportPoll } from "@/src/data/api";
import { getBlockWindow, pastRetryDelay, setBlockWindow } from "@/src/data/pastWindow";
import { BLOCK_WINDOW_TICKS, blockWanted, foldBlockWindow, type BlockWindowAnswer } from "@/src/data/blockWindow";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE ONE WRITER OF THE BLOCKS REGISTER'S WINDOW (`src/data/blockWindow.ts`), PastWindowBridge's
// sibling. It asks the one rule (`blockWanted`) whenever the view, the register, the pin or the live
// feed's newest snapshot moves, fetches `/api/blocks/trail`, folds the answer against the exact
// reads, and holds the window in the module beside `NetworkData` (`pastWindow.ts`). A failed read is
// tried again on `pastRetryDelay`'s schedule; once spent, or when the pin lies beyond the trail's
// reach, the held window is CLEARED (the chamber never shows a window that does not hold the pin)
// and `blockWindowStatus` says why; the feed's health row (`api-blocks`) tracks the reads. Following the live edge, it refreshes the live trail
// every `LIVE_REFRESH_MS` and adds a tick the live feed has announced at once (its blocks are on the
// global record), leaving its anchored records for the next refresh.
const LIVE_REFRESH_MS = 30_000;

export default function BlockWindowBridge() {
  const ledger = useStore((s) => VIEW_POLICIES[s.mode].tickScoped);
  const register = useStore((s) => s.ledgerRegister);
  const following = useStore((s) => s.following);
  const pin = useStore((s) => s.snap?.data.ordinal ?? null);
  const setStatus = useStore((s) => s.setBlockWindowStatus);
  const exact = useStore((s) => s.snapshotExact);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, ledger && register === "blocks");
  const liveNewest = snaps.length ? snaps[snaps.length - 1]!.ordinal : null;
  const liveTip = snaps.length ? snaps[snaps.length - 1]! : null;

  // The last answer the route gave (raw), so the exact reads re-fold it without a fetch.
  const answer = useRef<BlockWindowAnswer | null>(null);
  // What was asked ("live" or an ordinal) and its generation: a reply applies only while it is still wanted.
  const asked = useRef<string | null>(null);
  const gen = useRef(0);
  const retry = useRef<number | null>(null);
  const dropRetry = () => {
    if (retry.current != null) window.clearTimeout(retry.current);
    retry.current = null;
  };
  useEffect(() => dropRetry, []);

  const apply = (a: BlockWindowAnswer) => {
    answer.current = a;
    setBlockWindow(foldBlockWindow(a, useStore.getState().snapshotExact));
  };

  const read = (around: number | null, g: number, attempt: number) => {
    if (g !== gen.current) return;
    fetch(netUrl(`/api/blocks/trail?around=${around ?? "live"}&n=${BLOCK_WINDOW_TICKS}`))
      .then((r) => (r.ok ? (r.json() as Promise<BlockWindowAnswer>) : null))
      .then((a) => {
        if (g !== gen.current) return;
        if (!a || !Array.isArray(a.ticks)) return failed(around, g, attempt);
        reportPoll("api-blocks", true);
        if (a.beyond) {
          // Too deep to walk to: the read worked, the answer is "beyond"; nothing to retry.
          answer.current = null;
          setBlockWindow(null);
          setStatus({ around, status: "beyond" });
          return;
        }
        apply(a);
        setStatus({ around, status: "ready" });
      })
      .catch(() => failed(around, g, attempt));
  };
  const failed = (around: number | null, g: number, attempt: number) => {
    if (g !== gen.current) return;
    reportPoll("api-blocks", false);
    const delay = pastRetryDelay(attempt);
    if (delay == null) {
      // Budget spent: stand the chamber empty for a pin (a window that lacks it would lie); the
      // live edge keeps what it holds and tries again on its next refresh.
      if (around != null) {
        answer.current = null;
        setBlockWindow(null);
      }
      setStatus({ around, status: "failed" });
      return;
    }
    retry.current = window.setTimeout(() => {
      retry.current = null;
      read(around, g, attempt + 1);
    }, delay);
  };

  useEffect(() => {
    const held = getBlockWindow();
    const want = blockWanted({ ledger, register, pin, held: held ? { from: held.from, to: held.to } : null, liveNewest });
    // Unpinning back to the live edge: the held window is the pin's, so ask for live at once.
    const backToLive = want.kind === "keep" && pin == null && asked.current != null && asked.current !== "live";
    if (want.kind === "keep" && !backToLive) return;
    if (want.kind === "clear") {
      gen.current++;
      asked.current = null;
      answer.current = null;
      dropRetry();
      setBlockWindow(null);
      if (useStore.getState().blockWindowStatus) setStatus(null);
      return;
    }
    const around = want.kind === "fetch" ? want.around : null;
    const key = around == null ? "live" : String(around);
    if (asked.current === key) return;
    asked.current = key;
    setStatus({ around, status: "loading" });
    gen.current++;
    dropRetry();
    read(around, gen.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, register, pin, liveNewest]);

  // The exact reads change what a tick's anchor says: fold the same answer again (O(ticks)).
  useEffect(() => {
    if (answer.current && getBlockWindow()) setBlockWindow(foldBlockWindow(answer.current, exact));
  }, [exact]);

  // The live edge: a fresh trail every 30 s while following it.
  useEffect(() => {
    if (!ledger || register !== "blocks" || !following || pin != null) return;
    const id = window.setInterval(() => read(null, ++gen.current, 0), LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, register, following, pin]);

  // A global the live feed announces with blocks joins the window at once; its anchored records
  // come with the next refresh.
  useEffect(() => {
    const a = answer.current;
    if (!a || !liveTip || !following || pin != null || register !== "blocks") return;
    const hashes = (liveTip.blocks ?? []).filter((b): b is string => typeof b === "string");
    if (!hashes.length || a.ticks.some((t) => t.ord === liveTip.ordinal)) return;
    if (a.ticks.length && liveTip.ordinal < a.ticks[0]!.ord) return;
    apply({ ...a, ticks: [{ ord: liveTip.ordinal, ts: liveTip.timestamp, hash: liveTip.hash, blocks: hashes, metaSnaps: {} }, ...a.ticks].slice(0, BLOCK_WINDOW_TICKS) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTip, following, pin, register]);

  return null;
}
