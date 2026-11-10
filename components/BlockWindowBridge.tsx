"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useStore } from "@/src/store/store";
import { POLL } from "@/src/engine/config";
import { reportPoll } from "@/src/data/api";
import { getBlockWindow, onBlockWindow, pastRetryDelay, setBlockWindow } from "@/src/data/pastWindow";
import { BLOCK_WINDOW_TICKS, blockChainOf, blockRefreshMs, blockWanted, failedReadKeeps, foldBlockWindow, liveWindowRuns, mergeLiveAnswer, tipJoins, trailPath, type BlockWindowAnswer } from "@/src/data/blockWindow";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE ONE WRITER OF THE BLOCKS REGISTER'S WINDOW (`src/data/blockWindow.ts`), PastWindowBridge's
// sibling. It asks the one rule (`blockWanted`) whenever the view, the register, the pin or the live
// feed's newest snapshot moves, fetches `/api/blocks/trail`, folds the answer against the exact
// reads, and holds the window in the module beside `NetworkData` (`pastWindow.ts`). A failed read is
// tried again on `pastRetryDelay`'s schedule; once spent, or when the pin lies beyond the trail's
// reach, the held window is CLEARED (the chamber never shows a window that does not hold the pin)
// and `blockWindowStatus` says why; the feed's health row (`api-blocks`) tracks the reads. The held
// window carries its OWN provenance (`around`, `chain` — review M1/M2): every answer is stamped with
// what it was asked, and a read that spends its retries keeps the window only when it is the live
// window of the network asked (`failedReadKeeps`) — another network's window, or a pin's, is cleared
// rather than drawn under this filter. While the live window is held (`liveWindowRuns`: following,
// or a pin the held LIVE window covers or lies newer than — the band is the live instrument,
// so a click inside the live window never freezes it), it refreshes the live trail on
// `blockRefreshMs` — every 30 s in Transaction blocks, every 5 min in the other
// registers, whose switch needs only the window's reach (review M3) — and adds a tick the live feed
// has announced at once (its blocks are on the global record), leaving its anchored records for the
// next refresh. A pin older than it is a past window, which holds still.
//
// THE WINDOW IS THE FILTER'S NETWORK'S (`blockChainOf`, D4 2026-11-07): under a network filter the
// trail is asked for THAT network's newest block ticks (`&chain=`), however far back they lie; a
// filter change asks again and the answer REPLACES the window (`mergeLiveAnswer` never merges two
// networks' windows). Under the unlisted filter nothing is read (`blockWanted`'s `unread`): the window
// is cleared and the status says so, the explorer's stated floor. The live feed's announced tick is a
// DAG tick, so it joins only a window that holds the DAG's ticks (`tipJoins`).
//
export default function BlockWindowBridge() {
  const ledger = useStore((s) => VIEW_POLICIES[s.mode].tickScoped);
  const register = useStore((s) => s.ledgerRegister);
  const following = useStore((s) => s.following);
  // A PIN is a snapshot the reader holds — never the one a live follow walks forward each tick
  // (`pastWanted`'s own rule): read as a pin, the followed tick re-asked the trail on every global.
  const snapOrd = useStore((s) => s.snap?.data.ordinal ?? null);
  const pin = following ? null : snapOrd;
  // Where the live window is wanted: the Snapshots view in either register (D3: the scene's register
  // switch states the Blocks span from the Snapshots register too).
  const liveWanted = ledger;
  // The network the window is read for: the top bar's committed filter (null under All).
  const chain = blockChainOf(useStore((s) => s.filter));
  const setStatus = useStore((s) => s.setBlockWindowStatus);
  const exact = useStore((s) => s.snapshotExact);
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots, liveWanted);
  const liveNewest = snaps.length ? snaps[snaps.length - 1]!.ordinal : null;
  const liveTip = snaps.length ? snaps[snaps.length - 1]! : null;

  // The last answer the route gave (raw), so the exact reads re-fold it without a fetch.
  const answer = useRef<BlockWindowAnswer | null>(null);
  // What was asked (`<chain>@live`, `<chain>@<ordinal>`, or "unread") and its generation: a reply
  // applies only while it is still wanted.
  const asked = useRef<string | null>(null);
  const askedLive = () => asked.current?.endsWith("@live") === true;
  const gen = useRef(0);
  const retry = useRef<number | null>(null);
  const dropRetry = () => {
    if (retry.current != null) window.clearTimeout(retry.current);
    retry.current = null;
  };
  useEffect(() => dropRetry, []);

  // Last time a live read was started (ms): the refresh's first beat is due from it, so entering
  // Transaction blocks with a window read minutes ago refreshes at once rather than 30 s later.
  const lastLiveRead = useRef(0);

  const apply = (a: BlockWindowAnswer) => {
    answer.current = a;
    setBlockWindow(foldBlockWindow(a, useStore.getState().snapshotExact));
  };

  const read = (around: number | null, ch: string | null, g: number, attempt: number) => {
    if (g !== gen.current) return;
    if (around == null) lastLiveRead.current = Date.now();
    fetch(trailPath(around, ch))
      .then((r) => (r.ok ? (r.json() as Promise<BlockWindowAnswer>) : null))
      .then((a) => {
        if (g !== gen.current) return;
        if (!a || !Array.isArray(a.ticks)) return failed(around, ch, g, attempt);
        reportPoll("api-blocks", true);
        if (a.beyond) {
          // Too deep to walk to: the read worked, the answer is "beyond"; nothing to retry.
          answer.current = null;
          setBlockWindow(null);
          setStatus({ around, status: "beyond" });
          return;
        }
        // Stamped with what was asked — the window's own provenance (`BlockWindow.around`).
        const stamped: BlockWindowAnswer = { ...a, around };
        // A live refresh never moves the window backward (`mergeLiveAnswer` — only into a held LIVE
        // answer: a pin's window is replaced, never merged forward); a pin replaces.
        const heldLive = answer.current && (answer.current.around ?? null) == null ? answer.current : null;
        apply(around == null ? { ...mergeLiveAnswer(heldLive, stamped), around: null } : stamped);
        setStatus({ around, status: "ready" });
      })
      .catch(() => failed(around, ch, g, attempt));
  };
  const failed = (around: number | null, ch: string | null, g: number, attempt: number) => {
    if (g !== gen.current) return;
    reportPoll("api-blocks", false);
    const delay = pastRetryDelay(attempt);
    if (delay == null) {
      // Budget spent: the live edge keeps the window it holds — the live window of the network asked —
      // and tries again on its next refresh; anything else is cleared (`failedReadKeeps`): a window
      // that lacks the pin would lie, and another network's under this filter would too (M2).
      const held = getBlockWindow();
      if (!failedReadKeeps(held ? { chain: held.chain, around: held.around } : null, { around, chain: ch })) {
        answer.current = null;
        setBlockWindow(null);
      }
      setStatus({ around, status: "failed" });
      return;
    }
    retry.current = window.setTimeout(() => {
      retry.current = null;
      read(around, ch, g, attempt + 1);
    }, delay);
  };

  useEffect(() => {
    const held = getBlockWindow();
    const want = blockWanted({ ledger, register, pin, held: held ? { from: held.from, to: held.to, chain: held.chain, around: held.around } : null, liveNewest, chain });
    const chainKey = chain ?? "all";
    // Unpinning back to the live edge: the held window is the pin's, so ask for live at once.
    const backToLive = want.kind === "keep" && pin == null && asked.current != null && asked.current !== `${chainKey}@live`;
    if (want.kind === "keep" && !backToLive) return;
    if (want.kind === "unread") {
      // An unlisted network's blocks are not read: no window, and the status states the floor.
      if (asked.current === "unread") return;
      gen.current++;
      asked.current = "unread";
      answer.current = null;
      dropRetry();
      // The status first: the window's change is the follow's heartbeat (FollowController), and the
      // follow reads the status to tell "not read" (the live block goes) from "not landed yet".
      setStatus({ around: null, status: "unread" });
      setBlockWindow(null);
      return;
    }
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
    const key = `${chainKey}@${around == null ? "live" : String(around)}`;
    if (asked.current === key) return;
    asked.current = key;
    setStatus({ around, status: "loading" });
    gen.current++;
    dropRetry();
    read(around, chain, gen.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, register, pin, liveNewest, chain]);

  // The exact reads change what a tick's anchor says: fold the same answer again (O(ticks)) — but
  // only when a read for a tick IN the window changed (perf review, 2026-11-07: every exact read in
  // the view, window tick or not, re-folded the window and re-laid the whole trail).
  const foldSig = useRef<string | null>(null);
  useEffect(() => {
    const held = getBlockWindow();
    if (!answer.current || !held) return;
    const sig = held.ticks.map((t) => (exact[t.ord] ? "1" : "0")).join("");
    if (sig === foldSig.current) return;
    foldSig.current = sig;
    setBlockWindow(foldBlockWindow(answer.current, exact));
  }, [exact]);

  // Is the held window the live one, still moving (`liveWindowRuns`)? Asked of the refs and the
  // module's window at the moment, so the interval and the append re-ask it rather than closing over it.
  // WHICH window is held — none, the live edge, or one around an ordinal — as a render input (review,
  // 2026-11-09): a pin set while the live window was still loading found `liveRuns()` false, and the
  // live answer's landing changed none of the refresh effect's deps, so the 30 s refresh never began.
  const heldKind = useSyncExternalStore(
    onBlockWindow,
    () => { const w = getBlockWindow(); return w == null ? "none" : w.around == null ? "live" : `around:${w.around}`; },
    () => "none",
  );
  const liveRuns = () => {
    const held = getBlockWindow();
    return liveWindowRuns({ liveWanted, following, pin, held: held ? { from: held.from, to: held.to } : null, heldLive: held != null && held.around == null && askedLive() });
  };

  // The live edge: a fresh trail on `blockRefreshMs` while the live window is held — under a pin it
  // covers too. The first beat is due from the last live read, so a register switch into
  // Transaction blocks catches up at once on a window read on the 5-minute beat.
  useEffect(() => {
    if (!liveRuns()) return;
    const every = blockRefreshMs(register);
    const beat = () => {
      // A pin the window has since let go of (it aged out, or a pinned fetch replaced the window).
      if (!askedLive()) return;
      read(null, chain, ++gen.current, 0);
    };
    let id: number | null = null;
    const first = window.setTimeout(() => {
      beat();
      id = window.setInterval(beat, every);
    }, Math.max(0, lastLiveRead.current + every - Date.now()));
    return () => {
      window.clearTimeout(first);
      if (id != null) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWanted, following, pin, chain, register, heldKind]);

  // A global the live feed announces with blocks joins the window at once; its anchored records
  // come with the next refresh.
  useEffect(() => {
    const a = answer.current;
    // Only into the LIVE window held: a pinned window still held through a resume is not the live edge.
    if (!a || (a.around ?? null) != null || !liveTip || !liveRuns() || !tipJoins(a.chain ?? null)) return;
    const hashes = (liveTip.blocks ?? []).filter((b): b is string => typeof b === "string");
    if (!hashes.length || a.ticks.some((t) => t.ord === liveTip.ordinal)) return;
    if (a.ticks.length && liveTip.ordinal < a.ticks[0]!.ord) return;
    apply({ ...a, ticks: [{ ord: liveTip.ordinal, ts: liveTip.timestamp, hash: liveTip.hash, blocks: hashes, metaSnaps: {} }, ...a.ticks].slice(0, BLOCK_WINDOW_TICKS) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTip, following, pin, liveWanted]);

  return null;
}
