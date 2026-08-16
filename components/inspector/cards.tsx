"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { shortHash, metagraphById, getNetwork, SIGNER_GROUPS, nodeSigned, coLocatedNetworks, filterAccent } from "@/src/data/network";
import { UNLISTED_ID, observedUnlistedIds } from "@/src/data/unlisted";
import { identityHudHex } from "@/src/palette/identity";
import { hex, fmtDag, fmtKB, midHash } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { statusBreakdown } from "@/src/data/nodeStatus";
import type { GlobalSnapshot, MetaCfg, PickDescriptor } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import Odometer from "@/components/Odometer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SonarRing, NodeStars, NoSignalDot } from "@/components/state/StateAtoms";
import { VIEW_ICONS, SNAPSHOT_ICON, COUNTRY_ICON, PROVIDER_ICON, COMPOSITION_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { ExternalLink } from "lucide-react";
import { useMinHold } from "@/components/useMinHold";
import { useArchive, archiveFactState, archiveSummary, fmtSnapCount, fmtReach, useChainSpan } from "@/components/useArchive";
import { useNodeNames, nodeName, nodeRegistered } from "@/components/useNodeNames";
import { useNowTick } from "@/components/useNowTick";
import { POLL } from "@/src/engine/config";
import { Desc, StatusMark, CompositionRows, StatusBreakdown, RoleChips, IdentityDot, networkKind, Fact, FactGroup, Foot, FootRow, LayerWho, BoolMark } from "./parts";
import { compositionGroups, compositionRows, nodeCompositionLabel, parseCompositionKey } from "@/src/data/composition";
import { pickNetId, followToggleActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";

type PickOf<K extends PickDescriptor["kind"]> = Extract<PickDescriptor, { kind: K }>;

// ── Card-head pieces (unified head anatomy, Task 13 follow-up) ──────────────────────────────
// Every inspector card's primary TITLE now renders in CardHead's title slot (one standard:
// 15px / semibold), with the bits that used to ride the body title rows in the head's ASIDE
// area. These exports are what InspectorCard feeds CardHead per kind; the bodies below render
// NO title rows of their own.

// Snapshot title: the snapshot BLOCK mark (SNAPSHOT_ICON/Box — the snapshot renders as a block in
// the chamber; distinct from the view's Layers and the layer card's stratum mark) + the ordinal. The mark
// TINTS with the active filter's identity (`--filter-accent`, set on the rail by Inspector; cyan
// on "all") — the consistent subject-mark language (user rule: a selected metagraph's hue shows on
// every mark that speaks for it). The
// Odometer owns the roll (digit-roll on each live tick), so no CardHead `titleKey` — a keyed
// remount would restart it as a whole-title roll-in instead.
export function SnapshotTitle({ data: d }: { data: GlobalSnapshot }) {
  const Mark = SNAPSHOT_ICON;
  return (
    <span className="inline-flex items-center gap-2">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      <Odometer value={d.ordinal} className="text-title font-semibold text-foreground tabular-nums" />
    </span>
  );
}

// Snapshot title-row aside: the LIVE-MODE switch — a beating cyan dot while the card follows the
// heartbeat, the snapshot's coarse age while it is pinned, and the no-signal state when the feed
// is down (nothing to follow, so that one is not a control). Since the card no longer opens
// itself on entering the ledger (user, 2026-08-02), this element is how live mode is turned on
// and off; the write goes through the table + executor like every other selection.
// While following a metagraph lane, the newest snapshot it anchored into may be minutes old — the
// age rides alongside "live" rather than being replaced by it, so the label never overstates.
export function SnapshotAside({ data: d }: { data: GlobalSnapshot }) {
  const live = useStore((s) => s.live);
  const following = useStore((s) => s.following);
  const snap = useStore((s) => s.snap);
  // Relative recency as a LIVE TICKING counter (user, 2026-08-08 — reversing the old
  // "coarse freshness, not a ticking clock" choice): the seconds count up between heartbeats
  // and reset as a new snapshot lands, so a closed snapshot card still FEELS live. Guarded
  // against an unparseable timestamp (→ no age suffix rather than "NaN").
  const now = useNowTick(1000);
  const rel = relativeAge(now - Date.parse(d.timestamp));
  const cls = "inline-flex items-center gap-1.5 text-label text-muted-foreground whitespace-nowrap";
  if (!live) return <span className={cls}><NoSignalDot /> no signal</span>;
  return (
    <button
      type="button"
      aria-pressed={following}
      title={following ? "Stop following the live snapshot" : "Follow the live snapshot"}
      className={cn(cls, "rounded-xs hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60")}
      onClick={() => snap && applyClickActions(followToggleActions(snap, following))}
    >
      {following ? (
        <>
          <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
          {/* The tip state counts up from the last heartbeat and resets as the next lands (user,
              2026-08-08 — replacing the static "live now"; the label still never overstates: the
              counter IS the shown snapshot's age in both branches). relativeAge returns "" for a
              clock-skewed (future-stamped) timestamp — say "live" alone, no dangling separator. */}
          {rel ? `live · ${rel}` : "live"}
        </>
      ) : (
        <>◷ {rel}</>
      )}
    </button>
  );
}

// Dossier title: the pre-unification header composition (logo avatar ringed in the identity hue
// + the NAME over the TICKER), re-homed INTO CardHead's title slot (user refinement — the head
// unification had split the avatar/ticker off into a body row). The name inherits CardHead's one
// 15px/semibold title standard; the ticker rides under it at its original 11px/hue — the SAME
// treatment for every subject, DAG included (the ticker used to be metagraph-only). Right behind
// the ticker, subtly (muted, smaller — quieter than the ticker), rides the network-type
// descriptor ("data metagraph" / "currency metagraph" / "data and currency metagraph" /
// "hypergraph" for DAG) — reusing the same composition read the old standalone body line derived
// from (`networkKind`, in ./parts), just folded into the ticker row instead of its own line.
// Rolls as a whole via InspectorCard's `titleKey` (keyed on the name, synced with the edge pulse).
export function MetaTitle({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const hue = hex(cfg.color);
  const iconUrl = mg?.iconUrl || cfg.iconUrl; // live metagraph icon, or the core's bundled logo
  const monogram = (cfg.ticker || cfg.name).slice(0, 3).toUpperCase();
  const kind = networkKind(cfg.id, mg?.nodes || []);
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      {/* The logo shows as a clean circular mark — no squared tile (brand icons are round);
          30px matches the two-line name+ticker block (was 38 — bottom-padded the collapsed
          card, user). The head keeps its TWO lines even collapsed: a one-line compact variant
          was tried and rejected (2026-07-12 — the kind text truncated into the site link);
          the dossier's collapsed height runs a few px taller than the other cards' by
          deliberate trade (all the identity info stays). */}
      <Avatar className="size-[30px] flex-none">
        {iconUrl && <AvatarImage src={iconUrl} alt="" />}
        <AvatarFallback style={{ color: hue }}>{monogram}</AvatarFallback>
      </Avatar>
      <span className="flex flex-col gap-px min-w-0">
        <span className="leading-[1.1]">{cfg.name}</span>
        {/* The TICKER left this line for the title-row ASIDE (user, 2026-08-08 — MetaTickerAside,
            taking the slot the site link held; the link moved into the body as a labelled row).
            The kind descriptor keeps the second line alone. */}
        <span className="text-label font-normal text-muted-foreground truncate">{kind}</span>
      </span>
    </span>
  );
}

// The selected node, resolved from the store the same way GeoLiveCard does — shared by the
// head pieces and the body so they can't disagree.
function inspectedNode(inspect: ReturnType<typeof useStore.getState>["inspect"]) {
  return inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
    ? inspect
    : null;
}

// The node's resolved CITY — the title's place word ("" when geolocation hasn't resolved). The
// COUNTRY left the title (user, 2026-08-02): it is a labelled fact like hosting and the node id,
// so it reads in the body with the rest rather than doubling the headline.
// Whether the inspected node is among the COMMITTED metagraph snapshot's proof signers — the
// node card's "signed" relation (user, 2026-08-15). PRESENCE-gated, never mode-gated
// (convention 7's honest form): `metaSnap` is ledger-scoped and cleared on leaving the view,
// so this reads as the Snapshots view's variant with no view check anywhere. Signers come from
// the same two sources the Engine's tray glow reads — the deep read when it has landed, else
// the exact read's shallow row.
function useSignedSelected(node: { id?: string | null; ids?: string[] } | undefined | null): number | null {
  const metaSnap = useStore((s) => s.metaSnap);
  const deepMap = useStore((s) => s.metaSnapDeep);
  const exact = useStore((s) => s.snapshotExact);
  if (!node || !metaSnap) return null;
  const deep = deepMap[metaSnapDeepKey(metaSnap.globalOrdinal, metaSnap.metaId, metaSnap.ordinal)];
  const row = exact[metaSnap.globalOrdinal]?.rows?.find(
    (r) => r.metaId === metaSnap.metaId && r.ordinal === metaSnap.ordinal,
  );
  // Returns the SIGNED snapshot's ordinal (not a bare boolean): the relation names its object
  // (user, 2026-08-15 — "say what it signed, like 'anchored to'").
  return nodeSigned(node, deep?.signers ?? row?.signers ?? null) ? metaSnap.ordinal : null;
}

function nodeCity(node: NonNullable<ReturnType<typeof inspectedNode>>): string {
  return node.geo?.city ?? "";
}

// Node title: the Geography view mark (Globe — the Geography view's top-bar icon, same view-glyph
// vocabulary as the snapshot head's Layers; identity-hued) + the node's CITY — user-agreed:
// where the node sits is the headline; its hash is bookkeeping, demoted to the subtitle below.
// Fallback when the city hasn't resolved: the truncated id (mono) stays the title, no
// subtitle. The roll-in stays keyed on the node ID — the subject's identity, not the title text
// (a new node in the same city still rolls).
export function GeoLiveTitle() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  const id = node.node?.id;
  const city = nodeCity(node);
  const title = city || (id ? shortHash(id) : node.node?.ip || "Node");
  const color = node.kind === "metanode" ? (node.meta ? identityHudHex(node.meta.id) : undefined) : identityHudHex("dag");
  const Mark = VIEW_ICONS.geo;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {color && <Mark className={KIND_MARK_CLASS} style={{ color }} aria-hidden />}
      <span key={id ?? title} className={cn("min-w-0 roll-in", !city && "font-mono tabular-nums break-all")}>{title}</span>
    </span>
  );
}

