"use client";

import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork } from "@/src/data/network";
import { buildAnchorLog } from "@/src/data/anchorLog";
import { displayNetwork, unlistedLog, UNLISTED_ID } from "@/src/data/unlisted";
import { metaSnapSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { IdentityDot } from "@/components/inspector/parts";
import { SelectedRowMark } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POLL } from "@/src/engine/config";

// The retained global window the log joins against — the same buffer the strip's bars plot,
// one row per anchored metagraph snapshot inside it.
const MAX = POLL.maxSnapshots;

// The ledger data table (spec 2026-08-01): the per-metagraph ANCHOR LOG — one row per anchored
// metagraph snapshot in the retained window, finer-grained than the strip's per-tick bars.
// Chronological by construction (newest tick first) — no sortable headers here; the roster
// table is the sortable one. A row click names its own METAGRAPH SNAPSHOT — the same subject a
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
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const net = getNetwork();
  // Rebuilt per render on purpose: renders here are event-driven (a tick / an anchor fill every
  // few seconds), and the buffers mutate in place, so a memo key would go stale, not save work.
  // The UNLISTED channels join from the exact reads (2026-08-07 — the polled buffers only track
  // the catalog, so under the "unlisted" filter the listed builder is empty by construction and
  // these rows ARE the table; under "all" they complete it).
  const snapshotExact = useStore((s) => s.snapshotExact);
  const listedRows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];
  const unlistedRows =
    net && (filter === "all" || filter === UNLISTED_ID)
      ? unlistedLog(net.globalSnapshots, snapshotExact)
      : [];
  const rows = [...listedRows, ...unlistedRows].sort((a, b) =>
    a.ts === b.ts ? b.ordinal - a.ordinal : a.ts < b.ts ? 1 : -1,
  );

  if (rows.length === 0)
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live
          ? "NO SIGNAL"
          : filter === "dag"
            ? "The DAG core anchors nothing — it IS the anchor. Pick a metagraph, or All."
            : "Waiting for anchored metagraph snapshots…"}
      </p>
    );

  const now = Date.now();

  return (
    <ScrollArea className="flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="border-border">
            {["Network", "Snapshot", "Fee (DAG)", "Size", "Anchored into", "Age"].map((label, i) => (
              <TableHead
                key={label}
                className={cn("text-micro uppercase tracking-caps text-muted-foreground font-normal", i >= 2 && "text-right")}
              >
                {label}
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
            return (
              <TableRow
                key={`${r.metaId}:${r.ordinal}`}
                className={cn(
                  "cursor-pointer text-body hover:bg-wash-faint",
                  rowSel && "bg-[var(--sel-bg)] text-foreground",
                  tickMate && "bg-wash-faint",
                )}
                onMouseEnter={() => setHoverSnapOrd(r.global.ordinal)}
                onMouseLeave={() => setHoverSnapOrd(null)}
                onClick={() =>
                  applyClickActions(
                    metaSnapSelectActions(
                      { metaId: r.metaId, ordinal: r.ordinal, hash: r.hash, globalOrdinal: r.global.ordinal, ts: r.ts },
                      { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global },
                      { filter, metaSnap, following },
                    ),
                  )
                }
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
                    <span className="inline-flex w-3.5 flex-none">{rowSel && <SelectedRowMark />}</span>
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
  );
}
