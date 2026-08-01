"use client";

import { useStore } from "@/src/store/store";
import { useSnapshotFeed } from "@/components/useSnapshotFeed";
import { getNetwork, metagraphById, filterAccent } from "@/src/data/network";
import { buildAnchorLog } from "@/src/data/anchorLog";
import { latestRelevant } from "@/src/data/follow";
import { snapshotSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { IdentityDot } from "@/components/inspector/parts";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Matches VIS/POLL.maxSnapshots (the retained global window the log joins against) — the same
// buffer the strip's bars plot, one row per anchored metagraph snapshot inside it.
const MAX = 52;

// The ledger data table (spec 2026-08-01): the per-metagraph ANCHOR LOG — one row per anchored
// metagraph snapshot in the retained window, finer-grained than the strip's per-tick bars.
// Chronological by construction (newest tick first) — no sortable headers here; the roster
// table is the sortable one. A row click selects the GLOBAL snapshot the row anchored into
// (the metagraph snapshot itself is not a selectable subject) through the SAME tested builder
// as a bar/tile click; selection happens silently — the user drags back up to see the card.
export default function AnchorLogTable() {
  useSnapshotFeed(MAX); // re-render driver: global + anchor events (the buffers below refresh)
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const snap = useStore((s) => s.snap);
  const setHoverSnapOrd = useStore((s) => s.setHoverSnapOrd);
  const net = getNetwork();
  // Rebuilt per render on purpose: renders here are event-driven (a tick / an anchor fill every
  // few seconds), and the buffers mutate in place, so a memo key would go stale, not save work.
  const rows = net ? buildAnchorLog(net.metaSnaps, net.globalSnapshots, filter) : [];

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

  // The live tip (re-)follows the heartbeat on click; anything older pins — the exact semantics
  // of a strip bar / a 3D tile, because it is the same builder.
  const liveOrd = latestRelevant("all")?.ordinal ?? null;
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
            const cfg = metagraphById(r.metaId);
            // Several rows can share one anchoring global — they ALL wash when it's selected.
            // Honest: they anchored into the selected snapshot. (The wash alone, not the
            // SELECTED_ROW box-shadow: box-shadow doesn't paint on a collapsed table row.)
            const selected = snap?.data.ordinal === r.global.ordinal;
            return (
              <TableRow
                key={`${r.metaId}:${r.ordinal}`}
                className={cn(
                  "cursor-pointer text-body hover:bg-wash-faint",
                  selected && "bg-[var(--sel-bg)] text-foreground",
                )}
                onMouseEnter={() => setHoverSnapOrd(r.global.ordinal)}
                onMouseLeave={() => setHoverSnapOrd(null)}
                onClick={() =>
                  applyClickActions(
                    snapshotSelectActions(
                      { kind: "snapshot", title: `Global snapshot #${r.global.ordinal}`, data: r.global },
                      liveOrd === r.global.ordinal,
                    ),
                  )
                }
              >
                <TableCell>
                  <span className="flex items-center gap-2">
                    <IdentityDot hue={filterAccent(r.metaId)} />
                    {cfg?.name ?? r.metaId}
                  </span>
                </TableCell>
                <TableCell className="font-mono tabular-nums text-foreground-dim">{r.ordinal.toLocaleString()}</TableCell>
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