// Node title-row aside: the status pill — unless the SIGNED relation exists (user, 2026-08-15:
// "the header not to show the status, move that to a row, and instead show the relation"):
// with a metagraph snapshot committed and this node among its proof signers, the head states
// the relation — the one fact tying the node to the chamber's subject — and the status moves
// into the body (GeoLiveNode's Status row, gated on the same hook).
export function GeoLiveAside() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  const signed = useSignedSelected(node?.node);
  if (!node) return null;
  if (signed != null)
    return (
      // The relation NAMES ITS OBJECT (user, 2026-08-15 — like the snapshot card's "anchored
      // to N"): the signed metagraph snapshot's own ordinal, bare per the ordinal rule. The
      // layer detail (the L0 seal) rides the title — the aside states the relation.
      <span
        className="text-label text-muted-foreground whitespace-nowrap"
        title="This node is among the committed metagraph snapshot's proof signers — a snapshot is sealed by the metagraph's own L0 cluster."
      >
        signed {signed.toLocaleString()}
      </span>
    );
  return <StatusMark state={node.node?.state} />;
}

// A clicked Global L0 snapshot: what it anchored and what it settled (fees/size/rewards). Its
// place in the DAG (the Layers mark + ordinal + live/age) is the card HEAD now (SnapshotTitle/SnapshotAside).
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // EXACT totals from the raw L0 snapshot (via RawSnapshotBridge) are the ONLY source for the fee
  // + anchored breakdown — authoritative (the true total, incl. unlisted). If they aren't here yet
  // the tick is "reading…" (ACQUIRING); there is no polled-floor fallback. A FAILED read records
  // `exactMiss[ordinal]`, which is this card's give-up signal (rule 10: node-stars with nothing in
  // flight promise an arrival that isn't coming) — the slot terminates on an honest word, and a
  // later trigger (reselecting, the next live tick) retries.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const missed = useStore((s) => s.exactMiss[d.ordinal] != null);
  const live = useStore((s) => s.live);
  const lastGoodAt = useStore((s) => s.lastGoodAt);
  const awaitingExact = exact == null && !missed;
  const anchored = typeof d.metagraphSnapshotCount === "number" ? d.metagraphSnapshotCount : null;
  // Hold the ACQUIRING fee atom for one calm cycle even if the exact read lands sooner, then fade
  // it out (concern #8) — so a fast resolve doesn't blink the twinkling node-stars away.
  const feeHold = useMinHold(awaitingExact);

  // NO SIGNAL — the feed is unreachable. One sonar ring per retry: remounting `SonarRing` via
  // `key={retry}` (bumped on the same cadence as the poll, POLL.pollMs) makes the ring animation
  // itself read as "still retrying", not a static icon.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => setRetry((r) => r + 1), POLL.pollMs); // one ring per real poll/retry
    return () => clearInterval(id);
  }, [live]);

  // The title row lives in the card HEAD (SnapshotTitle/SnapshotAside above); the head's inset
  // hairline replaces the old leading Separator.
  if (!live) {
    return (
      <div className="saturate-[.45]">
        <div className="flex items-center gap-3 mt-1.5">
          <SonarRing key={retry} />
          <div className="flex flex-col gap-[3px] text-label text-muted-foreground">
            <span>Explorer API: unreachable</span>
            <span>Last good read: {lastGoodAt ? relativeAge(Date.now() - lastGoodAt) : "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  // Hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here.
  return (
    <div>
      {/* Anchored block (exact share breakdown, or "reading…" until it lands). */}
      <AnchoredTags ordinal={d.ordinal} anchored={anchored} awaiting={awaitingExact} />

      {/* Settlement — the exact fee + measured size + rewards (each an independent fact). While the
          exact read is still in flight (ACQUIRING), the fee row shows twinkling node-stars so the
          cell reserves width; once it lands the real value cross-fades in (animate-resolve-in). */}
      <Separator className="my-2" />
      {/* `|| exact == null` guards a one-render race: when the live tick rolls to a new ordinal,
          `exact` flips back to null on THAT render but useMinHold's `show` only rises in its
          effect on the NEXT one — without the guard this dereferenced `exact.totalFee`.
          A recorded MISS (with the hold played out) terminates the stars on an honest word —
          stars promise an arrival, and after a failed read none is coming. */}
      {feeHold.show || exact == null ? (
        <FactGroup>
          <Fact label="Fees paid">
            {missed && !feeHold.show ? (
              <span className="text-muted-foreground italic">unavailable — read failed</span>
            ) : (
              <span className={cn("flex flex-col items-end", feeHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}><NodeStars count={4} /></span>
            )}
          </Fact>
        </FactGroup>
      ) : (
        <FactGroup>
          {exact.totalFee > 0 && (
            <Fact label="Fees paid">
              <span className="flex flex-col items-end">
                <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.totalFee)}</b> DAG</span>
                <span className="text-label text-muted-foreground">{fmtKB(exact.totalSizeKB)} anchored</span>
              </span>
            </Fact>
          )}
          {exact.rewardsDatum > 0 && (
            <Fact label="Rewards out">
              <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.rewardsDatum)}</b> DAG</span>
            </Fact>
          )}
          {/* The signer count is a FACT about this tick — it reads. Its two hashes don't, so
              they sit in the foot below.
              The LAYER is part of the fact, exactly as on the metagraph snapshot card (user,
              2026-08-10: "why do we call it 'validators' for global snapshot and in metagraph L0
              validators?"). A bare "validators" was the odd one out, not the qualified one — a
              global snapshot is sealed by the DAG's OWN L0 cluster under the unified node model,
              so it is the same kind of fact and takes the same words. One home: SIGNER_GROUPS. */}
          {exact != null && (exact.signerCount ?? 0) > 0 && (
            <Fact label="Signed by" title={SIGNER_GROUPS.globalProof.title}>
              <span className="animate-resolve-in motion-reduce:animate-none inline-flex items-center gap-1">
                {exact.signerCount} <LayerWho who={SIGNER_GROUPS.globalProof.who} />
              </span>
            </Fact>
          )}
        </FactGroup>
      )}

      {/* FOOT — the artifact's CHAIN IDENTITY: what it is, what it links to, what it proves.
          The global snapshot is the same Signed[] artifact as the metagraph snapshots it
          anchors, so the two cards carry the SAME foot set (2026-08-10) — hash + parent here,
          plus the state proof over on the metagraph card, which is the one real difference
          between the artifacts. Counters are deliberately NOT chain identity: `epochProgress`
          was culled with them, and `height`/`blocks` (which this type does carry) never enter —
          a tick's block count is the wrong activity signal, and its anchors are the fact this
          card exists to state. */}
      <Foot>
        {/* The raw pane's long mid-ellipsis form, budgeted PER ROW (user, 2026-08-14 — "the
            hashes attached to the label", then "the hash label still has extra room"): the
            value fills its own row toward its label, so a short label buys a longer value —
            head and tail both surviving. Budgets measured at the desktop rail width. */}
        <FootRow label="Hash" value={midHash(d.hash, 34)} title={d.hash} copy={d.hash} />
        {d.lastSnapshotHash && (
          <FootRow label="Parent hash" value={midHash(d.lastSnapshotHash, 27)} title={d.lastSnapshotHash} copy={d.lastSnapshotHash} />
        )}
      </Foot>
    </div>
  );
}

