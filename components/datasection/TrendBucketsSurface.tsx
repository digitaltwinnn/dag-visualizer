"use client";

import { useEffect, useMemo, useState } from "react";

import { useStore } from "@/src/store/store";
import useTrendsSlice from "@/components/useTrendsSlice";
import { spanPhrase } from "@/src/data/trendWindow";
import { displayNetwork, LISTED_IDS, UNLISTED_ID } from "@/src/data/unlisted";
import { cardNetwork } from "@/src/engine/domain/trendStack";
import { bucketColumns, bucketPage, chainGroups, shortAddr, shortKey, tierWord } from "@/src/data/trendBuckets";
import { stampParts, utcDayKey } from "@/src/util/localTime";
import TablePager from "@/components/datasection/TablePager";
import { QualifierChip } from "@/components/inspector/parts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// HISTORY'S RAW IS THE STORED BUCKETS (user, 2026-10-08: "its raw page should just show upstash
// records, not the raw page for snapshots, should work with the app filter as well"). The measured
// history is a store of buckets — one row per five minutes, hour or day — and this lists them as
// they are stored, for the window or range on screen and the COMMITTED scope (the plane brought
// forward, else the filter — `trendStack.cardNetwork`, the cards' own rule; the resting front plane
// is a reading of the deck, not a commit, so it does not scope the records). Each row is one
// bucket's START and its STORED fields, named as the sampler names them — the fold's derived totals
// are left out (`trendBuckets`), and the Unlisted scope lists the chains the fold sums; a field a
// bucket does not hold is the dash (not measured), never a zero (rule 10). It reads the SAME
// payload the planes draw from (`useTrendsSlice`), so a row here is a point there.
//
// It replaced the door onto the anchor log (2026-10-07 → 2026-10-08): the cards' "Snapshot records"
// still opens the log for their span — those are the snapshots; this is the measurement.

const PAGE = 25;
const PHONE_HIDDEN = "max-[700px]:hidden";
/** The Unlisted scope's word on which addresses the catalog holds (`bucketColumns`). */
const UNLISTED_SCOPE = { id: UNLISTED_ID, listed: (a: string) => LISTED_IDS.has(a) };

const Dash = () => (
  <>
    <span aria-hidden className="text-muted-foreground/60">—</span>
    <span className="sr-only">not measured</span>
  </>
);

/** A stored value as stored: integers whole, anything else to three places. */
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));

