"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent, shortHash } from "@/src/data/network";
import { buildRoster, sortRoster, type RosterRow, type RosterSortKey } from "@/src/data/roster";
import { compositionRows } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { IdentityDot, RoleChips } from "@/components/inspector/parts";
import { SelectedRowMark, selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The hyper/geo data table (spec 2026-08-01): the NODE ROSTER — a flat, sortable, denser
// projection of the same `selNodes` the explorers browse (complementary, not a replacement).
// Column order is the view's lens: geo leads with location, hyper with network/architecture.
// A row click = the explorer row click (nodeSelectActions: filter→ancestry→inspect; re-click
// deselects); it commits silently — flip the RAW switch back to see the card/camera. Row hover
// glows the node's 3D shells (hoverNodeId, outward-only — the cohort-row convention).
// ⚠️ PHONE STANDS COLUMNS DOWN, BY THE ANCHOR LOG'S OWN RULE (2026-09-02; the log's COLUMNS
// note has the full argument): measured, this table ran 1017px inside a 390px viewport — three
// of seven columns visible, the rest behind a sideways scroll, which on a roster you SCAN is
// worse than showing less of each row. What stays is what IDENTIFIES a node under the view's
// own lens — geo: where it is and which node (country, network, id — city measured 125px and is
// the country's qualifier, stated on the node card one tap away); hyper: what it is in the
// architecture (network, id, layer). Provider, co-location and the off-lens locations are facts
// ABOUT the node, stated in full on the same card. `phone` is per-view because the lens is:
// geo's layer is hyper's identity column and vice versa.
const PHONE_HIDDEN = "max-[700px]:hidden"; // one class on head + body cells, so a column can never half-hide
const COLS: Record<"hyper" | "geo", { key: RosterSortKey; label: string; phone?: false }[]> = {
  geo: [
    { key: "country", label: "Country" },
    { key: "city", label: "City", phone: false },
    { key: "isp", label: "Provider", phone: false },
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer", phone: false },
    { key: "colo", label: "Co-located", phone: false },
  ],
  hyper: [
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
    { key: "isp", label: "Provider", phone: false },
    { key: "country", label: "Country", phone: false },
    { key: "city", label: "City", phone: false },
    { key: "colo", label: "Co-located", phone: false },
  ],
};

export default function NodeRosterTable({ mode }: { mode: "hyper" | "geo" }) {
  const selNodes = useStore((s) => s.selNodes);
  const metaList = useStore((s) => s.metaList);
  const filter = useStore((s) => s.filter);
  const live = useStore((s) => s.live);
  const inspect = useStore((s) => s.inspect);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const [sort, setSort] = useState<{ key: RosterSortKey; dir: 1 | -1 }>({ key: COLS[mode][0].key, dir: 1 });
  const rows = sortRoster(buildRoster(selNodes, metaList), sort.key, sort.dir);

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
        // Phone wears the TICKER, the log's own network-column treatment: measured, the full
        // names held this column at 133px where the tick log's ticker column runs 76 — and the
        // identity dot plus ticker is the same two-part identity every row and card wears.
        return (
          <span className="flex items-center gap-2">
            {r.netId && <IdentityDot hue={filterAccent(r.netId)} />}
            {cfg ? (
              <>
                <span className="max-[700px]:hidden">{cfg.name}</span>
                <span className="min-[700px]:hidden">{cfg.ticker || cfg.name}</span>
              </>
            ) : (
              r.netId ?? "—"
            )}
          </span>
        );
      }
      case "id":
        // The SHORT hash, the explorer's `NodePickerRow` treatment (2026-08-02): the full 64-char
        // id is `whitespace-nowrap` in a table cell, so it blew the NODE column — and with it the
        // table — past the raw layer's width. The id is a reference, not a reading column; the
        // full hash stays one hover away.
        // Phone tightens the short form once more (8…6 → 6…4): still a recognizable handle —
        // the full id stays on the hover title and the node card — and the 29px it frees is what
        // keeps the four surviving columns out of sideways scroll.
        return (
          <span className="font-mono tabular-nums text-foreground-dim" title={r.node.id ?? undefined}>
            {r.node.id ? (
              <>
                <span className="max-[700px]:hidden">{shortHash(r.node.id)}</span>
                <span className="min-[700px]:hidden">{`${r.node.id.slice(0, 6)}…${r.node.id.slice(-4)}`}</span>
              </>
            ) : (
              r.node.label
            )}
          </span>
        );
      case "layer": {
        // The shared composition vocabulary (the node card's subtitle idiom): the make-up word
        // plus its layer codes as pills — never a raw role array.
        const comp = compositionRows([{ roles: r.node.roles, layer: r.node.layer }])[0];
        // The chips stand down on phone (the word stays): the make-up word is the summary this
        // column exists to say, the codes are its detail — and at 150px the pair was the widest
        // cell in hyper's phone roster. Never the inverse: codes without the word would be the
        // raw role array this column's convention exists to prevent.
        return comp ? (
          <span className="flex items-center gap-2">
            {comp.label}
            <span className="max-[700px]:hidden"><RoleChips codes={comp.codes} /></span>
          </span>
        ) : (
          "—"
        );
      }
      case "country":
        return r.node.country || "—";
      case "city":
        return r.node.city ?? "—";
      case "isp":
        return r.isp ? `${r.isp}${r.asn ? ` · ${r.asn}` : ""}` : "—";
      case "colo":
        // CO-LOCATION (user, 2026-08-16): the machine's other tenant networks — rare (2
        // machines today), so the column reads as dashes with the exceptions standing out;
        // sorting it ascending gathers them at the top (nulls sort last).
        return r.colo ?? "—";
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md">
          <TableRow className="border-border">
            {COLS[mode].map((c) => (
              <TableHead
                key={c.key}
                className={cn(c.phone === false && PHONE_HIDDEN)}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                <button
                  type="button"
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
            const commit = () =>
              applyClickActions(nodeSelectActions(r.node.pick, { mode, currentFilter: filter, deselect: selected }));
            return (
              <TableRow
                key={r.key}
                // The committed-selection language, bent to a table: the `--sel-bg` wash + the
                // shared ✓ mark. (SELECTED_ROW's box-shadow ring is skipped on purpose — a
                // box-shadow doesn't paint on a border-collapsed table row.)
                className={cn(
                  "cursor-pointer text-body hover:bg-wash-faint",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                  selected && "bg-[var(--sel-bg)] text-foreground",
                )}
                // A <tr> is not natively focusable — tabIndex + Enter/Space give the keyboard the
                // same commit the click makes, and focus previews what hover previews.
                tabIndex={0}
                // The selection follows the subject's identity (selection.tsx · selectionHue).
                style={selected && r.netId ? selectionHue(filterAccent(r.netId)) : undefined}
                onMouseEnter={() => r.node.id && setHoverNodeId(r.node.id)}
                onMouseLeave={() => setHoverNodeId(null)}
                onFocus={() => r.node.id && setHoverNodeId(r.node.id)}
                onBlur={() => setHoverNodeId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); // Space must not scroll the pane
                    commit();
                  }
                }}
                onClick={commit}
              >
                {COLS[mode].map((c) => (
                  <TableCell key={c.key} className={cn(c.phone === false && PHONE_HIDDEN)}>{cell(r, c.key)}</TableCell>
                ))}
                <TableCell className="w-7">{selected && <SelectedRowMark hue={r.netId ? filterAccent(r.netId) : undefined} />}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