// ONE observed unlisted metagraph (user, 2026-08-14 — "different network id means different
// metagraph; determine cards for the currently unlisted ones"): the FACTS for one distinct
// uncataloged address seen anchoring in the measured window, rendered INSIDE MetaCard — the
// unlisted dossier is the same component as every other dossier (user, same day: "I'd rather
// not just share grammar but prefer sharing components"), so this block carries no foot; the
// card's one shared Foot states the last member's references. The MACHINES are honestly
// unknowable (no published cluster), but the CHAIN is not — the explorer indexes every
// anchoring chain's records. Its own component because the span hook is per address.
function UnlistedMemberFacts({ id, last }: { id: string; last: boolean }) {
  const span = useChainSpan(id);
  const age = span?.genesisTs ? fmtReach(span.genesisTs) : null;
  return (
    <>
      <Separator className="my-2" />
      {/* With SEVERAL members the block needs its own identity line for association; the LAST
          block's references live in the card's standard Foot instead — so the common
          one-member card reads exactly like a regular dossier (user, 2026-08-14: "it should
          use the same card as any other metagraph"). */}
      {!last && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro tracking-caps uppercase text-muted-foreground">Network id</span>
          <span className="font-mono text-label" title={id}>
            {shortHash(id)}
          </span>
        </div>
      )}
      <div className={last ? undefined : "mt-1.5"}>
        <Fact label="Online nodes">
          <span className="text-muted-foreground italic" title="This network publishes no node cluster, so its nodes are unknowable.">
            unknown
          </span>
        </Fact>
        <Fact
          label={
            <span className="inline-flex items-center gap-1">
              Full archive nodes <RoleChips codes={["L0"]} />
            </span>
          }
        >
          <span
            className="flex flex-col items-end"
            title={`Whether any node keeps this chain in full is unknowable — no cluster is published. The chain itself is real: ${
              span ? `${span.latestOrdinal.toLocaleString()} snapshots${age ? ` since ~${age.replace("~", "")} ago` : ""}.` : "reading its span…"
            }`}
          >
            <span className="text-muted-foreground italic">unknown</span>
            {age && <span className="text-label text-muted-foreground">chain ~{age}</span>}
            {span && span.latestOrdinal > 0 && (
              <span className="text-label text-muted-foreground">{fmtSnapCount(span.latestOrdinal)} snapshots</span>
            )}
          </span>
        </Fact>
      </div>
      {!last && span?.owner && (
        <Fact label="Owner address">
          <span className="font-mono" title={`The address that registered and controls this metagraph. ${span.owner}`}>
            {shortHash(span.owner)}
          </span>
        </Fact>
      )}
    </>
  );
}

