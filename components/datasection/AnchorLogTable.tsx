"use client";

import { netUrl } from "@/src/net/current";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Search, X } from "lucide-react";
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
import LogSearchBar from "@/components/datasection/LogSearchBar";
import { pageOfOrdinal, seekOrdinalByTime, dayStartMs, dayEndMs, tsInRange } from "@/src/data/chainSeek";
import { POLL } from "@/src/engine/config";

// The retained global window the log joins against — the same buffer the strip's bars plot,
// one row per anchored metagraph snapshot inside it.
const MAX = POLL.maxSnapshots;
const PAGE = 25;

// ONE COLUMN LIST, read by the header AND by the search row beneath it — a second literal is how the
// two silently fall out of alignment when a column is added.
/** How many seek-probed chain pages to retain (see loadPage). A walk spends at most ~10, so this
 *  holds several searches' worth without letting a long session grow unbounded. */
const PROBE_CACHE = 64;

const COLUMNS: { key: AnchorLogSortKey; label: string }[] = [
  { key: "net", label: "Network" },
  { key: "ordinal", label: "Snapshot" },
  { key: "fee", label: "Fee (DAG)" },
  { key: "size", label: "Size" },
  { key: "tick", label: "Anchored into" },
  { key: "age", label: "Age" },
];

/** The absence mark for a SEAM's metagraph columns. Muted rather than dim, so a scan reads it as
 *  "nothing to say here" instead of as a faint value — and `aria-hidden` with an sr-only word,
 *  because a screen reader announcing "em dash" four times per seam row says nothing at all. */
