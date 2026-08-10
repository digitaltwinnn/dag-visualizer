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
import { IdentityDot, Fact, FactGroup, Foot, FootRow } from "@/components/inspector/parts";
import { Separator } from "@/components/ui/separator";
import { useStore } from "@/src/store/store";
import { metaSnapDeepKey } from "@/src/data/types";
import type { ChannelSnapDeep, ChannelSnapRow } from "@/src/data/types";
import { getNetwork, SIGNER_GROUPS, metagraphById, shortHash } from "@/src/data/network";
import { UNLISTED_HUE } from "@/src/data/unlisted";
import { snapsAtTick } from "@/src/data/anchorLog";
import { PAYLOAD_LANES, parsePayload, payloadKinds } from "@/src/data/payloadKinds";
import { fmtBytes, fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { useMinHold } from "@/components/useMinHold";
import { useNowTick } from "@/components/useNowTick";
import { identityHudHex } from "@/src/palette/identity";
import { PulseEdge, useEdgePulse } from "@/components/EdgePulse";
import { NodeStars } from "@/components/state/StateAtoms";
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
  const hash = sel.hash || polled?.hash || "";
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
                What this snapshot IS and where it landed, on one line: the metagraph that
                produced it and the global tick it anchored into. Size and fee used to ride a
                second lead line; they moved DOWN into `Fees paid` (user, 2026-08-10) so this card
                mirrors its sibling above — the global card leads with the anchoring relation,
                puts the breakdown VISUAL at the centre, and states fee-and-size as one fact
                below. Bytes and DAG are bookkeeping about the anchor; the payload is the news. */}
            <div className="flex items-start justify-between gap-2.5" title={`Anchored into global snapshot ${sel.globalOrdinal.toLocaleString()}`}>
              <span className="inline-flex items-center gap-1.5 min-w-0 text-body text-foreground">
                <IdentityDot hue={hue} />
                <span className="truncate">{ticker}</span>
              </span>
              <span className="text-body text-muted-foreground tabular-nums whitespace-nowrap">
                → #{sel.globalOrdinal.toLocaleString()}
              </span>
            </div>

            {/* ── THE CENTRE: what this metagraph actually anchored ────────────────────────
                Two labelled sections, State and Data — the same two payload lanes the raw layer
                opens one tier down, so the card states their SHAPE and the pane renders them.
                Both always render, each honest about its own tier. */}
            <PayloadBlock row={row} deep={deep ?? null} following={following} decodeGaveUp={decodeGaveUp} />

            {/* ── DETAIL: the measured facts ─────────────────────────────────────────────── */}
            <Separator className="my-2" />
            <FactGroup>
              {row ? (
                <>
                  {/* Fee leads, size rides under it — the global card's own two-line value, so
                      the pair reads identically on both storeys of the chain. */}
                  <Fact label="Fees paid">
                    <span className="flex flex-col items-end">
                      <span className="whitespace-nowrap"><b className="font-bold">{fmtDag(row.fee)}</b> DAG</span>
                      <span className="text-label text-muted-foreground">{fmtKB(row.bytes / 1024)} anchored</span>
                    </span>
                  </Fact>
                  {/* The two signer groups, SEPARATED (user, 2026-08-10: "general signing is L0
                      validator, and data updates are separate and have separate signers as
                      dL1's? Perhaps that also warrants a separation on the metagraph cards?").
                      They are different clusters doing different work — the L0 cluster seals the
                      snapshot (DOR: the same 3 of its 20 machines every time), a rotating dL1
                      subset produces the data blocks — so one merged count would be a lie about
                      both. One home for the words: SIGNER_GROUPS. The NAMES behind the counts
                      live one tier down, in the raw layer's SIGNERS lane, which lists both groups
                      as a real table; a city column under "Signed by" claimed that cities sign. */}
                  <Fact label="Signed by" title={SIGNER_GROUPS.proof.title}>
                    {signers?.length ?? 0} {SIGNER_GROUPS.proof.who}
                  </Fact>
                  {deep && deep.dataBlockSigners.length > 0 && (
                    <Fact label="Blocks by" title={SIGNER_GROUPS.dataBlocks.title}>
                      {deep.dataBlockSigners.length} {SIGNER_GROUPS.dataBlocks.who}
                    </Fact>
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
              {/* The descriptor's hash is not the only source, and for a PAGER step it isn't a
                  source at all: `railSiblings` builds its siblings from the tick's exact read,
                  which carries no hash field (`hash: ""`), so stepping to a sibling left HASH as
                  an em-dash — while PARENT, one row below, populated fine from the polled record.
                  Both come off the same record; this row was simply not reading it. So it tiers
                  like `stateProof` does: descriptor first, polled buffer behind it. The em-dash
                  survives for the one case that is genuinely unknown — a snapshot stepped to
                  after it aged out of the retained buffer — where stating the gap is the point. */}
              <FootRow label="Hash" value={shortHash(hash)} title={hash} />
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

// ── The payload block: this card's centre of gravity ─────────────────────────────────────────
// TWO SECTIONS, State and Data, both always present (user, 2026-08-10: "I feel two sections
// (state & data) with a separator is the clearest way to present it, no?" and "can we make it
// always show both and be honest if data / state is not applicable or just not present in that
// particular snapshot"). They are genuinely different reads that were merged into one composed
// line: STATE is the metagraph's accumulated on-chain state, DATA is what THIS snapshot's blocks
// carried. Merged, DOR read `1.8 KB of state · 4 data updates` above a bar labelled `updates 4` —
// a state key that happens to be NAMED `updates` sitting beside an unrelated count of the same
// number. The section labels are what disambiguate them, and they are the raw layer's own lane
// words (PAYLOAD_LANES), so the card and the pane can't name one subject two ways.
//
// THE SHARE-OF-TOTAL BAR IS GONE and can't come back (user: "if it is filled, how do we measure
// the length of the bar — I think a bar might not be the right element here"). Correct, and
// structurally so: `shapeOf` sets each state key's count in whatever unit that branch happens to
// be — array → length, object → field count, scalar → 1 — so summing them and taking a share is a
// percentage of a quantity nobody can name (rule 10). It degenerated in both live cases anyway:
// one key is always 100% (DOR), all-zero keys always 0% (SWAP, which declares three record kinds
// and carried none of them), so the length encoded nothing either way. The global card's
// `AnchoredTags` bars STAY, because every one of their rows is the same unit — snapshots
// anchored — against a real total; the instrument was honest there and borrowed to here. Dropping
// the track also returns the full width to the key NAMES, which is what actually needed it
// (`processedRewardWithdrawal` had 68px), and retires the header's "no application state", which
// contradicted the very keys listed under it.
//
// ONE RULE for whether the tier shows at all (user, 2026-08-07: DED's empty state hid the
// invitation while the raw layer rendered the decoded shape — the two surfaces apply one
// standard): if the payload DECODED, the block shows; an empty payload says so honestly instead
// of hiding. Both routes share one decoder, so decoded-ness can't disagree between them.
//
// The two tiers of source stay DELIBERATELY asymmetric and now say so PER SECTION, which is a
// positive argument for the split: State's bytes ride the tick's free exact row, everything else
// needs the ~2.5 MB deep read, which stays gated to an explicit pin. So a live-following card
// states its size and Data states the instrument state — it never implies a count it hasn't read.
function PayloadBlock({
  row,
  deep,
  following,
  decodeGaveUp,
}: {
  row: ChannelSnapRow | null;
  deep: ChannelSnapDeep | null;
  following: boolean;
  decodeGaveUp: boolean;
}) {
  // State's shape is computed server-side (`stateKeys`); Data's is the same mechanical read the
  // raw layer's data lane uses, so the two sections' rows mean the same thing.
  const stateRows = useMemo(
    () =>
      deep
        ? [...deep.stateKeys].sort((a, b) => b.count - a.count).map((k) => ({ name: k.key, count: k.count }))
        : [],
    [deep],
  );
  const dataRows = useMemo(
    () => (deep ? payloadKinds(parsePayload(deep.dataTx)).map((k) => ({ name: k.kind, count: k.count })) : []),
    [deep],
  );

  const decodedOk = deep != null || row?.decoded === true;
  if (!decodedOk) {
    if (row == null) return null; // no exact row yet — the FactGroup's reading state covers it
    return (
      <div className="mt-1.5 text-body text-muted-foreground italic">
        {following ? "undecodable payload" : decodeGaveUp ? "decode unavailable — tick pruned" : "decoding…"}
      </div>
    );
  }

  const stateBytes = deep ? deep.stateBytes : (row?.stateBytes ?? 0);
  // BOTH tiers key on the SAME field, because pinning must not change the answer to a question the
  // free tier already answered. The row's own `hasState` is not that field: server-side it means
  // "some top-level branch has count > 0" (`decodeChannel.shapeOf`), so a state that exists as an
  // empty container — `{"updates":[]}`, 14 bytes, with a state proof — reports false. Calling that
  // "none" is exactly the conflation this block was rewritten to end. `stateBytes > 0` says there
  // IS a serialized state; the ROWS say what it carries, and all-zero rows say "declared these
  // kinds, carried none of them" without the headline having to contradict them.
  const hasState = stateBytes > 0;
  // Unread is an INSTRUMENT STATE, never a zero — pre-pin the update count simply isn't known, and
  // `0` would be a fabricated reading.
  //
  // WHICH instrument state is the app's own rule, latent in the two existing acquiring surfaces
  // and written down here because this row got it wrong: NODE-STARS fill a VALUE SLOT that a
  // number is actually coming into (they reserve its width, so nothing jumps when it lands — the
  // global card's `Fees paid` does exactly this); a WORD is for when no slot is being reserved —
  // a whole block acquiring (`AnchoredTags`' stars + "resolving"), or a state that names a
  // different fact entirely (`Exact read: reading…`, which is replaced wholesale, not filled in).
  //
  // So the three states here are three different things and only one of them twinkles:
  //   • following  → `pin to read`, an INVITATION. Nothing is in flight and nothing will arrive
  //     unless the user asks, so stars would promise an arrival that isn't coming.
  //   • pinned, in flight → the count IS coming into this slot. Stars.
  //   • pinned, given up → the honest terminal. The deep read 404s once the L0 node prunes the
  //     global (~30 min), and without this the slot twinkled forever — the same hang the
  //     `decodeGaveUp` timer was added to end, which this row was simply not consuming.
  const dataHeadline = deep ? (
    deep.dataTxCount > 0 ? (
      <>
        <b className="font-bold">{deep.dataTxCount.toLocaleString()}</b> update
        {deep.dataTxCount === 1 ? "" : "s"}
      </>
    ) : (
      <Quiet>none</Quiet>
    )
  ) : following ? (
    <Quiet>pin to read</Quiet>
  ) : decodeGaveUp ? (
    <Quiet>unavailable — tick pruned</Quiet>
  ) : (
    <NodeStars count={4} />
  );

  return (
    <div className="mt-1.5">
      <PayloadSection
        name={PAYLOAD_LANES.state.name}
        title={PAYLOAD_LANES.state.title}
        headline={
          hasState ? (
            <b className="font-bold">{fmtBytes(stateBytes)}</b>
          ) : (
            <Quiet>none</Quiet>
          )
        }
        rows={stateRows}
      />
      <Separator className="my-2" />
      <PayloadSection
        name={PAYLOAD_LANES.data.name}
        title={PAYLOAD_LANES.data.title}
        headline={dataHeadline}
        rows={dataRows}
      />
    </div>
  );
}

/** An absent or unread value — an instrument state, in the one treatment the card already uses
 *  for them. A section's bare `none` means a different thing in each lane, which is what the
 *  section's own `title` carries; the value column stays short so it can't wrap. */
function Quiet({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground italic">{children}</span>;
}

/** One payload section — the house one-row grammar at TWO weights: the section's own headline
 *  fact, then its shape rows one weight down. That is the same device `Foot` uses (small, muted,
 *  tabular), so a shape row is a WEIGHT and not a second grammar, and both weights keep the
 *  card's one right edge, so a breakdown reads under its own total. */
function PayloadSection({
  name,
  title,
  headline,
  rows,
}: {
  name: string;
  title: string;
  headline: ReactNode;
  rows: { name: string; count: number }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Fact label={name} title={title}>
        {headline}
      </Fact>
      {rows.map((r) => (
        <div key={r.name} className="flex items-start justify-between gap-2.5 pl-2" title={r.name}>
          <span className="min-w-0 truncate text-label text-foreground-dim">{r.name}</span>
          <span className="shrink-0 text-label text-foreground-dim tabular-nums">{r.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