// The metagraph context pane (top-right "context" slot): identity only — description,
// make-up rows, website. Its live/economic counterpart is the top-bar vitals (filter-aware
// "live activity"), so the dossier stays a stable identity card.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  // The UNLISTED dossier is THIS component (user, 2026-08-14 — shared components, not shared
  // grammar): its members are the distinct uncataloged addresses observed in the window's
  // exact reads, subscribed only while unlisted IS the subject so every other dossier pays
  // nothing.
  const snapshotExact = useStore((s) => (cfg.id === UNLISTED_ID ? s.snapshotExact : null));
  const unlistedMembers =
    cfg.id === UNLISTED_ID && snapshotExact
      ? observedUnlistedIds(getNetwork()?.globalSnapshots ?? [], snapshotExact).slice(0, 6)
      : [];
  // The card's ONE foot subject: the catalog address, or the last observed unlisted member.
  const footId =
    cfg.id !== "dag" && metagraphById(cfg.id) ? cfg.id : (unlistedMembers[unlistedMembers.length - 1] ?? null);
  // The owner and staking addresses, off the chain's newest record (user, 2026-08-14 — the
  // unlisted card grew them first; every dossier carries the same facts). The DAG core has no
  // currency chain, so its lookup idles and no rows grow.
  const chainSpan = useChainSpan(footId);
  // The network's ARCHIVE reading (user, 2026-08-14 — "how many have genesis? that's useful
  // information to know about a network"): genesis survival counted across the fleet, or the
  // deepest reach any of its own machines still serves. The DAG core's chain is "global" in
  // the census; a chain with no probed machines (unlisted, zero-node) answers null and grows
  // no row. While the census is in flight the row holds its place with stars (user,
  // 2026-08-15 — a separately-loaded fact never pops in), gated to networks the census
  // actually probes (the DAG + the catalog) so stars only ever promise data that is coming.
  const { census: archCensus, settled: archSettled } = useArchive();
  const archSum = archCensus ? archiveSummary(archCensus, cfg.id === "dag" ? "global" : cfg.id) : null;
  const archAcquiring = archSum == null && !archSettled && (cfg.id === "dag" || metagraphById(cfg.id) != null);
  const nodes = mg?.nodes || [];
  // The unlisted blurb COUNTS its members (user, 2026-08-14) — built here, beside the member
  // list it describes, so the two can't drift.
  const blurb =
    cfg.id === UNLISTED_ID
      ? "Metagraphs anchoring into Global L0 without an entry in the public catalog. " +
        (unlistedMembers.length === 0
          ? "None was seen anchoring in the measured window."
          : unlistedMembers.length === 1
            ? "One anchored in the measured window; its chain and owner address are public, its operator and nodes are not."
            : `${unlistedMembers.length} anchored in the measured window; their chains and owner addresses are public, their operators and machines are not.`)
      : mg?.description || cfg.blurb;
  // The site link rides the BODY now (MetaSiteRow — the aside slot carries the ticker). Falls
  // back to the config-level url for cores the live metaList doesn't carry a site for (the DAG).
  const site = mg?.siteUrl ?? cfg.siteUrl;
  // The summary row: "Online nodes" + the TOTAL (user, 2026-07-12 — it summarizes the
  // composition table above, whose counts sum to the total; a joining node is online too,
  // just not ready yet). The pill row below appears only when something is NOT ready.
  const states = nodes.map((n) => n.state);
  const buckets = statusBreakdown(states);
  const nonReady = buckets.progress + buckets.down + buckets.unknown > 0;
  // Hover pairing (synced 3D hub glow) lives on the OUTER pane (ContextCard's #metapane), not here.
  // The full identity header (avatar + name + ticker) lives in the card HEAD now (MetaTitle via
  // CardHead's title slot, rolled via titleKey) — the body starts at the description.
  return (
    <>
      {/* Keyed on the text so the expand state resets when the subject (or its description
          arriving from /api/metagraphs) changes — an expanded DOR must not leak into DED. */}
      <Desc key={blurb} text={blurb} />
      {nodes.length > 0 && (
        <>
          {/* The snapshot card's rhythm, applied here (user, 2026-07-12): the BREAKDOWN first
              (composition table — rows carry their own counts), then the shared Separator,
              then ONE summary row in the snapshot card's "Fees paid" grammar — muted label
              left, the bold total + per-state breakdown right. Totals sit BELOW their parts;
              the old "166 nodes with 3 different compositions" header restated the table.
              The "Composition" micro-uppercase label above this table was the LAST survivor of
              the retired stacked label-above-block form (user, 2026-08-10) — it outlived the
              sweep only because CompositionRows is a table rather than a Fact. Dropped: each
              row already names its own composition, and with it gone the description above
              reads as the card's LEAD (which is why the blurb stays in the body rather than
              moving into the head — a paragraph in CardHead would both special-case the one
              header standard and blow up this card's ~28px collapsed entry). */}
          <div className="mt-3">
            <CompositionRows nodes={nodes} />
          </div>
          <Separator className="my-2" />
          {/* Summary in the shared Fact grammar — muted label left, the bold TOTAL right
              (column-aligned with the composition counts it summarizes). */}
          <Fact label="Online nodes"><b className="font-bold">{nodes.length}</b></Fact>
          {/* The pill row appears only when something is NOT ready — and then it shows the
              FULL breakdown including the ready pill (user, 2026-07-12: all-ready is the
              silent default; a mixed fleet reads as one complete picture). */}
          {nonReady && (
            <div className="mt-1.5 flex justify-end">
              <StatusBreakdown states={states} />
            </div>
          )}
        </>
      )}
      {/* Fleet-level archive summary, in the same summary block as Online nodes; the DAG
          dossier carries no composition block, so it brings its own separator. ONE fact in
          the Fees-paid stacked grammar (user, 2026-08-14, settled over several passes —
          "from genesis as a separate fact, like a checkmark", then "the ~15 months as an
          underline like fees paid"): the main line counts the machines keeping the whole
          chain — ratio bold under the Online nodes total it counts against, checked in the
          success hue when any exist — and the muted underline carries the fleet's deepest
          surviving reach in the time register. */}
      {(archSum || archAcquiring) && (
        <>
          {nodes.length === 0 && <Separator className="my-2" />}
          {/* "Full archive nodes", not "genesis nodes" (user, 2026-08-14): the latter reads as
              validators PRESENT at genesis — a different claim than keeping the whole chain. */}
          <Fact
            label={
              <span className="inline-flex items-center gap-1">
                Full archive nodes <RoleChips codes={["L0"]} />
              </span>
            }
          >
            {archSum ? (
              /* No checkmark here (user, 2026-08-14 — "it just clutters the view"): the ratio
                 already answers, and the node card's Yes keeps the check where it is the value. */
              <span className="flex flex-col items-end" title={`${archSum.genesisTitle} ${archSum.reachTitle}`}>
                <b className="font-bold">{archSum.genesisRatio}</b>
                <span className="text-label text-muted-foreground">{archSum.reach}</span>
                {/* Second underline: what that reach holds in snapshots — absent for the holed
                    global deep archives, where any count would overclaim. */}
                {archSum.kept != null && (
                  <span className="text-label text-muted-foreground">{fmtSnapCount(archSum.kept)} snapshots</span>
                )}
              </span>
            ) : (
              <NodeStars count={4} />
            )}
          </Fact>
        </>
      )}
      {unlistedMembers.map((id, i) => (
        <UnlistedMemberFacts key={id} id={id} last={i === unlistedMembers.length - 1} />
      ))}
      {/* The site reference LAST, where references sit (the node card's reading order). */}
      {site && (
        <>
          <Separator className="my-2" />
          <MetaSiteRow site={site} />
        </>
      )}
      {/* FOOT — the network's own chain references (user, 2026-08-13/14): a metagraph's id IS
          its state-channel address, plus the owner and staking addresses its records publish.
          ONE foot for every dossier — a catalog metagraph's own address, or the last observed
          unlisted member's. The DAG core's internal key ("dag") is not an address, so it
          grows none. */}
      {footId && (
        <Foot>
          {/* The snapshot cards' fill rule (user, 2026-08-14 — "the value takes up most of the
              space and sits against the label"): midHash at per-label budgets, so each address
              fills its own row toward its label. */}
          <FootRow label="Network id" value={midHash(footId, 28)} title={footId} copy={footId} />
          {chainSpan?.owner && (
            <FootRow
              label="Owner address"
              value={midHash(chainSpan.owner, 24)}
              title={`The address that registered and controls this metagraph. ${chainSpan.owner}`}
              copy={chainSpan.owner}
            />
          )}
          {/* The staking address deliberately does NOT ride this foot (user, 2026-08-14):
              it is the fee-model's collateral pointer, and its home is the future Staking
              view — the dossier keeps the two identity references. */}
        </Foot>
      )}
    </>
  );
}

