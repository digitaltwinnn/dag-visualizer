"use client";

import { useEffect, useRef, useState } from "react";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";

import Explorer, { type ExplorerLevelSpec, type ExplorerRowSpec } from "@/components/explorer/Explorer";
import { NODE_GLYPH_W, nodeRowSpec, unknownNodeRowSpec } from "@/components/explorer/nodeRow";
import TablePager from "@/components/datasection/TablePager";
import { pageHolding, pageOnResize } from "@/components/explorer/fitRows";
import useFitRows from "@/components/explorer/useFitRows";
import { useBreakpoint } from "@/components/useBreakpoint";
import { IdentityDot } from "@/components/inspector/parts";
import { ensurePage } from "@/components/RawSnapshotBridge";
import { subjectPairing } from "@/components/useSubjectPairing";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { cn } from "@/lib/utils";
import { buildAnchorLog } from "@/src/data/anchorLog";
import { latestRelevant } from "@/src/data/follow";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import {
  LEDGER_MEASURE_OPTIONS,
  SNAP_MEASURE_OPTIONS,
  TICK_NET_MEASURE_OPTIONS,
  snapMeasure,
  snapMeasureValue,
  tickMeasure,
  tickMeasureValue,
  tickNetMeasure,
  type LedgerMeasure,
  SNAP_MEASURES,
  TICK_NET_MEASURES,
} from "@/src/data/ledgerMeasure";
import { ledgerLens, storyCount } from "@/src/data/ledgerStory";
import { filterAccent, getAnchor, getNetwork, resolveSigner, SIGNER_GROUPS, SIGNER_UNKNOWN, snapshotSigners } from "@/src/data/network";
import { metaSnapHoverKey, type GlobalSnapshot, type NodeRow, type SnapshotExact } from "@/src/data/types";
import { displayNetwork, LISTED_IDS, UNLISTED_HUE, UNLISTED_ID } from "@/src/data/unlisted";
import { POLL } from "@/src/engine/config";
import { followToggleActions, metaSnapSelectActions, nodeSelectActions, sameMetaSnap, snapshotSelectActions, tickNetSelectActions } from "@/src/engine/domain/pickActions";
import { heldTicks, nextHoldTop } from "@/src/data/ledgerHold";
import { CLOSED_PATH, pathViewChanged, syncLedgerPath, type LedgerPath, type LedgerPathView } from "@/src/data/ledgerPath";
import LiveDot from "@/components/LiveDot";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { NO_SIGNAL_COPY, useNoSignal } from "@/components/useNoSignal";
import { levelMeasure } from "@/src/data/explorerMeasure";
import { tickNetworksLevel } from "@/src/data/ladderLevels";

// THE SNAPSHOTS VIEW'S EXPLORER — a DESCRIPTION for the one `Explorer` component (design session
// 2026-09-26; read `docs/superpowers/design/2026-09-26-explorer-card/README.md` first). This file
// decides only what a view may: which levels are open, what each row is and commits, what each
// level measures, and the words. The layout is the component's.
//
// ONE AXIS: TIME (user, 2026-08-09). The path runs coarse→fine the way the chamber, the facts rail
// and the strip all read:
//
//   global tick        → pins that tick (snapshotSelectActions) and opens the networks in it
//     network          → OPENS its snapshots; commits NOTHING (user, 2026-08-10 — a click that
//                        moved the app-wide filter "will often happen accidentally"), previews the
//                        lane in the chamber on hover
//       snapshot       → commits the metagraph snapshot itself (metaSnapSelectActions — tick and
//                        snapshot, never the filter: design decision 13) and opens its signers
//         signer       → the node that sealed it, the same node row every explorer ends in
//
// The PER-NETWORK axis (network → its ordinals across the window) was a second tree once and was
// retired the same day the one axis was named: two trees over the same rows made the reader pick
// an axis before browsing. The network axis is the COMMITTED FILTER — the top bar's — which
// here is a LENS: with a network committed, every tick still lists (they all happened — rule 10
// doesn't let a lens edit the facts), a tick it anchored into carries its count in the network's
// hue, one it sat out is stepped back, and inside a tick only the committed network is drillable.
//
// WHICH LEVEL IS OPEN is this card's own browse state — with two exceptions that keep the path
// honest to the store: a metagraph snapshot committed anywhere (a tile, the rail's pager, the raw
// log) opens the path to it, and a tick pinned elsewhere while a tick is open re-points the path.
// Deliberately NO auto-open from the root: the newest tick changes every few seconds, and a path
// that opened itself onto it would fight the heartbeat under the pointer.
//
// Rule 9: a tick row previews on `hoverSnapOrd` (a global tick), a network row on `hoverFilter`
// (its lane in the chamber), a snapshot row on `hoverMetaSnap` (ONE snapshot — a row is a
// snapshot, not its tick, and the tick channel would light every band of the anchoring global),
// a signer on `hoverNodeId`. Hovers preview, never commit.

