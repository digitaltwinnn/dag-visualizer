"use client";

import { useEffect, useState } from "react";

import Explorer, { type ExplorerLevelSpec, type ExplorerRowSpec } from "@/components/explorer/Explorer";
import TablePager from "@/components/datasection/TablePager";
import { IdentityDot } from "@/components/inspector/parts";
import { ensurePage } from "@/components/RawSnapshotBridge";
import { selectedRow, selectionHue } from "@/components/selection";
import { NoSignalDot } from "@/components/state/StateAtoms";
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
  type SnapLevelMeasure,
  type TickNetMeasure,
} from "@/src/data/ledgerMeasure";
import { ledgerLens, storyCount, tickInStory } from "@/src/data/ledgerStory";
import { filterAccent, getAnchor, getNetwork, metagraphById, resolveSigner, SIGNER_GROUPS, SIGNER_UNKNOWN } from "@/src/data/network";
import { metaSnapHoverKey, type GlobalSnapshot, type NodeRow, type SnapshotExact } from "@/src/data/types";
import { displayNetwork, LISTED_IDS, UNLISTED_HUE, UNLISTED_ID, UNLISTED_LABEL, unlistedLog } from "@/src/data/unlisted";
import { POLL } from "@/src/engine/config";
import { filterToggleActions, followToggleActions, metaSnapSelectActions, nodeSelectActions, sameMetaSnap, snapshotSelectActions } from "@/src/engine/domain/pickActions";
import { identityHudCss } from "@/src/palette/identity";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { midHash } from "@/src/util/format";

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
// an axis before browsing. The network axis is the COMMITTED FILTER — the head's scope dot — which
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

/** How many ticks a page of the explorer shows. Fifteen because the card is a peephole, not the
 *  chain: enough rows that the list reads as a run of history rather than as the last handful
 *  (user, 2026-09-13: "can you do 10-20 by default"), few enough that one page fits the rail. */
const TICK_PAGE = 15;

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

const NO_SIGNERS: readonly string[] = [];

/** The signer ids of ONE metagraph snapshot, from the tick's EXACT read — the same source the
 *  metagraph-snapshot card's own signer list falls back to, so the two can't disagree. Never the
 *  ~2.5 MB deep read: the explorer must not turn an explicit-gesture route into a browse. The
 *  ordinal-0 fallback is the card's own: a payload the quick decoder couldn't read carries
 *  ordinal 0, and the address match still finds its proofs. */