// The dossier's title-row aside: the TICKER in the identity hue (user, 2026-08-08 — it took the
// slot the site link used to hold; the link itself moved into the body, see MetaSiteRow). Reads
// at the same 11px/hue treatment it had under the name, right-aligned like every head aside.
export function MetaTickerAside({ cfg }: { cfg: MetaCfg }) {
  if (!cfg.ticker) return null;
  return (
    <span className="text-label font-semibold tracking-[0.02em]" style={{ color: hex(cfg.color) }}>
      {cfg.ticker}
    </span>
  );
}

// The dossier's site link as a labelled BODY row (user, 2026-08-08 — the icon-only aside link
// was never used and the aside slot now carries the ticker). References sit last, where
// references sit: domain text + the ExternalLink glyph, in the link language (`text-primary`).
function MetaSiteRow({ site }: { site: string }) {
  const domain = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <Fact label="Site">
      <a
        href={site}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-primary/75 hover:text-primary"
      >
        {domain}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </Fact>
  );
}

// Geography's signature detail card: the **selected node**, picked from the left explorer
// or the globe. The selection's live footprint summary (online / countries / densest) now
// lives in the top-bar vitals, so this card is purely the picked node's facts — or a hint
// to pick one. Reads the node straight from the store, so it tracks any pick.
export function GeoLiveCard() {
  const inspect = useStore((s) => s.inspect);

  const node =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode")
      ? inspect
      : null;

  if (!node) {
    // UNREACHABLE, and deliberately empty: the manifest's `present` for the node slot is the SAME
    // `isNodePick(s.inspect)` test as the line above, so the rail renders this card only when a
    // node is picked and the GHOST owns the empty state — with the hint copy that lives once, in
    // `railCards.ts`. A second hint here is a copy that can only ever drift (it had: it still read
    // "or in the explorer" long after the ghosts dropped that shared tail).
    return null;
  }
  return <GeoLiveNode p={node} />;
}