/** How many ticks a page of the explorer shows before the first measure: on the desktop rail and
 *  the tablet sheet the page FILLS to its host's bottom (`useFitRows`, 2026-09-28 — user:
 *  "always fill the rows till the bottom of the view"). Fifteen because the card is a peephole, not the
 *  chain: enough rows that the list reads as a run of history rather than as the last handful
 *  (user, 2026-09-13: "can you do 10-20 by default"), few enough that one page fits the rail. */
const TICK_PAGE = 15;
/** The phone's page — shorter, since its bottom sheet takes the lower half of a small screen. */
const TICK_PAGE_PHONE = 10;

/** A COMMITTED FILTER IS A LENS, and inside a tick the lens decides what is drillable: with a
 *  network committed, every OTHER network's row under a tick opens nothing. */
function outOfLens(filter: string, id: string): boolean {
  const f = ledgerLens(filter);
  return f !== "all" && f !== id;
}

// A snapshot's signers: `snapshotSigners` (src/data/network.ts) — one home, shared with the node
// rung's ∨ step and pager (railSiblings), so the three list the same validators.
const signersOf = (ex: SnapshotExact | undefined, metaId: string, ordinal: number) => snapshotSigners(ex?.rows, metaId, ordinal);

/** The exact read's per-network fee and size for one row of the network level — a listed
 *  network's own entry, or the SUM of every uncataloged address for the unlisted row. */
function perMetaOf(ex: SnapshotExact | undefined, id: string): { fee: number; bytes: number } | undefined {
  if (!ex) return undefined;
  if (id !== UNLISTED_ID) return ex.perMeta[id];
  let fee = 0;
  let bytes = 0;
  let any = false;
  for (const [addr, v] of Object.entries(ex.perMeta)) {
    if (LISTED_IDS.has(addr)) continue;
    any = true;
    fee += v.fee;
    bytes += v.bytes;
  }
  return any ? { fee, bytes } : undefined;
}

/** "last 12 min" / "last 2 h" — the time the listed snapshots span, newest back to oldest. */
function spanWords(ordered: readonly GlobalSnapshot[]): string {
  if (ordered.length < 2) return "latest";
  const ms = Date.parse(ordered[0]!.timestamp) - Date.parse(ordered[ordered.length - 1]!.timestamp);
  if (!(ms > 0)) return "latest";
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 90 ? `last ${min} min` : `last ${Math.round(min / 60)} h`;
}

