"use client";
// The raw layer's half of the two-step disclosure (spec §7.3): the CARD states the shape of a
// metagraph's application state, and this renders the payload — one level down, on a second
// deliberate gesture, because one anchoring channel publishes personal records and a payload should
// never appear just because a tile was clicked. Since the master-detail split (item 9, 2026-08-06)
// it is the raw layer's RIGHT pane: the anchor log on the left is the index, this is the selected
// snapshot's contents, rendered through the bespoke JsonTree instead of a flat text dump.
import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import { metagraphById, shortHash } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { IdentityDot } from "@/components/inspector/parts";
import { fmtDag, fmtKB } from "@/src/util/format";
import JsonTree from "@/components/datasection/JsonTree";

export function ChannelStatePanel() {
  const sel = useStore((s) => s.metaSnap);
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId)] : undefined));
  const following = useStore((s) => s.following);

  const state = useMemo(() => {
    if (!deep?.state) return null;
    try {
      return JSON.parse(deep.state) as unknown;
    } catch {
      return deep.state; // undecodable → the raw string, rendered as one value
    }
  }, [deep]);

  if (!sel) {
    return (
      <p className="m-auto max-w-[26ch] text-center text-label text-muted-foreground">
        Select a metagraph snapshot — a row in the log, or a tile in the chamber — to read its contents here.
      </p>
    );
  }
  const cfg = metagraphById(sel.metaId);
  const ticker = cfg?.ticker || cfg?.name || shortHash(sel.metaId);
  const hue = identityHudHex(sel.metaId);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* The pane's subject head — same grammar as a card head: eyebrow + identity + ordinal. */}
      <div className="flex flex-col gap-1 flex-none">
        <span className="text-micro tracking-caps uppercase text-muted-foreground">Metagraph snapshot</span>
        <span className="flex items-center gap-2 text-title font-semibold text-foreground">
          <IdentityDot hue={hue} />
          {ticker} <span className="tabular-nums">#{sel.ordinal.toLocaleString()}</span>
        </span>
      </div>

      {!deep ? (
        // While FOLLOWING, the heavy per-snapshot decode is deliberately not fetched (the card
        // advances every tick — that would be a poll of the explicit-gesture-only route). Say
        // so honestly instead of pretending to read (user, 2026-08-07: "why can't I see the
        // contents?" — the answer must be on the instrument, not in the docs).
        <p className="text-label text-muted-foreground">
          {following ? "following live — pin this snapshot to decode its state" : "reading…"}
        </p>
      ) : (
        <>
          {/* The snapshot's own structure facts, straight off the deep read. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-none text-body">
            <span className="text-muted-foreground">Height</span>
            <span className="text-right tabular-nums">{deep.height.toLocaleString()} · {deep.subHeight.toLocaleString()}</span>
            <span className="text-muted-foreground">Parent</span>
            <span className="text-right font-mono" title={deep.lastSnapshotHash}>{shortHash(deep.lastSnapshotHash)}</span>
            <span className="text-muted-foreground">Fee</span>
            <span className="text-right tabular-nums">{fmtDag(deep.fee)} DAG</span>
            <span className="text-muted-foreground">Size</span>
            <span className="text-right tabular-nums">{fmtKB(deep.bytes / 1024)}</span>
            <span className="text-muted-foreground">Signed by</span>
            <span className="text-right tabular-nums">{deep.signers.length} validators</span>
          </div>

          {deep.stateKeys.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-micro uppercase tracking-caps text-muted-foreground font-normal">State key</TableHead>
                  <TableHead className="text-micro uppercase tracking-caps text-muted-foreground font-normal text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deep.stateKeys.map((k) => (
                  <TableRow key={k.key}>
                    <TableCell>{k.key}</TableCell>
                    <TableCell className="text-right tabular-nums">{k.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="flex-none text-micro tracking-caps text-muted-foreground">
            state {(deep.stateBytes / 1024).toFixed(1)} KB
            {deep.stateProof ? ` · proof ${shortHash(deep.stateProof)}` : ""}
          </p>

          {/* The payload itself — the second deliberate gesture's reward. */}
          {state != null && (
            <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-border/50 bg-wash-faint p-2">
              <JsonTree data={state} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