// The selected-node block. The node's CITY + status pill are the card HEAD (GeoLiveTitle/
// GeoLiveAside above) — the old IP and "Location" body rows are gone (the IP entirely,
// user-agreed; the city because it IS the title). The slot eyebrow reads "Node"; the × is
// CardHead's shared close (the outer pane).
//
// THE PILE IS THE UNIT (user, 2026-08-10). This card states its subject's OWN facts and never
// re-states an ancestor's IDENTITY: the country card's title IS the country, the provider card's
// title IS the isp, the composition card's title IS the composition word (with the same layer
// chips in its aside) — and a title survives a collapse into an entry, so the parent plank
// states it whether it's open or not. The slab's premise is that adjacency reads as containment,
// so a leaf restating its parent at equal weight is noise, not reassurance. The rule the
// provider card already followed since 2026-08-02 ("a facts rail shouldn't say the same thing
// twice"), generalised.
//
// The gate is PRESENCE, not view (convention 7): each fact drops exactly when the rung that owns
// it is committed — the same `!= null` conditions `railCards` uses for its `present` flags — so
// it stays correct if a ladder changes. What survives per view is the COMPLEMENT of the ladder
// above: geo (network→country→provider) leaves composition; hyper (network→composition) leaves
// place + host; ledger (network) leaves all three. Read down the pile the fact set is identical
// in every view — only its distribution across planks moves.
//
// CONSISTENCY LEVER: the ORDER never changes. Whichever facts survive render in the fixed
// reading order place → role → host → reference, so the card always reads the same way; it just
// has fewer lines.
//
// THE CODES ARE CULLED (user, 2026-08-10 — asked whether this card wanted a third column). It
// didn't: three columns break the one row grammar (label left, value right, one line), the codes
// run 2ch (`US`) to 8ch (`AS212317`) so a fixed column is either gappy or truncating, and the
// layer codes are a CHIP — pulling them out detaches them from the composition word they qualify.
// Measured live, the raggedness is at the LEFT of the value block anyway, so a right-aligned
// column tidies an edge that was never ragged. `US` is dropped outright: it restates "United
// States" and, unlike a hash, nobody looks a country code UP.
//
// THE ASN IS A BODY FACT, BESIDE THE HOST IT NAMES (user, 2026-08-13). It spent three days in the
// foot on the look-up rule — a value you only ever read to compare it against something else — and
// that reading is too literal here: the foot is where the card's own REFERENCES sit, and the ASN
// is not this node's reference, it is the provider's. Read down the foot it sat above `Node id` as
// if the two identified the same thing. In the body it lands where the reading order already puts
// it, one line under the provider NAME it is the number for, and the foot is left saying exactly
// one thing: which node this card is about. It keeps the `cohort == null` gate the Hosting line
// above it uses, so the two can't disagree about who owns the host, and it keeps the mono face
// the provider card's own ASN row carries.
function GeoLiveNode({ p }: { p: PickOf<"l0" | "l1" | "metanode"> }) {
  // The SIGNED relation owns the head aside while it exists (GeoLiveAside) — the status the
  // head normally carries moves down here as the first body row, so no fact is lost, only
  // redistributed (the pile rule's redistribution idea, applied within one card).
  const signedSel = useSignedSelected(p.node) != null;
  // The operator's self-registered ALIAS from the delegated-staking registry (user,
  // 2026-08-16 — "those names look informal often": a content attribute, never the title; and
  // "alias" is the user-facing word, "nickname" stays the internal register). The registry
  // keys on a PEER ID, so the name names a keypair — and a host that reuses one keypair
  // across networks (the Upsider pattern) carries it on its metagraph record too, which is
  // why the match runs for every node kind (user, 2026-08-16: "keep it actual"). The row is
  // ALWAYS stated, "not known" when nothing resolves. The registry's other reading, the
  // delegated-staking OPT-IN, is its own row (user, 2026-08-16: "would that be a separate
  // attribute?") in the service block below: Yes/No for DAG validators only — only a Global
  // L0 validator can register (measured: 31 of 147 live validators haven't).
  const isDagValidator = p.kind === "l0" || p.kind === "l1";
  const nickState = useNodeNames();
  const nickname = nodeName(nickState.names, p.node);
  const registered = nodeRegistered(nickState.names, p.node);
  // The three ancestor rungs that can own one of this card's facts.
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  const composition = useStore((s) => s.composition);
  // Hosting provider from the node's IP lookup (GeoInfo.isp/asn) — Absent = the lookup didn't
  // know; the line simply doesn't render (honesty: no "Unknown" filler in a facts card).
  const geo = "geo" in p ? p.geo : undefined;
  // The node's make-up: the composition word + its layer codes as squared pills (RoleChips — the
  // same rendering the metagraph card's composition rows use; user 2026-07-12: the joined
  // "L0·cL1" text read as one token). Sentence-cased ("Hybrid" / "Currency") to match the
  // composition rows' label style — text-micro is the UPPERCASE lane (labels), word values at
  // text-body are sentence case.
  const compWord = p.node ? nodeCompositionLabel(p.node) : null;
  const comp = compWord ? compWord.charAt(0).toUpperCase() + compWord.slice(1) : null;
  const codes = p.node ? compositionRows([p.node])[0]?.codes : undefined;
  // ARCHIVE — what depth of ITS OWN chain this machine serves (user, 2026-08-14: "I find this
  // info very interesting", then "mention time and/or snapshots... metagraph nodes as well").
  // The census probes the global L0 cluster and every catalog metagraph's L0 cluster, so a DAG
  // validator answers for the global chain and a metagraph machine for its currency chain. Not
  // part of the pile dedup: no ancestor card states it. The title carries the census context the
  // one-line value can't. The ROW is always decided, never absent-then-popping (user,
  // 2026-08-15): archiveFactState is the one home for that decision — stars while the census is
  // genuinely in flight, "n/a" immediately for a machine with no L0 process (roles are local
  // knowledge; the chip underline says why), "Unmeasured" once settled with no reading, which
  // covers a failed fetch too, so the stars can never hang. Roles unknown → no row at all,
  // since even "n/a" would be a guess.
  const { census: archive, settled: archSettled } = useArchive();
  const archEntry = p.node?.ip ? archive?.entries.get(p.node.ip) : undefined;
  const archState = archiveFactState(archEntry, archive?.since, archSettled, p.node?.roles ?? []);
  // The host's ASN answers to the provider rung exactly as the Hosting line above it does — one
  // condition, so the two can't disagree about who owns the host.
  const asn = cohort == null ? geo?.asn : null;
  // CO-LOCATION (user, 2026-08-16 — "can we show this in the node card?"): what ELSE this
  // machine runs, from the one home in network.ts (the roster's Co-located column reads the
  // same call). A host fact, so it sits with the host block. Usually "none" — stated, per the
  // user's spec, so the rare tenancy reads against a known resting value — but only once BOTH
  // sides of the read are live (the DAG core and at least one metagraph in the metaList);
  // before that a bare "none" would be a guess, so the slot holds (the archive row's lesson).
  const metaList = useStore((s) => s.metaList);
  const coloReady = metaList.some((m) => m.isRoot) && metaList.some((m) => !m.isRoot);
  const colo = coloReady ? coLocatedNetworks(p.node?.ip, pickNetId(p), metaList) : null;
  // NB: the hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here,
  // so the glow lights the card's rounded edge.
  return (
    <>
      <FactGroup>
        {/* ALIAS — the operator's informal self-registered handle (see the note above). The row
            is ALWAYS stated (user, 2026-08-16: "if it's missing just say so, don't hide the
            attribute" — and "alias" over "nickname"): a name, stars while the registry loads,
            "not known" when the loaded registry has none for this node's keys, "not available"
            when the registry itself couldn't be read. */}
        <Fact label="Alias">
          {nickname ?? (!nickState.settled ? (
            <NodeStars count={4} />
          ) : nickState.names ? (
            <span className="text-muted-foreground italic" title="No display name is registered for this node's keys in the Global L0's delegated-staking registry.">
              not known
            </span>
          ) : (
            <span className="text-muted-foreground italic" title="The delegated-staking registry could not be read — retried on the next visit.">
              not available
            </span>
          ))}
        </Fact>
        {/* STATUS — only while the SIGNED relation holds the head aside (its usual home). */}
        {signedSel && (
          <Fact label="Status">
            <StatusMark state={p.node?.state} />
          </Fact>
        )}
        {/* COUNTRY — the half of the place the head no longer carries (user, 2026-08-02). The
            country CODE suffix is gone (2026-08-10): it restated the name it sat beside.
            Yields to the country card's own title once that rung is drilled. */}
        {country == null && geo?.country && <Fact label="Country">{geo.country}</Fact>}
        {/* COMPOSITION — the node's role in the network, a labelled fact like the rest (user,
            2026-08-02: it used to ride the head as a subtitle, which made the head carry three
            different registers). Sits second: the reading order is place → role → host →
            reference, with health as the head's status pill. Yields to the composition card,
            which states the same word in its title and the same chips in its aside. The chips
            STAY on this line — they qualify the word, and a value column can't hold them. */}
        {composition == null && comp && (
          <Fact label="Composition">
            <span className="inline-flex items-center gap-1.5">
              <span>{comp}</span>
              {codes && codes.length > 0 && <RoleChips codes={codes} />}
            </span>
          </Fact>
        )}
        {/* HOSTING — the provider's NAME, then the ASN that is its number. Both yield to the
            provider card, whose title IS the isp and whose body carries the same reference. */}
        {cohort == null && geo?.isp && <Fact label="Hosting">{geo.isp}</Fact>}
        {asn && <Fact label="ASN"><span className="font-mono">{asn}</span></Fact>}
        {/* CO-LOCATED — the machine's other tenant networks (see the note above). Each name
            keeps its identity dot: a metagraph's hue is the same everywhere it appears. */}
        <Fact label="Co-located">
          {colo == null ? (
            <NodeStars count={3} />
          ) : colo.length ? (
            <span
              className="inline-flex items-center gap-1.5"
              title="Another network runs its layers at this node's IP — the same host answers in both clusters."
            >
              {colo.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  <IdentityDot hue={filterAccent(c.id)} />
                  {c.name}
                </span>
              ))}
            </span>
          ) : (
            // "none" is a MEASURED reading (both cluster sides are live and no co-tenant
            // exists), so it takes the value register like any other fact — muting it made a
            // fact read as an instrument state (user, 2026-08-16).
            <span title="No other network has a node at this IP.">none</span>
          )}
        </Fact>
        {/* Reading order: place → role → host → SERVICE — what this machine serves sits with
            the host block, above the reference foot. */}
        {/* DELEGATED STAKING — the registry's opt-in reading (see the Nickname note): whether
            this validator registered as a candidate DAG holders can delegate to. A service the
            machine offers, so it sits with the host block like Full archive, and it shares that
            row's Yes/No grammar. Validators only — the question doesn't apply to a metagraph
            machine (the archive row's n/a lesson, taken one further: no row at all). */}
        {isDagValidator && (
          <Fact label="Delegated staking">
            {!nickState.settled ? (
              <NodeStars count={3} />
            ) : nickState.names ? (
              <span
                className="inline-flex items-center gap-1.5"
                title={
                  registered
                    ? "Registered as a delegated-staking candidate in the Global L0 registry — DAG holders can delegate stake to this validator."
                    : "In the validator whitelist but not registered as a delegated-staking candidate — separate, independent gates, which is why a live validator can lack an entry."
                }
              >
                <BoolMark on={registered} />
                <b className="font-bold">{registered ? "Yes" : "No"}</b>
              </span>
            ) : (
              <span className="text-muted-foreground italic" title="The delegated-staking registry could not be read — retried on the next visit.">
                not available
              </span>
            )}
          </Fact>
        )}
        {archState.kind === "value" && archEntry && archive && (
          /* The dossier's settled stacked grammar, machine-scoped (user, 2026-08-14 — "in the
             node card follow the same thinking; still says 'archive'"): Yes/No against the
             From genesis label (check in the success hue on Yes), the machine's own reach as
             the first underline, its kept count as the second. */
          <Fact label="Full archive">
            <span
              className="flex flex-col items-end"
              title={
                archEntry.kind === "genesis"
                  ? `Serves its chain's every snapshot, back to ordinal 1`
                  : archEntry.kind === "deep"
                    ? `Serves global snapshots back to the metagraph era (${archive.since}), with some gaps — one of ${archive.archivalCount} archival validators of ${archive.total} probed`
                    : `Serves ~${(archEntry.latest - archEntry.floor).toLocaleString()} recent snapshots of its own chain, back to ordinal ${archEntry.floor.toLocaleString()}; older history is discarded`
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <BoolMark on={archState.display.genesis} />
                <b className="font-bold">{archState.display.genesis ? "Yes" : "No"}</b>
              </span>
              {archState.display.reach && <span className="text-label text-muted-foreground">{archState.display.reach}</span>}
              {archState.display.count && <span className="text-label text-muted-foreground">{archState.display.count}</span>}
            </span>
          </Fact>
        )}
        {archState.kind === "acquiring" && (
          /* The held-slot acquiring form: a reading for this machine is genuinely arriving
             (the census fetch is in flight), so the row holds its place with the stars rather
             than popping in when the value lands. */
          <Fact label="Full archive">
            <NodeStars count={4} />
          </Fact>
        )}
        {archState.kind === "na" && (
          <Fact label="Full archive">
            {/* The layer wears its chip, the same token the Composition line uses — one layer
                vocabulary everywhere (user, 2026-08-14: "not an L0 validator, use the L0 chip").
                "n/a", not "None" (user, 2026-08-15): the machine runs no L0 process, so the
                question doesn't apply — "None" would claim it could have kept one and didn't. */}
            <span
              className="flex flex-col items-end"
              title="A chain's snapshots are served by its L0 validators; this node runs no L0 process, so it keeps no snapshot archive."
            >
              <b className="font-bold">n/a</b>
              <span className="inline-flex items-center gap-1 text-label text-muted-foreground">
                not an <RoleChips codes={["L0"]} /> validator
              </span>
            </span>
          </Fact>
        )}
        {archState.kind === "unmeasured" && (
          <Fact label="Full archive">
            <span
              className="text-muted-foreground"
              title="The archive census (refreshed every few hours) has no reading for this node — it was unreachable at probe time, not Ready then, or joined the cluster since."
            >
              Unmeasured
            </span>
          </Fact>
        )}
      </FactGroup>
      {/* The look-up column: this node's own reference, and nothing else — the unique reference
          LAST, where references sit, which falls out of the grammar rather than being a rule of
          its own. Truncated display, full hash on hover. */}
      {p.node?.id && (
        <Foot>
          <FootRow label="Node id" value={midHash(p.node.id, 30)} title={p.node.id} copy={p.node.id} />
        </Foot>
      )}
    </>
  );
}

