"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent } from "@/src/data/network";
import { buildRoster, sortRoster, type RosterRow, type RosterSortKey } from "@/src/data/roster";
import { compositionRows } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { ccToFlag } from "@/src/util/format";
import { IdentityDot, RoleChips } from "@/components/inspector/parts";
import { SelectedRowMark } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The hyper/geo data table (spec 2026-08-01): the NODE ROSTER — a flat, sortable, denser
// projection of the same `selNodes` the explorers browse (complementary, not a replacement).
// Column order is the view's lens: geo leads with location, hyper with network/architecture.
// A row click = the explorer row click (nodeSelectActions: filter→ancestry→inspect; re-click
// deselects); it commits silently — the user drags back up to see the card/camera. Row hover
// glows the node's 3D shells (hoverNodeId, outward-only — the cohort-row convention).
const COLS: Record<"hyper" | "geo", { key: RosterSortKey; label: string }[]> = {
  geo: [
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
    { key: "isp", label: "Provider" },
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
  ],
  hyper: [
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
    { key: "isp", label: "Provider" },
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
  ],
};

export default function NodeRosterTable({ mode }: { mode: "hyper" | "geo" }) {
  const selNodes = useStore((s) => s.selNodes);
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const inspect = useStore((s) => s.inspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const [sort, setSort] = useState<{ key: RosterSortKey; dir: 1 | -1 }>({ key: COLS[mode][0].key, dir: 1 });
  const rows = sortRoster(buildRoster(selNodes), sort.key, sort.dir);

  if (rows.length === 0) {
    const cfg = metagraphById(filter);
    return (
      <p className="m-auto text-label text-muted-foreground">
        {!live ? "NO SIGNAL" : cfg ? `${cfg.name} has no locatable nodes.` : "Acquiring nodes…"}
      </p>
    );
  }

  const cell = (r: RosterRow, key: RosterSortKey) => {
    switch (key) {
      case "net": {
        const cfg = r.netId ? metagraphById(r.netId) : null;
        return (
          <span className="flex items-center gap-2">
            {r.netId && <IdentityDot hue={filterAccent(r.netId)} />}
            {cfg?.name ?? r.netId ?? "—"}
          </span>
        );
      }
      case "id":
        return <span className="font-mono text-foreground-dim">{r.node.id ?? r.node.label}</span>;
      case "layer": {
        // The shared composition vocabulary (the node card's subtitle idiom): the make-up word
        // plus its layer codes as pills — never a raw role array.
        const comp = compositionRows([{ roles: r.node.roles, layer: r.node.layer }])[0];
        return comp ? (
          <span className="flex items-center gap-2">
            {comp.label}
            <RoleChips codes={comp.codes} />
          </span>
        ) : (
          "—"
        );
      }
      case "country":
        return r.node.country ? `${ccToFlag(r.node.cc)} ${r.node.country}` : "—";
      case "city":
        return r.node.city ?? "—";
      case "isp":
        return r.isp ? `${r.isp}${r.asn ? ` · ${r.asn}` : ""}` : "—";
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="border-border">
            {COLS[mode].map((c) => (
              <TableHead
                key={c.key}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                <button
                  className="flex items-center gap-1 text-micro uppercase tracking-caps text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}
                >
                  {c.label}
                  {sort.key === c.key &&
                    (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                </button>
              </TableHead>
            ))}
            {/* Reserved trailing slot for the selection ✓ — so columns never shift. */}
            <TableHead className="w-7" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const key = hoverKeyOf(r.node.pick);
            const selected = key != null && hoverKeyOf(inspect) === key;
            return (
              <TableRow
                key={r.key}
                // The committed-selection language, bent to a table: the `--sel-bg` wash + the
                // shared ✓ mark. (SELECTED_ROW's box-shadow ring is skipped on purpose — a
                // box-shadow doesn't paint on a border-collapsed table row.)
                className={cn(
                  "cursor-pointer text-body hover:bg-wash-faint",
                  selected && "bg-[var(--sel-bg)] text-foreground",
                )}
                onMouseEnter={() => r.node.id && setHoverNodeId(r.node.id)}
                onMouseLeave={() => setHoverNodeId(null)}
                onClick={() =>
                  applyClickActions(nodeSelectActions(r.node.pick, { mode, currentFilter: filter, deselect: selected }))
                }
              >
                {COLS[mode].map((c) => (
                  <TableCell key={c.key}>{cell(r, c.key)}</TableCell>
                ))}
                <TableCell className="w-7">{selected && <SelectedRowMark />}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
