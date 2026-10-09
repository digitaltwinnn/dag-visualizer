"use client";

import { METAGRAPHS, netUrl } from "@/src/net/current";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { CSSProperties } from "react";
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
import { pageOfOrdinal, seekSpan, tsInRange } from "@/src/data/chainSeek";
import { POLL } from "@/src/engine/config";
import { utcDayKey } from "@/src/util/localTime";
import { dayWords } from "@/components/datasection/DateRange";
import { useMergedLog, type MergedScope } from "@/components/datasection/useMergedLog";
import { appliedChips, logMode, rangePage, searchCriterion, spanOfSearch } from "@/src/data/logSearch";
import type { ChainSpan } from "@/src/data/mergedLog";
import { useMinHold } from "@/components/useMinHold";
import { useUnlistedLastSeen } from "@/components/useUnlistedLastSeen";
import { useUnlistedChains } from "@/components/datasection/useUnlistedChains";
import { useChainSpan } from "@/components/useArchive";
import LiveDot from "@/components/LiveDot";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NodeStars, PinMark } from "@/components/state/StateAtoms";
import { isRetired } from "@/src/net/lineage";

// The retained global window the log joins against — the same buffer the strip's bars plot,
// one row per anchored metagraph snapshot inside it.
const MAX = POLL.maxSnapshots;
const NO_CHAINS: readonly string[] = [];
const PAGE = 25;

// ONE COLUMN LIST, read by the header AND by the search row beneath it — a second literal is how the
// two silently fall out of alignment when a column is added.
/** How many seek-probed chain pages to retain (see loadPage). A walk spends at most ~10, so this
 *  holds several searches' worth without letting a long session grow unbounded. */
const PROBE_CACHE = 64;

/** ⚠️ SIZE STANDS DOWN ON PHONE. Six columns cannot fit a 500px viewport — measured, the
 *  table ran 494px inside a 403px pane and took the whole log into horizontal scroll, which on a
 *  log you SCAN is worse than showing less of each row. This table already answered the same
 *  question the same way once (2026-08-15: the full network NAME became the TICKER because "the
 *  name column alone pushed the log into horizontal scroll") — shrink what is shown, do not hand
 *  the reader a sideways scroll.
 *
 *  SIZE is the one that goes, and the choice is not arbitrary: the other four are what
 *  IDENTIFIES a row — whose chain, which snapshot, where it anchored, when — while size is a
 *  measure ABOUT it, stated in full on the snapshot card one tap away. It is also a column the
 *  search bar cannot answer for, having no index at any layer, so a phone loses nothing it could
 *  have acted on. `max-[700px]` is `breakpointOf`'s own phone boundary and the same arm every
 *  other phone gate names (CSS trap 8: it stops applying AT 700).
 *  THE FEE STANDS DOWN ON PHONE TOO, and only there (user, 2026-10-09: "re-add the fee column but
 *  hide it in phone mode — only there it doesn't really fit"). It left every tier on 2026-10-08
 *  ("it gets too crowded here"), which the phone's 403px pane meant and the desktop's did not: on a
 *  wide pane the fee is what distinguishes one snapshot from the next at a glance, and the pane
 *  one click away states it for one row at a time. Same arm as the size. */
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
//   · Under "all" (and DAG, through the ledger lens) the log is EVERY catalog chain merged by
//     time with the real total (`useMergedLog`, 2026-10-07); under the unlisted lens it is every
//     UNLISTED chain merged the same way (2026-10-08 — the explorer lists them), falling back to
//     the latest rows the live buffer holds only when their list cannot be read.
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
/** One segment of the chain toggle: a one-word name, or the months an earlier chain ran. */
const SEGMENT = "inline-flex items-center gap-1 h-7 touch:h-10 px-2.5 rounded-sm cursor-pointer text-label whitespace-nowrap";
const SEGMENT_ON = "bg-[var(--sel-bg)] text-foreground";
const SEGMENT_OFF = "text-muted-foreground hover:text-foreground";
function ChainSegment({ label, on, onPick }: { label: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick} className={cn(SEGMENT, on ? SEGMENT_ON : SEGMENT_OFF)}>
      {label}
    </button>
  );
}
/** WHEN A CHAIN RAN — its first and last snapshot's months, UTC like every day-only label (the
 *  date rule, `src/util/localTime`). One month when both fall in it; null until the span is read. */
function chainMonths(span: { genesisTs: string | null; latestTs: string | null } | null): string | null {
  if (!span?.genesisTs) return null;
  const month = (ts: string) => new Date(ts).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
  const a = month(span.genesisTs);
  const b = span.latestTs ? month(span.latestTs) : null;
  return b && b !== a ? `${a} – ${b}` : a;
}
/** One earlier chain as a menu row: the months it ran (its ordinal count while they load). */
function ChainChoice({ addr, idx, on, onPick }: { addr: string; idx: number; on: boolean; onPick: () => void }) {
  const months = chainMonths(useChainSpan(addr));
  return (
    <DropdownMenuItem onSelect={onPick} className="gap-2 text-label">
      <span className="min-w-0 flex-1 truncate">{months ?? `Earlier ${idx}`}</span>
      <Check aria-hidden className={cn("size-3.5 flex-none", on ? "opacity-100" : "opacity-0")} />
    </DropdownMenuItem>
  );
}
/** THE NETWORK'S CHAINS (user, 2026-10-04: "can't we just have a simple toggle?"; 2026-10-08:
 *  "limit the control to current / earlier and use a drop-down for multiple earlier versions, and
 *  show also the date range"): Current | Earlier. One earlier chain is a plain segment; several
 *  make the segment a menu of them, each named by the months it ran, and the pressed segment then
 *  says which months are being paged. */