// ── The COUNTRY card (Geography · country drill) ────────────────────────────────────────────
// Selected via the geo focus ladder's country rung (`store.country`, a bare cc code — NOT a
// PickDescriptor, so it isn't routed through InspectorCard's dispatch; Inspector.tsx renders it
// directly from the store channel, mirroring this same head/body split). Facts derive from
// `store.selNodes` — deliberately the explorer's scope, the same data lane GeoExplore's own
// leaderboard/accordion reads, matched here by `cc` instead of grouped by display name.

// No countryName(cc) lookup exists anywhere in the app — the display name only ever arrives on a
// NodeRow (copied verbatim off the geo-IP lookup), so it's read off a matching row, same as
// GeoExplore's own leaderboard rows resolve their name. ONE home, shared by the title and the
// aside, so the two can't disagree about whether a name is even known.
function countryDisplayName(cc: string, selNodes: ReturnType<typeof useStore.getState>["selNodes"]) {
  return selNodes.find((r) => r.cc === cc)?.country ?? null;
}

// Head title: the country mark + display name (rolls via titleKey=cc, synced with the
// edge pulse) — same "kind mark leads the title" grammar as every other card head.
export function CountryTitle({ cc }: { cc: string }) {
  const selNodes = useStore((s) => s.selNodes);
  const name = countryDisplayName(cc, selNodes) ?? cc;
  const Mark = COUNTRY_ICON;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      <span className="truncate">{name}</span>
    </span>
  );
}

// The ISO code rides the title-row ASIDE (user, 2026-08-10): the country was the ONE card head
// still leaving that slot empty. The code is the subject's own short form — the same role the
// dossier's ticker plays, so it takes the same weight, but MUTED rather than hued: a place carries
// no identity, and the head's tinted mark is already the filter's accent.
// Suppressed when the display name is unknown — the title has then already fallen back to the code
// itself, and a head must not say the same thing twice (the same rule the pile follows).
export function CountryAside({ cc }: { cc: string }) {
  const selNodes = useStore((s) => s.selNodes);
  if (!countryDisplayName(cc, selNodes)) return null;
  return (
    <span className="text-label font-semibold tracking-[0.02em] uppercase text-muted-foreground">
      {cc}
    </span>
  );
}

