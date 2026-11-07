"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { netUrl } from "@/src/net/current";
import { POLL } from "@/src/engine/config";
import { reportPoll } from "@/src/data/api";
import { getBlockWindow, onBlockWindow, pastRetryDelay, setBlockWindow } from "@/src/data/pastWindow";
import { frontierAdvances, frontierChains, frontierKey, unstampedFrontiers } from "@/src/data/blockReads";
import type { TipRead } from "@/src/engine/domain/blockBraid";
import { BLOCK_WINDOW_TICKS, blockChainOf, blockWanted, foldBlockWindow, liveWindowRuns, mergeLiveAnswer, tipJoins, trailPath, type BlockWindowAnswer } from "@/src/data/blockWindow";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";

// THE ONE WRITER OF THE BLOCKS REGISTER'S WINDOW (`src/data/blockWindow.ts`), PastWindowBridge's
// sibling. It asks the one rule (`blockWanted`) whenever the view, the register, the pin or the live
// feed's newest snapshot moves, fetches `/api/blocks/trail`, folds the answer against the exact
// reads, and holds the window in the module beside `NetworkData` (`pastWindow.ts`). A failed read is
// tried again on `pastRetryDelay`'s schedule; once spent, or when the pin lies beyond the trail's
// reach, the held window is CLEARED (the chamber never shows a window that does not hold the pin)
// and `blockWindowStatus` says why; the feed's health row (`api-blocks`) tracks the reads. While the
// live window is held (`liveWindowRuns`: following, touring, or a pin the held LIVE window covers —
// the band is the live instrument, so a click inside the live window never freezes it), it
// refreshes the live trail every `LIVE_REFRESH_MS` and adds a tick the live feed has announced at
// once (its blocks are on the global record), leaving its anchored records for the next refresh. A
// pin outside it is a past window, which holds still.
//
// THE FRONTIER READS (`${chain}:frontier` in `blockReads`, `src/data/blockReads.ts`): the tips of each
// chain's NEWEST snapshot, with that snapshot's stamp (`ts`), which OPEN TIPS, FRONTIER AGE and the
// chamber's breathing tips read. The DAG's is the live global's own exact read
// (`snapshotExact[live].tips`) — the chamber already makes it, so it costs no fetch — written as each
// newer one lands. Each token chain the window covers (`frontierChains`: listed in the trail's
// `chains`, holding a block in the window) is read from `/api/network/<id>/snapshots/latest/blocks`
// on entering the register, when a new chain joins the window, and once a minute after. Every
// frontier is written only FORWARD (`frontierAdvances`, by the snapshot's ordinal). A failed read
// leaves a STAMPED frontier (its age says how old it is) but drops an unstamped one, and leaving the
// register drops every unstamped one (`unstampedFrontiers`; rule 10: no read is no tips).
//
// THE WINDOW IS THE FILTER'S NETWORK'S (`blockChainOf`, D4 2026-11-07): under a network filter the
// trail is asked for THAT network's newest block ticks (`&chain=`), however far back they lie; a
// filter change asks again and the answer REPLACES the window (`mergeLiveAnswer` never merges two
// networks' windows). Under the unlisted filter nothing is read (`blockWanted`'s `unread`): the window
// is cleared and the status says so, the explorer's stated floor. The live feed's announced tick is a
// DAG tick, so it joins only a window that holds the DAG's ticks (`tipJoins`).
//
// THE BRIEFING READS AHEAD: while the tour runs (`store.briefing` non-null) the LIVE window is
// fetched even before the Blocks stop, so that stop opens on a drawn chamber, not a loading one.
const LIVE_REFRESH_MS = 30_000;
const FRONTIER_REFRESH_MS = 60_000;