const Dash = () => (
  <>
    <span aria-hidden className="text-muted-foreground/60">—</span>
    <span className="sr-only">none</span>
  </>
);

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
//     /api/network/[address]/snapshots. Ordinals are sequential and gapless, so the newest
//     ordinal IS the lifetime total and EVERY page is pure arithmetic — page N asks for
//     ?before=latest−(N−1)·25, which is what makes the pager's «/» jumps (genesis included)
//     one request deep. `latest` FREEZES per walk (refreshed while on page 1) so deep pages
//     don't shift under the reader as new anchors land.
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
  // THE JUMP'S LANDING MARK. A jump that only changed the page would leave the reader hunting the
  // ordinal they just typed among 25 near-identical rows, so the row is marked when it arrives.
  // It is LOCAL state and deliberately not a selection: rule 2 keeps one write path for that, and
  // "I looked this up" is not "I committed this" — the mark carries no card, no scene subject and
  // no store write, and a real selection still paints over it.
  const [marked, setMarked] = useState<number | null>(null);
  const [jumpMiss, setJumpMiss] = useState<string | null>(null);
  // ⚠️ SEARCHING IS ASKED FOR, NOT ALWAYS ON (user, 2026-09-01: "can we make the search a more
  // deliberate action? … it now kinda looks like the search row is actually part of the data, and
  // the hint looks ugly"). The row was correct in WHERE it put its controls — under the columns
  // they can answer for — and wrong in being there unasked: a permanent line of placeholders
  // directly beneath the header reads as a first data row whose values happen to be words, and
  // the table's job is to open as data. Behind a toggle the placeholders only ever appear to
  // someone who just asked for them, which is also the one moment they stop being noise and
  // start being the column key.
  const [searchOpen, setSearchOpen] = useState(false);
  // ⚠️ WHICH CHAIN THE SNAPSHOT ORDINAL COUNTS ON. Null until chosen, and PRESELECTED from the
  // committed filter whenever there is one (user: "in a filter you can preselect it no?") — under
  // "all" the log is a window over every network at once, so there is nothing to infer and the
  // reader picks (user: "in all there are multiple networks, so it's needed").
  const [searchMeta, setSearchMeta] = useState<string | null>(null);
  const metaList = useStore((st) => st.metaList);
  const searchNet = searchMeta ?? (histNet || null);
  const [qSnapshot, setQSnapshot] = useState("");
  const [qTick, setQTick] = useState("");
  const [qFrom, setQFrom] = useState("");
  const [qTo, setQTo] = useState("");
  const [seeking, setSeeking] = useState(false);
  /** Chain pages fetched by a SEEK, keyed by the `before` ordinal asked for (see loadPage). Cleared
   *  with the walk when the network changes — another network's ordinals mean nothing here. */
  const probes = useRef<Map<number, { ordinal: number; ts: string }[]>>(new Map());
  const [page, setPageState] = useState(1);

  // ── History state (refs so fetches don't churn the effect graph; `version` re-renders) ──────
  type HistRow = { ordinal: number; hash: string; parent: string; ts: string; fee: number; sizeInKB: number };
  const hist = useRef<{ net: string; pages: Map<number, HistRow[]>; latest: number }>({
    net: "",
    pages: new Map(),
    latest: 0,
  });
  const resolved = useRef(new Map<string, { ordinal: number; hash: string; lastSnapshotHash?: string }>()); // ts → global
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
  // The FROZEN latest — page arithmetic must not shift under the reader mid-walk, so it only
  // advances while the reader is ON the live page (or when the walk resets).
  if (hist.current.net === lens && (page === 1 || hist.current.latest === 0)) {
    hist.current.latest = Math.max(hist.current.latest, bufferedNewest, histFirst);
  }
  const latest = hist.current.latest || Math.max(bufferedNewest, histFirst);

  // Reset the walk when the network changes; refresh page 1 when a new anchor lands (the live
  // tip is the only mutable page — ordinal-addressed pages are immutable).
  useEffect(() => {
    if (!histNet) return;
    if (hist.current.net !== histNet) {
      hist.current = { net: histNet, pages: new Map(), latest: 0 };
      probes.current.clear();
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

  // Fetch the current page if missing. Page 1 is the live tip; every deeper page is the
  // ordinal-addressed immutable read, so ANY page — a « jump to genesis included — is one
  // request, no cursor chain.
  useEffect(() => {
    if (!histNet || hist.current.net !== histNet || hist.current.pages.has(page)) return;
    const frozen = hist.current.latest;
    if (page !== 1 && frozen === 0) return; // no arithmetic base yet — page 1 seeds it
    const before = frozen - (page - 1) * PAGE;
    if (page !== 1 && before < 1) return;
    let dead = false;
    fetch(netUrl(`/api/network/${histNet}/snapshots${page === 1 ? "" : `?before=${before}`}`))
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: HistRow[] }>) : Promise.reject()))
      .then((d) => {
        if (dead) return;
        hist.current.pages.set(page, d.rows);
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
        resolved.current.set(r.ts, { ordinal: g.ordinal, hash: g.hash, lastSnapshotHash: g.lastSnapshotHash });
        continue;
      }
      inFlight.current.add(r.ts);
      fetch(netUrl(`/api/global/at?ts=${encodeURIComponent(r.ts)}`))
        .then((res) => (res.ok ? (res.json() as Promise<{ ordinal: number; hash: string; lastSnapshotHash?: string }>) : Promise.reject()))
        .then((g2) => {
          resolved.current.set(r.ts, { ordinal: g2.ordinal, hash: g2.hash, lastSnapshotHash: g2.lastSnapshotHash });
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
    allRows = sortAnchorLog([...listedRows, ...unlistedRows], sort.key, sort.dir, (metaId) => displayNetwork(metaId)?.ticker ?? metaId);
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
        // ⚠️ The chain link rides along. History mode REBUILDS the global rather than reading the
        // live buffer's record, so anything left out here is simply gone by the time the card
        // renders — which is how the Global snapshot card lost its Previous hash on exactly the
        // rows a reader pages back to (user, 2026-09-01).
        global: { ordinal: g?.ordinal ?? 0, timestamp: r.ts, hash: g?.hash ?? "", lastSnapshotHash: g?.lastSnapshotHash },
        pending: !g,
      };
    });
    // Sorting scopes to the page in history mode — the full set is the chain itself.
    rows = sortAnchorLog(mapped, sort.key, sort.dir, () => displayNetwork(histNet)?.ticker ?? histNet) as ViewRow[];
    allRows = rows;
    total = latest;
    pages = Math.max(1, Math.ceil(Math.max(total, 1) / PAGE));
    const ords = raw.map((r) => r.ordinal);
    // Page 1 IS positions 1..N by definition — deriving them by subtraction mixes two sources
    // (the buffer's `latest` can lead the explorer's live page by a tick, which read "13–37").
    // Deeper pages subtract against the SAME frozen latest their ?before was computed from.
    from = !ords.length ? 0 : page === 1 ? 1 : latest - Math.max(...ords) + 1;
    to = !ords.length ? 0 : page === 1 ? ords.length : latest - Math.min(...ords) + 1;
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
        // A SEAM first row commits the TICK alone — there is no metagraph snapshot to open the
        // channel pane on, and inventing one would be the fabricated state rule 10 forbids. The
        // pane's own empty branch is the honest answer, and the tick is still the subject.
        windowFirst.metaId == null
          ? null
          : { metaId: windowFirst.metaId, ordinal: windowFirst.ordinal, hash: windowFirst.hash, globalOrdinal: windowFirst.global.ordinal, ts: windowFirst.ts },
        { kind: "snapshot", title: `Global snapshot #${windowFirst.global.ordinal}`, data: windowFirst.global },
      ),
    );
    // The first row advances with the feed; only its identity matters for re-running the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, metaSnap, windowFirst?.metaId, windowFirst?.ordinal]);

  // ── THE THREE SEEKS ─────────────────────────────────────────────────────────────────────────
  // Each column's control answers with the cheapest mechanism that can reach the WHOLE chain, and
  // the differences between them are the reason only these three have controls at all.
  const netAddr = histNet;

  /** The chain pager, as `seekOrdinalByTime` wants it — and it reuses the walk's own page cache, so
   *  a probe already visited costs nothing and a completed seek leaves its landing page warm. */
  const loadPage = async (before: number) => {
    // The table's own page cache first — the TIP probe is `before === latest`, which is page 1 and
    // therefore already loaded in the normal case, so the walk's first step usually costs nothing.
    const cached = hist.current.net === netAddr ? hist.current.pages.get(pageOfOrdinal(before, latest, PAGE)) : null;
    if (cached && cached.length && cached[0].ordinal === before) return cached.map((r) => ({ ordinal: r.ordinal, ts: r.ts }));
    // …then the PROBE cache. A walk asks for pages at arbitrary ordinals (196,766, say), which do
    // not line up with page boundaries, so they cannot live in the map above — storing a misaligned
    // run under a page number would make the table render the wrong rows for that page. They get
    // their own map keyed by the ordinal actually requested, which makes a second search anywhere
    // near the first one nearly free: the interpolation converges through the same region, so the
    // pages it wants are the pages it already pulled.
    const hit = probes.current.get(before);
    if (hit) return hit;
    const r = await fetch(netUrl(`/api/network/${netAddr}/snapshots?before=${before}`));
    if (!r.ok) throw new Error(`chain ${r.status}`);
    const d = (await r.json()) as { rows: { ordinal: number; ts: string }[] };
    // Bounded, and oldest-out: a long session of searches must not grow this without limit, and the
    // useful entries are the recent ones — a walk revisits its own neighbourhood, not the whole chain.
    if (probes.current.size >= PROBE_CACHE) probes.current.delete(probes.current.keys().next().value as number);
    probes.current.set(before, d.rows);
    return d.rows;
  };

  /** ⚠️ FREEZE `latest` BEFORE COMPUTING THE PAGE. A page NUMBER only means an ordinal range
   *  relative to some `latest`, and while the reader sits on page 1 that value advances with the
   *  feed — `hist.current.latest` is deliberately refreshed there. So a jump computed its page from
   *  the live value, and by the time the fetch effect ran (which subtracts against the FROZEN one) a
   *  tick had landed and the same page number denoted a different 25 ordinals.
   *
   *  Caught live: searching global snapshot 3,993,563, whose manifest lists DOR 12,345,681–686, the
   *  table fetched the page starting at 12,345,706 — exactly one page off, because DOR anchors about
   *  25 snapshots per tick and one tick had passed. Pinning the base here makes the page number the
   *  jump computed and the page number the effect fetches mean the same thing. */
  /** What the landing OUTLINE keys on for a given row. The mark is one number matched against both
   *  `r.ordinal` and `r.global.ordinal`, and a SEAM has no metagraph ordinal — its `0` matches
   *  nothing, since every seek rejects an ordinal below 1. So a seam is marked by its TICK, which is
   *  the only number it has and the very thing that was searched for. */
  const markOf = (row: AnchorLogRow) => (row.metaId == null ? row.global.ordinal : row.ordinal);

  const landOn = (ordinal: number) => {
    if (histNet && latest) hist.current.latest = latest;
    setPageState(pageOfOrdinal(ordinal, latest, PAGE));
    setMarked(ordinal);
  };

  /** SNAPSHOT — pure arithmetic, one request. */
  const seekSnapshot = () => {
    const n = Number(qSnapshot.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setJumpMiss(null);
    if (!histNet) {
      const idx = allRows.findIndex((r) => r.ordinal === n);
      if (idx < 0) { setMarked(null); setJumpMiss("not in the retained window — pick a network to page all time"); return; }
      setPageState(Math.floor(idx / PAGE) + 1);
      setMarked(n);
      return;
    }
    if (!latest) { setJumpMiss("still reading the chain"); return; }
    if (n > latest) { setJumpMiss(`newest is ${latest.toLocaleString()}`); return; }
    landOn(n);
  };

  /** ANCHORED INTO — ASK THE GLOBAL SNAPSHOT ITSELF (user, 2026-09-01: "why if you search a
   *  [global snapshot] do you need a date").
   *
   *  A global snapshot CARRIES the list of what anchored into it — that is where
   *  `metagraphSnapshotCount` comes from — and `/api/snapshot/[ordinal]` already decodes it into one
   *  row per channel with that channel's own snapshot ordinal. So this is ONE exact read from the
   *  authoritative source, and it can say something no time-based search could: that this network
   *  did NOT anchor into that global snapshot.
   *
   *  ⚠️ NO FALLBACK, DELIBERATELY (user: "why walk as a fallback? keep it simple, no obsolete code
   *  to work around things"). The payload host serves only the recent band of global ordinals and
   *  404s older ones, and the first cut answered that by resolving the ordinal to a timestamp and
   *  walking the chain for an equal stamp — a second mechanism, with its own near-miss caveat, for a
   *  case the reader already has two working routes to: the Snapshot column pages the entire chain,
   *  and the date range reaches any point in it. So an unserved ordinal is simply SAID, and the
   *  message names the route that does work. */
  const seekTick = async () => {
    const n = Number(qTick.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setJumpMiss(null);
    if (!histNet) {
      const idx = allRows.findIndex((r) => r.global.ordinal === n);
      if (idx < 0) { setMarked(null); setJumpMiss("not in the retained window — pick a network to page all time"); return; }
      setPageState(Math.floor(idx / PAGE) + 1);
      setMarked(markOf(allRows[idx]));
      return;
    }
    if (!latest) { setJumpMiss("still reading the chain"); return; }
    const label = displayNetwork(histNet)?.ticker ?? "this network";
    setSeeking(true);
    try {
      const res = await fetch(netUrl(`/api/snapshot/${n}`));
      if (!res.ok) {
        setMarked(null);
        // The bound is the upstream's, not ours, and it moves — so the copy states the CONSEQUENCE
        // and the working alternative rather than a day count that would quietly go stale.
        setJumpMiss(`global snapshot ${n.toLocaleString()} is no longer served — search by date instead`);
        return;
      }
      const d = (await res.json()) as { rows?: { metaId: string; ordinal: number }[] };
      const mine = (d.rows ?? []).filter((r) => r.metaId === histNet);
      if (mine.length === 0) {
        setMarked(null);
        setJumpMiss(`${label} did not anchor into global snapshot ${n.toLocaleString()}`);
        return;
      }
      // A metagraph can anchor SEVERAL snapshots into one global; land on the oldest so the page
      // opens at the start of that run rather than in the middle of it. An `ordinal: 0` is the
      // route's marker for a payload it could not decode — excluded, and said if none survive.
      const ordinals = mine.map((r) => r.ordinal).filter((o) => o > 0);
      if (!ordinals.length) { setMarked(null); setJumpMiss("that global snapshot's payload could not be decoded"); return; }
      landOn(Math.min(...ordinals));
    } catch {
      setJumpMiss("the chain read failed — try again");
    } finally {
      setSeeking(false);
    }
  };

  /** AGE — the FROM bound is the destination; `to` only bounds which rows the landing marks. */
  const seekAge = async () => {
    const fromMs = dayStartMs(qFrom);
    setJumpMiss(null);
    if (fromMs == null) { setJumpMiss("pick a from-date"); return; }
    if (!histNet) {
      const toMs = dayEndMs(qTo);
      const idx = allRows.findIndex((r) => tsInRange(r.ts, fromMs, toMs));
      if (idx < 0) { setMarked(null); setJumpMiss("nothing in that range inside the window"); return; }
      setPageState(Math.floor(idx / PAGE) + 1);
      setMarked(markOf(allRows[idx]));
      return;
    }
    if (!latest) { setJumpMiss("still reading the chain"); return; }
    setSeeking(true);
    try {
      const hit = await seekOrdinalByTime(fromMs, latest, loadPage);
      if (hit == null) { setJumpMiss("could not locate that date in the chain"); return; }
      landOn(hit);
    } catch {
      setJumpMiss("the chain read failed — try again");
    } finally {
      setSeeking(false);
    }
  };

  /** The chains the picker offers — the catalog as the explorer lists it, plus whatever network is
   *  already committed, so a filter can always preselect something the list actually contains. */
  const searchNets = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const m of metaList) {
      if (m.isRoot || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ id: m.id, label: displayNetwork(m.id)?.ticker ?? m.symbol ?? m.name });
    }
    return out;
  }, [metaList]);

  // ⚠️ ONE BUTTON, SO THE PRECEDENCE IS STATED HERE — most specific first. A metagraph snapshot is
  // an exact address on one chain, a global snapshot is an exact address on the shared one, and a
  // date is a position to land NEAR. Filling more than one is not an error; the search simply
  // answers the most precise thing it was given, and the toolbar reports what is applied.
  const onSubmit = () => {
    if (searchNet && qSnapshot) seekSnapshot();
    else if (qTick) void seekTick();
    else if (qFrom) void seekAge();
  };

  /** Any criterion typed — the toggle says so while the row is folded away, or a search would be
   *  silently in force with nothing on screen to explain the rows you are looking at. */
  const searchSet = !!(qSnapshot || qTick || qFrom || qTo);

  // Built ONCE and rendered by BOTH branches below — a seek swaps the table into its loading state
  // while a page is fetched, and unmounting the controls mid-seek loses what was typed.
  const search = !searchOpen ? null : (
    <LogSearchBar
      networks={searchNets}
      metaId={searchNet}
      setMetaId={setSearchMeta}
      seeking={seeking}
      snapshot={qSnapshot}
      tick={qTick}
      from={qFrom}
      to={qTo}
      onSnapshot={(v) => { setQSnapshot(v); if (v === "") { setMarked(null); setJumpMiss(null); } }}
      onTick={(v) => { setQTick(v); if (v === "") { setMarked(null); setJumpMiss(null); } }}
      onFrom={setQFrom}
      onTo={setQTo}
      onSubmit={onSubmit}
      onClose={() => setSearchOpen(false)}
    />
  );

  const clearSearch = () => {
    setQSnapshot(""); setQTick(""); setQFrom(""); setQTo("");
    setMarked(null); setJumpMiss(null);
  };

  /** THE TABLE'S TOOLBAR — the researched home for a table search (2026-09-01). The controls stay
   *  per-COLUMN, which is where context is tightest ("users see results change directly under the
   *  input"), but the thing that OPENS them belongs in a toolbar ABOVE the table, and the two have
   *  to be adjacent. A trigger down in the pager strip opening inputs up under the header was the
   *  first attempt and the user rejected it on sight: nothing connected the two ends, and the
   *  reveal appeared nowhere near the thing that asked for it.
   *
   *  It also houses the two states that version had nowhere to put — what is APPLIED, and a way to
   *  CLEAR it. Every guide on table filtering names both; the first cut had neither, which is how
   *  a folded row could leave the table sitting on a search with nothing on screen explaining it.
   *
   *  ⚠️ Rendered by BOTH branches, like the row itself: a seek swaps the table into its loading
   *  state, and a toolbar that vanishes mid-seek takes the only way out with it. */
  const toolbar = (
    <div className="flex-none flex items-center justify-end gap-1.5 pb-1">
      {searchSet && (
        <>
          <span className="min-w-0 truncate text-micro text-muted-foreground">
            {[qSnapshot && `snapshot ${qSnapshot}`, qTick && `in global ${qTick}`, qFrom && `from ${qFrom}`, qTo && `to ${qTo}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex flex-none items-center gap-0.5 rounded-xs px-1 py-0.5 cursor-pointer text-micro uppercase tracking-caps text-muted-foreground hover:text-foreground hover:bg-wash-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
          >
            <X aria-hidden className="size-3" /> clear
          </button>
        </>
      )}
      <button
        type="button"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((o) => !o)}
        className={cn(
          "inline-flex flex-none items-center gap-1 rounded-xs px-1 py-0.5 cursor-pointer",
          "text-micro uppercase tracking-caps transition-colors hover:bg-wash-faint hover:text-foreground",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          searchOpen ? "bg-wash-faint text-foreground" : "text-muted-foreground",
        )}
      >
        <Search aria-hidden className="size-3" />
        search snapshots
        {/* The disclosure chevron this control was missing (user, 2026-09-01: "the 'search fields'
            needs a > as well no?") — the app's one expand affordance, on its own 150ms clock, so
            the button says at rest that there is something behind it. */}
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 transition-transform duration-150 motion-reduce:transition-none",
            searchOpen && "rotate-90",
          )}
        />
      </button>
    </div>
  );

  if (rows.length === 0)
    return (
      <>
        {toolbar}
        {search}
        <p className="m-auto text-label text-muted-foreground">
          {!live ? "NO SIGNAL" : histNet ? (histErr ? "history unavailable — the explorer read failed; paging again retries" : "reading the chain…") : "Waiting for anchored metagraph snapshots…"}
        </p>
      </>
    );

  const now = Date.now();

  return (
    <>
      {toolbar}
      {search}
      <ScrollArea className="flex-1 min-h-0">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md">
            <TableRow className="border-border">
              {COLUMNS.map((c, i) => (
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
              // ⚠️ A SEAM is a global tick that anchored NOTHING (buildAnchorLog). It is a real
              // measured row — the scene draws it standing at full height for exactly that reason —
              // but it has no metagraph and no metagraph snapshot, so it cannot carry the metagraph
              // selection, the hover channel keyed on one, or the ✓ that marks it.
              const seam = r.metaId == null;
              const rowSel = !seam && metaSnap?.metaId === r.metaId && metaSnap?.ordinal === r.ordinal;
              const tickMate = !rowSel && !r.pending && snap?.data.ordinal === r.global.ordinal;
              const pending = !!r.pending;
              const commit = () => {
                if (pending) return; // half a (snapshot, tick) pair must not commit
                if (seam || r.metaId == null) {
                  // Nothing anchored here, so the only subject is the TICK — commit it alone rather
                  // than inventing a metagraph snapshot the row does not have (rule 10).
                  applyClickActions(
                    metaSnapArrivalActions(
                      null,
                      { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global as GlobalSnapshot },
                    ),
                  );
                  return;
                }
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
                  // ⚠️ A SEAM has no metaId and no ordinal, so every seam would key `null:0` —
                  // React then treats a whole page of them as one repeated child and reuses the
                  // wrong DOM (caught by the Next.js MCP the first time a quiet network was
                  // opened). Its identity is its TICK, which is unique by construction.
                  key={r.metaId == null ? `tick:${r.global.ordinal}` : `${r.metaId}:${r.ordinal}`}
                  className={cn(
                    "text-body hover:bg-wash-faint",
                    pending ? "cursor-default" : "cursor-pointer",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    rowSel && "bg-[var(--sel-bg)] text-foreground",
                    tickMate && "bg-wash-faint",
                    // The jump's landing mark — an OUTLINE, never a wash: the two washes above are
                    // the selection language (committed row, its tick-mates), and a third fill
                    // would read as a third selection strength. An outline says "this is the one
                    // you asked for" without joining that vocabulary, and it loses to a real
                    // selection painting over it.
                    !rowSel && marked != null && (r.ordinal === marked || r.global.ordinal === marked) &&
                      "outline outline-1 outline-offset-[-1px] outline-[var(--primary)]",
                  )}
                  // A <tr> is not natively focusable — tabIndex + Enter/Space give the keyboard
                  // the same commit, and focus previews what hover previews (rule 9).
                  tabIndex={0}
                  title={pending ? "resolving the anchoring tick…" : undefined}
                  // The selection follows the subject's identity (selectionHue).
                  style={rowSel ? selectionHue(cfg?.hue ?? "var(--core)") : undefined}
                  // A seam has no metagraph snapshot to preview, so it writes no hover channel —
                  // the pairing rule is that a surface hovers the subject it would COMMIT.
                  onMouseEnter={() => setHoverMetaSnap(r.metaId ? metaSnapHoverKey(r.metaId, r.ordinal) : null)}
                  onMouseLeave={() => setHoverMetaSnap(null)}
                  onFocus={() => setHoverMetaSnap(r.metaId ? metaSnapHoverKey(r.metaId, r.ordinal) : null)}
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
                    {seam ? (
                      // ⚠️ FOUR EM-DASHES, NOT FOUR ZEROS. Network, snapshot, fee and size are all
                      // facts about a METAGRAPH SNAPSHOT, and this tick has none — so a `0.00000000`
                      // in the fee column would read as "a snapshot that paid nothing" when the
                      // truth is "no snapshot". The em-dash is the absence; the two columns that
                      // belong to the TICK itself (anchored into, age) carry their real measured
                      // values, because the tick is real and that is the whole point of the row.
                      // No identity dot either: a dot is an identity claim, and there is none here.
                      <span className="italic text-muted-foreground">no anchors</span>
                    ) : (
                    <span className="flex items-center gap-2">
                      <IdentityDot hue={cfg?.hue ?? "var(--core)"} />
                      {cfg && !cfg.virtual ? (
                        // The TICKER, not the full name (user, 2026-08-15): at tablet widths the
                        // name column alone pushed the log into horizontal scroll, and dot +
                        // ticker is the established compact identity — the pane head one column
                        // over says `DED 1,978,733` in exactly this register, so the log and the
                        // pane now name a row the same way. The full name remains one click away
                        // (the pane head's own subject line + the rail card).
                        <span title={cfg.name}>{cfg.ticker}</span>
                      ) : (
                        // An uncataloged channel: the core tone + its address, honestly unnamed.
                        <span className="italic text-muted-foreground">unlisted · {r.metaId?.slice(0, 10)}…</span>
                      )}
                    </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-foreground-dim">
                    {/* The ✓ slot is ALWAYS reserved so the column never shifts on select. */}
                    <span className="inline-flex items-center gap-1.5">
                      {seam ? <Dash /> : r.ordinal.toLocaleString()}
                      <span className="inline-flex w-3.5 flex-none">{rowSel && <SelectedRowMark hue={cfg?.hue ?? "var(--core)"} />}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{seam ? <Dash /> : fmtDag(r.fee)}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground-dim">{seam ? <Dash /> : fmtKB(r.sizeInKB)}</TableCell>
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
      {/* THE MISS IS STATED, never swallowed (rule 10). It sits by the pager rather than in a header
          cell because that is the strip already describing WHERE in the chain you are. */}
      {jumpMiss && (
        <p className="flex-none pt-1 text-micro text-muted-foreground">{jumpMiss}</p>
      )}
      <TablePager
        page={histNet ? page : Math.min(page, pages)}
        pages={pages}
        from={from}
        to={to}
        total={total}
        // The windowed lenses state their scope and the way further back (user, 2026-08-14):
        // no merged cross-network history feed exists, so "all"/unlisted page the window only.
        suffix={histNet ? undefined : "in window"}
        note={histNet ? undefined : "pick a network to explore all the way back to genesis"}
        onPage={setPageState}
      />
    </>
  );
}
