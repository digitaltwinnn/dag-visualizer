"use client";

import { useEffect, useRef, useState } from "react";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";

import Explorer, { type ExplorerLevelSpec, type ExplorerRowSpec } from "@/components/explorer/Explorer";
import { NODE_GLYPH_W, nodeRowSpec, unknownNodeRowSpec } from "@/components/explorer/nodeRow";
import TablePager from "@/components/datasection/TablePager";
import { pageKeepingRow } from "@/components/explorer/fitRows";
import useFitRows from "@/components/explorer/useFitRows";
import { useBreakpoint } from "@/components/useBreakpoint";
import { IdentityDot } from "@/components/inspector/parts";
import { ensurePage } from "@/components/RawSnapshotBridge";
import { subjectPairing } from "@/components/useSubjectPairing";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { cn } from "@/lib/utils";
import { buildAnchorLog, buildChannelLog, type AnchorLogRow } from "@/src/data/anchorLog";
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
import { filterAccent, getAnchor, getNetwork, metagraphById, resolveSigner, SIGNER_GROUPS, SIGNER_UNKNOWN, snapshotSigners } from "@/src/data/network";
import { metaSnapHoverKey, type GlobalSnapshot, type NodeRow, type SnapshotExact } from "@/src/data/types";
import { displayNetwork, LISTED_IDS, UNLISTED_HUE, UNLISTED_ID, UNLISTED_LABEL, unlistedLog } from "@/src/data/unlisted";
import { POLL } from "@/src/engine/config";
import { followToggleActions, metaSnapSelectActions, nodeSelectActions, sameMetaSnap, snapshotSelectActions } from "@/src/engine/domain/pickActions";
import { heldTicks, nextHoldTop } from "@/src/data/ledgerHold";
import LiveDot from "@/components/LiveDot";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { NO_SIGNAL_COPY, useNoSignal } from "@/components/useNoSignal";
import { levelMeasure } from "@/src/data/explorerMeasure";

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

/** One metagraph's anchored snapshots inside one tick. */
interface MetaGroup {
  id: string;
  name: string;
  hue: string;
  rows: AnchorLogRow[];
}

/** ONE TICK'S ROWS, from both sources, POLLED FIRST. The polled row wins where both hold the same
 *  (metaId, ordinal) — it carries the snapshot's own `hash`, which the exact read lacks — and the
 *  exact read supplies everything the per-network buffer has aged out. ⚠️ THE BREAKDOWN IS THE
 *  UNION, and only the exact read makes it COMPLETE (user, 2026-09-14: "DED is missing"): the
 *  polled buffers hold `POLL.metaSnapBuffer` rows PER NETWORK — a depth in rows, not ticks — so a
 *  busy chain's older ticks lost their busiest contributor while the fee above still counted it. */
function unionRows(polled: readonly AnchorLogRow[], exact: readonly AnchorLogRow[], tickOrdinal: number): AnchorLogRow[] {
  const mine = polled.filter((r) => r.global.ordinal === tickOrdinal);
  const seen = new Set(mine.map((r) => `${r.metaId}|${r.ordinal}`));
  const extra = exact.filter((r) => r.global.ordinal === tickOrdinal && !seen.has(`${r.metaId}|${r.ordinal}`));
  return extra.length ? [...mine, ...extra] : mine;
}