function signersOf(ex: SnapshotExact | undefined, metaId: string, ordinal: number): readonly string[] {
  if (!ex) return NO_SIGNERS;
  const r = ex.rows.find((x) => x.metaId === metaId && x.ordinal === ordinal) ?? ex.rows.find((x) => x.metaId === metaId && x.ordinal === 0);
  return r?.signers ?? NO_SIGNERS;
}

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
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const metaSnap = useStore((s) => s.metaSnap);
  const snapshotExact = useStore((s) => s.snapshotExact);
  const selNodes = useStore((s) => s.selNodes);
  const inspect = useStore((s) => s.inspect);
  // The two lower levels' own measures — a level remembers its pick; these are the card's, not
  // the app's, so they live here rather than in the store (the tick level's is `ledgerMeasure`,
  // which the chamber's own readouts share).
  const [netPick, setNetPick] = useState<TickNetMeasure>("snapshots");
  const [snapPick, setSnapPick] = useState<SnapLevelMeasure>("fee");

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
  const orderedSnaps = [...snaps].reverse(); // newest first, the log convention
  const activeSnapOrd = snap?.data.ordinal ?? null;
  const [tickPage, setTickPage] = useState(1);
  const pages = Math.max(1, Math.ceil(orderedSnaps.length / TICK_PAGE));
  const page = Math.min(tickPage, pages);
  const pagedSnaps = orderedSnaps.slice((page - 1) * TICK_PAGE, page * TICK_PAGE);
  // A PAGE IN VIEW IS A PAGE IN FOCUS: the exact reads (the figures) are fetched for the page the
  // reader is looking at, at the backfill's own pace, deduped against everything held or in flight.
  const pagedKey = pagedSnaps.map((d) => d.ordinal).join(",");
  useEffect(() => {
    const ords = pagedKey ? pagedKey.split(",").map(Number) : [];
    return ensurePage(ords);
  }, [pagedKey]);

  // The path: which tick, which network in it, which snapshot's signers.
  const [openTick, setOpenTick] = useState<number | null>(null);
  const [openNet, setOpenNet] = useState<string | null>(null);
  const [openSnap, setOpenSnap] = useState<string | null>(null); // `${metaId}|${ordinal}` — a bare ordinal collides (every undecodable unlisted payload is 0)
  // A snapshot committed ANYWHERE opens the path to it (the scene's tile, the rail's pager, the
  // raw log), so the explorer always shows the level the committed subject sits on.
  const metaSnapKey = metaSnap ? `${metaSnap.globalOrdinal}|${metaSnap.metaId}|${metaSnap.ordinal}` : null;
  useEffect(() => {
    if (!metaSnap) return;
    const netId = LISTED_IDS.has(metaSnap.metaId) ? metaSnap.metaId : UNLISTED_ID;
    setOpenTick(metaSnap.globalOrdinal);
    setOpenNet(netId);
    setOpenSnap((cur) => (cur === `${metaSnap.metaId}|${metaSnap.ordinal}` ? cur : null));
    const at = orderedSnaps.findIndex((d) => d.ordinal === metaSnap.globalOrdinal);
    if (at >= 0) setTickPage(Math.floor(at / TICK_PAGE) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one sync per committed snapshot
  }, [metaSnapKey]);
  // A tick pinned elsewhere (the rail's ‹ › plank) while a tick is open re-points the path.
  useEffect(() => {
    if (openTick == null || following || activeSnapOrd == null || activeSnapOrd === openTick) return;
    setOpenTick(activeSnapOrd);
    setOpenNet(null);
    setOpenSnap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the pin, not the path
  }, [activeSnapOrd, following]);

  const accent = filterAccent(filter);
  const tick = openTick != null ? orderedSnaps.find((d) => d.ordinal === openTick) ?? null : null;
  const exact = tick ? snapshotExact[tick.ordinal] : undefined;

  // ---- the heading's one setting: LIVE / PINNED (user, 2026-08-07 — the ONE explicit way to see
  // and toggle the follow state; design 2026-09-26 decision 15: it rides the heading as dot + word).
  // Hovering ANY snapshot — a row, a scene tile — PREVIEWS the pinned state it would enter (hollow
  // dot, dashed). The write goes through `followToggleActions` + the one executor. ----------------
  const setting = (() => {
    if (!live)
      return (
        <span className="mr-auto inline-flex items-center gap-1.5 text-micro tracking-caps uppercase text-muted-foreground">
          <NoSignalDot /> no signal
        </span>
      );
    const liveOrd = latestSnapshot?.ordinal ?? null;
    const previewOrd = hoverSnapOrd != null && hoverSnapOrd !== liveOrd ? hoverSnapOrd : null;
    const pinned = !following && snap != null;
    const beating = following && previewOrd == null;
    const label = previewOrd != null ? "Pinned" : following ? "Live" : pinned ? "Pinned" : "Live";
    const dotHue = displayNetwork(filter)?.hue ?? accent;
    const sub = previewOrd != null ? previewOrd.toLocaleString() : pinned ? snap!.data.ordinal.toLocaleString() : following ? null : "off";
    return (
      <button
        type="button"
        aria-pressed={following}
        title={following ? "Following the live snapshot — click to pin the one on screen" : "Follow the live snapshot"}
        onClick={() => {
          const shown = snap ?? (latestSnapshot ? ({ kind: "snapshot", title: `Global snapshot #${latestSnapshot.ordinal}`, data: latestSnapshot } as const) : null);
          if (shown) applyClickActions(followToggleActions(shown, following));
        }}
        // One box in every state, so the pill never changes size or place as the state flips:
        // the padding is there when it is invisible (LIVE, transparent) as when the PINNED wash
        // makes it a visible chip (user, 2026-09-26: the pinned block "looks ugly, no padding").
        className={cn(
          "mr-auto -ml-1.5 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-[3px] cursor-pointer select-none border border-transparent",
          "hover:bg-wash-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          pinned && previewOrd == null && selectedRow(true),
          previewOrd != null && "border-dashed border-border",
        )}
        style={pinned && previewOrd == null ? selectionHue(accent) : undefined}
      >
        {beating ? (
          <span
            className="flex-none w-2 h-2 rounded-full animate-dot-beat motion-reduce:animate-none"
            style={{ background: dotHue, boxShadow: `0 0 0 3px color-mix(in oklch, ${dotHue} 30%, transparent)` }}
          />
        ) : (
          <span className={cn("flex-none w-2 h-2 rounded-full border", pinned && previewOrd == null ? "border-primary/80" : "border-muted-foreground/70")} />
        )}
        <span className={cn("text-micro tracking-caps uppercase", beating ? "text-primary" : pinned && previewOrd == null ? "text-foreground" : "text-muted-foreground")}>{label}</span>
        {sub && <span className="tabular-nums text-micro text-muted-foreground">{sub}</span>}
      </button>
    );
  })();

  // ---- level 0: the ticks, paged, measured by the heading's pick -------------------------------
  const tickValues = pagedSnaps.map((d) => tickMeasureValue(ledgerMeasure, d, snapshotExact[d.ordinal]));
  const maxTick = Math.max(1e-9, ...tickValues.map((v) => v ?? 0));
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
      hasFigure: true,
      // A 4-decimal fee ("0.0680") needs the wider figure column; the width holds across the
      // level's measures so the columns never shift when the heading's pick changes.
      figureW: 48,
      empty: "Waiting for snapshots…",
      rows: pagedSnaps.map((d, i): ExplorerRowSpec => {
        const count = tickFilterCount(d);
        const v = tickValues[i];
        const globalPick = { kind: "snapshot", title: `Global snapshot #${d.ordinal}`, data: d } as const;
        const tickHasFilter = tickInStory(filter, getAnchor(d.timestamp), snapshotExact[d.ordinal]);
        const on = d.ordinal === activeSnapOrd;
        return {
          key: String(d.ordinal),
          name: <span className="tabular-nums">{d.ordinal.toLocaleString()}</span>,
          // The lens's count in the network's hue where it anchored; no "0" — a zero in a
          // network's own colour reads as a reading about that network.
          tag: filterNet && count > 0 ? <span className="tabular-nums" style={{ color: filterNet.hue }}>{count}</span> : undefined,
          share: v != null ? v / maxTick : undefined,
          hue: accent,
          // Absent = the dash, never a number derived from another (rule 10).
          figure: tickMeasure(ledgerMeasure, d, snapshotExact[d.ordinal]),
          on,
          faint: !!filterNet && count === 0 && !on,
          title: `Global snapshot ${d.ordinal.toLocaleString()} · ${d.metagraphSnapshotCount ?? 0} anchors`,
          onClick: () => {
            applyClickActions(
              snapshotSelectActions(globalPick, latestRelevant("all")?.ordinal === d.ordinal, {
                pinnedOrdinal: !following && snap ? snap.data.ordinal : null,
                metaSnap,
                filter,
                tickHasFilter,
              }),
            );
            setOpenTick(d.ordinal);
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
            from={(page - 1) * TICK_PAGE + 1}
            to={Math.min(page * TICK_PAGE, orderedSnaps.length)}
            total={orderedSnaps.length}
            compact
            // "recent", the raw log's own word (user, 2026-09-13: "held"/"window" named a mechanism).
            scope={{
              word: "recent",
              title: `These are the ${POLL.maxSnapshots} most recent global snapshots — the stretch this page follows live. The chain goes back very much further: open the raw data layer to search all of it.`,
            }}
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
      key: "networks",
      crumb: {
        label: <span className="tabular-nums">{tick.ordinal.toLocaleString()}</span>,
        onRelease: () => {
          setOpenNet(null);
          setOpenSnap(null);
        },
      },
      meaning: "Networks that anchored into it",
      measure: { options: TICK_NET_MEASURE_OPTIONS, value: netPick, onPick: (id) => setNetPick(id as TickNetMeasure) },
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
          on: filter === n.id && activeSnapOrd === tick.ordinal && metaSnap == null,
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
      measure: { options: SNAP_MEASURE_OPTIONS, value: snapPick, onPick: (id) => setSnapPick(id as SnapLevelMeasure) },
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
          // several chains, so the short address says which (2026-08-08). A listed row carries
          // its own hash where the polled buffer knows it.
          // A hash PREFIX, not the `a…b` short form: the tag home beside a 4-decimal fee holds
          // seven mono glyphs, and a prefix cut clean reads as a prefix where an ellipsised
          // short form cut again reads as broken. The row's title carries the full ids.
          tag: isUnlisted ? (r.ordinal > 0 ? r.metaId.slice(0, 7) : undefined) : r.hash ? r.hash.slice(0, 7) : undefined,
          share: values[i] != null ? values[i]! / maxLeaf : undefined,
          hue: leafHue,
          figure: snapMeasure(snapPick, r),
          on,
          title: isUnlisted
            ? `Unlisted channel ${r.metaId} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`
            : `${leafName} snapshot ${r.ordinal.toLocaleString()} · anchored into global ${tick.ordinal.toLocaleString()}${signers.length ? ` · signed by ${signers.length} ${SIGNER_GROUPS.proof.who}` : ""}`,
          onClick: () => {
            applyClickActions(metaSnapSelectActions(sel, globalPick, { metaSnap, following }));
            // The AFFORDANCE FOLLOWS THE DATA: no exact read for this tick means no signers are
            // knowable, so the row commits and stays — a level onto nothing would claim a fact
            // we don't have. Re-clicking (the deselect) closes the level with it.
            setOpenSnap(!on && signers.length > 0 ? key : null);
          },
          pair: subjectPairing(hoverMetaSnap, metaSnapHoverKey(r.metaId, r.ordinal), setHoverMetaSnap, leafHue),
        };
      }),
    });
  }

  // ---- level 3: the signers of the open snapshot — the same node row every explorer ends in ----
  const leaf = openSnap ? leaves.find((r) => `${r.metaId}|${r.ordinal}` === openSnap) ?? null : null;
  const signers = leaf ? signersOf(exact, leaf.metaId, leaf.ordinal) : NO_SIGNERS;
  if (leaf && signers.length > 0) {
    levels.push({
      key: "signers",
      crumb: { label: <span className="tabular-nums">{leaf.ordinal > 0 ? leaf.ordinal.toLocaleString() : `${leaf.metaId.slice(0, 10)}…`}</span> },
      // The cards' own phrase ("Signed by N L0 validators") — the producing layer named before
      // the rows, because the constant count is most puzzling here (3 rows under a 20-node network).
      // The user's words (2026-09-26); the count is the rows, the layer is the tag beside each.
      meaning: "Validators that signed",
      measure: null,
      hasFigure: false,
      rows: signers.map((sid): ExplorerRowSpec => {
        const r = resolveSigner(selNodes, leaf.metaId, sid);
        if (!r.known) {
          // No node to commit, so no affordance: a signature that states what isn't known
          // (`resolveSigner` + `SIGNER_UNKNOWN`, the one shared rule). Every unlisted channel's
          // signers take this branch by construction; a listed network's can too.
          const w = SIGNER_UNKNOWN[r.reason];
          return { key: sid, name: midHash(sid, 22), nameMono: true, tag: <span className="italic">{w.label}</span>, faint: true, title: w.title };
        }
        const row = r.row;
        const on = nodeOn(row);
        const id = row.id ?? row.label;
        const hue = identityHudCss(leaf.metaId);
        return {
          key: sid,
          name: midHash(id, 26),
          nameMono: true,
          tag: row.state ? row.state.charAt(0).toUpperCase() + row.state.slice(1) : undefined,
          on,
          hue,
          title: `${row.label} · ${row.state ?? "—"}`,
          onClick: () => applyClickActions(nodeSelectActions(row.pick, { mode: "ledger", currentFilter: filter, deselect: on })),
          pair: subjectPairing(hoverNodeId, hoverKeyOf(row.pick), setHoverNodeId, hue),
        };
      }),
    });
  }
  // Every level carries the view's one setting on its heading.
  for (const l of levels) l.setting = setting;

  const scopeNet = filter !== "all" ? displayNetwork(filter) : null;
  return (
    <Explorer
      id="ledger-view"
      title="Snapshot breakdown"
      hint="Recent global snapshots. Open one for the networks that anchored into it."
      scope={scopeNet ? { hue: scopeNet.hue, ticker: scopeNet.ticker, label: scopeNet.name, onRelease: () => applyClickActions(filterToggleActions(filter, filter)) } : null}
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
