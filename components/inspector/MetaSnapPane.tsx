"use client";
// The METAGRAPH SNAPSHOT card (spec §7) — the tile on the ledger's upper floor as a subject.
// Three TIERS of fact, each honest about where it came from: tier 1 is free from the 4-second
// poll (it named the tile in the first place), tier 2 arrives with the tick's exact read, tier 3
// is the application state — disclosed as a SHAPE here and as a payload in the raw layer.
// Like the global snapshot card this is a card SLOT, not a focus-ladder rung: it has its own
// store channel (`store.metaSnap`) and a fixed rail slot, and appears in no ladder.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import CardHead, { RailPane } from "@/components/CardHead";
import { IdentityDot } from "@/components/inspector/parts";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import type { NodeRow } from "@/src/data/types";
import { getNetwork, matchSignerRow, metagraphById, shortHash } from "@/src/data/network";
import { UNLISTED_HUE } from "@/src/data/unlisted";
import { snapsAtTick } from "@/src/data/anchorLog";
import { fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { useMinHold } from "@/components/useMinHold";
import { useNowTick } from "@/components/useNowTick";
import { subjectPairing } from "@/components/useSubjectPairing";
import { hoverKeyOf } from "@/src/data/hoverSubject";
import { identityHudHex } from "@/src/palette/identity";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { METASNAP_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { followToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { cn } from "@/lib/utils";

// The two body-row shapes the house already uses, side by side because this card carries both
// kinds of fact: a measured NUMBER reads label-left/value-right (CountryCard/LayerCard), a
// REFERENCE reads label-above/value-below with the full value on hover (the node card's id row).
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2.5">
      <span className="text-body text-muted-foreground">{label}</span>
      <span className="text-body text-foreground tabular-nums">{children}</span>
    </div>
  );
}
function HashFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground">{label}</span>
      <div className="font-mono tabular-nums text-label text-foreground-dim mt-0.5" title={value}>
        {shortHash(value)}
      </div>
    </div>
  );
}

