"use client";
// The raw layer's half of the two-step disclosure (spec §7.3): the CARD states the shape of a
// metagraph's application state, and this renders the payload — one level down, on a second
// deliberate gesture, because one anchoring channel publishes personal records and a payload should
// never appear just because a tile was clicked.
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import { metagraphById, shortHash } from "@/src/data/network";

export function ChannelStatePanel() {
  const sel = useStore((s) => s.metaSnap);
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)] : undefined));

  const pretty = useMemo(() => {
    if (!deep?.state) return null;
    try {
      return JSON.stringify(JSON.parse(deep.state), null, 2);
    } catch {
      return deep.state;
    }
  }, [deep]);

  if (!sel) {
    return <p className="text-label text-muted-foreground">Select a metagraph snapshot to read its application state.</p>;
  }
  const cfg = metagraphById(sel.metaId);
  const ticker = cfg?.ticker || cfg?.name || shortHash(sel.metaId);
  if (!deep) {
    return (
      <p className="text-label text-muted-foreground">
        {ticker} #{sel.ordinal.toLocaleString()} · reading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>KEY</TableHead>
            <TableHead>RECORDS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deep.stateKeys.map((k) => (
            <TableRow key={k.key}>
              <TableCell>{k.key}</TableCell>
              <TableCell>{k.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-micro tracking-caps text-muted-foreground">
        {ticker} #{deep.ordinal} · {(deep.stateBytes / 1024).toFixed(1)} KB
        {deep.stateProof ? ` · proof ${shortHash(deep.stateProof)}` : ""}
      </p>
      <ScrollArea className="max-h-[45vh]">
        <pre className="text-body font-mono whitespace-pre">{pretty}</pre>
      </ScrollArea>
    </div>
  );
}