export function CountryCard({ cc }: { cc: string }) {
  const selNodes = useStore((s) => s.selNodes);
  const rows = useMemo(() => selNodes.filter((r) => r.cc === cc), [selNodes, cc]);
  const cities = useMemo(
    () => new Set(rows.map((r) => r.city).filter((c): c is string => !!c)),
    [rows],
  );
  const providers = useMemo(
    () =>
      new Set(
        rows
          .map((r) => ("geo" in r.pick ? r.pick.geo?.isp : undefined))
          .filter((p): p is string => !!p),
      ),
    [rows],
  );
  const share = selNodes.length > 0 ? Math.round((rows.length / selNodes.length) * 100) : 0;
  const facts: { label: string; value: string }[] = [
    { label: "Nodes", value: String(rows.length) },
    { label: "Share of selection", value: `${share}%` },
    { label: "Cities", value: String(cities.size) },
    { label: "Providers", value: String(providers.size) },
  ];
  return (
    <FactGroup>
      {facts.map((f) => (
        <Fact key={f.label} label={f.label}>{f.value}</Fact>
      ))}
    </FactGroup>
  );
}

// ── The COMPOSITION card (Hypergraph · make-up group) ───────────────────────────────────────
// Hyper's rung between a network and a node (`store.composition`, a `CompositionSel`
// {netId, key}): the machines in one network that run the SAME set of layers — the metagraph
// card's own composition vocabulary (Hybrid / Data / …), promoted from a browse-only grouping to
// a committable subject (2026-08-02). Members are re-resolved LIVE from `selNodes` through the
// shared `compositionGroups` helper — the same dedupe-to-machines the explorer rows use, so the
// count here and the count on the row can't disagree. The label + layer codes come from the KEY,
// so the head still reads correctly for a group that has momentarily emptied out — read back
// through `parseCompositionKey`, the builder's own inverse, so the key format lives in ONE module.
export function CompositionTitle({ sel }: { sel: CompositionSel }) {
  const Mark = COMPOSITION_ICON;
  const { label } = parseCompositionKey(sel.key);
  return (
    <span className="flex items-center gap-2 min-w-0 max-w-full">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      {/* "<Label> validators", not the bare word (user, 2026-08-16 — aligning with the explorer
          depth caption's "…validators" register): the bare "Hybrid"/"Consensus" read as a
          category, not as the machines it names; the aside's layer chips still carry the codes. */}
      <span className="truncate min-w-0">{label} validators</span>
    </span>
  );
}

// The layer codes ride the HEAD's aside, not a body row (user, 2026-08-02): they are what the
// group IS — the head's own qualifier, like the node card's status pill — so they sit on the title
// row where every other card puts its subject mark, and they survive a collapse.
export function CompositionAside({ sel }: { sel: CompositionSel }) {
  const { codes } = parseCompositionKey(sel.key);
  if (codes.length === 0) return <span className="text-body text-muted-foreground">—</span>;
  return <RoleChips codes={codes} />;
}

export function CompositionCard({ sel }: { sel: CompositionSel }) {
  const selNodes = useStore((s) => s.selNodes);
  const groups = useMemo(() => compositionGroups(selNodes), [selNodes]);
  const members = groups.find((g) => g.key === sel.key)?.rows ?? [];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const share = total > 0 ? Math.round((members.length / total) * 100) : 0;
  const cfg = metagraphById(sel.netId);
  return (
    <FactGroup>
      <Fact label="Nodes">{members.length}</Fact>
      <Fact label="Share of network">{share}%</Fact>
      <Fact label="Network">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <IdentityDot hue={identityHudHex(sel.netId)} />
          <span className="truncate">{cfg?.name || sel.netId}</span>
        </span>
      </Fact>
    </FactGroup>
  );
}

// ── The PROVIDER card (Geography · city×provider cohort) ────────────────────────────────────
// Selected via the ladder's rung between a node and its country (`store.cohort`, a `CohortSel`
// {cc, city, isp} — internal name stays `cohort`, ALL user-facing copy says "provider", per the
// naming split the spec records). Member match mirrors GeoExplore's `cohortsOf` grouping exactly
// (same city + same `geo.isp`, `null` counting as a match), just applied against one fixed key
// instead of building the whole group.

export function ProviderTitle({ sel }: { sel: CohortSel }) {
  const Mark = PROVIDER_ICON;
  return (
    <span className="flex items-center gap-2 min-w-0 max-w-full">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      {/* The PROVIDER alone is the headline (user, 2026-08-02) — the city rides the head's aside
          (2026-08-09), and the country belongs to the parent country card the cohort sits under. */}
      <span className="truncate min-w-0">{sel.isp ?? "Unknown provider"}</span>
    </span>
  );
}

// The cohort's CITY, right-aligned on the head's title row (user, 2026-08-09 — swapped with the
// ASN that used to sit here). City×provider IS the cohort key, so both halves now read as one line
// while the card is collapsed, and the ASN moves down to the body as a labelled reference — the
// same rule the node card follows with NODE ID. `truncate` + a max width so a long city name yields
// to the provider name rather than crushing it (the aside is `flex-none` in CardHead).
export function ProviderAside({ sel }: { sel: CohortSel }) {
  return (
    <span className="max-w-[52%] truncate text-label text-muted-foreground">
      {sel.city ?? "Unlocated"}
    </span>
  );
}

export function ProviderCard({ sel }: { sel: CohortSel }) {
  const selNodes = useStore((s) => s.selNodes);
  const members = useMemo(
    () =>
      selNodes.filter((r) => {
        const geo = "geo" in r.pick ? r.pick.geo : undefined;
        return r.cc === sel.cc && (r.city || null) === sel.city && (geo?.isp || null) === sel.isp;
      }),
    [selNodes, sel.cc, sel.city, sel.isp],
  );
  // Distinct networks among the members, first-seen order — "dag" resolves through
  // metagraphById like every other subject id.
  const networkIds = useMemo(() => {
    const seen: string[] = [];
    for (const r of members) {
      const id = pickNetId(r.pick);
      if (id && !seen.includes(id)) seen.push(id);
    }
    return seen;
  }, [members]);
  // Members of one city×provider cohort share an AS number, so the first member that reports one
  // speaks for the cohort.
  const asn = useMemo(() => {
    for (const r of members) {
      const geo = "geo" in r.pick ? r.pick.geo : undefined;
      if (geo?.asn) return geo.asn;
    }
    return null;
  }, [members]);
  return (
    <FactGroup>
      {/* ASN — the provider's REFERENCE, in the slot the city vacated when it moved to the head
          (user, 2026-08-09). The COUNTRY is deliberately absent: the cohort always sits under a
          committed country, whose own card states it one slot up (user, 2026-08-02 — a facts rail
          shouldn't say the same thing twice). */}
      <Fact label="ASN"><span className="font-mono">{asn ?? "—"}</span></Fact>
      <Fact label="Nodes">{members.length}</Fact>
      <Fact label="Networks">
        <span className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 min-w-0">
          {networkIds.length === 0 ? (
            <span>—</span>
          ) : (
            networkIds.map((id) => {
              const cfg = metagraphById(id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5">
                  <IdentityDot hue={identityHudHex(id)} />
                  {cfg?.ticker || cfg?.name || id}
                </span>
              );
            })
          )}
        </span>
      </Fact>
    </FactGroup>
  );
}
