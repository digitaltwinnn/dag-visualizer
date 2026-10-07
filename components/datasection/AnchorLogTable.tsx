"use client";

import { netUrl } from "@/src/net/current";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Search, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useChainSpan } from "@/components/useArchive";
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
import { Empty, IdentityDot } from "@/components/inspector/parts";
import { selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TablePager from "@/components/datasection/TablePager";
import LogSearchBar from "@/components/datasection/LogSearchBar";
import { pageOfOrdinal, seekSpan, dayStartMs, dayEndMs, tsInRange } from "@/src/data/chainSeek";
import { POLL } from "@/src/engine/config";
import { recordStamp, utcDayKey, utcStamp } from "@/src/util/localTime";
import { dayWords } from "@/components/datasection/DateRange";

// The retained global window the log joins against — the same buffer the strip's bars plot,
// one row per anchored metagraph snapshot inside it.
const MAX = POLL.maxSnapshots;
const PAGE = 25;

/** An age's hover: the record's time in the reader's clock, then in UTC for matching an explorer
 *  (2026-10-07 — dates are local everywhere; UTC stays one hover away). */
const whenTitle = (ts: string): string | undefined => {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? `${recordStamp(ms)}\n${utcStamp(ms)}` : undefined;
};

// ONE COLUMN LIST, read by the header AND by the search row beneath it — a second literal is how the
// two silently fall out of alignment when a column is added.
/** How many seek-probed chain pages to retain (see loadPage). A walk spends at most ~10, so this
 *  holds several searches' worth without letting a long session grow unbounded. */
const PROBE_CACHE = 64;

/** ⚠️ TWO COLUMNS STAND DOWN ON PHONE. Six columns cannot fit a 500px viewport — measured, the
 *  table ran 494px inside a 403px pane and took the whole log into horizontal scroll, which on a
 *  log you SCAN is worse than showing less of each row. This table already answered the same
 *  question the same way once (2026-08-15: the full network NAME became the TICKER because "the
 *  name column alone pushed the log into horizontal scroll") — shrink what is shown, do not hand
 *  the reader a sideways scroll.
 *
 *  FEE and SIZE are the two that go, and the choice is not arbitrary: the other four are what
 *  IDENTIFIES a row — whose chain, which snapshot, where it anchored, when — while fee and size
 *  are measures ABOUT it, and both are stated in full on the snapshot card one tap away. They are
 *  also the two columns the search bar cannot answer for, having no index at any layer, so a phone
 *  loses nothing it could have acted on. `max-[700px]` is `breakpointOf`'s own phone boundary and
 *  the same arm every other phone gate names (CSS trap 8: it stops applying AT 700). */
const COLUMNS: { key: AnchorLogSortKey; label: string; phone?: false; phoneLabel?: string }[] = [
  { key: "net", label: "Network" },
  { key: "ordinal", label: "Snapshot" },
  { key: "fee", label: "Fee (DAG)", phone: false },
  { key: "size", label: "Size", phone: false },
  // `phoneLabel` — the same axis under its shorter name where the wide one alone kept the four
  // surviving columns in sideways scroll (2026-09-02: measured 366px of columns in a 309px pane,
  // and this header was the widest at 118px). "Global" is not an abbreviation but the axis's own
  // name — the search bar labels the very same criterion `global` — so nothing is invented for
  // the narrow tier; aria-sort and the full title stay on the th either way.
  { key: "tick", label: "Anchored into", phoneLabel: "Global" },
  { key: "age", label: "Age" },
];
/** The one class both the header cell and its body cells wear, so a column can never half-hide. */
const PHONE_HIDDEN = "max-[700px]:hidden";

/** A typed ordinal as the app prints one — digits only, with separators; whatever was typed if
 *  it holds no number. */
const fmtOrd = (q: string): string => {
  const n = Number(q.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toLocaleString() : q;
};

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
/** One chain's label in the toolbar: the current one says so, an earlier one says when it ran —
 *  its genesis date, read from the chain's own span (the same lookup the dossier uses). */
/** One segment of the chain toggle: a one-word name, the chain's start and address on hover. */
function ChainSegment({ address, idx, on, onPick }: { address: string; idx: number; on: boolean; onPick: () => void }) {
  const span = useChainSpan(address);
  const since = span?.genesisTs ? new Date(span.genesisTs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  const name = idx === 0 ? "Current" : idx === 1 ? "Earlier" : `Earlier ${idx}`;
  return (
    <button
      type="button"
      aria-pressed={on}
      title={`${idx === 0 ? "The current chain" : "An earlier chain"}${since ? `, from ${since}` : ""} · ${address}`}
      onClick={onPick}
      className={cn(
        "h-7 pointer-coarse:h-10 px-2.5 rounded-sm cursor-pointer text-label",
        on ? "bg-[var(--sel-bg)] text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {name}
    </button>
  );
}

export default function AnchorLogTable({ onOpen }: { /** PHONE: a row tap opens the snapshot's own page (RecordsSurface) — see the row's `commit`. */ onOpen?: () => void } = {}) {
  useSnapshotFeed(MAX); // re-render driver: global + anchor events (the buffers below refresh)
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const metaSnap = useStore((s) => s.metaSnap);
  // A row IS one metagraph snapshot, so its hover rides the snapshot channel, not the tick's
  // (user, 2026-08-09). Same channel the explorer's leaf rows and the scene's tiles use.
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const net = getNetwork();
  const snapshotExact = useStore((s) => s.snapshotExact);
  const lens = ledgerLens(filter);
  // The network the COMMITTED FILTER names, if any (the lens already maps DAG → "all").
  const lensNet = lens !== "all" && lens !== UNLISTED_ID && metagraphById(lens) ? lens : null;
  // The log's OWN scope under "all": the network picked in its search, or handed in by a door
  // (user, 2026-10-04: "in the moment card, go to raw snapshot sets the global filter — that should
  // not happen; only set the filter in the raw list / search section"). See `searchMeta` below.
  const [searchMeta, setSearchMeta] = useState<string | null>(null);
  // A DOOR'S NETWORK WINS, EVEN OVER THE FILTER (user, 2026-10-04 — option a of the branch review):
  // a door names the records it is for, and since it may not set the filter, the log must honour it
  // itself — otherwise a BioFi door under a DOR filter landed on DOR's chain with BioFi's dates.
  // Spent when the reader clears the search, or when the filter changes under it.
  const [doorMeta, setDoorMeta] = useState<string | null>(null);
  const [doorFilter, setDoorFilter] = useState(filter);
  if (doorFilter !== filter) {
    setDoorFilter(filter);
    if (doorMeta) setDoorMeta(null);
  }
  // HISTORY mode: the chain this table pages — a door's network, else the committed filter's (under
  // a commit the table IS that network's chain), else the log's own pick.
  const histNet =
    (doorMeta && metagraphById(doorMeta) ? doorMeta : null) ?? lensNet ?? (searchMeta && metagraphById(searchMeta) ? searchMeta : null);
  // ⚠️ A NETWORK CAN HAVE MORE THAN ONE CHAIN (user, 2026-10-02: "try also searching the first
  // BioFi retired chain, it should be able to handle that by design"). A re-registered metagraph
  // keeps its earlier addresses in the catalog (`formerIds`, `src/net/lineage.ts`), and each is a
  // chain of its own with its own ordinals — so the pager cannot splice them into one run of
  // page numbers. `histNet` stays the NETWORK; `histAddr` is the chain being paged: the current
  // one by default, an earlier one when the reader picks it in the toolbar or a search lands in
  // it. Newest chain first. Everything below that fetches, caches or does ordinal arithmetic
  // keys on `histAddr`.
  const lineage = useMemo(
    () => (histNet ? [histNet, ...[...(metagraphById(histNet)?.formerIds ?? [])].reverse()] : []),
    [histNet],
  );
  const [chainSel, setChainSel] = useState<{ net: string | null; idx: number }>({ net: null, idx: 0 });
  const chainIdx = chainSel.net === histNet ? Math.min(chainSel.idx, Math.max(0, lineage.length - 1)) : 0;
  const histAddr = histNet ? (lineage[chainIdx] ?? histNet) : null;
  const setChain = (idx: number) => setChainSel({ net: histNet, idx });

  const [sort, setSort] = useState<{ key: AnchorLogSortKey; dir: 1 | -1 }>({ key: "age", dir: 1 });
  // GROUPED BY GLOBAL SNAPSHOT whenever the rows are in time order (see the table below). Grouped,
  // the group's header row states the global snapshot and its age, so the two columns that said
  // it on every row are DROPPED — header and all (user, 2026-10-07: "make the global row have label
  // + value so the entire column can be dropped", then "just the child column, with the header
  // across it"). Grouped is newest first; sorted by anything else the two columns come back, and
  // their Age header is the way back to the groups.
  const grouped = sort.key === "age" || sort.key === "tick";
  const columns = grouped ? COLUMNS.filter((c) => c.key !== "tick" && c.key !== "age") : COLUMNS;
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
  // ⚠️ UNDER A COMMIT THE PICKER IS A READOUT, NOT A CHOICE. This table IS the committed network's
  // chain — it pages that chain server-side — so an ordinal typed here can only ever count on it,
  // and offering a different network would promise a search this surface cannot run. `histNet`
  // therefore WINS over the local pick; under "all" there is no chain and the pick is the scope.
  // Changing which network is searched is the top bar's job, which is the same boundary the pager
  // and the explorer already keep.
  const metaList = useStore((st) => st.metaList);
  const searchNet = histNet || searchMeta;
  const [qSnapshot, setQSnapshot] = useState("");
  const [qTick, setQTick] = useState("");
  const [qFrom, setQFrom] = useState("");
  const [qTo, setQTo] = useState("");
  /** The DOOR'S OWN WORDS for the dates it filled (2026-10-07): a History card's span as the card
   *  said it ("Sep 22, 2:00 PM GMT+2", "Sep 8 – Oct 8"). The fields can only hold whole days, so an
   *  hour's Moment would otherwise read as its whole day — the chip repeats the card until the
   *  reader edits the dates themselves. */
  const [doorLabel, setDoorLabel] = useState<string | null>(null);
  /** THE RANGE THE LOG KEEPS TO (user, 2026-10-07 — "card → raw page incl. filters"). A date search
   *  is a FILTER now, not only a jump: on a chain the pager stays between the span's first and last
   *  ordinals (`seekSpan`) and says how many it holds; under All the recent rows are cut to it.
   *  `addr` is the chain the ordinals count on — another chain's ordinals mean nothing here. A
   *  snapshot or global search, a clear, or another chain drops it. */
  const [bound, setBound] = useState<{ addr: string | null; fromMs: number; toMs: number | null; first: number | null; last: number | null } | null>(null);
  const [seeking, setSeeking] = useState(false);
  // ⚠️ AN ARRIVAL SHOWS ITS SEARCH, NOT THE LIVE PAGE (user, 2026-09-29: coming to the raw page
  // from History with a network in scope "looks like it's loading something twice"). The door hands
  // over a date; the log must read page 1 first (it is how the walk learns the chain's newest
  // ordinal), and it used to SHOW that page — the live tip, seconds old — for the several seconds
  // the walk took, then jump to the answer a year back. Page 1 still loads underneath; while the
  // arrival's search is pending the table states that search instead, and the flag drops when the
  // walk ends either way (landed, or its miss is printed in the bar).
  const [arriving, setArriving] = useState(false);
  // Any answer printed in the bar ends an arrival's hold too — every early exit of the walk says
  // why through `jumpMiss`, so the table can never be left holding a search that already answered.
  useEffect(() => {
    if (jumpMiss) setArriving(false);
  }, [jumpMiss]);
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
  // A failed chain read is an answer as well: the hold must not hide the message (and the pager)
  // that says the read failed and how to retry it (rule 10 — a hold with no give-up path).
  useEffect(() => {
    if (histErr) setArriving(false);
  }, [histErr]);

  // The network's newest ordinal — the lifetime total (ordinals are sequential and gapless).
  // The live buffer leads; the explorer's first page seeds it for a quiet network whose window
  // is empty.
  const bufferedNewest = (() => {
    if (!histAddr || !net) return 0;
    let max = 0;
    for (const r of net.metaSnaps.get(histAddr) ?? []) if (r.ordinal > max) max = r.ordinal;
    return max;
  })();
  const histFirst = hist.current.net === histAddr ? (hist.current.pages.get(1)?.[0]?.ordinal ?? 0) : 0;
  // The FROZEN latest — page arithmetic must not shift under the reader mid-walk, so it only
  // advances while the reader is ON the live page (or when the walk resets).
  if (hist.current.net === histAddr && (page === 1 || hist.current.latest === 0)) {
    hist.current.latest = Math.max(hist.current.latest, bufferedNewest, histFirst);
  }
  const latest = hist.current.latest || Math.max(bufferedNewest, histFirst);

  // Reset the walk when the network changes; refresh page 1 when a new anchor lands (the live
  // tip is the only mutable page — ordinal-addressed pages are immutable).
  useEffect(() => {
    if (!histAddr) return;
    if (hist.current.net !== histAddr) {
      hist.current = { net: histAddr, pages: new Map(), latest: 0 };
      probes.current.clear();
      setPageState(1);
      setVersion((v) => v + 1);
    }
  }, [histAddr]);
  // ⚠️ STALE-WHILE-REVALIDATE (user, 2026-09-29: opening the raw log under a filter "looks like
  // it's loading something twice"). A new anchor used to DELETE page 1 before refetching it, so
  // for the length of the request the table had no rows, fell into its "reading the chain…"
  // branch and painted again — on every anchor, most visibly right after the layer opened on a
  // page cached while it was away. Page 1 now stays on screen and is REPLACED when the fresh
  // read lands. A generation counter, not a flag: an anchor arriving mid-refresh must leave the
  // page stale, or the older refresh would mark it current and the newest anchor would be missed.
  const liveGen = useRef(0);
  const liveHave = useRef(0);
  useEffect(() => {
    if (!histAddr || page !== 1) return;
    liveGen.current += 1;
    setVersion((v) => v + 1);
    // bufferedNewest is the real dependency: a new anchor means a stale live page. `page` is the
    // other one (2026-10-02): anchors that land while the reader is on a deeper page return early
    // above, so COMING BACK to page 1 has to mark it stale itself — it used to show the copy
    // cached before the walk (minutes old after a search) until the next anchor happened by.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bufferedNewest, histAddr, page]);

  // Fetch the current page if missing (or, for page 1, stale). Page 1 is the live tip; every
  // deeper page is the ordinal-addressed immutable read, so ANY page — a « jump to genesis
  // included — is one request, no cursor chain. One request per page at a time: the effect
  // re-runs on every `version` bump (each resolved ANCHORED INTO cell is one), and cancelling
  // the read on each of those would starve it.
  const pageFetch = useRef(new Set<string>());
  useEffect(() => {
    if (!histAddr || hist.current.net !== histAddr) return;
    const stale = page === 1 && liveHave.current !== liveGen.current;
    if (hist.current.pages.has(page) && !stale) return;
    const frozen = hist.current.latest;
    if (page !== 1 && frozen === 0) return; // no arithmetic base yet — page 1 seeds it
    const before = frozen - (page - 1) * PAGE;
    if (page !== 1 && before < 1) return;
    const key = `${histAddr}:${page}`;
    if (pageFetch.current.has(key)) return;
    pageFetch.current.add(key);
    const gen = liveGen.current;
    fetch(netUrl(`/api/network/${histAddr}/snapshots${page === 1 ? "" : `?before=${before}`}`))
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: HistRow[] }>) : Promise.reject()))
      .then((d) => {
        if (hist.current.net !== histAddr) return; // the walk moved to another chain meanwhile
        hist.current.pages.set(page, d.rows);
        if (page === 1) liveHave.current = gen;
        setHistErr(false);
        setVersion((v) => v + 1);
      })
      .catch(() => {
        if (hist.current.net === histAddr) setHistErr(true);
      })
      .finally(() => pageFetch.current.delete(key));
  }, [histAddr, page, version]);

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
  /** The window's rows before a range cuts them — what a date search looks through. */
  let allRowsUnbounded: AnchorLogRow[] = [];
  let rows: ViewRow[] = [];
  /** A chain range's page window: the chain pages its first and last ordinals sit on. */
  let rangePages: { lo: number; hi: number } | null = null;
  let pages = 1;
  let from = 0;
  let to = 0;
  let total = 0;

  // Whether a range is CUTTING what this render shows (set in the branch that applies it).
  let rangeActive = false;
  if (!histNet) {
    const listedRows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];
    const unlistedRows = net && (lens === "all" || lens === UNLISTED_ID) ? unlistedLog(net.globalSnapshots, snapshotExact) : [];
    allRowsUnbounded = sortAnchorLog([...listedRows, ...unlistedRows], sort.key, sort.dir, (metaId) => displayNetwork(metaId)?.ticker ?? metaId);
    // A RANGE CUTS THE RECENT ROWS to its span (`bound`, addressed to no chain here).
    // ⚠️ "IN RANGE" ONLY WHEN THE RECENT ROWS HOLD THE WHOLE RANGE (rule 10). Cut from the recent
    // rows, a month's range showed "1–25 of 174 in range" — a count of what this view keeps, not of
    // the range (1.29M). Where the range reaches past the oldest recent row, the count keeps the
    // "recent" word, whose explanation is the route to the whole chain.
    const oldestMs = allRowsUnbounded.reduce((m, r) => Math.min(m, Date.parse(r.ts) || Infinity), Infinity);
    rangeActive = !!bound && bound.addr == null && bound.fromMs >= oldestMs;
    const cut = !!bound && bound.addr == null;
    allRows = cut ? allRowsUnbounded.filter((r) => tsInRange(r.ts, bound!.fromMs, bound!.toMs)) : allRowsUnbounded;
    total = allRows.length;
    pages = Math.max(1, Math.ceil(total / PAGE));
    // A LANDED SEARCH HOLDS ITS ROW, NOT ITS PAGE NUMBER (user, 2026-09-09: "a search filter
    // gets overwritten when a new live snapshot arrives") — the window's rows shift on every
    // tick, so while a mark stands the shown page is re-derived from the marked row each
    // render; paging away by hand releases the follow (the pager clears the mark). Inlined
    // markOf (defined below) — the row's identity is its own ordinal, a seam its tick's.
    const markIdx = marked != null ? allRows.findIndex((r) => (r.metaId == null ? r.global.ordinal : r.ordinal) === marked) : -1;
    const p = markIdx >= 0 ? Math.floor(markIdx / PAGE) + 1 : Math.min(page, pages);
    rows = allRows.slice((p - 1) * PAGE, p * PAGE);
    from = total === 0 ? 0 : (p - 1) * PAGE + 1;
    to = Math.min(p * PAGE, total);
  } else {
    // A RANGE ON THIS CHAIN keeps the pager between its ends: only the pages its first and last
    // ordinals sit on, and only the rows between them (the boundary pages hold neighbours too).
    const span = bound && bound.addr === histAddr && bound.first != null && bound.last != null && latest ? bound : null;
    if (span) rangePages = { lo: pageOfOrdinal(span.last!, latest, PAGE), hi: pageOfOrdinal(span.first!, latest, PAGE) };
    rangeActive = !!span;
    const rawPage = hist.current.net === histAddr ? (hist.current.pages.get(page) ?? []) : [];
    const raw = span ? rawPage.filter((r) => r.ordinal >= span.first! && r.ordinal <= span.last!) : rawPage;
    const mapped: ViewRow[] = raw.map((r) => {
      const g = resolved.current.get(r.ts);
      return {
        // The row's own CHAIN address — a retired chain's snapshot is read at that address.
        metaId: histAddr,
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
    total = span ? span.last! - span.first! + 1 : latest;
    pages = rangePages ? rangePages.hi - rangePages.lo + 1 : Math.max(1, Math.ceil(Math.max(total, 1) / PAGE));
    const ords = raw.map((r) => r.ordinal);
    // Page 1 IS positions 1..N by definition — deriving them by subtraction mixes two sources
    // (the buffer's `latest` can lead the explorer's live page by a tick, which read "13–37").
    // Deeper pages subtract against the SAME frozen latest their ?before was computed from.
    // Inside a range the positions count from its newest snapshot.
    const top = span ? span.last! : latest;
    from = !ords.length ? 0 : !span && page === 1 ? 1 : top - Math.max(...ords) + 1;
    to = !ords.length ? 0 : !span && page === 1 ? ords.length : top - Math.min(...ords) + 1;
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
    // ⚠️ THE NEWEST ROW WITH A SNAPSHOT, not the newest row (found 2026-09-29: the pane opened
    // on "Select a metagraph snapshot…"). The buffer's newest global tick is usually a SEAM while
    // it settles — its metagraph snapshots are stamped over the seconds AFTER it appears (the tick
    // lifecycle, src/data/CLAUDE.md) — and a seam commits the tick alone, which leaves the channel
    // pane on its empty state. The newest row that carries a snapshot is a real row, a few seconds
    // older, and it is what "opens on a subject" means.
    return listed.find((r) => r.metaId != null) ?? listed[0] ?? null;
  })();
  useEffect(() => {
    if (section !== "data" || !armed.current) return;
    // AN ARRIVAL THAT ALREADY HAS A SUBJECT SPENDS THE ARM (2026-10-07): left armed, the first
    // deliberate CLEAR afterwards — a global snapshot's header row, which selects the global
    // alone — read as "opened on nothing" and the log picked a row the reader never asked for.
    if (metaSnap) {
      armed.current = false;
      return;
    }
    if (!windowFirst) return;
    // AN ARRIVAL THROUGH A DOOR OPENS ON WHAT IT ASKED FOR (2026-10-03). History's "Snapshot
    // records" door hands a moment to search for; this effect used to commit the newest row
    // anyway, so the list landed nine months back while the pane beside it showed a snapshot
    // from seconds ago. The commit waits for the search and takes the row it lands on (below).
    // Read from the STORE: this effect is declared before the one that consumes `logSeek`, so in
    // the arriving commit no local flag has been raised yet.
    if (useStore.getState().logSeek?.metaId) return;
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
  const netAddr = histAddr;

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
    setBound(null); // an exact address, not a span — the range no longer applies
    const n = Number(qSnapshot.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setJumpMiss(null);
    if (!histNet) {
      // ⚠️ SCOPED TO THE CHOSEN CHAIN. Ordinals are per-chain, so an unscoped scan of the window
      // matches whichever network happened to reach that number first — the exact ambiguity the
      // picker exists to remove, and the reason the field refuses to run without one.
      if (!searchNet) { setJumpMiss("pick which metagraph's chain this number counts on"); return; }
      const idx = allRows.findIndex((r) => r.metaId === searchNet && r.ordinal === n);
      if (idx < 0) {
        setMarked(null);
        const who = displayNetwork(searchNet)?.ticker ?? "that network";
        setJumpMiss(`${who} ${n.toLocaleString()} is not in the retained window — commit it in the top bar to page all time`);
        return;
      }
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
    setBound(null);
    const n = Number(qTick.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setJumpMiss(null);
    if (!histNet) {
      const idx = allRows.findIndex((r) => r.global.ordinal === n);
      if (idx < 0) {
        setMarked(null);
        // Two different misses, said differently (the search pass, 2026-10-02): an ordinal ABOVE the
        // newest one does not exist yet, and telling the reader to "page all time" for it sends
        // them looking for something that is not there. An older one is real but outside the
        // window this unfiltered log holds — and the route that reaches it is the same one the
        // network-ordinal miss names, in the same words.
        const newest = allRows.reduce((m, r) => Math.max(m, r.global.ordinal), 0);
        setJumpMiss(
          newest > 0 && n > newest
            ? `global snapshot ${n.toLocaleString()} does not exist yet — the newest is ${newest.toLocaleString()}`
            : `global snapshot ${n.toLocaleString()} is not in the retained window — commit a network in the top bar to page all time`,
        );
        return;
      }
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
      // Any of the network's chains: an old global snapshot holds the address in use at the time.
      const mine = (d.rows ?? []).filter((r) => lineage.includes(r.metaId));
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
      // The hit may live in ANOTHER of the network's chains — switch to it and land once its walk
      // is up (the ordinal means nothing against this chain's numbering).
      const hitChain = lineage.indexOf(mine[0].metaId);
      if (hitChain >= 0 && hitChain !== chainIdx) {
        pendingLand.current = Math.min(...ordinals);
        setChain(hitChain);
        return;
      }
      landOn(Math.min(...ordinals));
    } catch {
      setJumpMiss("the chain read failed — try again");
    } finally {
      setSeeking(false);
    }
  };

  /** The one answer for "this view cannot reach that date". Said in terms of what to DO, never in
   *  terms of the retained window (user, 2026-09-14: "perhaps has to do with the active window, but
   *  to a user that does not matter and makes no sense"). The window is this table's own
   *  implementation, and a reader who asked for a date in August is owed the route to August, not a
   *  description of the buffer that failed to hold it. */
  const PICK_A_CHAIN = "pick a network in the top-bar filter to search its history by date";

  /** AGE — a FILTER since 2026-10-07: the log keeps to [from, to) (`bound`). A closed span lands on
   *  its newest snapshot, an open one (a from-date alone) on the date it asked for. A door's span is
   *  exact (`exactFrom` / `exactTo`); a typed one is whole UTC days. */
  const seekAge = async () => {
    // An ARRIVAL carries its exact instant (the Moment card's door); a typed search is a day.
    const fromMs = exactFrom.current ?? dayStartMs(qFrom);
    const toMs = exactTo.current ?? (qTo ? dayEndMs(qTo) : null);
    exactFrom.current = null;
    exactTo.current = null;
    setJumpMiss(null);
    if (fromMs == null) { setJumpMiss("pick a from-date"); return; }
    if (!histNet) {
      // The recent rows are CUT to the range (the render applies `bound`), so the first in-range
      // row is page 1's first row.
      const idx = allRowsUnbounded.findIndex((r) => tsInRange(r.ts, fromMs, toMs));
      if (idx >= 0) {
        setBound({ addr: null, fromMs, toMs, first: null, last: null });
        setPageState(1);
        setMarked(markOf(allRowsUnbounded[idx]));
        return;
      }
      setBound(null);
      setMarked(null);
      // ⚠️ TWO MISSES, NOT ONE — they are different facts and only one of them is the reader's to
      // fix. If the range reaches back past the oldest row here, the date is simply out of this
      // view's reach and the answer is the route that does reach it. If it lies INSIDE what is
      // loaded and still matched nothing, the search genuinely found no snapshots, which is an
      // answer rather than a failure. The old single line ("nothing in that range inside the
      // window") conflated them and explained itself with the mechanism.
      const oldest = allRowsUnbounded.reduce<number | null>((acc, r) => {
        const ms = Date.parse(r.ts);
        return Number.isFinite(ms) && (acc == null || ms < acc) ? ms : acc;
      }, null);
      setJumpMiss(oldest != null && fromMs >= oldest ? "no snapshots in that range" : PICK_A_CHAIN);
      return;
    }
    // WHICH CHAIN HOLDS THAT DATE. With more than one, the date picks it: the newest chain that
    // had begun by then (a date before the first chain's genesis takes the first chain, which then
    // lands on its opening snapshot). A switch re-arms this same seek for when the walk is up.
    if (lineage.length > 1) {
      const idx = await chainForDate(fromMs);
      if (idx != null && idx !== chainIdx) {
        exactFrom.current = fromMs;
        exactTo.current = toMs;
        pendingSeek.current = true;
        setChain(idx);
        return;
      }
    }
    if (!latest) { setJumpMiss("still reading the chain"); return; }
    setSeeking(true);
    try {
      const span = await seekSpan(fromMs, toMs ?? Number.MAX_SAFE_INTEGER, latest, loadPage);
      if (span && span.count === 0) { setBound(null); setJumpMiss("no snapshots in that range"); return; }
      // A CLOSED range lands on its NEWEST snapshot — page 1 of the range, as the log reads newest
      // first; an open one (a from-date alone) lands on the date it asked for, as it always did.
      const hit = span == null ? null : toMs != null ? span.last : span.first;
      if (span) setBound({ addr: netAddr, fromMs, toMs, first: span.first, last: span.last });
      // ⚠️ A MISS HERE IS NOW GENUINELY EXCEPTIONAL, and the copy says what to do about it rather
      // than pronouncing on the chain. The walk's budget covers bisection's own worst case for the
      // chain it was given (see chainSeek's probeBudget), so running out means a pathological run,
      // not a chain that lacks the date — and the probe cache survives the press, so a second one
      // resumes from a narrower bracket instead of starting over.
      if (hit == null) { setJumpMiss("could not reach that date — press search again"); return; }
      landOn(hit);
    } catch {
      setJumpMiss("the chain read failed — try again");
    } finally {
      setSeeking(false);
      // A landed arrival keeps its hold until the answer's ROWS are here (the effect beside the
      // render below); a miss releases it through `jumpMiss`.
    }
  };

  // THE LADDER'S INBOUND RUNG (convention 12): a /trends chart range arrives on the one-shot
  // store bridge — open the search bar, prefill the date criteria, and when the handoff named
  // a network (whose filter commit already happened on the trends side, through the table),
  // run the date seek as soon as the chain's tip is known. Consumed on sight so a later
  // manual search starts clean; the unscoped case stays prefilled-only (a date seek pages a
  // committed chain — under "all" the fields wait for the reader, and the bar says why).
  const logSeek = useStore((st) => st.logSeek);
  const setLogSeek = useStore((st) => st.setLogSeek);
  const pendingSeek = useRef(false);
  /** An ordinal to land on once ANOTHER of the network's chains has loaded (see `seekTick`). */
  const pendingLand = useRef<number | null>(null);
  /** Each chain's genesis instant, read once per address (`/api/network/<addr>/chain`). */
  const genesisOf = useRef(new Map<string, number | null>());
  const chainForDate = async (ms: number): Promise<number | null> => {
    for (let i = 0; i < lineage.length; i++) {
      const addr = lineage[i];
      if (!genesisOf.current.has(addr)) {
        try {
          const r = await fetch(netUrl(`/api/network/${addr}/chain?v=3`));
          const j = r.ok ? ((await r.json()) as { genesisTs?: string | null }) : null;
          const t = j?.genesisTs ? Date.parse(j.genesisTs) : NaN;
          genesisOf.current.set(addr, Number.isFinite(t) ? t : null);
        } catch {
          return null; // unknown — stay on the chain in hand rather than guess
        }
      }
      const g = genesisOf.current.get(addr);
      if (g != null && g <= ms) return i;
    }
    return lineage.length - 1;
  };
  /** The arriving span's exact start (ms). The fields show a DAY — that is what a reader can type —
   *  but a door from one instant should land AT it, not at that day's midnight (measured: the
   *  Moment card's 02:45 landed 4,700 DOR snapshots early). Consumed by the one seek it arms. */
  const exactFrom = useRef<number | null>(null);
  /** …and the arrival's exact END, so the log keeps to exactly the card's span. */
  const exactTo = useRef<number | null>(null);
  /** An arrival's search has landed and its row has yet to be committed (see the hold's effect):
   *  the ORDINAL it landed on, else null.
   *  ⚠️ BOUND TO ITS LANDING, AND DROPPED BY ANY GESTURE OF THE READER'S (whole-branch review,
   *  2026-10-03). As a bare flag it stood until consumed — and a landed row whose anchoring
   *  global never resolved (or was still resolving) left it standing, so the reader's NEXT
   *  search, a plain look-up, committed its landing as a selection: pane, rail and scene all
   *  moved on a mark that by this file's own rule "carries no store write". It names the row it
   *  is for, and a manual search, a clear or a page turn withdraws it. */
  const landCommit = useRef<number | null>(null);
  /** A snapshot search a door armed, run once the chain it counts on is the one in hand. */
  const pendingSnap = useRef(false);
  useEffect(() => {
    if (!logSeek) return;
    // ONE SNAPSHOT (a metagraph-snapshot card's door, 2026-10-04): the exact address — the most
    // specific search there is — so the dates stay empty and the snapshot field takes the number.
    // It pages ITS network's chain, whatever the filter or an earlier scope (`doorMeta`).
    if (logSeek.snapshot != null && logSeek.metaId) {
      setDoorMeta(logSeek.metaId);
      setSearchOpen(true);
      setQFrom("");
      setDoorLabel(null);
      setQTo("");
      setQTick("");
      setSearchMeta(logSeek.metaId);
      setQSnapshot(String(logSeek.snapshot));
      setMarked(null);
      setJumpMiss(null);
      landCommit.current = null;
      pendingSnap.current = true;
      setLogSeek(null);
      return;
    }
    if (logSeek.snapshot != null) {
      setLogSeek(null);
      return;
    }
    setSearchOpen(true);
    // The fields hold UTC DAYS (a day-only label is a UTC day for every reader); the span's end is
    // exclusive, so its last day is the one holding the instant just before it.
    setQFrom(utcDayKey(logSeek.fromMs));
    setQTo(utcDayKey(logSeek.toMs - 1));
    setDoorLabel(logSeek.label ?? null);
    if (logSeek.metaId) {
      setDoorMeta(logSeek.metaId);
      setSearchMeta(logSeek.metaId);
      pendingSeek.current = true;
      exactFrom.current = logSeek.fromMs;
      exactTo.current = logSeek.toMs;
      setArriving(true);
      // A PREVIOUS search's landing would satisfy the hold's release at once (a marked row, page 1
      // cached) and flash the live page before this seek runs — the double-load the hold exists
      // to prevent.
      setMarked(null);
      setJumpMiss(null);
    } else {
      // AN UNSCOPED ARRIVAL SEARCHES THE RECENT ROWS (2026-10-07): a span names no chain, but the
      // recent rows of every network can still be cut to it. A span older than they reach answers
      // with the route to a chain (`PICK_A_CHAIN`, from the seek itself) — never a door that did
      // nothing (user, 2026-09-14).
      pendingSeek.current = true;
      exactFrom.current = logSeek.fromMs;
      exactTo.current = logSeek.toMs;
      setMarked(null);
      setJumpMiss(null);
    }
    setLogSeek(null);
  }, [logSeek, setLogSeek]);
  useEffect(() => {
    // `hist.current.net === lens` is the LOAD-BEARING guard (found live, 2026-09-09: the
    // handoff committed BioFi while the walk cache still held DOR's, and line 184's fallback
    // handed DOR's 28M tip to BioFi's pager — the tip probe came back empty and the seek
    // honestly reported "could not locate"). The seek may only run once the walk IS the
    // target chain's.
    // ⚠️ `latest` is a RENDER-time value, and the walk's reset runs in an effect of the same commit
    // — so on the first pass after a chain switch the guard below sees the NEW chain's name beside
    // the OLD chain's `latest` (found live: a date search that switched chains paged the earlier
    // chain with the current one's total, and the other way round asked for an ordinal past the
    // tip). `walkReady` requires the walk's own frozen base to be set and to be the one in hand.
    const walkReady = !!histAddr && hist.current.net === histAddr && hist.current.latest > 0 && latest === hist.current.latest;
    if (pendingLand.current != null && walkReady) {
      const o = pendingLand.current;
      pendingLand.current = null;
      landOn(o);
    }
    if (pendingSeek.current && (histNet ? walkReady : !!net) && qFrom && !seeking) {
      pendingSeek.current = false;
      void seekAge();
    }
    // A door's snapshot search runs as soon as it can answer: at once against the live window,
    // or once the committed chain's walk is in hand.
    if (pendingSnap.current && qSnapshot && (!histNet || walkReady)) {
      pendingSnap.current = false;
      seekSnapshot();
    }
  });

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
  // A typed ordinal with NO chain picked still routes to seekSnapshot, whose "pick which
  // metagraph's chain…" answer is the whole teaching (user, 2026-09-09 — the old guard let the
  // press fall through silently, and the button before it sat disabled with no reason).
  const onSubmit = () => {
    landCommit.current = null; // the reader's own search: an arrival still waiting to commit is withdrawn
    if (qSnapshot) seekSnapshot();
    else if (qTick) void seekTick();
    else if (qFrom) void seekAge();
  };

  /** Any criterion typed — the toggle says so while the row is folded away, or a search would be
   *  silently in force with nothing on screen to explain the rows you are looking at. */
  const searchSet = !!(qSnapshot || qTick || qFrom || qTo);

  // A SEARCH THAT LANDS FOLDS THE BAR (design round, 2026-09-29): the landing mark on the row and
  // the toolbar's applied chip say what is in force, so the fields step aside and the log gets its
  // height back — on the phone that is the sheet closing onto the answer. A miss keeps the bar
  // open, since its answer is printed inside it.
  useEffect(() => {
    if (marked != null) setSearchOpen(false);
  }, [marked]);

  // Built ONCE and rendered by BOTH branches below — a seek swaps the table into its loading state
  // while a page is fetched, and unmounting the controls mid-seek loses what was typed.
  const search = !searchOpen ? null : (
    <LogSearchBar
      networks={searchNets}
      metaId={searchNet}
      // THE LOG'S OWN SCOPE IS A LENS TOO (user, 2026-10-07): picking another network here clears
      // what was picked under the old one, as a filter change does (the executor's filter step).
      setMetaId={(id) => {
        const st = useStore.getState();
        if (id !== searchMeta && (st.metaSnap != null || st.tickNet != null)) {
          applyClickActions([
            { kind: "metaSnap", sel: null },
            { kind: "tickNet", sel: null },
          ]);
        }
        setSearchMeta(id);
      }}
      // Locked only by the FILTER: under "all" the pick is the log's own scope, and changing it
      // pages the other network's chain.
      metaLocked={!!lensNet || !!doorMeta}
      seeking={seeking}
      snapshot={qSnapshot}
      tick={qTick}
      from={qFrom}
      to={qTo}
      miss={jumpMiss}
      onSnapshot={(v) => { setQSnapshot(v); if (v === "") { setMarked(null); setJumpMiss(null); } }}
      onTick={(v) => { setQTick(v); if (v === "") { setMarked(null); setJumpMiss(null); } }}
      onFrom={(v) => { setDoorLabel(null); setQFrom(v); }}
      onTo={(v) => { setDoorLabel(null); setQTo(v); }}
      onSubmit={onSubmit}
      onClose={() => setSearchOpen(false)}
    />
  );

  const clearSearch = () => {
    setQSnapshot(""); setQTick(""); setQFrom(""); setQTo(""); setDoorLabel(null); setBound(null);
    // Clearing the search drops a door's scope, and under "all" the log's own pick too.
    setDoorMeta(null);
    if (!lensNet) setSearchMeta(null);
    setMarked(null); setJumpMiss(null);
    // Clearing the arrival's search cancels it: nothing is being found any more.
    pendingSeek.current = false;
    landCommit.current = null;
    setArriving(false);
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
    // `pb-2` — the same 8px the box below it keeps to the table, so the search block sits in an
    // even rhythm instead of being pinched against its own trigger (user, 2026-09-01).
    // ⚠️ Phone clears the layer's × (user, 2026-09-02: "the close button overlaps with the
    // 'search snapshots' button"): this row right-aligns into the pane's top-right corner, which
    // is exactly where SectionShell's absolute close sits — and the phone pane's slimmer padding
    // (pr-4, was the pr-10 tablet gutter) plus the ×'s 44px touch box put the two on top of each
    // other. The reserve is the ×'s own touch width.
    // ⚠️ LEGIBLE CONTROLS (design round, 2026-09-29, desktop A + phone A): the toggle was a 16px
    // line of micro caps and the applied search a whisper beside a caps "clear". Both are 32px
    // controls now (44px on touch and phone) on the bar's own type: the toggle a real button that
    // shows pressed while open, the applied search one chip per criterion, each with its own ×.
    <div className="flex-none flex items-center justify-end gap-2 pb-2 max-[700px]:pr-10">
      {/* THE NETWORK'S CHAINS — only where there is more than one (see `lineage`). ONE SEGMENTED
          TOGGLE of one-word names (user, 2026-10-04: "two buttons with lots of text, even on
          mobile … can't we just have a simple toggle?"): Current | Earlier, the pressed segment the
          chain this table pages; each chain's start date and address are its segment's title. */}
      {lineage.length > 1 && (
        <span className="mr-auto inline-flex items-center gap-0.5 p-0.5 rounded-btn border border-border" role="group" aria-label="Which of this network's chains to page">
          {lineage.map((addr, i) => (
            <ChainSegment key={addr} address={addr} idx={i} on={i === chainIdx} onPick={() => { setMarked(null); setJumpMiss(null); setChain(i); }} />
          ))}
        </span>
      )}
      {searchSet && (
        // EACH APPLIED CRITERION IS ITS OWN CHIP with its own × (user, 2026-10-07): one chip per
        // condition, and the metagraph snapshot names its chain beside the ordinal ("DED 2,617,537"),
        // as the search bar's composite field does — an ordinal is per chain, bare it names nothing.
        // The date range is ONE condition, so one chip. Clearing the last chip clears the search.
        <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-2 max-[700px]:flex-1">
          {[
            qSnapshot && {
              key: "snapshot",
              text: `${searchNet ? (displayNetwork(searchNet)?.ticker ?? searchNet) + " " : ""}${fmtOrd(qSnapshot)}`,
              clear: () => { setQSnapshot(""); setMarked(null); setJumpMiss(null); },
            },
            qTick && {
              key: "tick",
              text: `in global ${fmtOrd(qTick)}`,
              clear: () => { setQTick(""); setMarked(null); setJumpMiss(null); },
            },
            (qFrom || qTo) && {
              key: "age",
              // In the date picker's own words ("Mar 13 – Mar 20"), never the field's YYYY-MM-DD.
              // The chain it searches leads, as on the snapshot chip ("DED Sep 8 – Oct 7").
              text: `${searchNet ? (displayNetwork(searchNet)?.ticker ?? searchNet) + " " : ""}${doorLabel ?? (qFrom && qTo ? (qFrom === qTo ? dayWords(qFrom) : `${dayWords(qFrom)} – ${dayWords(qTo)}`) : qFrom ? `from ${dayWords(qFrom)}` : `to ${dayWords(qTo)}`)}`,
              clear: () => { setQFrom(""); setQTo(""); setDoorLabel(null); setBound(null); },
            },
          ]
            .filter((c): c is { key: string; text: string; clear: () => void } => !!c)
            .map((c, _i, all) => (
              <span
                key={c.key}
                className="inline-flex min-w-0 items-center gap-1 h-8 pointer-coarse:h-11 max-[700px]:h-11 pl-3 pr-1 rounded-btn border border-border/70 bg-[var(--panel-plate)] text-body text-foreground-dim"
              >
                <span className="min-w-0 truncate tabular-nums">{c.text}</span>
                <button
                  type="button"
                  onClick={all.length === 1 ? clearSearch : c.clear}
                  aria-label={`Clear ${c.text}`}
                  title="Clear"
                  className="inline-flex flex-none size-6 pointer-coarse:size-9 max-[700px]:size-9 items-center justify-center rounded-xs cursor-pointer text-muted-foreground hover:text-foreground hover:bg-wash-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                >
                  <X aria-hidden className="size-3.5 pointer-coarse:size-[18px]" />
                </button>
              </span>
            ))}
        </span>
      )}
      <button
        type="button"
        aria-expanded={searchOpen}
        onClick={() => setSearchOpen((o) => !o)}
        className={cn(
          "inline-flex flex-none items-center gap-2 h-8 pointer-coarse:h-11 max-[700px]:h-11 px-3 rounded-btn border cursor-pointer",
          "text-body font-medium transition-colors",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
          searchOpen
            ? "border-primary/45 bg-wash-soft text-primary"
            : "border-border/70 text-foreground-dim hover:bg-wash-faint hover:text-foreground",
        )}
      >
        <Search aria-hidden className="size-[15px] text-primary" />
        {/* The noun is said once, here (the fields name only their axis); the phone's toolbar
            is narrow, and the sheet it opens carries the full title. */}
        <span className="max-[700px]:hidden">Search snapshots</span>
        <span className="min-[700px]:hidden">Search</span>
        {/* The disclosure chevron (user, 2026-09-01: "needs a > as well") — pointing at where the
            bar opens, below, on its own 150ms clock. The phone opens a sheet, which needs none. */}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 max-[700px]:hidden transition-transform duration-150 motion-reduce:transition-none",
            searchOpen && "rotate-180",
          )}
        />
      </button>
    </div>
  );

  // The hold ends on the ANSWER'S ROWS, not on the walk: the walk lands on a page number and the
  // page still has to be read, and ending on the walk showed "reading the chain…" in between.
  useEffect(() => {
    if (arriving && !seeking && marked != null && rows.length > 0) {
      setArriving(false);
      landCommit.current = marked;
    }
    // …and the pane opens on the row the arrival landed on — the door's own subject. An arrival
    // is a deliberate gesture, so it takes the arrival builder (no toggle, never the filter), the
    // same one the layer's first-row commit uses. ⚠️ It WAITS for the row to be whole: a history
    // row's anchoring global is resolved a request later (`pending`), and half a (snapshot, tick)
    // pair must not commit — so this is a standing intent consumed on a later render, not a
    // one-shot at the landing.
    if (landCommit.current == null || marked == null || marked !== landCommit.current) return;
    const hit = rows.find((r) => r.metaId != null && r.ordinal === marked);
    if (!hit || hit.metaId == null || hit.pending) return;
    landCommit.current = null;
    armed.current = false;
    applyClickActions(
      metaSnapArrivalActions(
        { metaId: hit.metaId, ordinal: hit.ordinal, hash: hit.hash, globalOrdinal: hit.global.ordinal, ts: hit.ts },
        { kind: "snapshot", title: `Global snapshot #${hit.global.ordinal}`, data: hit.global as GlobalSnapshot },
      ),
    );
  });

  if (arriving && histNet)
    return (
      <>
        {toolbar}
        {search}
        <p className="m-auto text-label text-muted-foreground">
          {`Finding the snapshots from ${qFrom || "that date"}…`}
        </p>
      </>
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
        {/* PHONE SETS THE LOG AT THE LABEL STEP (2026-10-02, the phone pass): the type scale raised
            the table's 14px rows with everything else, and the four columns that survive on phone
            (see COLUMNS) outgrew the pane again — AGE was cut off at the right edge. */}
        {/* GROUPED BY GLOBAL SNAPSHOT (user, 2026-10-07 — option 2 in the companion, "but it needs
            some colour distinction to show what is the actual group"): in time order the rows sit
            under one thin header per global snapshot — its number and age, said once instead of
            on every row — and the SELECTED global snapshot's group is set apart in the accent:
            its header, and a rail down its rows' leading edge. The selected row keeps the one
            fill; the faint tick-mate wash and the ✓ retired with this ("the whole row is
            highlighted"). Sorted by anything else the rows are not in time order, so no groups. */}
        <Table className="max-[700px]:block max-[700px]:[&_tbody]:block">
          {/* TWO-LINE ROWS ON PHONE (design 2026-10-02, option E): the header stands down — a row
              names its own parts there — and each row is network · snapshot · age over one muted
              line of "into <global> · fee · size". That brings fee and size back on phone and
              ends the column squeeze for good (the four-column table was cut off at the edge
              twice). Sorting by header is a desktop/tablet affordance; the phone list is the
              log in its natural order. */}
          <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md max-[700px]:hidden">
            <TableRow className="border-border">
              {columns.map((c, i) => (
                <TableHead
                  key={c.key}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={cn(i >= 2 && "text-right", c.phone === false && PHONE_HIDDEN)}
                >
                  <button
                    type="button"
                    className={cn(
                      "items-center gap-1 text-label uppercase tracking-caps text-muted-foreground hover:text-foreground cursor-pointer",
                      i >= 2 ? "inline-flex flex-row-reverse" : "flex",
                    )}
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}
                  >
                    {c.phoneLabel ? (
                      <>
                        <span className="max-[700px]:hidden">{c.label}</span>
                        <span className="min-[700px]:hidden">{c.phoneLabel}</span>
                      </>
                    ) : (
                      c.label
                    )}
                    {sort.key === c.key &&
                      (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const cfg = displayNetwork(r.metaId) ?? null;
              // A row whose anchoring global is not resolved yet has a group of its own — the
              // placeholder the scene's forming block is (user, 2026-10-07: "add the row and say
              // anchoring"). Its key is not an ordinal: there is none yet.
              const groupKey = (x: ViewRow) => (x.pending ? "anchoring" : x.global.ordinal);
              const groupHead = grouped && (i === 0 || groupKey(rows[i - 1]!) !== groupKey(r));
              const inSelGroup = grouped && !r.pending && snap?.data.ordinal === r.global.ordinal;
              // TWO selection strengths (user, 2026-08-07): the CLICKED metagraph snapshot wears
              // the full wash + ✓; its tick-mates keep a fainter wash. (Washes, not box-shadow —
              // it doesn't paint on a collapsed table row.)
              // ⚠️ A SEAM is a global tick that anchored NOTHING (buildAnchorLog). It is a real
              // measured row — the scene draws it standing at full height for exactly that reason —
              // but it has no metagraph and no metagraph snapshot, so it cannot carry the metagraph
              // selection, the hover channel keyed on one, or the ✓ that marks it.
              const seam = r.metaId == null;
              const rowSel = !seam && metaSnap?.metaId === r.metaId && metaSnap?.ordinal === r.ordinal;
              const pending = !!r.pending;
              // THE SIZE IS MEASURED OR IT IS ABSENT (user, 2026-10-03, two rounds: "focus on real size —
              // compressed, as it is used", then, of a "≤ 7.0 KB" stand-in, "I don't like any
              // approximations, use facts"). The explorer's `sizeInKB` is the BILLED size — whole
              // kilobytes, rounded up, the figure the fee is computed from — so the column restated
              // the fee and disagreed with the card and the pane, which print the bytes actually
              // anchored (3.4 KB beside this column's 6.0). Those bytes exist in one place: the
              // global snapshot the row anchored into. The exact read of it is held for every row
              // in the live window and for any row that has been opened; a deep history row that
              // nobody has opened has NO measured size here, and says so with the dash — never the
              // billed figure dressed as a bound. Opening the row reads its global, and every row
              // anchored into that global then states its size.
              const realBytes = seam ? undefined : snapshotExact[r.global.ordinal]?.rows?.find((x) => x.metaId === r.metaId && x.ordinal === r.ordinal)?.bytes;
              const size =
                realBytes != null && realBytes > 0 ? (
                  fmtKB(realBytes / 1024)
                ) : (
                  <Empty why="Not read yet. The size is measured from the global snapshot this one anchored into — open the row to read it." />
                );
              const commit = () => {
                if (pending) return; // half a (snapshot, tick) pair must not commit
                // PHONE: the list and the snapshot are two pages (design 2026-10-02, option B), so
                // a tap on the ALREADY-selected row opens its page rather than deselecting it —
                // there the toggle would close the very thing the reader asked to read.
                if (onOpen && rowSel) return onOpen();
                if (onOpen && !seam) queueMicrotask(onOpen);
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
                    { metaSnap, following, inspect: useStore.getState().inspect },
                  ),
                );
              };
              return (
                <Fragment key={r.metaId == null ? `tick:${r.global.ordinal}` : `${r.metaId}:${r.ordinal}`}>
                {groupHead && r.pending && (
                  // THE ANCHORING PLACEHOLDER: these snapshots exist, but which global snapshot they
                  // anchored into is still being read — said in words, never a guessed number
                  // (rule 10), and nothing to click until it lands.
                  <TableRow className="hover:bg-transparent border-border max-[700px]:block">
                    <TableCell colSpan={columns.length} className="pt-3 pb-1 max-[700px]:block">
                      <span className="flex items-baseline gap-2 text-label text-muted-foreground">
                        <span className="uppercase tracking-caps">Global</span>
                        <span className="italic">anchoring…</span>
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {groupHead && !r.pending && (
                  // THE GLOBAL SNAPSHOT'S OWN ROW: its number and its age, each as label + value, and
                  // a click selects THAT global snapshot alone (no metagraph snapshot — the pane
                  // then has nothing to read, honestly), as an explorer row does; hovering it lights
                  // the snapshot in the scene on its own channel (rule 9: hover what a click commits).
                  <TableRow
                    className={cn(
                      "cursor-pointer max-[700px]:block hover:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                      inSelGroup ? "border-[var(--primary)]" : "border-border",
                    )}
                    tabIndex={0}
                    title={`Select global snapshot ${r.global.ordinal.toLocaleString()}`}
                    onClick={() => {
                      applyClickActions(metaSnapArrivalActions(null, { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global as GlobalSnapshot }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        applyClickActions(metaSnapArrivalActions(null, { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global as GlobalSnapshot }));
                      }
                    }}
                    onMouseEnter={() => setHoverSnapOrd(r.global.ordinal)}
                    onMouseLeave={() => setHoverSnapOrd(null)}
                    onFocus={() => setHoverSnapOrd(r.global.ordinal)}
                    onBlur={() => setHoverSnapOrd(null)}
                  >
                    <TableCell colSpan={columns.length} className="pt-3 pb-1 max-[700px]:block">
                      <span className={cn("flex items-baseline gap-2 text-label", inSelGroup ? "text-primary-ink" : "text-muted-foreground")}>
                        <span className="uppercase tracking-caps">Global</span>
                        <span className={cn("font-mono tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground")}>{r.global.ordinal.toLocaleString()}</span>
                        <span className="ml-auto uppercase tracking-caps">Age</span>
                        <span className={cn("tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground")} title={whenTitle(r.ts)}>{relativeAge(now - Date.parse(r.ts))}</span>
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  // ⚠️ A SEAM has no metaId and no ordinal, so every seam would key `null:0` —
                  // React then treats a whole page of them as one repeated child and reuses the
                  // wrong DOM (caught by the Next.js MCP the first time a quiet network was
                  // opened). Its identity is its TICK, which is unique by construction.
                  key={r.metaId == null ? `tick:${r.global.ordinal}` : `${r.metaId}:${r.ordinal}`}
                  // HOVER IN THE ROW'S OWN HUE (user, 2026-09-26: "the same idea" as the planes and
                  // the explorer rows — any raw row that belongs to a network previews in that
                  // network's colour). `--row-hue` is set on the row; a seam has none and takes
                  // the accent.
                  className={cn(
                    "text-body hover:bg-[color-mix(in_oklch,var(--row-hue,var(--primary))_12%,transparent)]",
                    // 44px on a touch pointer (a tablet shows the desktop table at ~33px rows).
                    "pointer-coarse:h-11",
                    // Phone: the row is a three-column grid with the detail line spanning beneath.
                    "max-[700px]:grid max-[700px]:grid-cols-[auto_minmax(0,1fr)_auto]",
                    // One line when grouped (fee and size beside the snapshot), so the padding is
                    // even; two lines otherwise, the detail line tucked under the first.
                    grouped
                      ? "max-[700px]:items-center max-[700px]:[&>td]:py-2"
                      : "max-[700px]:items-baseline max-[700px]:[&>td]:pb-0 max-[700px]:[&>td:last-child]:pb-2",
                    pending ? "cursor-default" : "cursor-pointer",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    rowSel && "bg-[var(--sel-bg)] text-foreground",
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
                  style={{
                    ...(r.metaId ? { "--row-hue": cfg?.hue ?? "var(--core)" } : {}),
                    ...(rowSel ? selectionHue(cfg?.hue ?? "var(--core)") : {}),
                  } as CSSProperties}
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
                  <TableCell className={cn(inSelGroup && "shadow-[inset_2px_0_0_var(--primary)]")}>
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
                        <span className="inline-flex items-baseline gap-2 text-muted-foreground"><span className="italic">unlisted</span><span className="font-mono text-label">{r.metaId?.slice(0, 10)}…</span></span>
                      )}
                    </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-foreground-dim">
                    {/* The ✓ slot is ALWAYS reserved so the column never shifts on select. */}
                    {seam ? <Dash /> : r.ordinal.toLocaleString()}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", PHONE_HIDDEN)}>{seam ? <Dash /> : fmtDag(r.fee)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums text-foreground-dim", PHONE_HIDDEN)}>{seam ? <Dash /> : size}</TableCell>
                  {!grouped && (
                    <TableCell className="text-right font-mono tabular-nums max-[700px]:hidden">
                      {pending ? <span className="text-muted-foreground">…</span> : r.global.ordinal.toLocaleString()}
                    </TableCell>
                  )}
                  {!grouped && (
                    <TableCell className="text-right text-muted-foreground" title={whenTitle(r.ts)}>
                      {/* Phone drops the " ago" (the bare register — relativeAge's own note): the
                          AGE header names the quantity, and the suffix's width was the last thing
                          holding this table in sideways scroll. */}
                      <span className="max-[700px]:hidden">{relativeAge(now - Date.parse(r.ts))}</span>
                      <span className="min-[700px]:hidden">{relativeAge(now - Date.parse(r.ts), true)}</span>
                    </TableCell>
                  )}
                  {/* The phone row's SECOND LINE — where it anchored, what it paid, how big it was.
                      One muted line under the row's identity; absent from the table tiers, whose
                      columns state the same three. A seam has only its tick. */}
                  {/* THREE FACTS, THREE PLACES — no mid-dots (user, 2026-10-03: "likely separate facts
                      to show instead of a combined text"): where it anchored on the left, what it
                      paid and how big it is ranged right, each in its own cell of the line. */}
                  {/* GROUPED, it joins the first line: the header holds the "into" and the age, so
                      fee and size take the age's place instead of a line of their own. */}
                  <TableCell className={cn("min-[700px]:hidden text-label text-muted-foreground whitespace-normal", grouped ? "self-center" : "col-span-full pt-0")}>
                    <span className="flex items-baseline gap-4 font-mono tabular-nums">
                      {!grouped && <span className="mr-auto">into {pending ? "…" : r.global.ordinal.toLocaleString()}</span>}
                      {!seam && <span>{fmtDag(r.fee)} DAG</span>}
                      {!seam && <span className="min-w-[6ch] text-right">{size}</span>}
                    </span>
                  </TableCell>
                </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      {/* THE MISS IS STATED, never swallowed (rule 10). Its home moved INTO the search bar
          (2026-09-09 — a screen below the button, it read as the search not working); this
          pager-side line remains only for a FOLDED bar, whose applied search would otherwise
          sit unexplained. */}
      {jumpMiss && !searchOpen && (
        <p className="flex-none pt-1 text-label text-[var(--warn-soft)]">{jumpMiss}</p>
      )}
      <TablePager
        page={rangePages ? page - rangePages.lo + 1 : histNet ? page : Math.min(page, pages)}
        pages={pages}
        from={from}
        to={to}
        total={total}
        // The windowed lenses state their scope and the way further back (user, 2026-08-14) —
        // since 2026-09-02 as one underlined word with the explanation behind it, because the
        // spelled-out line ran too long. The word was "window" until 2026-09-13, which named
        // the MECHANISM rather than the fact (user: "no human understands this"); "recent" is
        // the Snapshots explorer's word too, so the qualifier is learned once. The title still
        // carries what the count actually is: the window is a span of TIME, and networks
        // snapshot at their own rates, so 262 here is not a fraction of anything.
        // A RANGE says the count is the range's, in two words.
        scope={rangeActive ? { word: "in range" } : histNet ? undefined : {
          word: "recent",
          title: "These are only the most recent snapshots, not a whole chain. This view keeps a short stretch of TIME, and every network snapshots at its own rate — so a busy network fills it with hundreds while a quiet one adds three, and the count says nothing about how long either chain is. Pick a network in the top-bar filter to page through all of its snapshots, back to the very first one.",
        }}
        onPage={(n) => {
          landCommit.current = null; // paging away from a landing leaves it uncommitted
          setPageState(rangePages ? n + rangePages.lo - 1 : n);
          // Manual paging is the reader leaving the landing — release the row-follow, or the
          // next live tick would snap the view straight back to the mark.
          if (!histNet) setMarked(null);
        }}
      />
    </>
  );
}
