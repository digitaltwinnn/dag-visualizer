"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork, metagraphById } from "@/src/data/network";
import { buildAnchorLog, sortAnchorLog, type AnchorLogRow, type AnchorLogSortKey } from "@/src/data/anchorLog";
import { displayNetwork, unlistedLog, UNLISTED_ID } from "@/src/data/unlisted";
import { ledgerLens } from "@/src/data/ledgerStory";
import { metaSnapHoverKey, type GlobalSnapshot } from "@/src/data/types";
import { metaSnapArrivalActions, metaSnapSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { IdentityDot } from "@/components/inspector/parts";
import { SelectedRowMark, selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TablePager from "@/components/datasection/TablePager";
import { POLL } from "@/src/engine/config";

// The retained global window the log joins against — the same buffer the strip's bars plot,
// one row per anchored metagraph snapshot inside it.
const MAX = POLL.maxSnapshots;
const PAGE = 25;

// The ledger data table (spec 2026-08-01): the per-metagraph ANCHOR LOG — one row per anchored
// metagraph snapshot, finer-grained than the strip's per-tick bars. SORTABLE like the roster
// (2026-08-13 — one raw-table idiom), resting on its chronological construction (newest first =
// Age ↑). A row click names its own METAGRAPH SNAPSHOT through the SAME tested
// `metaSnapSelectActions` builder as a tile click, so the two can't drift.
//
// TWO SOURCES, ONE TABLE (user, 2026-08-14 — "the pagination should be based on the total
// number of snapshots, not what we see in our buffers"):
//
//   · Under "all"/unlisted (and DAG, through the ledger lens) the log is WINDOW-scoped — no
//     merged cross-network history feed exists to page — and its pager says so ("in window")
//     with the route further back named in words: pick a network.
//   · Under a committed CATALOG network the log pages that network's ENTIRE chain through
//     /api/network/[address]/snapshots (the explorer's cursor pages, walked prev/next and
//     memoized per page). Ordinals are sequential and gapless, so the network's newest ordinal
//     IS its lifetime total and every pager number derives from the rows' own ordinals.
//
// A history row's ANCHORED INTO is resolved exactly — the buffer's own tick first, then
// /api/global/at (the timestamp→ordinal binary search; the join is timestamp EQUALITY, the
// explorer stamps metagraph snapshots with the anchoring global's own timestamp). Until it
// resolves the cell reads "…" and the row does not commit: a metagraph-snapshot selection IS
// the (snapshot, tick) pair, and committing half of it would break every downstream consumer.
export default function AnchorLogTable() {
  useSnapshotFeed(MAX); // re-render driver: global + anchor events (the buffers below refresh)
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const metaSnap = useStore((s) => s.metaSnap);
  // A row IS one metagraph snapshot, so its hover rides the snapshot channel, not the tick's
  // (user, 2026-08-09). Same channel the explorer's leaf rows and the scene's tiles use.
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const net = getNetwork();
  const snapshotExact = useStore((s) => s.snapshotExact);
  const lens = ledgerLens(filter);
  // HISTORY mode: a committed catalog network (the lens already maps DAG → "all").
  const histNet = lens !== "all" && lens !== UNLISTED_ID && metagraphById(lens) ? lens : null;

  const [sort, setSort] = useState<{ key: AnchorLogSortKey; dir: 1 | -1 }>({ key: "age", dir: 1 });
  const [page, setPageState] = useState(1);

  // ── History state (refs so fetches don't churn the effect graph; `version` re-renders) ──────
  type HistRow = { ordinal: number; hash: string; parent: string; ts: string; fee: number; sizeInKB: number };
  const hist = useRef<{ net: string; pages: Map<number, HistRow[]>; cursors: Map<number, string | null> }>({
    net: "",
    pages: new Map(),
    cursors: new Map(),
  });
  const resolved = useRef(new Map<string, { ordinal: number; hash: string }>()); // ts → global
  const inFlight = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  const [histErr, setHistErr] = useState(false);

  // The network's newest ordinal — the lifetime total (ordinals are sequential and gapless).
  // The live buffer leads; the explorer's first page seeds it for a quiet network whose window
  // is empty.
  const bufferedNewest = (() => {
    if (!histNet || !net) return 0;
    let max = 0;
    for (const r of net.metaSnaps.get(histNet) ?? []) if (r.ordinal > max) max = r.ordinal;
    return max;
  })();
  const histFirst = hist.current.net === lens ? (hist.current.pages.get(1)?.[0]?.ordinal ?? 0) : 0;
  const latest = Math.max(bufferedNewest, histFirst);

  // Reset the walk when the network changes; refresh page 1 when a new anchor lands (the live
  // tip is the only mutable page — cursored pages are immutable).
  useEffect(() => {
    if (!histNet) return;
    if (hist.current.net !== histNet) {
      hist.current = { net: histNet, pages: new Map(), cursors: new Map() };
      setPageState(1);
      setVersion((v) => v + 1);
    }
  }, [histNet]);
  useEffect(() => {
    if (!histNet || page !== 1) return;
    hist.current.pages.delete(1);
    setVersion((v) => v + 1);
    // bufferedNewest is the real dependency: a new anchor means a stale live page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bufferedNewest, histNet]);

  // Fetch the current history page if missing (prev/next walking guarantees the cursor chain).
  useEffect(() => {
    if (!histNet || hist.current.net !== histNet || hist.current.pages.has(page)) return;
    const cursor = page === 1 ? null : (hist.current.cursors.get(page - 1) ?? null);
    if (page !== 1 && cursor == null) return;
    let dead = false;
    fetch(`/api/network/${histNet}/snapshots${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: HistRow[]; next: string | null }>) : Promise.reject()))
      .then((d) => {
        if (dead) return;
        hist.current.pages.set(page, d.rows);
        hist.current.cursors.set(page, d.next);
        setHistErr(false);
        setVersion((v) => v + 1);
      })
      .catch(() => {
        if (!dead) setHistErr(true);
      });
    return () => {
      dead = true;
    };
  }, [histNet, page, version]);

  // Resolve the visible page's ANCHORED INTO ticks: buffer join first (free), the resolver
  // route for anything older. Timestamps are immutable, so each resolves at most once.
  useEffect(() => {
    if (!histNet || !net) return;
    const rows = hist.current.pages.get(page) ?? [];
    const byTs = new Map(net.globalSnapshots.map((g) => [g.timestamp, g]));
    for (const r of rows) {
      if (resolved.current.has(r.ts) || inFlight.current.has(r.ts)) continue;
      const g = byTs.get(r.ts);
      if (g) {
        resolved.current.set(r.ts, { ordinal: g.ordinal, hash: g.hash });
        continue;
      }
      inFlight.current.add(r.ts);
      fetch(`/api/global/at?ts=${encodeURIComponent(r.ts)}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ ordinal: number; hash: string }>) : Promise.reject()))
        .then((g2) => {
          resolved.current.set(r.ts, { ordinal: g2.ordinal, hash: g2.hash });
          setVersion((v) => v + 1);
        })
        .catch(() => {
          /* transient — the cell keeps its "…" and the next page visit retries */
        })
        .finally(() => inFlight.current.delete(r.ts));
    }
    // `version` re-runs this when a page lands; rows are read from the ref.
  }, [histNet, net, page, version]);

  // ── The rows this render shows ──────────────────────────────────────────────────────────────
  // WINDOW mode builds from the live buffers (rebuilt per event-driven render on purpose — the
  // buffers mutate in place, so a memo key would go stale, not save work). HISTORY mode maps the
  // memoized explorer page; a pending tick keeps `global` at ordinal 0 + `pending` true.
  type ViewRow = AnchorLogRow & { pending?: boolean };
  let allRows: AnchorLogRow[] = [];
  let rows: ViewRow[] = [];
  let pages = 1;
  let from = 0;
  let to = 0;
  let total = 0;

  if (!histNet) {
    const listedRows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];
    const unlistedRows = net && (lens === "all" || lens === UNLISTED_ID) ? unlistedLog(net.globalSnapshots, snapshotExact) : [];
    allRows = sortAnchorLog([...listedRows, ...unlistedRows], sort.key, sort.dir, (metaId) => displayNetwork(metaId)?.name ?? metaId);
    total = allRows.length;
    pages = Math.max(1, Math.ceil(total / PAGE));
    const p = Math.min(page, pages);
    rows = allRows.slice((p - 1) * PAGE, p * PAGE);
    from = total === 0 ? 0 : (p - 1) * PAGE + 1;
    to = Math.min(p * PAGE, total);
  } else {
    const raw = hist.current.net === histNet ? (hist.current.pages.get(page) ?? []) : [];
    const mapped: ViewRow[] = raw.map((r) => {
      const g = resolved.current.get(r.ts);
      return {
        metaId: histNet,
        ordinal: r.ordinal,
        hash: r.hash,
        fee: r.fee,
        sizeInKB: r.sizeInKB,
        ts: r.ts,
        global: { ordinal: g?.ordinal ?? 0, timestamp: r.ts, hash: g?.hash ?? "" },
        pending: !g,
      };
    });
    // Sorting scopes to the page in history mode — the full set is the chain itself.
    rows = sortAnchorLog(mapped, sort.key, sort.dir, () => displayNetwork(histNet)?.name ?? histNet) as ViewRow[];
    allRows = rows;
    total = latest;
    pages = Math.max(1, Math.ceil(Math.max(total, 1) / PAGE));
    const ords = raw.map((r) => r.ordinal);
    from = ords.length && latest ? latest - Math.max(...ords) + 1 : 0;
    to = ords.length && latest ? latest - Math.min(...ords) + 1 : 0;
  }

  // THE LAYER OPENS ON A SUBJECT (2026-08-13): with nothing selected, the log commits its own
  // first row on arrival — the section EDGE, one commit per arrival, never overriding an
  // existing selection. History mode keeps the same source: the newest WINDOW row (the buffer
  // leads the explorer's live page by construction).
  const section = useStore((s) => s.section);
  const armed = useRef(false);
  useEffect(() => {
    armed.current = section === "data";
  }, [section]);
  const windowFirst = (() => {
    if (!net) return null;
    const listed = buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter);
    return listed[0] ?? null;
  })();
  useEffect(() => {
    if (section !== "data" || !armed.current || metaSnap || !windowFirst) return;
    armed.current = false;
    applyClickActions(
      metaSnapArrivalActions(
        { metaId: windowFirst.metaId, ordinal: windowFirst.ordinal, hash: windowFirst.hash, globalOrdinal: windowFirst.global.ordinal, ts: windowFirst.ts },
        { kind: "snapshot", title: `Global snapshot #${windowFirst.global.ordinal}`, data: windowFirst.global },
      ),
    );
    // The first row advances with the feed; only its identity matters for re-running the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, metaSnap, windowFirst?.metaId, windowFirst?.ordinal]);

  if (rows.length === 0)
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live ? "NO SIGNAL" : histNet ? (histErr ? "history unavailable — the explorer read failed; paging again retries" : "reading the chain…") : "Waiting for anchored metagraph snapshots…"}
      </p>
    );

  const now = Date.now();

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md">
            <TableRow className="border-border">
              {(
                [
                  { key: "net", label: "Network" },
                  { key: "ordinal", label: "Snapshot" },
                  { key: "fee", label: "Fee (DAG)" },
                  { key: "size", label: "Size" },
                  { key: "tick", label: "Anchored into" },
                  { key: "age", label: "Age" },
                ] as { key: AnchorLogSortKey; label: string }[]
              ).map((c, i) => (
                <TableHead
                  key={c.key}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={cn(i >= 2 && "text-right")}
                >
                  <button
                    type="button"
                    className={cn(
                      "items-center gap-1 text-micro uppercase tracking-caps text-muted-foreground hover:text-foreground cursor-pointer",
                      i >= 2 ? "inline-flex flex-row-reverse" : "flex",
                    )}
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const cfg = displayNetwork(r.metaId) ?? null;
              // TWO selection strengths (user, 2026-08-07): the CLICKED metagraph snapshot wears
              // the full wash + ✓; its tick-mates keep a fainter wash. (Washes, not box-shadow —
              // it doesn't paint on a collapsed table row.)
              const rowSel = metaSnap?.metaId === r.metaId && metaSnap?.ordinal === r.ordinal;
              const tickMate = !rowSel && !r.pending && snap?.data.ordinal === r.global.ordinal;
              const pending = !!r.pending;
              const commit = () => {
                if (pending) return; // half a (snapshot, tick) pair must not commit
                applyClickActions(
                  metaSnapSelectActions(
                    { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: r.global.ordinal, ts: r.ts },
                    { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global as GlobalSnapshot },
                    { filter, metaSnap, following },
                  ),
                );
              };
              return (
                <TableRow
                  key={`${r.metaId}:${r.ordinal}`}
                  className={cn(
                    "text-body hover:bg-wash-faint",
                    pending ? "cursor-default" : "cursor-pointer",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    rowSel && "bg-[var(--sel-bg)] text-foreground",
                    tickMate && "bg-wash-faint",
                  )}
                  // A <tr> is not natively focusable — tabIndex + Enter/Space give the keyboard
                  // the same commit, and focus previews what hover previews (rule 9).
                  tabIndex={0}
                  title={pending ? "resolving the anchoring tick…" : undefined}
                  // The selection follows the subject's identity (selectionHue).
                  style={rowSel ? selectionHue(cfg?.hue ?? "var(--core)") : undefined}
                  onMouseEnter={() => setHoverMetaSnap(metaSnapHoverKey(r.metaId, r.ordinal))}
                  onMouseLeave={() => setHoverMetaSnap(null)}
                  onFocus={() => setHoverMetaSnap(metaSnapHoverKey(r.metaId, r.ordinal))}
                  onBlur={() => setHoverMetaSnap(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault(); // Space must not scroll the pane
                      commit();
                    }
                  }}
                  onClick={commit}
                >
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <IdentityDot hue={cfg?.hue ?? "var(--core)"} />
                      {cfg && !cfg.virtual ? (
                        cfg.name
                      ) : (
                        // An uncataloged channel: the core tone + its address, honestly unnamed.
                        <span className="italic text-muted-foreground">unlisted · {r.metaId.slice(0, 10)}…</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-foreground-dim">
                    {/* The ✓ slot is ALWAYS reserved so the column never shifts on select. */}
                    <span className="inline-flex items-center gap-1.5">
                      {r.ordinal.toLocaleString()}
                      <span className="inline-flex w-3.5 flex-none">{rowSel && <SelectedRowMark hue={cfg?.hue ?? "var(--core)"} />}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDag(r.fee)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-dim">{fmtKB(r.sizeInKB)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {pending ? <span className="text-muted-foreground">…</span> : r.global.ordinal.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeAge(now - Date.parse(r.ts))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      <TablePager
        page={histNet ? page : Math.min(page, pages)}
        pages={pages}
        from={from}
        to={to}
        total={total}
        // The windowed lenses state their scope and the way further back (user, 2026-08-14):
        // no merged cross-network history feed exists, so "all"/unlisted page the window only.
        suffix={histNet ? undefined : "in window"}
        note={histNet ? undefined : "pick a network to page all time"}
        onPage={setPageState}
      />
    </>
  );
}
