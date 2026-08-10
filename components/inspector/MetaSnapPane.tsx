"use client";
// The METAGRAPH SNAPSHOT card (spec §7) — the tile on the ledger's upper floor as a subject.
// Three TIERS of fact, each honest about where it came from: tier 1 is free from the 4-second
// poll (it named the tile in the first place), tier 2 arrives with the tick's exact read, tier 3
// is the application state — disclosed as a SHAPE here and as a payload in the raw layer.
// Like the global snapshot card this is a card SLOT, not a focus-ladder rung: it has its own
// store channel (`store.metaSnap`) and a fixed rail slot, and appears in no ladder.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import CardHead, { RailPane } from "@/components/CardHead";
import { IdentityDot, Fact, FactGroup, Foot, FootRow } from "@/components/inspector/parts";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import type { NodeRow } from "@/src/data/types";
import { getNetwork, resolveSigner, SIGNER_GROUPS, SIGNER_UNKNOWN, metagraphById, shortHash, type SignerResolution } from "@/src/data/network";
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

// The body's row grammar and its three weights live in ./parts (`Fact` / `FactGroup` / `Foot`)
// — shared with every other rail card, so this one can't drift into a dialect of its own. The
// LEAD is composed here rather than imported: it merges facts and drops labels their units
// already carry, which is card-specific by nature.

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
  // The metagraph snapshot is exactly as LIVE as the global while following (advanceMetaSnap rides
  // the same heartbeat), so its aside is the same tap-to-follow toggle as SnapshotAside — but it
  // does NOT repeat the clock. The anchor join is exact (a metagraph snapshot is stamped with the
  // timestamp of the global it anchored into), so whenever the card above shows that same tick the
  // two counters were literally the same number twice (user, 2026-08-09: "both say live · x
  // seconds ago; looks redundant"). The GLOBAL card owns the clock; this one states the relation
  // instead — `anchored`, the house word for what the Snapshots stack does. The counter comes back
  // the moment it carries real information: while following a metagraph lane through anchor-less
  // global ticks this card holds an OLDER tick, and then its age is not a repeat.
  const now = useNowTick(1000);

  if (!sel) return null;
  const cfg = metagraphById(sel.metaId);
  // An UNLISTED metagraph has no config row — its address is the only name it has, and its hue
  // is the unlisted set's NEUTRAL gray (2026-08-08: hashing the address through the identity
  // palette minted a random hue per channel — pink icons for a set that deliberately has no
  // identity of its own).
  const ticker = cfg?.ticker || cfg?.name || shortHash(sel.metaId);
  const hue = cfg ? identityHudHex(sel.metaId) : UNLISTED_HUE;
  // Hoisted out of the state tier so the FOOT can reach it — it is a hash, and hashes are looked
  // up, not read. The deep read wins where it exists; the exact row carries it otherwise.
  const stateProof = deep?.stateProof ?? row?.stateProof;
  const rel = relativeAge(now - Date.parse(sel.ts));
  // ⚠️ The `!!snap` half is load-bearing: the ledger contributes no ancestry, so the global card
  // can be a GHOST while this one is populated — there the clock has to stay here.
  const sameTick = !!snap && snap.data.ordinal === sel.globalOrdinal;
  const asideCls = "inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap";
  const aside = (
    <button
      type="button"
      aria-pressed={following}
      title={following ? "Stop following the live snapshot" : "Follow the live snapshot"}
      className={cn(asideCls, "rounded-xs hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60")}
      onClick={() => snap && applyClickActions(followToggleActions(snap, following))}
    >
      {/* The beating dot rides `following` on its own, so the card still FEELS live in the
          `anchored` state — the heartbeat-on-closed-cards rule doesn't depend on the number. */}
      {following && (
        <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
      )}
      {sameTick ? "anchored" : following ? (rel ? `live · ${rel}` : "live") : <>◷ {rel}</>}
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
              <span className="truncate">{sel.ordinal.toLocaleString()}</span>
            </span>
          }
          titleKey={`${sel.metaId}:${sel.ordinal}`}
          aside={aside}
          onClose={onClose}
          collapsed={collapsed}
          onToggle={onToggle}
        />
        {!collapsed && (
          <div>
            {/* ── LEAD ───────────────────────────────────────────────────────────────────────
                The two things this card exists to say, merged from four rows that each used to
                cost a line of their own (Network / Anchored into, Size / Fee). The network's
                anchor is one relation, so it reads as one line; size and fee carry their own
                units, so they need no labels. Size leads the pair because the chamber's byte bar
                IS the bytes — the card's headline number is the one the geometry encodes. */}
            <div className="flex flex-col gap-1">
              <div
                className="flex items-start justify-between gap-2.5"
                title={`Anchored into global snapshot ${sel.globalOrdinal.toLocaleString()}`}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0 text-body text-foreground">
                  <IdentityDot hue={hue} />
                  <span className="truncate">{ticker}</span>
                </span>
                <span className="text-body text-muted-foreground tabular-nums whitespace-nowrap">
                  → #{sel.globalOrdinal.toLocaleString()}
                </span>
              </div>
              {row && (
                <div className="text-body text-foreground tabular-nums">
                  <b className="font-bold">{fmtKB(row.bytes / 1024)}</b>
                  <span className="text-muted-foreground"> · </span>
                  {fmtDag(row.fee)} DAG
                </div>
              )}
            </div>

            {/* ── DETAIL: the measured facts ─────────────────────────────────────────────── */}
            <FactGroup className="mt-2.5">
              {row ? (
                <>
                  {/* The LAYER is part of the fact: a metagraph's proof is its L0 cluster's, so DOR
                      shows 3 of its 20 machines by construction (user, 2026-08-09 — the bare count
                      read as a bug). One home for the words: SIGNER_GROUPS. */}
                  <Fact label="Signed by" title={SIGNER_GROUPS.proof.title}>
                    {signers?.length ?? 0} {SIGNER_GROUPS.proof.who}
                  </Fact>
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

              {/* ── The application state — ONE RULE (user, 2026-08-07: DED's empty state hid
                  the invitation while the raw layer rendered the decoded shape; the two
                  surfaces must apply one standard): if the payload DECODED, the tier shows and
                  the invitation stands — an empty state says "empty" honestly instead of
                  hiding. Both routes share one decoder, so decoded-ness itself can't disagree;
                  a genuinely unreadable payload says so (and "decoding…" while the pin's full
                  unpack is in flight). ── */}
              {(() => {
                const decodedOk = deep != null || row?.decoded === true;
                if (!decodedOk) {
                  if (row == null) return null; // no exact row yet — the reading state above covers it
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
                        stays empty; 2026-08-07). Their PRODUCING LAYER — the dL1 subset that
                        signed the blocks — was culled from this card (user, 2026-08-10): it
                        exists only after the deep read, and the raw layer's SIGNERS lane names
                        both groups beside their counts, which is where a signer question is
                        actually asked. */}
                    {deep && deep.dataTxCount > 0 && <Fact label="Data updates">{deep.dataTxCount}</Fact>}
                  </>
                );
              })()}
            </FactGroup>

            {(deep != null || row?.decoded === true) && (
              <Button variant="link" size="xs" className="mt-1 px-0" onClick={() => setSection("data")}>
                Show the application state
              </Button>
            )}

            {/* ── FOOT: the artifact's CHAIN IDENTITY ─────────────────────────────────────
                What it is, what it links to, what it proves — and nothing else. The three
                hashes used to cost 114px as stacked label-above blocks; same values, same
                full-hash-on-hover, one small muted column (user, 2026-08-10).
                HEIGHT and BLOCKS were culled the same day: the global snapshot card's foot
                carries hash + parent only, and the two cards are the SAME Signed[] artifact, so
                the asymmetry was an accident of history rather than a difference in the data
                (GlobalSnapshot carries height/blocks too). Reconciled DOWN, not up — CLAUDE.md
                already rules that a tick's block count is the wrong activity signal, and the
                facts that answer a question about this snapshot are all above. `State proof` is
                the one asymmetry that STAYS: only a metagraph snapshot proves an application
                state, so it's a real difference in the artifact, not an inconsistency. */}
            <Foot>
              <FootRow label="Hash" value={shortHash(sel.hash)} title={sel.hash} />
              {polled?.parent && (
                <FootRow label="Parent" value={shortHash(polled.parent)} title={polled.parent} />
              )}
              {stateProof && (
                <FootRow label="State proof" value={shortHash(stateProof)} title={stateProof} />
              )}
            </Foot>
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
  // `resolveSigner` is the ONE shared decision (src/data/network.ts): the ledger explorer's signer
  // depth reads it too, so the same id can never be described differently in the two places.
  const rows = useMemo(() => ids.map((id) => ({ id, r: resolveSigner(selNodes, metaId, id) })), [ids, selNodes, metaId]);
  return (
    <div className="flex flex-col gap-px">
      {rows.map(({ id, r }) => (
        <SignerRow key={id} id={id} res={r} hue={hue} hoverNodeId={hoverNodeId} setHoverNodeId={setHoverNodeId} />
      ))}
    </div>
  );
}

function SignerRow({
  id,
  res,
  hue,
  hoverNodeId,
  setHoverNodeId,
}: {
  id: string;
  res: SignerResolution;
  hue: string;
  hoverNodeId: string | null;
  setHoverNodeId: (id: string | null) => void;
}) {
  // An UNRESOLVED signer states what isn't known instead of pairing on a key it can't light — the
  // shared words, so this row and the explorer's say the same thing. It stays a SIGNATURE: no node
  // card, because there is no IP, geolocation, role or status behind it (rule 10). The scene-side
  // glow is unaffected either way: the Engine resolves signer ids against the live metaList.
  const node = res.known ? res.row : null;
  const key = node ? hoverKeyOf(node.pick) : null;
  const pair = subjectPairing(hoverNodeId, key, setHoverNodeId, hue);
  const unknown = res.known ? null : SIGNER_UNKNOWN[res.reason];
  return (
    <div
      className={cn(
        "nb-row flex items-baseline gap-1.5 -mx-2 px-2 py-0.5 rounded-sm text-label text-foreground-dim",
        pair.className,
      )}
      style={pair.style}
      title={unknown ? unknown.title : id}
      onMouseEnter={pair.onMouseEnter}
      onMouseLeave={pair.onMouseLeave}
    >
      <span
        className={cn(
          "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
          unknown && "italic text-muted-foreground",
        )}
      >
        {node ? node.city : unknown!.label}
      </span>
      {/* A signer id arrives ALREADY truncated (8 chars) — running the house shortener over it
          would echo its own tail back (`c54ccbea…4ccbea`) and read as a longer hash than exists.
          Shorten only what is actually long. */}
      <span className="flex-none font-mono tabular-nums text-micro text-muted-foreground">
        {id.length > 16 ? shortHash(id) : id}
      </span>
    </div>
  );
}