function ChainControl({ lineage, chainIdx, onPick }: { lineage: readonly string[]; chainIdx: number; onPick: (idx: number) => void }) {
  const chosen = chainMonths(useChainSpan(chainIdx > 0 ? (lineage[chainIdx] ?? null) : null));
  const several = lineage.length > 2;
  return (
    <span className="inline-flex items-center gap-0.5 p-0.5 rounded-btn border border-border" role="group" aria-label="Which of this network's chains to page">
      <ChainSegment label="Current" on={chainIdx === 0} onPick={() => onPick(0)} />
      {!several ? (
        <ChainSegment label="Earlier" on={chainIdx === 1} onPick={() => onPick(1)} />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-pressed={chainIdx > 0} className={cn(SEGMENT, chainIdx > 0 ? SEGMENT_ON : SEGMENT_OFF)}>
              {chainIdx > 0 ? (chosen ?? "Earlier") : "Earlier"}
              <ChevronDown aria-hidden className="size-3 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="min-w-[11rem]">
            {lineage.slice(1).map((addr, i) => (
              <ChainChoice key={addr} addr={addr} idx={i + 1} on={chainIdx === i + 1} onPick={() => onPick(i + 1)} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
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
  // THE UNLISTED SET IS A SCOPE THE LOG CAN TAKE FROM A DOOR OR ITS OWN PICKER (user, 2026-10-09:
  // History's Unlisted plane "should be focused and passed as search-filter to the raw page"). It
  // is the lens the app's Unlisted FILTER already gives this table — every unlisted chain merged by
  // time — so the door's and the picker's scope ride the same lens the filter does, and nothing
  // below learns a new case. The app filter itself is never written (the door's rule).
  const scopeMeta = doorMeta ?? searchMeta;
  const lens = scopeMeta === UNLISTED_ID ? UNLISTED_ID : ledgerLens(filter);
  // The network the COMMITTED FILTER names, if any (the lens already maps DAG → "all").
  const lensNet = lens !== "all" && lens !== UNLISTED_ID && metagraphById(lens) ? lens : null;
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

  // ── UNDER ALL: EVERY NETWORK'S CHAIN, MERGED BY TIME (user, 2026-10-07) ─────────────────────
  // "I care about actual real totals not technical implementation … that should be solved under
  // the hood". With no network in scope the log is every listed network's whole chain, newest
  // first, with the exact total (`useMergedLog`). It replaced a live WINDOW of the last few minutes
  // that called itself "recent" and explained the buffer on hover. The UNLISTED lens merges the
  // unlisted chains the same way (2026-10-08): the explorer lists them by address, so their whole
  // history pages like a network's — it used to be the live window alone.
  // …while the unlisted chain list is in hand: a list that failed or holds nothing falls back to the
  // live window (the "latest" rows) rather than merging nothing and waiting forever (the review).
  // ⚠️ READ ONLY WHILE THE RAW LAYER IS OPEN: this table stays mounted behind the scene, and an
  // ungated merge read every network's chain on every Snapshots page load (measured: 28 requests
  // with RAW closed). Its caches survive closing, so reopening is instant.
  const rawOpen = useStore((s) => s.section === "data");
  // …AND UNDER ALL (user, 2026-10-08: "can't see unlisted in the raw snapshot list — I came from a
  // range in History that does show it anchoring"): unlisted is a network like any other, so the
  // unscoped log merges the unlisted chains with the catalog's once their list is in hand. Under
  // Unlisted the list is the whole merge, so the merge waits for it (below).
  const unlisted = useUnlistedChains(lens === UNLISTED_ID || (lens === "all" && rawOpen));
  const unlistedReady = !!unlisted.chains?.length;
  const unlistedFallback = lens === UNLISTED_ID && (unlisted.failed || (unlisted.chains != null && !unlisted.chains.length));
  const mergedMode = logMode({ chain: histNet, lens }) === "merged" && !unlistedFallback;
  const metaList = useStore((st) => st.metaList);
  // THE CATALOG'S CHAINS, not the live directory's (2026-10-07 — retirement): every network the
  // catalog has, RETIRED ones included, with their former addresses, so the all-time total and the
  // records of a network Constellation no longer lists survive its removal.
  const catalogChains = useMemo(() => METAGRAPHS.flatMap((m) => [m.id, ...(m.formerIds ?? [])]).filter((a, i, all) => !!a && all.indexOf(a) === i), []);
  const mergedChains = useMemo(
    () => (lens === UNLISTED_ID ? (unlisted.chains ?? NO_CHAINS) : unlisted.chains?.length ? [...catalogChains, ...unlisted.chains] : catalogChains),
    [lens, unlisted.chains, catalogChains],
  );
  // The live buffer's newest ordinal per chain — the merged log's tips lead with it.
  const liveTips: Record<string, number> = {};
  if (net) for (const [addr, snaps] of net.metaSnaps) for (const r of snaps) if (r.ordinal > (liveTips[addr] ?? 0)) liveTips[addr] = r.ordinal;
  // The UNLISTED chains are in no live buffer (the polls track the catalog), so their tips come from
  // the decoded live ticks — otherwise the Unlisted log's newest page never followed (the review).
  if (net && lens === UNLISTED_ID) {
    for (const r of unlistedLog(net.globalSnapshots, snapshotExact, net.unlistedSnaps)) {
      if (r.metaId && r.ordinal > (liveTips[r.metaId] ?? 0)) liveTips[r.metaId] = r.ordinal;
    }
  }
  /** What the merged log is cut to: a time span (the date search), or exactly the snapshots one
   *  global snapshot carries (the global search). */
  // ⚠️ THE TIME CUT IS THE ONE SOURCE OF TRUTH for a date filter (the tester pass, 2026-10-07:
  // a filter change kept the chip and dropped the cut). It is the SPAN; each view resolves it on
  // its own — the merged log as its scope, a chain as its ordinals (`bound`, re-resolved whenever
  // the chain changes), the unlisted lens as a cut of its rows.
  const [timeCut, setTimeCut] = useState<{ fromMs: number; toMs: number | null } | null>(null);
  // THE READER'S OWN CUT GOES BACK TO HISTORY (2026-10-09, `store.logCut`): a date search typed
  // here — never a door's span, which came FROM History — is mirrored into the store, and closing
  // a log a History door opened takes it as the committed range. `cutIsOwn` is decided where the
  // search runs (`seekAge`): a typed search has no door span and no exact arrival instant.
  const cutIsOwn = useRef(false);
  const setLogCut = useStore((st) => st.setLogCut);
  useEffect(() => {
    setLogCut(cutIsOwn.current && timeCut ? timeCut : null);
  }, [timeCut, setLogCut]);
  // The table leaves with the layer (History mounts no log), so its cut leaves the store with it.
  useEffect(() => () => setLogCut(null), [setLogCut]);
  /** A global-snapshot search under All: exactly the snapshots that global carries. */
  const [globalSpans, setGlobalSpans] = useState<ChainSpan[] | null>(null);
  /** How many of that global's snapshots came from UNLISTED channels — said, never silently dropped
   *  (the Unlisted audit, 2026-10-07: global 6,700,000 anchored 18 and the log showed 15). */
  const [globalUnlisted, setGlobalUnlisted] = useState(0);
  const mergedScope = useMemo<MergedScope>(
    () => (globalSpans ? { kind: "spans", spans: globalSpans } : timeCut ? { kind: "time", fromMs: timeCut.fromMs, toMs: timeCut.toMs } : { kind: "all" }),
    [globalSpans, timeCut],
  );
  // Under the Unlisted lens an empty log says when one last anchored, never "waiting" forever.
  const unlistedLastSeen = useUnlistedLastSeen(rawOpen && lens === UNLISTED_ID);
  // Under Unlisted the merge waits for the chain list — an empty list would read as "no snapshots".
  // …and under ALL it waits for the list too (or its failure), so the merge reads once rather than
  // walking the catalog and restarting when the unlisted chains land (the PR review).
  const unlistedSettled = unlisted.chains != null || unlisted.failed;
  const merged = useMergedLog(mergedMode && rawOpen && (lens === UNLISTED_ID ? unlistedReady : lens !== "all" || unlistedSettled), mergedChains, mergedScope, liveTips);
  /** A merged search waiting for its page: land (mark) its first row, or go to the oldest end. */
  const mergedLand = useRef<"newest" | "oldest" | "landed-oldest" | null>(null);

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
  /** WHAT A SEARCH APPLIED, recorded when it runs — the chips read THIS, never the live fields (the
   *  branch review's I5: typing a number beside an applied range showed two chips, and editing a
   *  date retitled the chip while the old span stood). Null when no search is in force. */
  const [applied, setApplied] = useState<{ snapshot: string; tick: string; from: string; to: string; doorLabel: string | null } | null>(null);
  /** The door's EXACT span, kept while its words stand (the tester pass: pressing Search on a
   *  Moment's hand-off re-read the fields as whole UTC days and widened an hour to a day). */
  const [doorSpan, setDoorSpan] = useState<{ fromMs: number; toMs: number } | null>(null);
  /** THE RANGE THE LOG KEEPS TO (user, 2026-10-07 — "card → raw page incl. filters"). A date search
   *  is a FILTER now, not only a jump: on a chain the pager stays between the span's first and last
   *  ordinals (`seekSpan`) and says how many it holds; under All the recent rows are cut to it.
   *  `addr` is the chain the ordinals count on — another chain's ordinals mean nothing here. A
   *  snapshot or global search, a clear, or another chain drops it. */
  const [bound, setBound] = useState<{ addr: string; fromMs: number; toMs: number | null; first: number; last: number } | null>(null);
  /** A SNAPSHOT SEARCH CUTS THE CHAIN AT ITS ANSWER (user, 2026-10-08: "why would we show any newer
   *  global snapshots before our search results? … it also refreshes while a search is active"):
   *  the found snapshot is the first row and the log pages back from it, through `bound` with the
   *  snapshot as `last` — the range's own path, so the page grid counts from the answer and the
   *  live page is not read while it stands. The flag says the bound is a snapshot's, not a date's. */
  const [snapCut, setSnapCut] = useState(false);
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
      // A new chain's walk starts with no failure: an old one would keep the hold-release effect
      // (keyed on `histErr`) from firing for this chain's own failure (M2).
      setHistErr(false);
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
  // PAGES INSIDE A RANGE COUNT FROM THE RANGE'S NEWEST SNAPSHOT (the tester pass, 2026-10-07: they
  // were cut from the chain's own page grid, so page 1 of a range held 11 rows, then 25). A range's
  // pages are their own reads, keyed by the range, so every page but the last is full.
  const rangeSpan = (timeCut || snapCut) && bound && bound.addr === histAddr ? bound : null;
  const rangeRows = useRef(new Map<string, HistRow[]>());
  const rangeKey = (n: number) => (rangeSpan ? `${rangeSpan.addr}:${rangeSpan.last}:${n}` : "");
  useEffect(() => {
    if (!rangeSpan || rangeSpan.last < rangeSpan.first) return;
    const key = rangeKey(page);
    if (rangeRows.current.has(key) || pageFetch.current.has(key)) return;
    const before = rangePage(rangeSpan, page, PAGE).before;
    if (before == null || before < rangeSpan.first) return;
    pageFetch.current.add(key);
    fetch(netUrl(`/api/network/${rangeSpan.addr}/snapshots?before=${before}`))
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: HistRow[] }>) : Promise.reject()))
      .then((d) => {
        rangeRows.current.set(key, d.rows.filter((r) => r.ordinal >= rangeSpan.first && r.ordinal <= before));
        setHistErr(false);
        setVersion((v) => v + 1);
      })
      .catch(() => setHistErr(true))
      .finally(() => pageFetch.current.delete(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeSpan?.addr, rangeSpan?.last, rangeSpan?.first, page, version]);
  useEffect(() => {
    if (rangeSpan) return; // a range reads its own pages (above)
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
    if ((!histNet && !mergedMode) || !net) return;
    // The merged log's rows resolve the same way — they are chain rows too.
    const rows = mergedMode ? (merged.rows ?? []) : rangeSpan ? (rangeRows.current.get(rangeKey(page)) ?? []) : (hist.current.pages.get(page) ?? []);
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
  }, [histNet, mergedMode, merged.rows, net, page, version]);

  // ── The rows this render shows ──────────────────────────────────────────────────────────────
  // WINDOW mode builds from the live buffers (rebuilt per event-driven render on purpose — the
  // buffers mutate in place, so a memo key would go stale, not save work). HISTORY mode maps the
  // memoized explorer page; a pending tick keeps `global` at ordinal 0 + `pending` true.
  type ViewRow = AnchorLogRow & { pending?: boolean };
  let allRows: AnchorLogRow[] = [];
  /** The window's rows before a range cuts them — what a date search looks through. */
  let allRowsUnbounded: AnchorLogRow[] = [];
  let rows: ViewRow[] = [];
  let pages = 1;
  let from = 0;
  let to = 0;
  let total = 0;

  if (mergedMode) {
    rows = (merged.rows ?? []).map((r) => {
      const g = resolved.current.get(r.ts);
      return {
        metaId: r.addr,
        ordinal: r.ordinal,
        hash: r.hash,
        fee: r.fee,
        sizeInKB: r.sizeInKB,
        ts: r.ts,
        global: { ordinal: g?.ordinal ?? 0, timestamp: r.ts, hash: g?.hash ?? "", lastSnapshotHash: g?.lastSnapshotHash },
        pending: !g,
      };
    });
    allRows = rows;
    total = merged.total ?? 0;
    pages = merged.pages;
    from = merged.from;
    to = merged.to;
  } else if (!histNet) {
    const listedRows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];
    const unlistedRows = net && (lens === "all" || lens === UNLISTED_ID) ? unlistedLog(net.globalSnapshots, snapshotExact, net.unlistedSnaps) : [];
    allRowsUnbounded = sortAnchorLog([...listedRows, ...unlistedRows], sort.key, sort.dir, (metaId) => displayNetwork(metaId)?.ticker ?? metaId);
    // A RANGE CUTS THE LATEST ROWS to its span (`bound`, addressed to no chain) — the unlisted lens.
    allRows = timeCut ? allRowsUnbounded.filter((r) => tsInRange(r.ts, timeCut.fromMs, timeCut.toMs)) : allRowsUnbounded;
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
    const span = rangeSpan;
    const raw = span ? (rangeRows.current.get(rangeKey(page)) ?? []) : hist.current.net === histAddr ? (hist.current.pages.get(page) ?? []) : [];
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
    total = span ? Math.max(0, span.last - span.first + 1) : latest;
    pages = Math.max(1, Math.ceil(Math.max(total, 1) / PAGE));
    const ords = raw.map((r) => r.ordinal);
    // Page 1 IS positions 1..N by definition — deriving them by subtraction mixes two sources
    // (the buffer's `latest` can lead the explorer's live page by a tick, which read "13–37").
    // Deeper pages subtract against the SAME frozen latest their ?before was computed from.
    // Inside a range the positions count from its newest snapshot.
    const top = span ? span.last : latest;
    from = !ords.length ? 0 : !span && page === 1 ? 1 : top - Math.max(...ords) + 1;
    to = !ords.length ? 0 : !span && page === 1 ? ords.length : top - Math.min(...ords) + 1;
  }

  // THE LAYER OPENS ON A SUBJECT (2026-08-13): with nothing selected, the log commits its own
  // first row on arrival — the section EDGE, one commit per arrival, never overriding an
  // existing selection. History mode keeps the same source: the newest WINDOW row (the buffer
  // leads the explorer's live page by construction).
  const section = useStore((s) => s.section);
  const armed = useRef(false);
  /** A DOOR ARRIVED ON THIS OPENING of the layer (2026-10-09). The re-arm below runs on every
   *  section edge — and in dev's StrictMode twice per mount, the second pass AFTER the door's seek
   *  was consumed — so a door's spend of the arm has to survive the re-arm: this ref does, and is
   *  cleared only when the layer closes. Found live: the History door's "all networks" range landed
   *  with the newest DED row committed, by the arm, a pass after the door had spent it. */
  const doorSeen = useRef(false);
  useEffect(() => {
    if (section !== "data") doorSeen.current = false;
    armed.current = section === "data" && !doorSeen.current;
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
    if (useStore.getState().logSeek) return;
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
    // ONE SEARCH AT A TIME (the tester pass, 2026-10-07: a global search with a date range applied
    // showed both chips while only one was in force). An exact address replaces the other criteria.
    setBound(null); setSnapCut(false); setTimeCut(null); setGlobalSpans(null); setDoorLabel(null); setDoorSpan(null);
    setQTick(""); setQFrom(""); setQTo("");
    setApplied({ snapshot: qSnapshot, tick: "", from: "", to: "", doorLabel: null });
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
        setJumpMiss(`${who} ${n.toLocaleString()} is not among the latest snapshots — pick its network in the search or the top bar to page all time`);
        return;
      }
      setPageState(Math.floor(idx / PAGE) + 1);
      setMarked(n);
      return;
    }
    if (!latest) { setJumpMiss("still reading the chain"); return; }
    if (n > latest) { setJumpMiss(`newest is ${latest.toLocaleString()}`); return; }
    // The answer leads: the chain is cut at it (`snapCut`), page 1 of the cut is the answer and the
    // 24 before it, and the mark lands on the first row.
    if (histNet && latest) hist.current.latest = latest;
    setBound({ addr: histAddr!, fromMs: 0, toMs: null, first: 1, last: n });
    setSnapCut(true);
    setPageState(1);
    setMarked(n);
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
    // One search at a time: a global snapshot replaces a snapshot number or a date range.
    setBound(null); setSnapCut(false); setTimeCut(null); setDoorLabel(null); setDoorSpan(null);
    setQSnapshot(""); setQFrom(""); setQTo("");
    setApplied({ snapshot: "", tick: qTick, from: "", to: "", doorLabel: null });
    const n = Number(qTick.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setJumpMiss(null);
    // UNDER ALL a global snapshot is exactly the snapshots it carries — its own manifest, one read —
    // shown merged like any other cut of the log.
    if (mergedMode) {
      setSeeking(true);
      try {
        const res = await fetch(netUrl(`/api/snapshot/${n}`));
        if (!res.ok) {
          setJumpMiss(`global snapshot ${n.toLocaleString()} is no longer served — search by date instead`);
          return;
        }
        const d = (await res.json()) as { rows?: { metaId: string; ordinal: number }[] };
        const spans = new Map<string, { lo: number; hi: number }>();
        for (const r of d.rows ?? []) {
          if (!mergedChains.includes(r.metaId)) continue;
          const s = spans.get(r.metaId);
          spans.set(r.metaId, s ? { lo: Math.min(s.lo, r.ordinal), hi: Math.max(s.hi, r.ordinal) } : { lo: r.ordinal, hi: r.ordinal });
        }
        // The REMAINDER is the snapshots outside the lens's own chains: unlisted ones under All, the
        // listed ones under Unlisted — each said in its own words (the review: under Unlisted the
        // remainder WAS the listed snapshots, and the miss called them unlisted).
        const otherN = (d.rows ?? []).filter((r) => !mergedChains.includes(r.metaId)).length;
        const unlistedLens = lens === UNLISTED_ID;
        setGlobalUnlisted(unlistedLens ? 0 : otherN);
        if (!spans.size) {
          const g = n.toLocaleString();
          const s = otherN === 1 ? "" : "s";
          setJumpMiss(
            unlistedLens
              ? otherN
                ? `no unlisted chain anchored into global snapshot ${g} — it carried ${otherN} listed snapshot${s}, under All`
                : `nothing anchored into global snapshot ${g}`
              : otherN
                ? `global snapshot ${g} carried only ${otherN} unlisted snapshot${s} — the Unlisted filter lists them`
                : `no listed network anchored into global snapshot ${g}`,
          );
          return;
        }
        setMarked(null);
        setGlobalSpans(mergedChains.filter((a) => spans.has(a)).map((addr) => ({ addr, ...spans.get(addr)! })));
        mergedLand.current = "newest";
      } catch {
        setJumpMiss("the read failed — try again");
      } finally {
        setSeeking(false);
      }
      return;
    }
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
      setTimeCut(null);
      setApplied(null);
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
    // The span: an arrival's exact one (a chain switch re-arming the seek, or the door's own span
    // while its words stand), else the typed whole UTC days.
    const typed = spanOfSearch({ door: doorSpan, from: qFrom, to: qTo });
    // The reader's own search, or a door's span re-run (see `cutIsOwn`).
    cutIsOwn.current = exactFrom.current === null && doorSpan == null;
    const fromMs = exactFrom.current ?? typed?.fromMs ?? null;
    // An exact start carries its own end (open where the re-armed cut was open).
    const toMs = exactFrom.current !== null ? exactTo.current : (typed?.toMs ?? null);
    exactFrom.current = null;
    exactTo.current = null;
    setJumpMiss(null);
    if (fromMs == null) { setJumpMiss("pick a from-date"); return; }
    // One search at a time: a date range replaces a snapshot number or a global snapshot.
    setGlobalSpans(null);
    if (qSnapshot) setQSnapshot("");
    if (qTick) setQTick("");
    setTimeCut({ fromMs, toMs });
    setApplied({ snapshot: "", tick: "", from: qFrom, to: qTo, doorLabel });
    // UNDER ALL every network's chain is cut to the span (the merged scope reads `timeCut`), with its
    // exact total: a closed span opens on its newest snapshot, a from-date alone on that date.
    if (mergedMode) {
      setBound(null);
      setMarked(null);
      merged.retry(); // the same search pressed again reads again
      mergedLand.current = toMs != null ? "newest" : "oldest";
      return;
    }
    if (!histNet) {
      // The latest rows are CUT to the range (the render applies `timeCut`).
      const idx = allRowsUnbounded.findIndex((r) => tsInRange(r.ts, fromMs, toMs));
      if (idx >= 0) {
        setPageState(1);
        setMarked(markOf(allRowsUnbounded[idx]));
        return;
      }
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
      // NOTHING IN THE SPAN IS AN ANSWER: the chain is cut to nothing and says so (the tester pass:
      // a filter change to a network with no data in the range showed its whole chain instead).
      if (span && span.count === 0) {
        setBound({ addr: netAddr!, fromMs, toMs, first: span.first, last: span.first - 1 });
        setArriving(false);
        return;
      }
      // A CLOSED range lands on its NEWEST snapshot — page 1 of the range, as the log reads newest
      // first; an open one (a from-date alone) lands on the date it asked for, as it always did.
      const hit = span == null ? null : toMs != null ? span.last : span.first;
      if (span) setBound({ addr: netAddr!, fromMs, toMs, first: span.first, last: span.last });
      // ⚠️ A MISS HERE IS NOW GENUINELY EXCEPTIONAL, and the copy says what to do about it rather
      // than pronouncing on the chain. The walk's budget covers bisection's own worst case for the
      // chain it was given (see chainSeek's probeBudget), so running out means a pathological run,
      // not a chain that lacks the date — and the probe cache survives the press, so a second one
      // resumes from a narrower bracket instead of starting over.
      // A miss applies no range: the chip must not claim a filter that is not in force (M3).
      if (hit == null) { setTimeCut(null); setApplied(null); setJumpMiss("could not reach that date — press search again"); return; }
      // A range's pages are its own (counted from its newest snapshot): a closed range opens on
      // its first page, a from-date alone on its last — the date it asked for.
      if (span) {
        setPageState(toMs != null ? 1 : Math.max(1, Math.ceil(span.count / PAGE)));
        setMarked(hit);
      } else landOn(hit);
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
  // manual search starts clean; an unscoped arrival seeks too — under All the merged log is cut
  // to the span (2026-10-07).
  const logSeek = useStore((st) => st.logSeek);
  const setLogSeek = useStore((st) => st.setLogSeek);
  const pendingSeek = useRef(false);
  /** A global-snapshot search to run again once the chain it now answers for is in hand. */
  const pendingTick = useRef(false);
  // A STANDING SEARCH FOLLOWS THE CHAIN (the tester pass, 2026-10-07: a filter change kept the chip
  // "DED Aug 22 – Aug 31" and paged DED's whole chain). When the chain the log reads changes —
  // the top-bar filter, the log's own picker, All ⇄ a network — a date cut is resolved again for
  // the new chain (a network with nothing in it then shows nothing, and says so), and a global
  // search is run again. The merged log reads the cut as its scope directly.
  const cutChain = useRef("");
  useEffect(() => {
    const here = histAddr ?? (mergedMode ? "all" : "latest");
    if (cutChain.current === here) return;
    const first = cutChain.current === "";
    cutChain.current = here;
    if (first) return;
    if (qTick) {
      if (!mergedMode) setGlobalSpans(null);
      pendingTick.current = true;
      return;
    }
    if (timeCut && histAddr && bound?.addr !== histAddr) {
      setBound(null);
      exactFrom.current = timeCut.fromMs;
      exactTo.current = timeCut.toMs;
      pendingSeek.current = true;
      // The waiting state while the cut is found on the new chain — never its whole chain under
      // the range's chip in the meantime.
      setMarked(null);
      setArriving(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histAddr, mergedMode]);
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
  /** Whether the door that armed the standing search NAMED A NETWORK — the one case its landing row
   *  is committed (below). */
  const landScoped = useRef(false);
  useEffect(() => {
    if (!logSeek) return;
    // A DOOR SPENDS THE ARM (2026-10-09). The "opens on a subject" arm above skips while a door's
    // seek is pending, but its deps re-run it on the next live tick, when `logSeek` is already
    // consumed — and it committed the newest row under a History door that had asked for a span
    // (user: "it automatically opens the details pane for a DOR metagraph snapshot; it shouldn't").
    // A door names what the layer opens on; the arm is for the bare RAW toggle alone.
    armed.current = false;
    doorSeen.current = true;
    // ONLY WHAT THE GESTURE NAMED IS COMMITTED (the same ruling). A door scoped to a network lands
    // on that network's row at the span's edge and commits it — the door's own subject (2026-10-04).
    // An UNSCOPED door — the Range card under All — names no network, so its landing row is marked
    // and nothing is committed: the pane's own empty state is the honest answer for "all networks".
    landScoped.current = !!logSeek.metaId;
    // ONE SNAPSHOT (a metagraph-snapshot card's door, 2026-10-04): the exact address — the most
    // specific search there is — so the dates stay empty and the snapshot field takes the number.
    // It pages ITS network's chain, whatever the filter or an earlier scope (`doorMeta`).
    if (logSeek.snapshot != null && logSeek.metaId) {
      setDoorMeta(logSeek.metaId);
      setSearchOpen(true);
      setQFrom("");
      setDoorLabel(null);
      setDoorSpan(null);
      setTimeCut(null);
      setGlobalSpans(null);
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
    setDoorSpan({ fromMs: logSeek.fromMs, toMs: logSeek.toMs });
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
      setArriving(true);
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
    // A standing global-snapshot search, re-run on the chain now in hand (the `cutChain` effect).
    if (pendingTick.current && qTick && !seeking && (mergedMode || walkReady)) {
      pendingTick.current = false;
      void seekTick();
    }
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
    // …and the RETIRED networks the live directory no longer lists: their records are still here.
    for (const m of METAGRAPHS) {
      if (!isRetired(m) || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ id: m.id, label: `${m.ticker || m.name} (retired)` });
    }
    // …and the UNLISTED set, as the explorer and the filter list it (2026-10-09): picked, the log is
    // every unlisted chain merged by time (the `lens` above). An ordinal typed against it still
    // routes to the "pick which chain" teaching — the set has no one chain to address.
    out.push({ id: UNLISTED_ID, label: displayNetwork(UNLISTED_ID)?.ticker ?? UNLISTED_ID });
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
    const c = searchCriterion({ snapshot: qSnapshot, tick: qTick, from: qFrom });
    if (c === "snapshot") seekSnapshot();
    else if (c === "tick") void seekTick();
    else if (c === "date") void seekAge();
  };

  /** Any criterion typed — the toggle says so while the row is folded away, or a search would be
   *  silently in force with nothing on screen to explain the rows you are looking at. */
  // What is IN FORCE (the applied record), not what is typed — the chips say only that.
  const searchSet = applied != null;
  /** The rows follow the chain: the newest page, nothing in force, and the live tip being read. */
  const liveNow =
    !searchSet && !(mergedMode ? merged.error : histErr) && (mergedMode ? mergedScope.kind === "all" && merged.page === 1 : histNet ? !rangeSpan && page === 1 : true);

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
      onFrom={(v) => { setDoorLabel(null); setDoorSpan(null); setQFrom(v); }}
      onTo={(v) => { setDoorLabel(null); setDoorSpan(null); setQTo(v); }}
      onSubmit={onSubmit}
      onClose={() => setSearchOpen(false)}
    />
  );

  const clearSearch = () => {
    setQSnapshot(""); setQTick(""); setQFrom(""); setQTo(""); setDoorLabel(null); setDoorSpan(null); setBound(null); setSnapCut(false); setTimeCut(null); setGlobalSpans(null); setApplied(null);
    // Clearing the search drops a door's scope, and under "all" the log's own pick too.
    setDoorMeta(null);
    if (!lensNet) setSearchMeta(null);
    setMarked(null); setJumpMiss(null);
    // Removing the search IS the unfiltered log (user, 2026-10-08: "when we remove the filter tag,
    // it should apply it"): back to its live head, not left on the page the search landed on.
    setPageState(1);
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
      <span className="mr-auto inline-flex items-center gap-2.5">
        {/* THE LOG IS LIVE ON ITS NEWEST PAGE WITH NO SEARCH IN FORCE (user, 2026-10-08): the card's
            own beating dot and word, so the page that follows the chain says so — and a search or
            a page back, which freezes it, drops the word. */}
        {liveNow && (
          <span className="inline-flex items-center gap-1.5 text-label text-muted-foreground">
            <LiveDot />
            live
          </span>
        )}
        {lineage.length > 1 && (
          <ChainControl lineage={lineage} chainIdx={chainIdx} onPick={(i) => { setMarked(null); setJumpMiss(null); setChain(i); }} />
        )}
      </span>
      {searchSet && (
        // EACH APPLIED CRITERION IS ITS OWN CHIP with its own × (user, 2026-10-07): one chip per
        // condition, and the metagraph snapshot names its chain beside the ordinal ("DED 2,617,537"),
        // as the search bar's composite field does — an ordinal is per chain, bare it names nothing.
        // The date range is ONE condition, so one chip. Clearing the last chip clears the search.
        <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-2 max-[700px]:flex-1">
          {appliedChips(
            { ...applied!, chain: searchNet },
            (id) => displayNetwork(id)?.ticker ?? id,
            dayWords,
          )
            .map((c) => ({
              ...c,
              clear:
                c.key === "snapshot"
                  ? () => { setQSnapshot(""); setMarked(null); setJumpMiss(null); setApplied(null); setBound(null); setSnapCut(false); setPageState(1); }
                  : c.key === "tick"
                    ? () => { setQTick(""); setMarked(null); setJumpMiss(null); setGlobalSpans(null); setApplied(null); }
                    : () => { setQFrom(""); setQTo(""); setDoorLabel(null); setDoorSpan(null); setBound(null); setTimeCut(null); setApplied(null); },
            }))
            .map((c, _i, all) => (
              <span
                key={c.key}
                className="inline-flex min-w-0 items-center gap-1 h-8 touch:h-11 max-[700px]:h-11 pl-3 pr-1 rounded-btn border border-border/70 bg-[var(--panel-plate)] text-body text-foreground-dim"
              >
                <span className="min-w-0 truncate tabular-nums">{c.text}</span>
                <button
                  type="button"
                  onClick={all.length === 1 ? clearSearch : c.clear}
                  aria-label={`Clear ${c.text}`}
                  className="inline-flex flex-none size-6 touch:size-9 max-[700px]:size-9 items-center justify-center rounded-xs cursor-pointer text-muted-foreground hover:text-foreground hover:bg-wash-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]"
                >
                  <X aria-hidden className="size-3.5 touch:size-[18px]" />
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
          "inline-flex flex-none items-center gap-2 h-8 touch:h-11 max-[700px]:h-11 px-3 rounded-btn border cursor-pointer",
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

  // A MERGED READ THAT FAILS ENDS AN ARRIVAL'S HOLD (the branch review's I2 — the chain log's
  // `histErr` rule): the reader sees the failure and its retry, never "Finding…" forever.
  useEffect(() => {
    if (mergedMode && merged.error && arriving) {
      setArriving(false);
      mergedLand.current = null;
      setJumpMiss("the snapshot history could not be read — press Search to try again");
    }
  }, [mergedMode, merged.error, arriving]);

  // A MERGED SEARCH LANDS once its page is here: a from-date alone first goes to the oldest end
  // (the date it asked for), then the page's first row is marked — and an arrival commits it below.
  useEffect(() => {
    if (!mergedMode || !mergedLand.current || merged.loading || !merged.rows) return;
    if (mergedLand.current === "oldest") {
      mergedLand.current = "landed-oldest";
      if (merged.pages > 1) { merged.go(merged.pages); return; }
    }
    // A from-date alone landed on the OLDEST page, so its mark is that page's oldest row — the date
    // asked for (M1); a closed range's is its newest.
    const landing = mergedLand.current;
    mergedLand.current = null;
    const first = landing === "newest" ? merged.rows[0] : merged.rows[merged.rows.length - 1];
    if (first) setMarked(first.ordinal);
    else { setArriving(false); setJumpMiss("no snapshots in that range"); }
  });

  // The hold ends on the ANSWER'S ROWS, not on the walk: the walk lands on a page number and the
  // page still has to be read, and ending on the walk showed "reading the chain…" in between.
  useEffect(() => {
    if (arriving && !seeking && marked != null && rows.length > 0) {
      setArriving(false);
      landCommit.current = landScoped.current ? marked : null;
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

  // THE LOG'S WAITING STATES (the state-atom rules, components/CLAUDE.md): a block that is being
  // read says so in a word beside the twinkling node-stars, and a transient one is HELD for a calm
  // beat (`useMinHold`) so a fast answer never blinks it on and off. The first read of every chain
  // under All is the long one — a page of each network, in parallel.
  const firstRead = useMinHold(mergedMode && merged.rows == null && !merged.error);
  const waiting = (words: string) => (
    <p className="m-auto inline-flex items-center gap-2.5 text-label text-muted-foreground">
      <NodeStars count={3} />
      {words}
    </p>
  );

  if (arriving && (histNet || mergedMode))
    return (
      <>
        {toolbar}
        {search}
        {/* The span in the card's own words when a door brought it, else the day the reader typed. */}
        {waiting(`Finding the snapshots ${doorLabel ? `in ${doorLabel}` : qFrom ? `from ${dayWords(qFrom)}` : "you asked for"}…`)}
      </>
    );

  if (mergedMode && (firstRead.show || merged.rows == null))
    return (
      <>
        {toolbar}
        {search}
        {merged.error ? (
          <p className="m-auto flex items-center gap-3 text-label text-muted-foreground">
            The snapshot history could not be read.
            <button type="button" onClick={merged.retry} className="rounded-btn border border-border px-2 py-1 text-foreground hover:bg-wash-faint cursor-pointer">
              Try again
            </button>
          </p>
        ) : (
          <div className={cn("m-auto", firstRead.fading && "animate-hold-fade-out motion-reduce:animate-none")}>{waiting(lens === UNLISTED_ID ? "Reading the unlisted chains…" : "Reading every network's snapshots…")}</div>
        )}
      </>
    );

  // A RANGE PAGE STILL BEING READ is a wait, not an empty answer (the empty line flashed on every
  // page turn inside a range).
  if (rows.length === 0 && rangeSpan && rangeSpan.last >= rangeSpan.first && !rangeRows.current.has(rangeKey(page)) && !histErr)
    return (
      <>
        {toolbar}
        {search}
        {waiting("Reading the snapshots…")}
      </>
    );

  if (rows.length === 0)
    return (
      <>
        {toolbar}
        {search}
        <p className="m-auto text-label text-muted-foreground">
          {!live ? "NO SIGNAL" : lens === UNLISTED_ID && !timeCut && !mergedMode ? `No unlisted snapshots among the latest global snapshots. ${unlistedLastSeen}` : timeCut || globalSpans ? "No snapshots in that range" : mergedMode ? "No snapshots here" : histNet && bound?.addr === histAddr ? "No snapshots in that range" : histNet ? (histErr ? "history unavailable — the explorer read failed; paging again retries" : "reading the chain…") : "Waiting for anchored metagraph snapshots…"}
        </p>
      </>
    );

  const now = Date.now();

  return (
    <>
      {toolbar}
      {search}
      {/* A PAGE THAT FAILED TO READ says so beside the rows still on screen, with its retry (the
          branch review's I1: the table sat dimmed with no word). */}
      {mergedMode && merged.error && merged.rows && (
        <p className="flex-none m-0 pb-2 flex items-center gap-3 text-label text-[var(--warn-soft)]">
          That page could not be read.
          <button type="button" onClick={merged.retry} className="rounded-btn border border-border px-2 py-0.5 text-foreground hover:bg-wash-faint cursor-pointer">
            Try again
          </button>
        </p>
      )}
      {/* THE UNLISTED REMAINDER OF A GLOBAL SNAPSHOT, said rather than dropped. */}
      {mergedMode && globalSpans && globalUnlisted > 0 && (
        <p className="flex-none m-0 pb-2 text-label text-muted-foreground">
          This global snapshot also carried {globalUnlisted} snapshot{globalUnlisted === 1 ? "" : "s"} from unlisted channels — the Unlisted filter lists them.
        </p>
      )}
      {/* A PAGE BEING READ keeps the previous page on screen, dimmed — a page turn never blanks the
          table (the merged log reads a page of every network). */}
      <ScrollArea className={cn("flex-1 min-h-0 transition-opacity duration-150", mergedMode && merged.loading && "opacity-60")} aria-busy={mergedMode && merged.loading}>
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
                        {/* A chain row IS anchored — only its global's number is still being read,
                            so the number's slot twinkles; a live row is genuinely still anchoring. */}
                        {histNet || mergedMode ? <NodeStars count={3} /> : <span className="italic">anchoring…</span>}
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
                      // THE HEADER IS A PLATE (user, 2026-10-08, design B1: "the header in the
                      // snapshot list is not clearly distinguishable from the body rows"). The plate
                      // lives on the cell's inner block, not the row: a <tr> takes neither margin
                      // nor radius, and the gap ABOVE the plate is what separates two groups.
                      "group/gh cursor-pointer max-[700px]:block border-0 hover:bg-transparent",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                    )}
                    tabIndex={0}
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
                    <TableCell colSpan={columns.length} className="p-0 pt-2.5 max-[700px]:px-0 max-[700px]:block">
                      {/* Accent-tinted band + accent hairline; the SELECTED global deepens to the
                          selection accent — the group's head carries that selection, never its rows.
                          The age needs no "Age" label: "17s ago" names itself. */}
                      <span
                        className={cn(
                          // px matches the rows' own cell inset, so "GLOBAL" stands on the identity dots' edge.
                          "flex items-center gap-2 h-[34px] px-2 max-[700px]:px-1.5 rounded-t-md border-b text-label transition-colors",
                          inSelGroup
                            ? "bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] border-[var(--primary)]"
                            : "bg-[color-mix(in_oklch,var(--primary)_9%,var(--panel-plate))] border-[color-mix(in_oklch,var(--primary)_35%,transparent)] group-hover/gh:bg-[color-mix(in_oklch,var(--primary)_14%,var(--panel-plate))]",
                        )}
                      >
                        <span className={cn("uppercase tracking-caps", inSelGroup ? "text-primary-ink" : "text-[color-mix(in_oklch,var(--primary-ink)_80%,var(--muted-foreground))]")}>Global</span>
                        <span className={cn("font-mono tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground")}>{r.global.ordinal.toLocaleString()}</span>
                        <span className={cn("ml-auto tabular-nums", inSelGroup ? "text-primary-ink" : "text-foreground-dim")}>{relativeAge(now - Date.parse(r.ts))}</span>
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
                    "touch:h-11",
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
                  {/* THE EDGE MARKS THE ONE SELECTED ROW (user, 2026-10-08: "only add a | to the
                      metagraph row that is the selection"). It used to run down every row anchored
                      into the selected global, which read as N selections when the global itself was
                      the subject — that case is the group's header, which wears the accent. */}
                  <TableCell className={cn(rowSel && "shadow-[inset_2px_0_0_var(--row-hue,var(--primary))]")}>
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
                        <span>{cfg.ticker}</span>
                      ) : (
                        // An uncataloged channel: the core tone + its address, honestly unnamed.
                        <span className="inline-flex items-baseline gap-2 text-muted-foreground"><span className="italic">unlisted</span><span className="font-mono text-label">{r.metaId?.slice(0, 10)}…</span></span>
                      )}
                    </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-foreground-dim">
                    {/* THE SELECTED ROW SAYS WHETHER IT IS LIVE OR PINNED (user, 2026-10-09: the
                        pinned snapshot "should show that also in the raw list") — the Snapshots
                        explorer's own state mark on its highlighted row, the same two glyphs. */}
                    <span className="inline-flex items-center gap-1.5">
                      {seam ? <Dash /> : r.ordinal.toLocaleString()}
                      {rowSel && !seam && (following ? <LiveDot /> : <PinMark className="text-muted-foreground" />)}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", PHONE_HIDDEN)}>{seam ? <Dash /> : fmtDag(r.fee)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums text-foreground-dim", PHONE_HIDDEN)}>{seam ? <Dash /> : size}</TableCell>
                  {!grouped && (
                    <TableCell className="text-right font-mono tabular-nums max-[700px]:hidden">
                      {pending ? <span className="text-muted-foreground">…</span> : r.global.ordinal.toLocaleString()}
                    </TableCell>
                  )}
                  {!grouped && (
                    <TableCell className="text-right text-muted-foreground">
                      {/* Phone drops the " ago" (the bare register — relativeAge's own note): the
                          AGE header names the quantity, and the suffix's width was the last thing
                          holding this table in sideways scroll. */}
                      <span className="max-[700px]:hidden">{relativeAge(now - Date.parse(r.ts))}</span>
                      <span className="min-[700px]:hidden">{relativeAge(now - Date.parse(r.ts), true)}</span>
                    </TableCell>
                  )}
                  {/* The phone row's SECOND LINE — where it anchored and how big it was. One muted
                      line under the row's identity; absent from the table tiers, whose columns
                      state the same two. A seam has only its tick. */}
                  {/* TWO FACTS, TWO PLACES — no mid-dots (user, 2026-10-03: "likely separate facts
                      to show instead of a combined text"): where it anchored on the left, how big
                      it is ranged right, each in its own cell of the line. */}
                  {/* GROUPED, it joins the first line: the header holds the "into" and the age, so
                      the size takes the age's place instead of a line of its own. */}
                  <TableCell className={cn("min-[700px]:hidden text-label text-muted-foreground whitespace-normal", grouped ? "self-center" : "col-span-full pt-0")}>
                    <span className="flex items-baseline gap-4 font-mono tabular-nums">
                      {!grouped && <span className="mr-auto">into {pending ? "…" : r.global.ordinal.toLocaleString()}</span>}
                      {!seam && <span className="min-w-[6ch] text-right">{size}</span>}
                      {/* THE ROW OPENS A PAGE (design B1): the phone's chevron says so — this cell
                          exists only on the phone, where list and snapshot are two pages. The
                          selected row's chevron takes its network's hue, like its edge. */}
                      {!seam && !pending && onOpen && (
                        <ChevronRight
                          aria-hidden
                          className={cn("size-3.5 self-center -mr-1", rowSel ? "text-[var(--row-hue,var(--primary))]" : "text-muted-foreground/75")}
                        />
                      )}
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
        page={mergedMode ? merged.page : histNet ? page : Math.min(page, pages)}
        pages={pages}
        from={from}
        to={to}
        total={total}
        // REAL TOTALS, written out (user, 2026-10-07): the count is the answer, not an estimate.
        exact
        // While the networks' spans are still being measured, the count slot twinkles (NodeStars —
        // a value arriving into its slot).
        totalPending={mergedMode && merged.total == null}
        // A chain that could not be read or searched makes the merged total a FLOOR (I3).
        floor={mergedMode && merged.floor}
        // The windowed lenses state their scope and the way further back (user, 2026-08-14) —
        // since 2026-09-02 as one underlined word with the explanation behind it, because the
        // spelled-out line ran too long. The word was "window" until 2026-09-13, which named
        // the MECHANISM rather than the fact (user: "no human understands this"); "recent" is
        // the Snapshots explorer's word too, so the qualifier is learned once. The title still
        // carries what the count actually is: the window is a span of TIME, and networks
        // snapshot at their own rates, so 262 here is not a fraction of anything.
        // The one qualifier left is the unlisted lens's: an unlisted channel has no public chain, so
        // that view holds only the latest snapshots — said in one plain word, no lecture behind it.
        scope={!histNet && !mergedMode ? { word: "recent" } : undefined}
        onPage={(n) => {
          landCommit.current = null; // paging away from a landing leaves it uncommitted
          if (mergedMode) { setMarked(null); merged.go(n); return; }
          setPageState(n);
          // Manual paging is the reader leaving the landing — release the row-follow, or the
          // next live tick would snap the view straight back to the mark.
          if (!histNet) setMarked(null);
        }}
      />
    </>
  );
}
