"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useStore } from "@/src/store/store";
import { metagraphById, filterAccent, shortHash } from "@/src/data/network";
import { buildRoster, sortRoster, type RosterRow, type RosterSortKey } from "@/src/data/roster";
import { compositionRows } from "@/src/data/composition";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { nodeSelectActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { IdentityDot, QualifierChip, RoleChips } from "@/components/inspector/parts";
import { COUNTRY_ICON, PROVIDER_ICON } from "@/components/icons";
import { tickerOf } from "@/components/explorer/nodeRow";
import { SelectedRowMark, selectionHue } from "@/components/selection";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The hyper/geo data table (spec 2026-08-01): the NODE ROSTER — a flat, sortable, denser
// projection of the same `selNodes` the explorers browse (complementary, not a replacement).
// Column order is the view's lens: geo leads with location, hyper with network/architecture.
// A row click commits the NODE (nodeSelectActions: ancestry→inspect; re-click deselects) and
// NEVER the filter, in any view (user, 2026-09-29) — the top bar is where a network is committed;
// it commits silently — flip the RAW switch back to see the card/camera. Row hover
// glows the node's 3D shells (hoverNodeId, outward-only — the cohort-row convention).
// ⚠️ PHONE STANDS COLUMNS DOWN, BY THE ANCHOR LOG'S OWN RULE (2026-09-02; the log's COLUMNS
// note has the full argument): measured, this table ran 1017px inside a 390px viewport — three
// of seven columns visible, the rest behind a sideways scroll, which on a roster you SCAN is
// worse than showing less of each row. What stays is what IDENTIFIES a node under the view's
// own lens — geo: where it is and which node (country, network, id — city measured 125px and is
// the country's qualifier, stated on the node card one tap away); hyper: what it is in the
// architecture (network, id, layer). Provider and the off-lens locations are facts
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
  ],
  hyper: [
    { key: "net", label: "Network" },
    { key: "id", label: "Node" },
    { key: "layer", label: "Layer" },
    { key: "isp", label: "Provider", phone: false },
    { key: "country", label: "Country", phone: false },
    { key: "city", label: "City", phone: false },
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
      case "net":
        // EVERY NETWORK ON THE MACHINE, EACH AS ITS DOT AND TICKER (user, 2026-09-29: "just show
        // both tickers, so DAG and UP, both with their coloured bullet, consistently") — the anchor
        // log's own network-column treatment, so a single-network row reads "● DOR" and a
        // co-located one "● UP ● DAG", primary first. The full names ride the hover.
        return (
          <span
            className="flex items-center gap-3"
            title={r.nets.map((id) => metagraphById(id)?.name ?? (id === "dag" ? "DAG" : id)).join(" + ")}
          >
            {r.nets.length === 0
              ? "—"
              : r.nets.map((id) => (
                  <span key={id} className="inline-flex items-center gap-2">
                    <IdentityDot hue={filterAccent(id)} />
                    {tickerOf(id)}
                  </span>
                ))}
          </span>
        );
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
            {/* A machine that reports a different id to each network it serves: the rest are
                counted, never dropped (the full list rides the title). */}
            {r.ids.length > 1 && <span className="ml-1.5 text-muted-foreground" title={r.ids.join("\n")}>+{r.ids.length - 1}</span>}
          </span>
        );
      case "layer": {
        // The shared composition vocabulary (the node card's subtitle idiom): the make-up word
        // plus its layer codes as pills — never a raw role array.
        // The MACHINE's roles — the union across its merged records, so a machine serving two
        // networks states everything it runs.
        const comp = compositionRows([{ roles: r.roles, layer: r.node.layer }])[0];
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
        return r.isp ? `${r.isp}${r.asn ? ` (${r.asn})` : ""}` : "—";
    }
  };

  return (
    // `max-[700px]:mt-8`: the phone list has no header row, which is what used to sit beside the
    // panel's × — without the room the close mark covered the first row's right end.
    <>
    {/* THE PHONE LIST NAMES ITSELF (user, 2026-10-07 — option B): the table has no header row on a
        phone, which left the panel's × alone on an empty line. That line now says what the list is
        and how many, with the × at its end. */}
    <p className="min-[700px]:hidden m-0 h-9 flex items-center gap-2 pr-10 border-b border-border text-body">
      <span className="font-medium text-foreground">Nodes</span>
      <span className="tabular-nums text-muted-foreground">{rows.length}</span>
    </p>
    <ScrollArea className="flex-1 min-h-0">
      <Table className="max-[700px]:block max-[700px]:[&_tbody]:block max-[700px]:[&_tr]:grid">
        <TableHeader className="sticky top-0 z-10 bg-[var(--panel-solid)] backdrop-blur-md max-[700px]:hidden">
          <TableRow className="border-border">
            {COLS[mode].map((c) => (
              <TableHead
                key={c.key}
                className={cn(c.phone === false && PHONE_HIDDEN)}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 text-label uppercase tracking-caps text-muted-foreground hover:text-foreground cursor-pointer"
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
            // A MERGED row is selected when ANY of its records is (a DAG bead committed in the scene
            // is this row as much as the metagraph record leading it), and its click then acts on
            // THAT record — so the re-click deselects what is committed rather than committing the
            // primary on top of it.
            const inspected = hoverKeyOf(inspect);
            const hit = inspected == null ? undefined : r.recs.find((x) => hoverKeyOf(x.pick) === inspected);
            const selected = hit != null;
            const commit = () =>
              applyClickActions(nodeSelectActions((hit ?? r.node).pick, { mode, currentFilter: filter, deselect: selected, commitNetwork: false }));
            return (
              <TableRow
                key={r.key}
                // The committed-selection language, bent to a table: the `--sel-bg` wash + the
                // shared ✓ mark. (SELECTED_ROW's box-shadow ring is skipped on purpose — a
                // box-shadow doesn't paint on a border-collapsed table row.)
                // Hover in the node's network hue (user, 2026-09-26) — the anchor log's recipe.
                className={cn(
                  "cursor-pointer text-body hover:bg-[color-mix(in_oklch,var(--row-hue,var(--primary))_12%,transparent)]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-[-2px]",
                  selected && "bg-[var(--sel-bg)] text-foreground",
                )}
                // A <tr> is not natively focusable — tabIndex + Enter/Space give the keyboard the
                // same commit the click makes, and focus previews what hover previews.
                tabIndex={0}
                // The selection follows the subject's identity (selection.tsx · selectionHue).
                style={{
                  ...(r.netId ? { "--row-hue": filterAccent(r.netId) } : {}),
                  ...(selected && r.netId ? selectionHue(filterAccent(r.netId)) : {}),
                } as CSSProperties}
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
                  <TableCell key={c.key} className={PHONE_HIDDEN}>{cell(r, c.key)}</TableCell>
                ))}
                <TableCell className={cn("w-7", PHONE_HIDDEN)}>{selected && <SelectedRowMark hue={r.netId ? filterAccent(r.netId) : undefined} />}</TableCell>
                {/* ONE FACT PER LINE ON PHONE (user, 2026-10-07 — the raw phone pass: "1 per row
                    looks clean, keep the tag also", then "add the icon to each"). The first line is
                    WHO — network, node id, and the make-up as the head's own qualifier chip — and
                    each fact below takes a line of its own, led by the kind mark the cards use for
                    it (the country pin, the provider rack). Nothing to separate, so no mid-dot and
                    no wrapping run of three facts; nothing stands down. */}
                <TableCell className="min-[700px]:hidden pb-0.5">
                  <span className="flex items-center gap-3">
                    {cell(r, "net")}
                    {cell(r, "id")}
                    <span className="ml-auto flex items-center gap-2">
                      {(() => {
                        const comp = compositionRows([{ roles: r.roles, layer: r.node.layer }])[0];
                        return comp ? <QualifierChip>{comp.label}</QualifierChip> : null;
                      })()}
                      <span className="inline-flex w-3.5 flex-none">{selected && <SelectedRowMark hue={r.netId ? filterAccent(r.netId) : undefined} />}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="min-[700px]:hidden pt-0 pb-2 text-label whitespace-normal">
                  {(() => {
                    const place = [r.node.city, r.node.country].filter(Boolean).join(", ");
                    const line = (Icon: LucideIcon, text: string, ink: string) => (
                      <span className={cn("flex items-center gap-1.5 min-w-0", ink)}>
                        <Icon aria-hidden className="size-3 flex-none opacity-70" />
                        <span className="truncate">{text}</span>
                      </span>
                    );
                    return (
                      <span className="flex flex-col gap-0.5">
                        {line(COUNTRY_ICON, place || "Unlocated", "text-muted-foreground")}
                        {/* ONE INK for both facts, the darker one (user, 2026-10-07): they are peers, told apart by
                            their marks, not ranked by a colour step. */}
                        {line(PROVIDER_ICON, r.isp ?? "Unknown provider", "text-muted-foreground")}
                      </span>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
    </>
  );
}