export default function LedgerPanel({ defaultCollapsed }: { defaultCollapsed?: boolean } = {}) {
  const filter = useStore((s) => s.filter);
  const hoverFilter = useStore((s) => s.hoverFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const hoverSnapOrd = useStore((s) => s.hoverSnapOrd);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const hoverMetaSnap = useStore((s) => s.hoverMetaSnap);
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const ledgerMeasure = useStore((s) => s.ledgerMeasure);
  const setLedgerMeasure = useStore((s) => s.setLedgerMeasure);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const dead = useNoSignal();
  const live = useStore((s) => s.live);
  const metaSnap = useStore((s) => s.metaSnap);
  const tickNet = useStore((s) => s.tickNet);
  const snapshotExact = useStore((s) => s.snapshotExact);
  const selNodes = useStore((s) => s.selNodes);
  const metaList = useStore((s) => s.metaList); // co-location reads the full catalog (nodeRowSpec)
  const inspect = useStore((s) => s.inspect);
  // ONE PICK FOR EVERY LEVEL (user, 2026-09-29 — `src/data/explorerMeasure.ts`): the lower levels
  // show the tick level's `ledgerMeasure` where they can state it and their own first measure where
  // they can't, and a pick at any level writes that one value — so stepping down and back up never
  // loses what the reader chose.
  const netPick = levelMeasure(TICK_NET_MEASURES, ledgerMeasure);
  const snapPick = levelMeasure(SNAP_MEASURES, ledgerMeasure);

  const selNode = inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const selIp = selNode?.node?.ip ?? null;
  const selLayer = selNode ? (selNode.kind === "metanode" ? selNode.node?.layer ?? null : selNode.kind) : null;
  const nodeOn = (r: NodeRow) => selIp != null && r.layer === selLayer && "node" in r.pick && r.pick.node?.ip === selIp;

  // ⚠️ THE LIST IS THE LIVE BUFFER, PAGED — not the 3D trail (user, 2026-09-13: nine rows made
  // the explorer look like the whole chain rather than a peephole onto it). `POLL.maxSnapshots`
  // ticks is what the app already holds, so paging costs no fetch; the raw layer is where a walk
  // to genesis belongs. Hovering a row older than the trail previews nothing in the scene, which
  // is an honest no-op, not a broken pair.
  const { snaps } = useSnapshotFeed(POLL.maxSnapshots);
  const net = getNetwork();
  const visibleTs = new Set(snaps.map((s) => s.timestamp));
  const rows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, "all").filter((r) => visibleTs.has(r.ts)) : [];
  // Through the ledger's lens: `displayNetwork("dag")` RESOLVES, and a committed DAG must not
  // narrow the list to a story that can never have members (found live 2026-08-13).
  const filterNet = displayNetwork(ledgerLens(filter));
  const tickFilterCount = (d: GlobalSnapshot): number => storyCount(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]) ?? 0;

  // ⚠️ THE LENS DIMS, IT DOES NOT EDIT — the tick list is always the whole retained window (user,
  // 2026-09-14: a list whose LENGTH depended on the filter kept answering "how much is there?"
  // differently). Page 1 is the live page and the only one that moves under the reader.
  //
  // ⚠️ …AND IT HOLDS STILL WHILE A TICK IS PINNED (user, 2026-10-02 — `src/data/ledgerHold.ts`).
  // Newest-first, every live tick pushed each row down a place, so a pinned row walked off the
  // page while it was being read; the scene already holds its pinned row at the front. The head
  // freezes at the newest tick on screen at the moment of the pin, the ticks that arrive meanwhile
  // are COUNTED rather than listed, and one control on the heading row resumes live. The frozen
  // head is state derived during render, so it lands in the same commit as the pin.
  // A pin the rolling buffer has evicted holds nothing (`heldTicks` lets go there), so the frozen
  // head is released WITH it — kept, a later pin would inherit a stale head and cut the list.
  const pinnedOrd = !following && snap && snaps.some((x) => x.ordinal === snap.data.ordinal) ? snap.data.ordinal : null;
  const [holdTop, setHoldTop] = useState<number | null>(null);
  const wantTop = nextHoldTop(holdTop, pinnedOrd, snaps.length ? snaps[snaps.length - 1].ordinal : null);
  if (wantTop !== holdTop) setHoldTop(wantTop);
  const held = heldTicks(snaps, wantTop, pinnedOrd);
  const orderedSnaps = [...held.ticks].reverse(); // newest first, the log convention
  const activeSnapOrd = snap?.data.ordinal ?? null;
  const [tickPage, setTickPage] = useState(1);
  // THE PATH — which tick, which network in it, which snapshot's signers are open. Declared here
  // because the page size reads it (the fit measures only while the tick level is on screen); how
  // the store moves it is `src/data/ledgerPath.ts`, applied below.
  const [path, setPath] = useState<LedgerPath>(CLOSED_PATH);
  const openTick = path.tick;
  const openNet = path.net;
  const openSnap = path.snap;
  // THE PAGE SIZE FILLS THE RAIL on desktop (`useFitRows`): measured only while the tick level is
  // the one on screen, and when it changes the reader keeps their place — the page holding the
  // row that was first on screen (`pageKeepingRow`), so a resize never throws them to page 1.
  const bp = useBreakpoint();
  // Phone keeps a fixed, shorter page (its sheet sizes to content): 10, not the old 15 (user,
  // 2026-09-28). Desktop and tablet fill their host.
  const pageSize = useFitRows("ledger-view", bp !== "phone", openTick == null, bp === "phone" ? TICK_PAGE_PHONE : TICK_PAGE);
  const lastSize = useRef(pageSize);
  // The pinned tick's row, read by the resize below without re-running it on every feed tick.
  const pinnedRow = useRef(-1);
  pinnedRow.current = pinnedOrd != null ? orderedSnaps.findIndex((d) => d.ordinal === pinnedOrd) : -1;
  useEffect(() => {
    if (lastSize.current === pageSize) return;
    // Read the OLD size before overwriting it: an updater runs lazily when another update is
    // pending on this fiber (the feed re-renders it often), and by then the ref would say new.
    const prev = lastSize.current;
    lastSize.current = pageSize;
    // The pinned row stays on screen through a resize — the fit re-measures while the card eases.
    setTickPage((p) => pageOnResize(p, prev, pageSize, pinnedRow.current));
  }, [pageSize]);
  const pages = Math.max(1, Math.ceil(orderedSnaps.length / pageSize));
  const page = Math.min(tickPage, pages);
  const pagedSnaps = orderedSnaps.slice((page - 1) * pageSize, page * pageSize);
  // A PAGE IN VIEW IS A PAGE IN FOCUS: the exact reads (the figures) are fetched for the page the
  // reader is looking at, at the backfill's own pace, deduped against everything held or in flight.
  const pagedKey = pagedSnaps.map((d) => d.ordinal).join(",");
  useEffect(() => {
    const ords = pagedKey ? pagedKey.split(",").map(Number) : [];
    return ensurePage(ords);
  }, [pagedKey]);

  // THE STORE MOVES THE PATH through one pure function (`syncLedgerPath`, with its rules and their
  // history) — applied DURING RENDER when the view it reads changes, so the path lands in the same
  // commit as the selection. The two page moves ride the same transitions: opening onto a snapshot
  // turns to its tick's page, and a resume that closes the path returns to page 1.
  const pathView: LedgerPathView = {
    metaSnap: metaSnap
      ? { metaId: metaSnap.metaId, ordinal: metaSnap.ordinal, globalOrdinal: metaSnap.globalOrdinal, netKey: LISTED_IDS.has(metaSnap.metaId) ? metaSnap.metaId : UNLISTED_ID }
      : null,
    snapOrd: activeSnapOrd,
    following,
    // The network committed INSIDE the shown tick, by network key (an unlisted address is the
    // unlisted set) — only when it belongs to this tick.
    tickNet: tickNet && tickNet.globalOrdinal === activeSnapOrd ? (LISTED_IDS.has(tickNet.metaId) ? tickNet.metaId : UNLISTED_ID) : null,
  };
  const [seenView, setSeenView] = useState(pathView);
  if (pathViewChanged(seenView, pathView)) {
    setSeenView(pathView);
    const next = syncLedgerPath(path, seenView, pathView);
    // A resume is a return to the stream, so the list returns to its live page — even with no tick
    // open (review, 2026-10-04) — unless it is this explorer's own click, which opened a tick.
    if (pathView.following && !seenView.following && !path.selfResume) setTickPage(1);
    if (next !== path) {
      setPath(next);
      if (next.tick == null && path.tick != null) setTickPage(1);
      // WHENEVER THE PATH OPENS A GLOBAL SNAPSHOT the list turns to the page holding it (user,
      // 2026-10-07) — a pin from the card's ‹ ›, a bar or a tile, not only a metagraph snapshot's —
      // so going back up via the crumb finds the pinned row on screen.
      else if (next.tick != null && next.tick !== path.tick) {
        const page = pageHolding(orderedSnaps.findIndex((d) => d.ordinal === next.tick), pageSize);
        if (page != null) setTickPage(page);
      }
    }
  }

  const accent = filterAccent(filter);
  const tick = openTick != null ? orderedSnaps.find((d) => d.ordinal === openTick) ?? null : null;
  const exact = tick ? snapshotExact[tick.ordinal] : undefined;

  // The LIVE / PINNED state is the global snapshot CARD's alone (B1, user 2026-10-02 —
  // `components/FollowControl.tsx`); the scene callout mirrors it and this explorer no longer
  // carries the pill or its hover preview.

  // ---- level 0: the ticks, paged, measured by the heading's pick -------------------------------
  const tickValues = pagedSnaps.map((d) => tickMeasureValue(ledgerMeasure, d, snapshotExact[d.ordinal]));
  const maxTick = Math.max(1e-9, ...tickValues.map((v) => v ?? 0));
  // THE SPAN THE EXPLORER HOLDS — stated on EVERY level (user, 2026-09-29: "even if there is no
  // pager you should still indicate the size of the cache, e.g. 'last 11 min'"). The deeper levels
  // have nothing to page, so they carry the same footer with the span alone.
  // The span ALONE (user, 2026-10-03: "remove the explanatory text section"): the word was a
  // button opening a sentence about how many snapshots the explorer keeps — the cache again, which
  // is ours to know and not the reader's (his ruling on the raw phone panel's title, 2026-10-02).
  const spanScope = { word: spanWords(orderedSnaps) };
  const spanFooter =
    live && orderedSnaps.length > 0 ? (
      <TablePager page={1} pages={1} from={1} to={orderedSnaps.length} total={orderedSnaps.length} compact scope={spanScope} onPage={() => {}} />
    ) : undefined;
  const levels: ExplorerLevelSpec[] = [
    {
      key: "ticks",
      crumb: {
        label: "Snapshots",
        onRelease: () => setPath(CLOSED_PATH),
      },
      measure: { options: LEDGER_MEASURE_OPTIONS, value: ledgerMeasure, onPick: (id) => setLedgerMeasure(id as LedgerMeasure) },
      // The held list's ONE control: how many ticks arrived behind the pin, and the way back to
      // them. It is the follow switch (`followToggleActions` through the one executor) — the same
      // write the card's own pill makes — shown here only while there is something to resume to.
      setting:
        held.newer > 0 && snap ? (
          <button
            type="button"
            title={`${held.newer} snapshot${held.newer === 1 ? "" : "s"} arrived since this one was pinned. Follow live again.`}
            onClick={() => applyClickActions(followToggleActions(snap, false))}
            className="inline-flex items-center gap-1.5 rounded-sm px-1.5 -mr-1.5 py-[3px] min-h-6 text-label text-foreground whitespace-nowrap cursor-pointer select-none hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
          >
            <LiveDot />
            <span className="tabular-nums">{held.newer}</span> newer
          </button>
        ) : undefined,
      hasFigure: true,
      // A 4-decimal fee ("0.0680") needs the wider figure column; the width holds across the
      // level's measures so the columns never shift when the heading's pick changes.
      figureW: 48,
      // "Waiting" is a promise; a network that has never answered gets the honest state instead.
      empty: dead ? NO_SIGNAL_COPY : "Waiting for snapshots…",
      rows: pagedSnaps.map((d, i): ExplorerRowSpec => {
        const count = tickFilterCount(d);
        const v = tickValues[i];
        const globalPick = { kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d } as const;
        const on = d.ordinal === activeSnapOrd;
        return {
          key: String(d.ordinal),
          name: <span className="tabular-nums">{d.ordinal.toLocaleString()}</span>,
          // THE LENS IS THE BAR'S COLOUR, not a number beside it (user, 2026-10-04: "remove the
          // added '1' and instead use the colour"). The bar always measures the whole tick, as it
          // does unfiltered, so it keeps the default cyan; a tick the committed network anchored
          // into takes that network's hue. Colour plus the faint row below, never colour alone.
          share: v != null ? v / maxTick : undefined,
          // …and under a filter a tick it did NOT anchor into steps back to a SOFTER cyan — the same
          // hue at less strength, never a grey (user, 2026-10-04: "a bit more muted, like the scene",
          // then "not gray-cyan, just a less strong cyan"). Unfiltered, every bar keeps the full accent.
          hue: !filterNet ? "var(--primary)" : count > 0 ? filterNet.hue : "color-mix(in oklch, var(--primary) 50%, transparent)",
          // Absent = the dash, never a number derived from another (rule 10).
          figure: tickMeasure(ledgerMeasure, d, snapshotExact[d.ordinal]),
          on,
          // No `rung`: a committed tick row's click also opens its tick in this card (local path
          // state), which a re-box would swallow — and its Global snapshot card is the box anyway.
          faint: !!filterNet && count === 0 && !on,
          // The count the bar's colour stands for, in words — colour is never the only carrier.
          title: `Global snapshot ${d.ordinal.toLocaleString()}, ${d.metagraphSnapshotCount ?? 0} snapshots anchored${filterNet ? (count > 0 ? `, ${count} from ${filterNet.name}` : `, none from ${filterNet.name}`) : ""}`,
          onClick: () => {
            // A pinned stream and the live tip's row: this click resumes live (see the effect above).
            const selfResume = !following && latestRelevant("all")?.ordinal === d.ordinal && !(on && !following);
            applyClickActions(
              snapshotSelectActions(globalPick, latestRelevant("all")?.ordinal === d.ordinal, {
                pinnedOrdinal: !following && snap ? snap.data.ordinal : null,
                metaSnap,
                tickNet,
              }),
            );
            // Re-clicking the PINNED tick releases it (the builder's toggle) — the path closes
            // with it rather than opening the tick it just let go (review, 2026-09-26); any other
            // click toggles the tick open, the live tip included.
            const releasing = on && !following;
            setPath({ ...CLOSED_PATH, tick: releasing || openTick === d.ordinal ? null : d.ordinal, selfResume });
          },
          pair: subjectPairing(hoverSnapOrd, d.ordinal, setHoverSnapOrd, accent),
        };
      }),
      pager:
        live && orderedSnaps.length > 0 ? (
          <TablePager
            page={page}
            pages={pages}
            from={(page - 1) * pageSize + 1}
            to={Math.min(page * pageSize, orderedSnaps.length)}
            total={orderedSnaps.length}
            compact
            // THE SPAN THE ROWS COVER, and nothing else — the compact pager drops its count when a
            // scope is given (TablePager). THE SPAN, not a count of a buffer (user, 2026-09-28: "instead of '52
            // recent' say something people understand — they are all recent, but why only 52?").
            // The explorer holds the latest POLL.maxSnapshots global snapshots; how much TIME that
            // is — measured from the rows themselves, oldest to newest — is what a reader can use.
            // It was "recent" (the raw log's word, 2026-09-13), which answered neither question.
            scope={spanScope}
            onPage={(p) => setTickPage(p)}
          />
        ) : undefined,
    },
  ];

  // ---- level 1: the networks that anchored into the open tick ---------------------------------
  // The ONE list (src/data/ladderLevels.ts): the Metagraph card's ‹ › and the tick's ghost step the
  // same networks in the same order.
  const tickNets = tick ? tickNetworksLevel(tick, rows, exact?.rows, (id) => LISTED_IDS.has(id)) : [];
  if (tick) {
    const netRows: { id: string; name: string; hue: string; count: number; italic?: boolean }[] = tickNets.map((n) => ({
      id: n.id,
      name: n.name,
      hue: n.hue,
      count: n.snaps.length,
      ...(n.unlisted ? { italic: true } : {}),
    }));
    const measured = netRows.map((n) => ({ n, m: tickNetMeasure(netPick, n.count, perMetaOf(exact, n.id)) }));
    const maxNet = Math.max(1e-9, ...measured.map(({ m }) => m.value ?? 0));
    levels.push({
      pager: spanFooter,
      key: "networks",
      parent: "snap",
      crumb: {
        label: <span className="tabular-nums">{tick.ordinal.toLocaleString()}</span>,
        onRelease: () => setPath((p) => ({ ...p, net: null, snap: null })),
      },
      meaning: "Networks that anchored into it",
      measure: { options: TICK_NET_MEASURE_OPTIONS, value: netPick, onPick: (id) => setLedgerMeasure(id as LedgerMeasure) },
      hasFigure: true,
      nameW: 120,
      figureW: 48,
      // The polled buffer identified none of this tick's anchors (yet), and the exact read
      // counted no uncataloged ones — say so, never fabricate.
      empty: "No identified metagraph snapshots in this snapshot.",
      rows: measured.map(({ n, m }): ExplorerRowSpec => {
        const lensedOut = outOfLens(filter, n.id);
        return {
          key: n.id,
          glyph: <IdentityDot hue={n.hue} />,
          name: n.italic ? <span className="italic">{n.name}</span> : n.name,
          share: m.value != null ? m.value / maxNet : undefined,
          hue: n.hue,
          figure: m.text,
          // The row IS a committed subject when its band is the live selection: this network's
          // filter on this tick, or the network committed INSIDE this tick (the pager's ∨, a band —
          // 2026-10-02) — with a snapshot of it selected or not: this level is on screen with a
          // snapshot held exactly when the Global snapshot card is open (`levelsForBox`), and then
          // the network is the selected child the rule highlights (user, 2026-10-07).
          on: ledgerNetwork({ filter, tickNet, snapOrdinal: activeSnapOrd ?? null }) === n.id && activeSnapOrd === tick.ordinal,
          // Selected, its click brings the Metagraph card to the front (`openOrToggle`) — the
          // explorer then steps to that card's children — rather than re-committing the network.
          rung: "context",
          // Out of the lens: listed (it really did anchor here), not drillable.
          faint: lensedOut,
          title: lensedOut
            ? `${n.name} · ${n.count} snapshot${n.count === 1 ? "" : "s"} anchored here — outside the committed filter`
            : `${n.name} · ${n.count} snapshot${n.count === 1 ? "" : "s"} anchored into ${tick.ordinal.toLocaleString()}`,
          // OPENS ITS CARD TOO (user, 2026-10-04: "clicking a row in the explorer should open the
          // related card; happens for some but not for all" — this row was the one that only
          // drilled, ruled "opens, never commits" on 2026-08-10, before a network could be
          // committed INSIDE a tick). It commits the tick-local network — the pager ∨'s own
          // `tickNetSelectActions`, which pins the tick and never writes the filter — so the
          // Metagraph card boxes, and the path opens to its snapshots as before.
          onClick: lensedOut
            ? undefined
            : () => {
                applyClickActions(
                  tickNetSelectActions(n.id, { kind: "snapshot", title: `Global snapshot #${tick.ordinal}`, data: tick }, {
                    metaSnap,
                    hasInspect: !!selNode,
                    net: ledgerNetwork({ filter, tickNet, snapOrdinal: activeSnapOrd ?? null }),
                  }),
                );
                setPath((p) => ({ ...p, net: n.id, snap: null }));
              },
          // The row's hover IS the network's lane preview in the chamber (`hoverFilter`), paired
          // in the network's own hue — a scene-side hover of that lane lights this row back.
          pair: subjectPairing(hoverFilter, n.id, setHoverFilter, n.hue),
        };
      }),
    });
  }

  // ---- level 2: one network's snapshots in the open tick ---------------------------------------
  type SnapLeaf = { metaId: string; ordinal: number; hash: string; ts: string; fee: number; sizeInKB?: number };
  const openTickNet = openNet ? (tickNets.find((n) => n.id === openNet) ?? null) : null;
  const leaves: SnapLeaf[] = openTickNet?.snaps ?? [];
  const leafHue = openTickNet?.hue ?? accent;
  const leafName = openTickNet?.name ?? "";
  if (tick && openNet && (leaves.length > 0 || openNet === UNLISTED_ID)) {
    const globalPick = { kind: "snapshot", title: `Global snapshot #${tick.ordinal}`, data: tick } as const;
    const values = leaves.map((r) => snapMeasureValue(snapPick, r));
    const maxLeaf = Math.max(1e-9, ...values.map((v) => v ?? 0));
    levels.push({
      pager: spanFooter,
      key: "snapshots",
      parent: "context",
      crumb: {
        label: (
          <>
            <IdentityDot hue={leafHue} />
            <span className={cn(openNet === UNLISTED_ID && "italic")}>{leafName}</span>
          </>
        ),
        onRelease: () => setPath((p) => ({ ...p, snap: null })),
      },
      meaning: "Its snapshots anchored here",
      measure: { options: SNAP_MEASURE_OPTIONS, value: snapPick, onPick: (id) => setLedgerMeasure(id as LedgerMeasure) },
      hasFigure: true,
      figureW: 48,
      empty: "No snapshots identified for this network here.",
      rows: leaves.map((r, i): ExplorerRowSpec => {
        const sel = { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: tick.ordinal, ts: r.ts };
        const signers = signersOf(exact, r.metaId, r.ordinal);
        const on = sameMetaSnap(metaSnap, sel);
        const key = `${r.metaId}|${r.ordinal}`;
        const isUnlisted = openNet === UNLISTED_ID;
        return {
          key: `${key}:${i}`,
          name: <span className="tabular-nums">{r.ordinal > 0 ? r.ordinal.toLocaleString() : `${r.metaId.slice(0, 10)}…`}</span>,
          // An unlisted row's ordinal counts on ITS OWN channel's sequence — one tick can carry
          // several chains, so the short address says which (2026-08-08). A listed row shows NO
          // hash (user, 2026-09-29: "don't show the actual snapshot hash in the explorer") — the
          // row's network is its level, its ordinal its name, and the hash is the card's foot.
          tag: isUnlisted && r.ordinal > 0 ? r.metaId.slice(0, 7) : undefined,
          share: values[i] != null ? values[i]! / maxLeaf : undefined,
          hue: leafHue,
          figure: snapMeasure(snapPick, r),
          on,
          rung: "metaSnap",
          title: isUnlisted
            ? `Unlisted channel ${r.metaId} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`
            : `${leafName} snapshot ${r.ordinal.toLocaleString()} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`,
          onClick: () => {
            applyClickActions(metaSnapSelectActions(sel, globalPick, { metaSnap, following, inspect: useStore.getState().inspect }));
            // The AFFORDANCE FOLLOWS THE DATA: no exact read for this tick means no signers are
            // knowable, so the row commits and stays — a level onto nothing would claim a fact
            // we don't have. Re-clicking (the deselect) closes the level with it.
            setPath((p) => ({ ...p, snap: !on && signers.length > 0 ? key : null }));
          },
          // The pairing wash follows the FILTER, as the snapshot's card does (2026-10-03) — the
          // two ends of one pairing light in one hue. The dot keeps the network's own.
          pair: subjectPairing(hoverMetaSnap, metaSnapHoverKey(r.metaId, r.ordinal), setHoverMetaSnap, openNet === filter ? leafHue : accent),
        };
      }),
    });
  }

  // ---- level 3: the signers of the open snapshot — the same node row every explorer ends in ----
  const leaf = openSnap ? leaves.find((r) => `${r.metaId}|${r.ordinal}` === openSnap) ?? null : null;
  const signers = signersOf(leaf ? exact : undefined, leaf?.metaId ?? "", leaf?.ordinal ?? 0); // no leaf → the shared empty list
  if (leaf && signers.length > 0) {
    levels.push({
      pager: spanFooter,
      key: "signers",
      parent: "metaSnap",
      crumb: { label: <span className="tabular-nums">{leaf.ordinal > 0 ? leaf.ordinal.toLocaleString() : `${leaf.metaId.slice(0, 10)}…`}</span> },
      // The cards' own phrase ("Signed by N L0 validators") — the producing layer named before
      // the rows, because the constant count is most puzzling here (3 rows under a 20-node network).
      // The user's words (2026-09-26); the count is the rows, the layer is the tag beside each.
      meaning: "Validators that signed",
      glyphW: NODE_GLYPH_W,
      measure: null,
      hasFigure: false,
      // The one node row (`explorer/nodeRow.tsx`), ticker included, as in every explorer.
      rows: signers.map((sid): ExplorerRowSpec => {
        const r = resolveSigner(selNodes, leaf.metaId, sid);
        if (!r.known) {
          // No node to commit, so no affordance: a signature that states what isn't known
          // (`resolveSigner` + `SIGNER_UNKNOWN`, the one shared rule). Every unlisted channel's
          // signers take this branch by construction; a listed network's can too.
          const w = SIGNER_UNKNOWN[r.reason];
          return unknownNodeRowSpec({ key: sid, id: sid, label: w.label, title: w.title, hue: UNLISTED_HUE });
        }
        const row = r.row;
        const on = nodeOn(row);
        const hue = identityHudCss(leaf.metaId);
        return nodeRowSpec({
          metaList,
          key: sid,
          row,
          hue,
          on,
          onClick: () => applyClickActions(nodeSelectActions(row.pick, { mode: "ledger", currentFilter: filter, deselect: on })),
          pair: subjectPairing(hoverNodeId, hoverKeyOf(row.pick), setHoverNodeId, hue),
        });
      }),
    });
  }

  return (
    <Explorer
      id="ledger-view"
      title="Snapshots"
      hint="Recent global snapshots. Open one for the networks that anchored into it."
      levels={levels}
      defaultCollapsed={defaultCollapsed}
      onLeave={() => {
        // Container-level hover backstop: leaving the card clears every channel its rows write.
        setHoverFilter(null);
        setHoverSnapOrd(null);
        setHoverMetaSnap(null);
        setHoverNodeId(null);
      }}
    />
  );
}
