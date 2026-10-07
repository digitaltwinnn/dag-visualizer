"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { netUrl } from "@/src/net/current";
import { seekSpan } from "@/src/data/chainSeek";
import { lastPageSize, mergePage, type ChainSpan, type LogRow } from "@/src/data/mergedLog";

// THE ANCHOR LOG UNDER ALL — every listed network's chain, merged by time, with the REAL total
// (user, 2026-10-07: "I care about actual real totals not technical implementation … that should
// be solved under the hood and indifferent to the user"). The merge itself is pure
// (`src/data/mergedLog.ts`); this hook fetches the chains, keeps the cursors and builds a page.
//
//  - WHAT IT COVERS: each chain's whole span — or, under a filter, the part a time range holds
//    (`seekSpan` per chain, in parallel) or exactly the snapshots one global snapshot carries.
//  - THE TOTAL is the sum of the spans' sizes: exact, never a count of a buffer.
//  - A PAGE BOUNDARY IS A CURSOR PER CHAIN, cached per page, so the newest page, the oldest page
//    and each step are exact. Pages are counted newest first; the oldest page holds the remainder.
//  - While a page is read the PREVIOUS rows stay (the caller dims them), so a page turn never
//    blanks the table.

export const MERGED_PAGE = 25;

/** What the merged log is cut to: nothing, a time span, or the snapshots one global carries. */
export type MergedScope =
  | { kind: "all" }
  | { kind: "time"; fromMs: number; toMs: number | null }
  | { kind: "spans"; spans: ChainSpan[] };

type Where = { side: "top" | "bottom"; n: number };

export interface MergedLog {
  /** The page's rows, newest first, each with its chain address — null until the first page lands. */
  rows: (LogRow & { addr: string })[] | null;
  /** 1-based, counted newest first. */
  page: number;
  pages: number;
  /** Exact, or null while the spans are still being measured. */
  total: number | null;
  /** The page's row range within the total (1-based). */
  from: number;
  to: number;
  /** A page (or the spans) being read — the rows on screen are the previous page's. */
  loading: boolean;
  error: boolean;
  /** Go to a page: the newest, the oldest, or one step either way. */
  go: (target: number) => void;
}

