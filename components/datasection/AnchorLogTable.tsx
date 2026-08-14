"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork } from "@/src/data/network";
import { buildAnchorLog, sortAnchorLog, type AnchorLogSortKey } from "@/src/data/anchorLog";
import { displayNetwork, unlistedLog, UNLISTED_ID } from "@/src/data/unlisted";
import { ledgerLens } from "@/src/data/ledgerStory";
import { metaSnapHoverKey } from "@/src/data/types";
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

// The ledger data table (spec 2026-08-01): the per-metagraph ANCHOR LOG — one row per anchored
// metagraph snapshot in the retained window, finer-grained than the strip's per-tick bars.
// SORTABLE like the roster (user, 2026-08-13 — the no-sort split was revised: one raw-table
// idiom, not two), resting on its chronological construction (newest tick first = Age ↑);
// `sortAnchorLog` compares the DISPLAYED network name, the roster's own lesson. A row click
// names its own METAGRAPH SNAPSHOT — the same subject a
// tile click on the upper floor names — through the SAME tested `metaSnapSelectActions` builder
// (Task 20): it already pins the global tick the row anchored into, so the row and a tile click
// mean exactly the same thing.
export default function AnchorLogTable() {
  useSnapshotFeed(MAX); // re-render driver: global + anchor events (the buffers below refresh)
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const snap = useStore((s) => s.snap);
  const following = useStore((s) => s.following);
  const metaSnap = useStore((s) => s.metaSnap);
  // A row IS one metagraph snapshot, so its hover rides the snapshot channel, not the tick's
  // (user, 2026-08-09): `hoverSnapOrd` lights every band of the anchoring global, which lit a row
  // of snapshots the pointer was not on. Same channel the explorer's leaf rows and the scene's
  // tiles use, so all three preview exactly the subject a click would commit.
  const setHoverMetaSnap = useStore((s) => s.setHoverMetaSnap);
  const net = getNetwork();
  // Rebuilt per render on purpose: renders here are event-driven (a tick / an anchor fill every
  // few seconds), and the buffers mutate in place, so a memo key would go stale, not save work.
  // The UNLISTED channels join from the exact reads (2026-08-07 — the polled buffers only track
  // the catalog, so under the "unlisted" filter the listed builder is empty by construction and
  // these rows ARE the table; under "all" they complete it).
  const snapshotExact = useStore((s) => s.snapshotExact);
  const listedRows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];
  // Through the ledger's lens: committed DAG reads as the whole log (ledgerLens — every tick IS
  // a DAG snapshot), so the unlisted rows complete it exactly as under "all". The old
  // "The DAG core anchors nothing. It IS the anchor." hint retired with the empty state it
  // explained (user, 2026-08-13).
  const lens = ledgerLens(filter);
  const unlistedRows =
    net && (lens === "all" || lens === UNLISTED_ID)
      ? unlistedLog(net.globalSnapshots, snapshotExact)
      : [];
  const [sort, setSort] = useState<{ key: AnchorLogSortKey; dir: 1 | -1 }>({ key: "age", dir: 1 });
  const allRows = sortAnchorLog(
    [...listedRows, ...unlistedRows],
    sort.key,
    sort.dir,
    (metaId) => displayNetwork(metaId)?.name ?? metaId,
  );
  // PAGINATED (user, 2026-08-14): a bottom pager strip rather than one long scroll. The page is
  // CLAMPED, never reset — the live window advances every few seconds, so page 1 churns at the
  // heartbeat's own pace and deeper pages shift only as rows age out of the window.
  const PAGE = 25;
  const [pageState, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(allRows.length / PAGE));
  const page = Math.min(pageState, pages);
  const rows = allRows.slice((page - 1) * PAGE, page * PAGE);

  // THE LAYER OPENS ON A SUBJECT: with nothing selected, the log commits its own first row on
  // arrival, so the pane opens populated instead of on an empty state the user has to dismiss by
  // guessing where to click. "Arrival" is the section EDGE, not React mount — this table stays
  // mounted (hidden, inert) while the layer is away, and it also freshly mounts when the view
  // switches to ledger with the layer already up, so the arm covers both routes. One commit per
  // arrival: a deselect while here must stay a deselect, so the arm drops after firing and only
  // a fresh arrival re-arms it. An existing selection is never overridden (`metaSnap == null`).
  const section = useStore((s) => s.section);
  const armed = useRef(false);
  useEffect(() => {
    armed.current = section === "data";
  }, [section]);
  const first = allRows[0] ?? null;
  useEffect(() => {
    if (section !== "data" || !armed.current || metaSnap || !first) return;
    armed.current = false;
    applyClickActions(
      metaSnapArrivalActions(
        { metaId: first.metaId, ordinal: first.ordinal, hash: first.hash, globalOrdinal: first.global.ordinal, ts: first.ts },
        { kind: "snapshot", title: `Global snapshot #${first.global.ordinal}`, data: first.global },
      ),
    );
    // The first row advances with the feed; only its identity matters for re-running the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, metaSnap, first?.metaId, first?.ordinal]);

  if (allRows.length === 0)
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live ? "NO SIGNAL" : "Waiting for anchored metagraph snapshots…"}
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
            // TWO selection strengths (user, 2026-08-07 — "which row did I click?"): the
            // CLICKED metagraph snapshot wears the full selection wash + the ✓; its tick-mates
            // (rows sharing the anchoring global) keep a fainter wash — honest, they anchored
            // into the selected tick. (Washes, not the SELECTED_ROW box-shadow: box-shadow
            // doesn't paint on a collapsed table row.)
            const rowSel = metaSnap?.metaId === r.metaId && metaSnap?.ordinal === r.ordinal;
            const tickMate = !rowSel && snap?.data.ordinal === r.global.ordinal;
            const commit = () =>
              applyClickActions(
                metaSnapSelectActions(
                  { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: r.global.ordinal, ts: r.ts },
                  { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global },
                  { filter, metaSnap, following },
                ),
              );
            return (
              <TableRow
                key={`${r.metaId}:${r.ordinal}`}
                className={cn(
                  "cursor-pointer text-body hover:bg-wash-faint",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                  rowSel && "bg-[var(--sel-bg)] text-foreground",
                  tickMate && "bg-wash-faint",
                )}
                // A <tr> is not natively focusable, so the row's click was mouse-only. tabIndex +
                // Enter/Space give the keyboard the same commit, and focus previews what hover
                // previews (rule 9's pairing rides both routes).
                tabIndex={0}
                // The selection follows the subject's identity (selection.tsx · selectionHue):
                // the row's wash tokens re-hue to its network; unlisted rows keep the core tone
                // their dot already wears.
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
                <TableCell className="text-right font-mono tabular-nums">{r.global.ordinal.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">{relativeAge(now - Date.parse(r.ts))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
    <TablePager
      page={page}
      pages={pages}
      from={(page - 1) * PAGE + 1}
      to={Math.min(page * PAGE, allRows.length)}
      total={allRows.length}
      onPage={setPage}
    />
    </>
  );
}