export default function BlockWindowBridge() {
  const ledger = useStore((s) => VIEW_POLICIES[s.mode].tickScoped);
  const register = useStore((s) => s.ledgerRegister);
  const following = useStore((s) => s.following);
  // A PIN is a snapshot the reader holds — never the one a live follow walks forward each tick
  // (`pastWanted`'s own rule): read as a pin, the followed tick re-asked the trail on every global.
  const snapOrd = useStore((s) => s.snap?.data.ordinal ?? null);
  // The Briefing reads the live window ahead (`blockWanted`'s `touring`): no pin stands during it.
  const touring = useStore((s) => s.briefing != null);
  const pin = following || touring ? null : snapOrd;
  // Where the live window is wanted: the Snapshots view in either register (D3: the scene's register
  // switch states the Blocks span from the Snapshots register too), or anywhere while the tour runs.
  const liveWanted = touring || ledger;
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

  const apply = (a: BlockWindowAnswer) => {
    answer.current = a;
    setBlockWindow(foldBlockWindow(a, useStore.getState().snapshotExact));
  };

  const read = (around: number | null, ch: string | null, g: number, attempt: number) => {
    if (g !== gen.current) return;
    fetch(netUrl(trailPath(around, ch)))
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
        // A live refresh never moves the window backward (`mergeLiveAnswer`); a pin replaces.
        apply(around == null ? mergeLiveAnswer(answer.current, a) : a);
        setStatus({ around, status: "ready" });
      })
      .catch(() => failed(around, ch, g, attempt));
  };
  const failed = (around: number | null, ch: string | null, g: number, attempt: number) => {
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
      read(around, ch, g, attempt + 1);
    }, delay);
  };

  useEffect(() => {
    const held = getBlockWindow();
    const want = blockWanted({ ledger, register, pin, held: held ? { from: held.from, to: held.to, chain: held.chain } : null, liveNewest, touring, chain });
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
  }, [ledger, register, pin, liveNewest, touring, chain]);

  // The exact reads change what a tick's anchor says: fold the same answer again (O(ticks)).
  useEffect(() => {
    if (answer.current && getBlockWindow()) setBlockWindow(foldBlockWindow(answer.current, exact));
  }, [exact]);

  // Is the held window the live one, still moving (`liveWindowRuns`)? Asked of the refs and the
  // module's window at the moment, so the interval and the append re-ask it rather than closing over it.
  const liveRuns = () => {
    const held = getBlockWindow();
    return liveWindowRuns({ liveWanted, touring, following, pin, held: held ? { from: held.from, to: held.to } : null, heldLive: askedLive() });
  };

  // The live edge: a fresh trail every 30 s while the live window is held — under a pin inside it too.
  useEffect(() => {
    if (!liveRuns()) return;
    const id = window.setInterval(() => {
      // A pin the window has since let go of (it aged out, or a pinned fetch replaced the window).
      if (!askedLive()) return;
      read(null, chain, ++gen.current, 0);
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveWanted, touring, following, pin, chain]);

  // THE DAG'S FRONTIER: the live global's exact read, as each newer one lands.
  const latest = useStore((s) => s.latestSnapshot);
  useEffect(() => {
    if (!ledger || register !== "blocks" || !latest) return;
    const tips = exact[latest.ordinal]?.tips;
    if (!tips) return;
    const st = useStore.getState();
    if (!frontierAdvances(st.blockReads[frontierKey("dag")], latest.ordinal)) return;
    st.setBlockRead(frontierKey("dag"), { blocks: [], tips, ts: latest.timestamp, ordinal: latest.ordinal });
  }, [ledger, register, latest, exact]);

  // EACH TOKEN CHAIN'S FRONTIER: its newest snapshot from its own L0, once a minute while the register is on.
  useEffect(() => {
    if (!ledger || register !== "blocks") return;
    let live = true;
    let asked = new Set<string>();
    const readOne = async (chain: string) => {
      try {
        const r = await fetch(netUrl(`/api/network/${chain}/snapshots/latest/blocks`));
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { ordinal?: number; tips?: TipRead | null; ts?: string };
        if (!live) return;
        if (typeof d.ordinal !== "number") throw new Error("no ordinal");
        reportPoll("api-blocks", true);
        const st = useStore.getState();
        if (!frontierAdvances(st.blockReads[frontierKey(chain)], d.ordinal)) return;
        st.setBlockRead(frontierKey(chain), { blocks: [], tips: d.tips ?? null, ordinal: d.ordinal, ...(d.ts ? { ts: d.ts } : {}) });
      } catch {
        if (!live) return;
        reportPoll("api-blocks", false);
        // A frontier that cannot say how old it is goes with its failed refresh.
        const st = useStore.getState();
        if (unstampedFrontiers(st.blockReads).includes(frontierKey(chain))) st.dropBlockReads([frontierKey(chain)]);
      }
    };
    const chains = () => frontierChains(getBlockWindow(), answer.current?.chains ?? []);
    const readAll = () => {
      const now = chains();
      asked = new Set(now);
      for (const c of now) void readOne(c);
    };
    // A chain that joins the window is read at once, not a minute later.
    const onWindow = () => {
      for (const c of chains()) if (!asked.has(c)) {
        asked.add(c);
        void readOne(c);
      }
    };
    readAll();
    const off = onBlockWindow(onWindow);
    const id = window.setInterval(readAll, FRONTIER_REFRESH_MS);
    return () => {
      live = false;
      off();
      window.clearInterval(id);
      // Leaving the register: an unstamped frontier would read as current on a return.
      const st = useStore.getState();
      st.dropBlockReads(unstampedFrontiers(st.blockReads));
    };
  }, [ledger, register]);

  // A global the live feed announces with blocks joins the window at once; its anchored records
  // come with the next refresh.
  useEffect(() => {
    const a = answer.current;
    if (!a || !liveTip || !liveRuns() || !tipJoins(a.chain ?? null)) return;
    const hashes = (liveTip.blocks ?? []).filter((b): b is string => typeof b === "string");
    if (!hashes.length || a.ticks.some((t) => t.ord === liveTip.ordinal)) return;
    if (a.ticks.length && liveTip.ordinal < a.ticks[0]!.ord) return;
    apply({ ...a, ticks: [{ ord: liveTip.ordinal, ts: liveTip.timestamp, hash: liveTip.hash, blocks: hashes, metaSnaps: {} }, ...a.ticks].slice(0, BLOCK_WINDOW_TICKS) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTip, following, pin, liveWanted, touring]);

  return null;
}