export function useMergedLog(active: boolean, chains: readonly string[], scope: MergedScope, liveTips: Readonly<Record<string, number>>): MergedLog {
  // ── Chain pages, cached by (chain, before) — an ordinal-addressed page never changes ───────────
  const runs = useRef(new Map<string, Promise<LogRow[]>>());
  const fetchRun = (addr: string, before: number | null): Promise<LogRow[]> => {
    const key = `${addr}:${before ?? "tip"}`;
    let p = runs.current.get(key);
    if (!p) {
      p = fetch(netUrl(`/api/network/${addr}/snapshots${before == null ? "" : `?before=${before}`}`))
        .then((r) => (r.ok ? (r.json() as Promise<{ rows: LogRow[] }>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => d.rows)
        .catch((e) => {
          runs.current.delete(key); // a failed read is retried on the next ask
          throw e;
        });
      runs.current.set(key, p);
    }
    return p;
  };

  // ── The spans the log covers, and the total ───────────────────────────────────────────────────
  const chainKey = chains.join(",");
  const scopeKey = scope.kind === "all" ? "all" : scope.kind === "time" ? `t:${scope.fromMs}:${scope.toMs}` : `s:${scope.spans.map((s) => `${s.addr}:${s.lo}-${s.hi}`).join(",")}`;
  const [spans, setSpans] = useState<{ scope: string; spans: ChainSpan[] } | null>(null);
  const [error, setError] = useState(false);
  // The live tips move the whole-chain spans only while the reader is on the newest page (a deeper
  // page's positions must not shift under them) — the anchor log's own frozen-latest rule.
  const [where, setWhere] = useState<Where>({ side: "top", n: 1 });
  const onNewest = where.side === "top" && where.n === 1;
  // ⚠️ FROZEN off the newest page, not cleared: clearing it re-ran the span read the moment the
  // reader left page 1, which reset every page cursor (found in the tester pass, 2026-10-07).
  const tipKeyRef = useRef("");
  if (scope.kind === "all" && onNewest) tipKeyRef.current = chains.map((a) => liveTips[a] ?? 0).join(",");
  const tipKey = scope.kind === "all" ? tipKeyRef.current : "";

  useEffect(() => {
    if (!active || !chains.length) return;
    const scopeAt = `${chainKey}|${scopeKey}`;
    let cancelled = false;
    setError(false);
    (async () => {
      let next: ChainSpan[];
      if (scope.kind === "spans") {
        next = scope.spans;
      } else {
        // Each chain's newest ordinal: the live buffer's when it leads, else the chain's own tip page.
        const tips = await Promise.all(
          chains.map(async (addr) => {
            const page = await fetchRun(addr, null).catch(() => [] as LogRow[]);
            return Math.max(liveTips[addr] ?? 0, page[0]?.ordinal ?? 0);
          }),
        );
        if (scope.kind === "all") {
          next = chains.map((addr, i) => ({ addr, lo: 1, hi: tips[i]! })).filter((s) => s.hi >= 1);
        } else {
          const found = await Promise.all(
            chains.map(async (addr, i) => {
              const latest = tips[i]!;
              if (latest < 1) return null;
              const loadPage = (before: number) => fetchRun(addr, before).then((rows) => rows.map((r) => ({ ordinal: r.ordinal, ts: r.ts })));
              const s = await seekSpan(scope.fromMs, scope.toMs ?? Number.MAX_SAFE_INTEGER, latest, loadPage).catch(() => null);
              return s && s.count > 0 ? { addr, lo: s.first, hi: s.last } : null;
            }),
          );
          next = found.filter((s): s is ChainSpan => s != null);
        }
      }
      if (cancelled) return;
      setSpans({ scope: scopeAt, spans: next });
    })().catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
    // `scope`, `chains` and `liveTips` are read through their keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chainKey, scopeKey, tipKey]);

  // A new scope starts on the newest page; a tip refresh keeps the reader where they are (page 1).
  const scopeAndChains = `${chainKey}|${scopeKey}`;
  useEffect(() => {
    setWhere({ side: "top", n: 1 });
  }, [scopeAndChains]);

  const current = spans && spans.scope === scopeAndChains ? spans.spans : null;
  const total = current ? current.reduce((n, s) => n + (s.hi - s.lo + 1), 0) : null;
  const pages = total == null ? 1 : Math.max(1, Math.ceil(total / MERGED_PAGE));

  // ── Pages ─────────────────────────────────────────────────────────────────────────────────────
  // Cursors per page, per side: top[n] is page n's newest-first cursor per chain; bottom[m] the
  // m-th page from the oldest end's oldest-first cursor. Reset with the spans.
  const cursors = useRef<{ key: string; top: Map<number, Record<string, number>>; bottom: Map<number, Record<string, number>> }>({ key: "", top: new Map(), bottom: new Map() });
  const spanKey = current ? JSON.stringify(current) : "";
  if (cursors.current.key !== spanKey && current) {
    cursors.current = {
      key: spanKey,
      top: new Map([[1, Object.fromEntries(current.map((s) => [s.addr, s.hi]))]]),
      bottom: new Map([[1, Object.fromEntries(current.map((s) => [s.addr, s.lo]))]]),
    };
  }

  const [shown, setShown] = useState<{ key: string; where: Where; total: number; rows: (LogRow & { addr: string })[] } | null>(null);
  const [reading, setReading] = useState(false);
  const pageKey = `${spanKey}|${where.side}:${where.n}`;
  useEffect(() => {
    if (!active || !current || total == null) return;
    const map = where.side === "top" ? cursors.current.top : cursors.current.bottom;
    const at = map.get(where.n);
    if (!at) return; // only adjacent steps are offered, so the cursor is always cached
    let cancelled = false;
    setReading(true);
    (async () => {
      const take = where.side === "bottom" && where.n === 1 ? lastPageSize(total, MERGED_PAGE) : MERGED_PAGE;
      const live = current.filter((s) => (where.side === "top" ? at[s.addr]! >= s.lo : at[s.addr]! <= s.hi));
      const chainRuns = await Promise.all(
        live.map(async (s) => {
          const c = at[s.addr]!;
          if (where.side === "top") {
            const rows = await fetchRun(s.addr, c);
            return { addr: s.addr, rows: rows.filter((r) => r.ordinal <= c && r.ordinal >= s.lo) };
          }
          const rows = await fetchRun(s.addr, Math.min(c + MERGED_PAGE - 1, s.hi));
          return { addr: s.addr, rows: rows.filter((r) => r.ordinal >= c && r.ordinal <= s.hi).sort((a, b) => a.ordinal - b.ordinal) };
        }),
      );
      // Keep the chains' own order (the tie-break), whatever subset still has rows.
      const ordered = current.map((s) => chainRuns.find((r) => r.addr === s.addr)).filter((r): r is NonNullable<typeof r> => !!r);
      const page = mergePage(ordered, take, where.side === "top" ? "down" : "up");
      const nextCursor = Object.fromEntries(
        current.map((s) => [s.addr, where.side === "top" ? at[s.addr]! - (page.taken[s.addr] ?? 0) : at[s.addr]! + (page.taken[s.addr] ?? 0)]),
      );
      if (cancelled || cursors.current.key !== spanKey) return;
      map.set(where.n + 1, nextCursor);
      setShown({ key: pageKey, where, total, rows: page.rows });
      setReading(false);
    })().catch(() => {
      if (!cancelled) {
        setError(true);
        setReading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pageKey]);

  // THE PAGER DESCRIBES THE ROWS ON SCREEN: while the next page is read, its number and range stay
  // the shown page's (the tester pass: a jump to the oldest page read "38525226–38525250 of
  // 38,525,232" over the newest rows for a moment).
  const at = shown?.where ?? where;
  const page = at.side === "top" ? at.n : pages - at.n + 1;
  const targetPage = where.side === "top" ? where.n : pages - where.n + 1;
  const go = (target: number) => {
    if (target <= 1) return setWhere({ side: "top", n: 1 });
    if (target >= pages) return setWhere({ side: "bottom", n: 1 });
    // Steps are taken from the page ASKED FOR, so a second click during a read still steps on.
    if (target === page + 1 || target === targetPage + 1) return setWhere(where.side === "top" ? { side: "top", n: where.n + 1 } : { side: "bottom", n: where.n - 1 });
    if (target === page - 1 || target === targetPage - 1) return setWhere(where.side === "top" ? { side: "top", n: where.n - 1 } : { side: "bottom", n: where.n + 1 });
  };

  const rows = shown?.rows ?? null;
  // The row range: counted from the newest end on the top side, from the oldest end on the bottom.
  const range = useMemo(() => {
    if (!shown) return { from: 0, to: 0 };
    const { where: w, total: t, rows: r } = shown;
    if (w.side === "top") return { from: (w.n - 1) * MERGED_PAGE + 1, to: (w.n - 1) * MERGED_PAGE + r.length };
    const fromEnd = lastPageSize(t, MERGED_PAGE) + (w.n - 1) * MERGED_PAGE;
    return { from: t - fromEnd + 1, to: t - fromEnd + r.length };
  }, [shown]);

  return {
    rows,
    page,
    pages,
    total,
    from: range.from,
    to: range.to,
    loading: reading || total == null || (shown != null && shown.key !== pageKey),
    error,
    go,
  };
}