function groupByMeta(rows: readonly AnchorLogRow[]): MetaGroup[] {
  const by = new Map<string, MetaGroup>();
  for (const r of rows) {
    if (r.metaId == null) continue;
    const metaId = r.metaId;
    let g = by.get(metaId);
    if (!g) {
      const cfg = metagraphById(metaId);
      g = { id: metaId, name: cfg?.name ?? metaId, hue: identityHudCss(metaId), rows: [] };
      by.set(metaId, g);
    }
    g.rows.push({ ...r, metaId });
  }
  return [...by.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
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
  const unlistedEntries = unlistedLog([...snaps].reverse(), snapshotExact);
  const exactChannelRows = buildChannelLog([...snaps].reverse(), snapshotExact, (id: string) => LISTED_IDS.has(id));
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
  // The path's first step, declared here because the page size reads it: the fit measures only
  // while the tick level (no tick open) is the one on screen.
  const [openTick, setOpenTick] = useState<number | null>(null);
  // THE PAGE SIZE FILLS THE RAIL on desktop (`useFitRows`): measured only while the tick level is
  // the one on screen, and when it changes the reader keeps their place — the page holding the
  // row that was first on screen (`pageKeepingRow`), so a resize never throws them to page 1.
  const bp = useBreakpoint();
  // Phone keeps a fixed, shorter page (its sheet sizes to content): 10, not the old 15 (user,
  // 2026-09-28). Desktop and tablet fill their host.
  const pageSize = useFitRows("ledger-view", bp !== "phone", openTick == null, bp === "phone" ? TICK_PAGE_PHONE : TICK_PAGE);
  const lastSize = useRef(pageSize);
  useEffect(() => {
    if (lastSize.current === pageSize) return;
    // Read the OLD size before overwriting it: an updater runs lazily when another update is
    // pending on this fiber (the feed re-renders it often), and by then the ref would say new.
    const prev = lastSize.current;
    lastSize.current = pageSize;
    setTickPage((p) => pageKeepingRow(p, prev, pageSize));
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

  // The path: which tick, which network in it, which snapshot's signers.
  const [openNet, setOpenNet] = useState<string | null>(null);
  const [openSnap, setOpenSnap] = useState<string | null>(null); // `${metaId}|${ordinal}` — a bare ordinal collides (every undecodable unlisted payload is 0)
  // A snapshot committed ANYWHERE opens the path to it (the scene's tile, the rail's pager, the
  // raw log), so the explorer always shows the level the committed subject sits on.
  const metaSnapKey = metaSnap ? `${metaSnap.globalOrdinal}|${metaSnap.metaId}|${metaSnap.ordinal}` : null;
  // ⚠️ …EXCEPT THE LIVE FOLLOW'S OWN COMMIT (user, 2026-10-04: "the scene shows 3 snapshots on the
  // trail while the explorer only shows 1 … ensure the explorer is always filled — mirror what the
  // scene shows"). Under a metagraph filter the heartbeat (`src/data/follow.ts`) commits that
  // network's newest snapshot on every tick, and this path followed each one down to a single
  // tick's single row. A live commit is the stream moving, not a reader choosing a subject, so the
  // explorer stays on the tick list — filled, the filtered network's ticks lit — exactly as the
  // trail shows it. Any commit that pins (a tile, the pager, the raw log) still opens the path.
  useEffect(() => {
    if (!metaSnap || following) return;
    const netId = LISTED_IDS.has(metaSnap.metaId) ? metaSnap.metaId : UNLISTED_ID;
    setOpenTick(metaSnap.globalOrdinal);
    setOpenNet(netId);
    setOpenSnap((cur) => (cur === `${metaSnap.metaId}|${metaSnap.ordinal}` ? cur : null));
    const at = orderedSnaps.findIndex((d) => d.ordinal === metaSnap.globalOrdinal);
    if (at >= 0) setTickPage(Math.floor(at / pageSize) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one sync per committed snapshot
  }, [metaSnapKey]);
  // A tick pinned elsewhere (the rail's ‹ › plank) while a tick is open re-points the path — but
  // NOT when the same commit carried a metagraph snapshot for that tick: the effect above has
  // just opened the path to the snapshot, and this one, reading the stale `openTick`, would
  // close it back to the networks level (review, 2026-09-26). The effects run in one commit.
  useEffect(() => {
    if (openTick == null || following || activeSnapOrd == null || activeSnapOrd === openTick) return;
    if (metaSnap && metaSnap.globalOrdinal === activeSnapOrd) return;
    setOpenTick(activeSnapOrd);
    setOpenNet(null);
    setOpenSnap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the pin, not the path
  }, [activeSnapOrd, following]);

  // RESUMING LIVE CLOSES THE PATH (test pass, 2026-10-03). Releasing a pin clears the tick-local
  // commits — the rail drops its Metagraph and Metagraph-snapshot cards — but the path is local
  // state and stayed where it was: the rail said "live", the explorer still listed the validators
  // that signed the snapshot just let go, three levels inside a tick nothing was pinned to. A
  // resume is a return to the stream, so the explorer returns to the list of it. Only on the
  // false → true EDGE: a path opened by browsing while live is the reader's own and is left alone.
  // ⚠️ …UNLESS THE RESUME IS THIS EXPLORER'S OWN CLICK (whole-branch review, 2026-10-03). The
  // live tip's row resumes live AND opens the tick — its handler says so — and this effect, a
  // render later, closed what the click had just opened: the row needed a second click. The
  // handler flags the resume it is about to cause, and that one edge is left alone.
  const wasFollowing = useRef(following);
  const ownResume = useRef(false);
  useEffect(() => {
    const resumed = following && !wasFollowing.current;
    wasFollowing.current = following;
    if (!resumed) return;
    if (ownResume.current) {
      ownResume.current = false;
      return;
    }
    setOpenTick(null);
    setOpenNet(null);
    setOpenSnap(null);
    setTickPage(1);
  }, [following]);

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
        onRelease: () => {
          setOpenTick(null);
          setOpenNet(null);
          setOpenSnap(null);
        },
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
          hue: filterNet && count > 0 ? filterNet.hue : "var(--primary)",
          // Absent = the dash, never a number derived from another (rule 10).
          figure: tickMeasure(ledgerMeasure, d, snapshotExact[d.ordinal]),
          on,
          faint: !!filterNet && count === 0 && !on,
          // The count the bar's colour stands for, in words — colour is never the only carrier.
          title: `Global snapshot ${d.ordinal.toLocaleString()}, ${d.metagraphSnapshotCount ?? 0} snapshots anchored${filterNet ? (count > 0 ? `, ${count} from ${filterNet.name}` : `, none from ${filterNet.name}`) : ""}`,
          onClick: () => {
            // A pinned stream and the live tip's row: this click resumes live (see the effect above).
            ownResume.current = !following && latestRelevant("all")?.ordinal === d.ordinal && !(on && !following);
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
            setOpenTick(releasing || openTick === d.ordinal ? null : d.ordinal);
            setOpenNet(null);
            setOpenSnap(null);
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
  let groups: MetaGroup[] = [];
  let unlistedCount = 0;
  if (tick) {
    groups = groupByMeta(unionRows(rows, exactChannelRows, tick.ordinal));
    unlistedCount = exact?.unlistedCount ?? 0;
    const netRows: { id: string; name: string; hue: string; count: number; italic?: boolean }[] = [
      ...groups.map((g) => ({ id: g.id, name: g.name, hue: g.hue, count: g.rows.length })),
      ...(unlistedCount > 0 ? [{ id: UNLISTED_ID, name: UNLISTED_LABEL, hue: UNLISTED_HUE, count: unlistedCount, italic: true }] : []),
    ];
    const measured = netRows.map((n) => ({ n, m: tickNetMeasure(netPick, n.count, perMetaOf(exact, n.id)) }));
    const maxNet = Math.max(1e-9, ...measured.map(({ m }) => m.value ?? 0));
    levels.push({
      pager: spanFooter,
      key: "networks",
      crumb: {
        label: <span className="tabular-nums">{tick.ordinal.toLocaleString()}</span>,
        onRelease: () => {
          setOpenNet(null);
          setOpenSnap(null);
        },
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
          // filter on this tick, with no finer snapshot pinned under it (the byte bar's band click).
          // …or the network committed INSIDE this tick (the pager's ∨, a band — 2026-10-02).
          on:
            ledgerNetwork({ filter, tickNet, snapOrdinal: activeSnapOrd ?? null }) === n.id &&
            activeSnapOrd === tick.ordinal &&
            metaSnap == null,
          // Out of the lens: listed (it really did anchor here), not drillable.
          faint: lensedOut,
          title: lensedOut
            ? `${n.name} · ${n.count} snapshot${n.count === 1 ? "" : "s"} anchored here — outside the committed filter`
            : `${n.name} · ${n.count} snapshot${n.count === 1 ? "" : "s"} anchored into ${tick.ordinal.toLocaleString()}`,
          // OPENS, never commits (user, 2026-08-10).
          onClick: lensedOut
            ? undefined
            : () => {
                setOpenNet(n.id);
                setOpenSnap(null);
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
  let leaves: SnapLeaf[] = [];
  let leafHue = accent;
  let leafName = "";
  if (tick && openNet) {
    const g = groups.find((x) => x.id === openNet) ?? null;
    if (openNet === UNLISTED_ID && unlistedCount > 0) {
      leafHue = UNLISTED_HUE;
      leafName = UNLISTED_LABEL;
      leaves = unlistedEntries
        .filter((e) => e.global.ordinal === tick.ordinal)
        .map((r) => ({ metaId: r.metaId, ordinal: r.ordinal, hash: "", ts: r.ts, fee: r.fee, sizeInKB: r.sizeInKB }));
    } else if (g) {
      leafHue = g.hue;
      leafName = g.name;
      leaves = g.rows.map((r) => ({ metaId: r.metaId!, ordinal: r.ordinal, hash: r.hash, ts: r.ts, fee: r.fee, sizeInKB: r.sizeInKB }));
    }
  }
  if (tick && openNet && (leaves.length > 0 || openNet === UNLISTED_ID)) {
    const globalPick = { kind: "snapshot", title: `Global snapshot #${tick.ordinal}`, data: tick } as const;
    const values = leaves.map((r) => snapMeasureValue(snapPick, r));
    const maxLeaf = Math.max(1e-9, ...values.map((v) => v ?? 0));
    levels.push({
      pager: spanFooter,
      key: "snapshots",
      crumb: {
        label: (
          <>
            <IdentityDot hue={leafHue} />
            <span className={cn(openNet === UNLISTED_ID && "italic")}>{leafName}</span>
          </>
        ),
        onRelease: () => setOpenSnap(null),
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
          title: isUnlisted
            ? `Unlisted channel ${r.metaId} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`
            : `${leafName} snapshot ${r.ordinal.toLocaleString()} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`,
          onClick: () => {
            applyClickActions(metaSnapSelectActions(sel, globalPick, { metaSnap, following, inspect: useStore.getState().inspect }));
            // The AFFORDANCE FOLLOWS THE DATA: no exact read for this tick means no signers are
            // knowable, so the row commits and stays — a level onto nothing would claim a fact
            // we don't have. Re-clicking (the deselect) closes the level with it.
            setOpenSnap(!on && signers.length > 0 ? key : null);
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