export default function MetaSnapPane({
  onClose,
  collapsed,
  onToggle,
}: {
  onClose: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const sel = useStore((s) => s.metaSnap);
  const exact = useStore((s) => (sel ? s.snapshotExact[sel.globalOrdinal] : undefined));
  const deep = useStore((s) => (sel ? s.metaSnapDeep[metaSnapDeepKey(sel.globalOrdinal, sel.metaId, sel.ordinal)] : undefined));
  const following = useStore((s) => s.following);
  const snap = useStore((s) => s.snap);
  const setSection = useStore((s) => s.setSection);
  // Spec §5.3's pairing runs on the EXISTING node-hover channel — a hover, never a selection, so
  // this card stays outside the one-selection-write-path rule.
  const hoverNodeId = useStore((s) => s.hoverNodeId);
  const setHoverNodeId = useStore((s) => s.setHoverNodeId);
  const selNodes = useStore((s) => s.selNodes);

  // Tier 1 — the polled record this tile was named from (free: the metagraph snapshot buffers
  // are already in memory, keyed by the anchoring tick's timestamp).
  const polled = useMemo(() => {
    if (!sel) return null;
    const net = getNetwork();
    if (!net) return null;
    return snapsAtTick(net.metaSnaps, sel.metaId, sel.ts).find((r) => r.ordinal === sel.ordinal) ?? null;
  }, [sel]);

  // Tier 2 — this snapshot's own row inside the tick's exact read.
  const row = useMemo(() => {
    if (!sel || !exact) return null;
    // A row the quick decoder couldn't read carries ordinal 0 — fall back to the address match
    // so the card still finds it (2026-08-07: the miss hid the whole exact tier and the state
    // invitation for snapshots whose deep decode worked fine).
    return (
      exact.rows.find((r) => r.metaId === sel.metaId && r.ordinal === sel.ordinal) ??
      exact.rows.find((r) => r.metaId === sel.metaId && r.ordinal === 0) ??
      null
    );
  }, [sel, exact]);
  const reading = useMinHold(!!sel && !row);
  // The pinned decode's give-up timer (2026-08-08, review fix): a 404'd/pruned deep read left
  // "decoding…" forever — after a patient window the instrument states the honest terminal.
  const [decodeGaveUp, setDecodeGaveUp] = useState(false);
  useEffect(() => {
    setDecodeGaveUp(false);
    if (!sel || following || deep) return;
    const t = setTimeout(() => setDecodeGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [sel, following, deep]);

  // The signers, deep read first (it re-reads the same proofs straight off the channel, so it wins
  // when it lands) — but the tick's exact read already carries them, so the rows never wait on it.
  const signers = deep?.signers ?? row?.signers ?? null;

  const pulseKey = useEdgePulse(sel ? `${sel.metaId}:${sel.ordinal}` : null);
  // The metagraph snapshot is exactly as LIVE as the global while following (advanceMetaSnap
  // rides the same heartbeat), so its aside speaks the SAME language as SnapshotAside: beating
  // dot + a ticking `live · Xs ago` counter, tap-to-toggle through the same tested follow table.
  const now = useNowTick(1000);

  if (!sel) return null;
  const cfg = metagraphById(sel.metaId);
  // An UNLISTED metagraph has no config row — its address is the only name it has, and its hue
  // is the unlisted set's NEUTRAL gray (2026-08-08: hashing the address through the identity
  // palette minted a random hue per channel — pink icons for a set that deliberately has no
  // identity of its own).
  const ticker = cfg?.ticker || cfg?.name || shortHash(sel.metaId);
  const hue = cfg ? identityHudHex(sel.metaId) : UNLISTED_HUE;
  const rel = relativeAge(now - Date.parse(sel.ts));
  const asideCls = "inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap";
  const aside = (
    <button
      type="button"
      aria-pressed={following}
      title={following ? "Stop following the live snapshot" : "Follow the live snapshot"}
      className={cn(asideCls, "rounded-xs hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60")}
      onClick={() => snap && applyClickActions(followToggleActions(snap, following))}
    >
      {following ? (
        <>
          <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
          {rel ? `live · ${rel}` : "live"}
        </>
      ) : (
        <>◷ {rel}</>
      )}
    </button>
  );

  return (
    <RailPane entry={collapsed}>
      <CardHead
          eyebrow="Metagraph snapshot"
          title={
            <span className="inline-flex items-center gap-2 min-w-0">
              {/* A subject-specific mark carries its OWN subject's hue (the node-mark idiom) —
                  this card is about one metagraph even when the filter is "all". */}
              <METASNAP_ICON aria-hidden className={KIND_MARK_CLASS} style={{ color: hue } as CSSProperties} />
              <span className="truncate">#{sel.ordinal.toLocaleString()}</span>
            </span>
          }
          titleKey={`${sel.metaId}:${sel.ordinal}`}
          aside={aside}
          onClose={onClose}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && (
          <div className="flex flex-col gap-2">
            {/* ── Tier 1: free from the poll ─────────────────────────────────────────────── */}
            <Fact label="Network">
              <span className="inline-flex items-center gap-1.5">
                <IdentityDot hue={hue} />
                {ticker}
              </span>
            </Fact>
            <Fact label="Anchored into">#{sel.globalOrdinal.toLocaleString()}</Fact>
            {polled && (
              <Fact label="Height">
                {polled.height} · {polled.subHeight}
              </Fact>
            )}
            {polled && <Fact label="Blocks">{polled.blocks}</Fact>}

            {/* ── Tier 2: the tick's exact read ──────────────────────────────────────────── */}
            {row ? (
              <>
                <Fact label="Fee">{fmtDag(row.fee)} DAG</Fact>
                <Fact label="Size">{fmtKB(row.bytes / 1024)}</Fact>
                <Fact label="Signed by">{signers?.length ?? 0} validators</Fact>
                {signers && signers.length > 0 && (
                  <SignerRows
                    ids={signers}
                    metaId={sel.metaId}
                    selNodes={selNodes}
                    hue={hue}
                    hoverNodeId={hoverNodeId}
                    setHoverNodeId={setHoverNodeId}
                  />
                )}
              </>
            ) : reading.show ? (
              <Fact label="Exact read">
                <span className={cn(reading.fading && "animate-hold-fade-out motion-reduce:animate-none")}>reading…</span>
              </Fact>
            ) : (
              // The L0 node prunes after ~30 minutes; an old tick keeps its polled facts and says so.
              <Fact label="Exact read">unavailable — tick pruned</Fact>
            )}

            {/* ── Tier 3: the application state — ONE RULE (user, 2026-08-07: DED's empty
                state hid the invitation while the raw layer rendered the decoded shape; the
                two surfaces must apply one standard): if the payload DECODED, the tier shows
                and the invitation stands — an empty state says "empty" honestly instead of
                hiding. Both routes share one decoder, so decoded-ness itself can't disagree;
                a genuinely unreadable payload says so (and "decoding…" while the pin's full
                unpack is in flight). ── */}
            {(() => {
              const decodedOk = deep != null || row?.decoded === true;
              if (!decodedOk) {
                if (row == null) return null; // no exact row yet — tier 2's reading state covers it
                return (
                  <Fact label="State">
                    <span className="text-muted-foreground italic">
                      {following ? "undecodable payload" : decodeGaveUp ? "decode unavailable — tick pruned" : "decoding…"}
                    </span>
                  </Fact>
                );
              }
              const stateBytes = deep ? deep.stateBytes : (row?.stateBytes ?? 0);
              const empty = deep ? !deep.stateKeys.some((k) => k.count > 0) : !row?.hasState;
              return (
                <>
                  {empty ? (
                    <Fact label="State">
                      <span className="text-muted-foreground italic">empty</span>
                    </Fact>
                  ) : (
                    stateBytes > 0 && <Fact label="State">{fmtKB(stateBytes / 1024)}</Fact>
                  )}
                  {deep && deep.stateKeys.length > 0 && (
                    <Fact label="State records">{deep.stateKeys.map((k) => `${k.key} ${k.count}`).join(" · ")}</Fact>
                  )}
                  {/* The deep decode is pin-gated while following (the live card advances every
                      tick — fetching it would poll the heavy route). Honest hint in place. */}
                  {!deep && following && (
                    <Fact label="State records">
                      <span className="text-muted-foreground italic">pin to decode</span>
                    </Fact>
                  )}
                  {/* The data TRANSACTIONS are a data metagraph's real payload (batch
                      commitments etc. — DED's fingerprint batches ride here while its state
                      stays empty; 2026-08-07). */}
                  {deep && deep.dataTxCount > 0 && (
                    <Fact label="Data updates">{deep.dataTxCount}</Fact>
                  )}
                  {deep && deep.dataBlockSigners.length > 0 && (
                    <Fact label="Data blocks">{deep.dataBlockSigners.length} signers</Fact>
                  )}
                  {(deep?.stateProof ?? row?.stateProof) && (
                    <HashFact label="State proof" value={(deep?.stateProof ?? row?.stateProof)!} />
                  )}
                  <div>
                    <Button variant="link" size="xs" className="px-0" onClick={() => setSection("data")}>
                      Show the application state
                    </Button>
                  </div>
                </>
              );
            })()}

            {/* The references sit LAST, where references sit (the node card's reading order). */}
            <HashFact label="Hash" value={sel.hash} />
            {polled?.parent && <HashFact label="Parent" value={polled.parent} />}
          </div>
        )}
        <PulseEdge pulseKey={pulseKey} rail="right" />
    </RailPane>
  );
}

// One row per signer, each PAIRED to its chip on the ml0 rail (spec §5.3): hovering the row writes
// `hoverNodeId` and the chip glows; hovering the chip in the scene writes the same channel and the
// row washes. No new mechanism — the identical coupling an explorer node row already has.
// A metagraph seals its snapshots with its L0 cluster, so this is a handful of machines: the list
// renders whole, with no truncation and no "show more".
function SignerRows({
  ids,
  metaId,
  selNodes,
  hue,
  hoverNodeId,
  setHoverNodeId,
}: {
  ids: readonly string[];
  metaId: string;
  selNodes: NodeRow[];
  hue: string;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}) {
  // A signer id arrives TRUNCATED (decodeChannel's shortSigner keeps the payload small), so the
  // live row it names is found by prefix, scoped to this snapshot's own network — the card-side
  // twin of the scene's `resolveSignerIps`, so a row and its glowing chip resolve the same way.
  const rows = useMemo(
    () => ids.map((id) => ({ id, node: matchSignerRow(selNodes, metaId, id) })),
    [ids, selNodes, metaId],
  );
  return (
    <div className="flex flex-col gap-px">
      {rows.map(({ id, node }) => (
        <SignerRow key={id} id={id} node={node} hue={hue} hoverNodeId={hoverNodeId} setHoverNodeId={setHoverNodeId} />
      ))}
    </div>
  );
}

function SignerRow({
  id,
  node,
  hue,
  hoverNodeId,
  setHoverNodeId,
}: {
  id: string;
  node: NodeRow | null;
  hue: string;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}) {
  // With another network committed, `selNodes` doesn't carry THIS metagraph's nodes — so the row
  // degrades to a bare id rather than pairing on a key it can't light. The scene-side glow is
  // unaffected: the Engine resolves the signer ids against the live metaList (Task 13).
  const key = node ? hoverKeyOf(node.pick) : null;
  const pair = subjectPairing(hoverNodeId, key, setHoverNodeId, hue);
  return (
    <div
      className={cn(
        "nb-row flex items-baseline gap-1.5 -mx-2 px-2 py-0.5 rounded-sm text-label text-foreground-dim",
        pair.className,
      )}
      style={pair.style}
      title={id}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
    >
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{node?.city ?? "—"}</span>
      {/* A signer id arrives ALREADY truncated (8 chars) — running the house shortener over it
          would echo its own tail back (`c54ccbea…4ccbea`) and read as a longer hash than exists.
          Shorten only what is actually long. */}
      <span className="flex-none font-mono tabular-nums text-micro text-muted-foreground">
        {id.length > 16 ? shortHash(id) : id}
      </span>
    </div>
  );
}
