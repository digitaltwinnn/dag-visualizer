"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/src/store/store";
import { netUrl } from "@/src/net/current";
import { reportPoll } from "@/src/data/api";
import { getBlockWindow, onBlockWindow } from "@/src/data/pastWindow";
import { blockReadKey, wantedBlockReads, windowBlockKeys, type BlockReadWant } from "@/src/data/blockReads";
import { BACKFILL_GAP_MS, ensurePage } from "@/components/RawSnapshotBridge";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import type { BlockRead, TipRead } from "@/src/engine/domain/blockBraid";

// THE BLOCK READS' FETCHER (`src/data/blockReads.ts` says which reads the window wants). A block's
// parents come only from a full read of the snapshot that accepted it: the DAG's through the
// chamber's own paced exact read (`ensurePage`), mirrored into `blockReads` as it lands; a token
// chain's through `/api/network/<id>/snapshots/<ordinal>/blocks`, one at a time at the exact reads'
// pace, newest first. A failed read is tried once more after 5 s, then recorded as a MISS (rule 10:
// the blocks draw with no links, never invented ones). Every window change prunes first, then
// queues, and cancels the running queue (BlockWindowBridge's generation counter). Leaving the
// register stops the queue but keeps what landed.
const RETRY_MS = 5000;

export default function BlockReadsBridge() {
  const on = useStore((s) => VIEW_POLICIES[s.mode].tickScoped && s.ledgerRegister === "blocks");
  const gen = useRef(0);

  useEffect(() => {
    if (!on) return;
    let cancelDag: (() => void) | null = null;
    let timer: number | null = null;
    let g = 0;
    let sig = "";
    const stop = () => {
      g = ++gen.current;
      cancelDag?.();
      cancelDag = null;
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    };

    // Mirror a landed or missed DAG exact read into the block reads.
    const mirror = () => {
      const w = getBlockWindow();
      if (!w) return;
      const st = useStore.getState();
      for (const t of w.ticks) {
        if (!t.blocks.length) continue;
        const key = blockReadKey("dag", t.ord);
        if (st.blockReads[key]) continue;
        const exact = st.snapshotExact[t.ord];
        if (exact) st.setBlockRead(key, { blocks: exact.blocks ?? [], tips: exact.tips ?? null });
        else if (st.exactMiss[t.ord] != null && st.blockReadMiss[key] == null) st.setBlockReadMiss(key);
      }
    };

    const readToken = async (x: BlockReadWant): Promise<boolean> => {
      try {
        const r = await fetch(netUrl(`/api/network/${x.chain}/snapshots/${x.ordinal}/blocks`));
        if (!r.ok) return false;
        const d = (await r.json()) as { blocks: BlockRead[]; tips: TipRead | null };
        if (!Array.isArray(d.blocks)) return false;
        reportPoll("api-blocks", true);
        useStore.getState().setBlockRead(x.key, { blocks: d.blocks, tips: d.tips ?? null });
        return true;
      } catch {
        return false;
      }
    };

    const run = () => {
      const w = getBlockWindow();
      // A refold of the same ticks (the exact reads landing) is not a window change: keep the queue.
      const now = w ? [...windowBlockKeys(w)].join(",") : "";
      if (w && now === sig) return;
      sig = now;
      stop();
      const mine = g;
      if (!w) return;
      const st = useStore.getState();
      st.retainBlockReads(windowBlockKeys(w));
      mirror();
      const s2 = useStore.getState();
      const wants = wantedBlockReads(w, s2.blockReads, s2.blockReadMiss);
      const dag = wants.filter((x) => x.chain === "dag").map((x) => x.ordinal);
      if (dag.length) cancelDag = ensurePage(dag);
      const tokens = wants.filter((x) => x.chain !== "dag");
      let i = 0;
      const next = () => {
        timer = null;
        if (mine !== gen.current || i >= tokens.length) return;
        const x = tokens[i++]!;
        void (async () => {
          let ok = await readToken(x);
          if (mine !== gen.current) return;
          if (!ok) {
            await new Promise<void>((res) => { timer = window.setTimeout(res, RETRY_MS); });
            timer = null;
            if (mine !== gen.current) return;
            ok = await readToken(x);
            if (mine !== gen.current) return;
            if (!ok) {
              reportPoll("api-blocks", false);
              useStore.getState().setBlockReadMiss(x.key);
            }
          }
          timer = window.setTimeout(next, BACKFILL_GAP_MS);
        })();
      };
      next();
    };

    run();
    const offWin = onBlockWindow(run);
    const offStore = useStore.subscribe((s, p) => {
      if (s.snapshotExact !== p.snapshotExact || s.exactMiss !== p.exactMiss) mirror();
    });
    return () => {
      offWin();
      offStore();
      stop();
    };
  }, [on]);

  return null;
}