export default function TrendBucketsSurface() {
  const windowId = useStore((s) => s.trendWindow);
  const range = useStore((s) => s.trendRange);
  const filter = useStore((s) => s.filter);
  const focus = useStore((s) => s.trendFocus);
  // Read only while the layer is open; the payload is the stack's own cached one, so opening is instant.
  const rawOpen = useStore((s) => s.section === "data");
  const slice = useTrendsSlice(rawOpen ? windowId : null, range);
  const p = slice.p;
  const scope = cardNetwork(filter, focus);
  const columns = useMemo(() => bucketColumns(p ? Object.keys(p.series) : [], scope, UNLISTED_SCOPE), [p, scope]);
  // THE UNLISTED SCOPE IS ONE ROW PER BUCKET AND CHAIN (the PR review's follow-up: five chains'
  // seven fields are thirty-five columns across, which is a sideways scroll — never by design).
  // The chain is a column, the seven stored tails are the others; a chain a bucket holds nothing
  // of draws no row, so a quiet month lists only the chains that anchored in it.
  const byChain = scope === UNLISTED_ID ? chainGroups(columns) : null;
  const tails = byChain ? [...new Set(byChain.flatMap((g) => g.tails))] : [];
  const cellKeys = byChain ? tails.map((t) => `.${t}`) : columns;
  const count = p?.buckets.length ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const [page, setPage] = useState(1);
  // A new scope or span is a new list: back to its newest page.
  useEffect(() => setPage(1), [scope, windowId, range?.fromMs, range?.toMs]);
  const pg = bucketPage(count, Math.min(page, pages), PAGE);
  const daily = (p?.stepMs ?? 0) >= 86_400_000;
  const who = scope === "all" ? "All networks" : (displayNetwork(scope)?.ticker ?? (scope === "dag" ? "DAG" : scope));
  // A finer bucket is a clock time (the date rule); its zone is said ONCE in the head, not on
  // every row — fourteen numeric columns need the width a per-row chip took.
  const zone = p && !daily && count ? stampParts(p.buckets[count - 1]!).zone : "";

  return (
    <div className="h-full flex flex-col pl-6 pr-10 max-[700px]:pr-3 max-[700px]:pl-3 py-3 max-[700px]:pt-2">
      {/* THE HEAD states what the rows are: whose fields, over which span, at which tier — one chip
          per fact. The scope's address is here once, so the columns can drop it (`shortKey`). */}
      <div className="flex-none flex flex-wrap items-center gap-2 pb-2 max-[700px]:pr-10">
        <span className="mr-auto text-label uppercase tracking-caps text-muted-foreground">Measured history</span>
        <QualifierChip>{who}</QualifierChip>
        <QualifierChip>{spanPhrase(windowId, range)}</QualifierChip>
        {p && <QualifierChip>{tierWord(p.stepMs)} buckets</QualifierChip>}
        {zone && <QualifierChip>{zone}</QualifierChip>}
      </div>
      {!p ? (
        <p className="m-auto text-label text-muted-foreground">{slice.error ? "The measured history could not be read." : "reading the measured history…"}</p>
      ) : columns.length === 0 ? (
        <p className="m-auto text-label text-muted-foreground">Nothing stored for {who} in this window.</p>
      ) : (
        <>
          <ScrollArea className="flex-1 min-h-0">
            {/* The previous window's rows stand, dimmed, while the new one loads (the slice's hold). */}
            <Table className={cn("max-[700px]:block max-[700px]:[&_tbody]:block max-[700px]:[&_tr]:grid", slice.stale && "opacity-60")}>
              <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md max-[700px]:hidden">
                <TableRow className="border-border">
                  <TableHead className="text-label uppercase tracking-caps text-muted-foreground">Bucket</TableHead>
                  {byChain && <TableHead className="text-label uppercase tracking-caps text-muted-foreground">Chain</TableHead>}
                  {cellKeys.map((k) => (
                    <TableHead key={k} className="text-right px-1.5">
                      <span className="font-mono text-label text-muted-foreground">{byChain ? `m${k}` : shortKey(k, scope, UNLISTED_ID)}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pg.idx.flatMap((i) => {
                  const ms = p.buckets[i]!;
                  // One row per bucket — or, under Unlisted, one per chain that holds a reading in it.
                  const rows: { key: string; addr: string | null; vals: (number | null)[] }[] = byChain
                    ? byChain
                        .map((g) => ({ key: `${ms}:${g.addr}`, addr: g.addr, vals: tails.map((t) => p.series[`m.${g.addr}.${t}`]?.[i] ?? null) }))
                        .filter((r) => r.vals.some((v) => v != null))
                    : [{ key: String(ms), addr: null, vals: columns.map((k) => p.series[k]?.[i] ?? null) }];
                  return rows.map((r) => (
                    <TableRow key={r.key} className="max-[700px]:grid-cols-1 max-[700px]:py-1">
                      {/* A day bucket is a UTC day; a finer one is a clock time with its zone (the date rule). */}
                      <TableCell className="whitespace-nowrap text-label text-foreground-dim tabular-nums">
                        {daily ? utcDayKey(ms) : (() => { const t = stampParts(ms); return <><span className="text-muted-foreground">{t.date}</span> {t.time}</>; })()}
                      </TableCell>
                      {r.addr != null && <TableCell className={cn("font-mono text-label text-foreground-dim", PHONE_HIDDEN)}>{shortAddr(r.addr)}</TableCell>}
                      {r.vals.map((v, c) => (
                        <TableCell key={cellKeys[c]} className={cn("text-right font-mono text-label tabular-nums px-1.5", PHONE_HIDDEN)}>
                          {v == null ? <Dash /> : fmt(v)}
                        </TableCell>
                      ))}
                      {/* PHONE: the fields wrap under the bucket as "name value" pairs — no sideways scroll. */}
                      <TableCell className="min-[700px]:hidden whitespace-normal pt-0">
                        <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-label tabular-nums">
                          {r.addr != null && <span className="text-foreground-dim">{shortAddr(r.addr)}</span>}
                          {r.vals.map((v, c) => (
                            <span key={cellKeys[c]} className="inline-flex items-baseline gap-1">
                              <span className="text-muted-foreground">{byChain ? `m${cellKeys[c]}` : shortKey(cellKeys[c]!, scope, UNLISTED_ID)}</span>
                              {v == null ? <Dash /> : fmt(v)}
                            </span>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          </ScrollArea>
          <TablePager page={Math.min(page, pages)} pages={pages} from={pg.from} to={pg.to} total={count} exact onPage={setPage} />
        </>
      )}
    </div>
  );
}
