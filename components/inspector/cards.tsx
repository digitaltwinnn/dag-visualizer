"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { shortHash, metagraphById, getNetwork, SIGNER_GROUPS, nodeSigned, coLocatedNetworks, filterAccent } from "@/src/data/network";
import { UNLISTED_ID, UNLISTED_HUE, observedUnlistedIds } from "@/src/data/unlisted";
import { identityHudCss } from "@/src/palette/identity";
import { fmtDag, fmtKB, midHash } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import type { GlobalSnapshot, MetaCfg, PickDescriptor } from "@/src/data/types";
import { metaSnapDeepKey } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import Odometer from "@/components/Odometer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SonarRing, NodeStars } from "@/components/state/StateAtoms";
import { VIEW_ICONS, SNAPSHOT_ICON, COUNTRY_ICON, PROVIDER_ICON, COMPOSITION_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useMinHold } from "@/components/useMinHold";
import { useArchive, archiveFactState, archiveReach, archiveSchedule, archiveSummary, fmtSnapCount, fmtReach, useChainSpan } from "@/components/useArchive";
import { useNodeNames, nodeName } from "@/components/useNodeNames";
import { POLL } from "@/src/engine/config";
import { cap, Desc, StatusMark, RoleChips, IdentityDot, networkKind, Fact, FactGroup, Foot, FootRow, LayerWho, ScheduleTable, partShade, Lead, Empty, QualifierChip, TickerChip, LayerCells, Door, SectionLabel, shareWords, type SchedulePart } from "./parts";
import { statusItems } from "@/src/data/nodeStatus";
import { compositionGroups, compositionRows, nodeCompositionLabel, parseCompositionKey } from "@/src/data/composition";
import { pickNetId } from "@/src/engine/domain/pickActions";
import type { CohortSel, CompositionSel } from "@/src/engine/domain/focusLadder";
import FollowControl from "@/components/FollowControl";
import { NODE_ID_GLYPHS } from "@/components/explorer/nodeRow";
import { IDENT_INK } from "@/components/identInk";

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
      <Odometer value={d.ordinal} className="font-mono text-title font-semibold text-foreground tabular-nums" />
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
export function SnapshotAside(_: { data: GlobalSnapshot }) {
  // The same LIVE / PINNED switch the Snapshots explorer wears (user, 2026-09-29: a pin read as
  // pinned there and as a bare "◷ 12s" here). It reads the committed snapshot — the one this card
  // shows — else the live tip.
  return <FollowControl />;
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
  // The unlisted pseudo-network keeps its mandated neutral — identityHudCss would hash-assign a
  // saturated hue to the "unlisted" id, and no single identity can speak for a mixed set. Same
  // guard LedgerPanel applies (UNLISTED_HUE is the one home, src/data/unlisted.ts).
  const hue = cfg.id === UNLISTED_ID ? UNLISTED_HUE : identityHudCss(cfg.id);
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
        <AvatarFallback className={IDENT_INK} style={{ color: hue }}>{monogram}</AvatarFallback>
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
  // TITLED BY THE NODE, NOT ITS CITY (user, 2026-09-29): the explorer's node row names a node by
  // its id, and under a committed provider the city is the card above's own title — the pile rule
  // says a card never restates an ancestor. The id, shown exactly as the row shows it, is what
  // tells a node from its siblings; the city is a body fact that yields to the provider card.
  const id = node.node?.id;
  const title = id ? midHash(id, NODE_ID_GLYPHS) : node.node?.ip || "Node";
  const color = node.kind === "metanode" ? (node.meta ? identityHudCss(node.meta.id) : undefined) : identityHudCss("dag");
  const Mark = VIEW_ICONS.geo;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {color && <Mark className={KIND_MARK_CLASS} style={{ color }} aria-hidden />}
      <span key={id ?? title} className="min-w-0 roll-in font-mono tabular-nums">{title}</span>
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
  if (!node) return null;
  // ALWAYS THE STATE PILL (the card skeleton, 2026-10-02): a head's right slot is a qualifier or a
  // state, and the "signed N" relation it held since 2026-08-15 is the LEAD's now, where relations
  // read — so the status no longer has to move into a body row to make room.
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
              <span className="text-muted-foreground"><Empty why="The exact read of this snapshot failed" /> <span className="text-label">read failed</span></span>
            ) : (
              <span className={cn("flex flex-col items-end", feeHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}><NodeStars count={4} /></span>
            )}
          </Fact>
        </FactGroup>
      ) : (
        <FactGroup>
          {/* REGULAR WEIGHT, AND THE SIZE IS A FACT OF ITS OWN (the card skeleton, 2026-10-02): the
              card's one headline figure sits on the breakdown's section label, and "50 KB
              anchored" hung under the fee as a note about a different quantity. */}
          {exact.totalFee > 0 && (
            <Fact label="Fees paid">
              <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap">{fmtDag(exact.totalFee)} DAG</span>
            </Fact>
          )}
          {exact.totalSizeKB > 0 && (
            <Fact label="Size">
              <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap">{fmtKB(exact.totalSizeKB)}</span>
            </Fact>
          )}
          {exact.rewardsDatum > 0 && (
            <Fact label="Rewards out">
              <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap">{fmtDag(exact.rewardsDatum)} DAG</span>
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
        <FootRow label="Hash" value={midHash(d.hash, 23)} title={d.hash} copy={d.hash} copyName="hash" />
        {d.lastSnapshotHash && (
          <FootRow label="Previous" value={midHash(d.lastSnapshotHash, 18)} title={d.lastSnapshotHash} copy={d.lastSnapshotHash} copyName="previous hash" />
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
          <span className="text-label tracking-caps uppercase text-muted-foreground">Network id</span>
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

// EACH SCHEDULE GROUP DISCLOSES (user, 2026-09-10: "add a dropdown chevron to each
// breakdown") — the one Collapsible + .disclose-panel recipe, the caption row as the
// trigger. The chevron stays ALWAYS visible (not the explorer's hover-reveal: a folded
// group's caption is otherwise indistinguishable from a plain label, and the chevron was
// asked for as the affordance), rotating on the shared 150ms clock.
// CLOSED by default (user, round 21) — the captions are the card's index and a breakdown
// is opened on demand; state is local and plain — folding commits nothing, so the store
// owns none of it — and survives pager steps, since the group's identity does.
function ScheduleGroup({
  label,
  value,
  children,
  defaultOpen = false,
}: {
  label: string;
  /** A FACT-REGISTER header (user, 2026-09-26: "make the 'online nodes' element the one used for
   *  the breakdown"): the label in the Fact row's body type with this value right-aligned — the
   *  total the schedules below partition IS the disclosure, so the reader opens the number to
   *  see what it is made of. Without it the header is the quiet eyebrow-style caption. */
  value?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* No default focus ring and no text selection (user, round 22: clicking drew "an
          ugly white selection border … separate to the chevron" — the double-click text
          selection, which can never include the chevron): the row is one CONTROL, so it
          selects nothing, and focus shows only for the keyboard in CopyButton's own
          focus-visible recipe. */}
      <CollapsibleTrigger className="group mt-2 flex w-full items-center gap-1 cursor-pointer select-none outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]">
        {/* A SECTION LABEL in both forms (the card skeleton, 2026-10-02): caps and muted, the
            total it heads on the right — the breakdown slot's one heading recipe. */}
        <span className="text-label tracking-caps uppercase text-muted-foreground">{label}</span>
        {value !== undefined && <span className="ml-auto min-w-0 text-body text-foreground tabular-nums text-right">{value}</span>}
        {/* THE FOLD MARK SITS AT THE ROW'S FAR END, after the total (user, 2026-10-02: "it is on the
            text; where does it belong?") — the same place and the same glyph as the snapshot card's
            expandable rows, so the rail has one disclosure mark. It is not the pager's ‹ ›: those
            STEP to a sibling, this one folds the rows beneath it, which is why it is the smaller
            muted chevron that turns down when open. */}
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 flex-none text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            value === undefined && "ml-auto",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="disclose-panel">
        <div className="mt-1 pl-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// THE "BY ARCHIVAL" GROUP — one renderer for every dossier (user, 2026-09-10: "missing the
// archival breakdown for DAG / hypergraph; should behave the same"): the census's reaches as
// the parts of one stacked bar (2026-09-26), the honest unmeasured remainder, stars while
// the census is in flight. The metagraph dossiers seat it as the third schedule under Online
// nodes; the DAG dossier seats the same group standalone (its roster isn't `nodes`).
function ArchivalGroup({ sched }: { sched: ReturnType<typeof archiveSchedule> }) {
  return (
    <ScheduleGroup label="by archived snapshots" defaultOpen>
      {sched ? <ScheduleTable axis="Depth" axisTitle="Archive depth — how far back each node's snapshot archive reaches" parts={archiveParts(sched)} /> : <ArchivalAcquiring />}
    </ScheduleGroup>
  );
}

/** The archive schedule's rows as the parts of one bar: the census's kinds in the neutral hue,
 *  stepped down per row, each part's title carrying what its tag column used to say. */
function archiveParts(sched: NonNullable<ReturnType<typeof archiveSchedule>>): SchedulePart[] {
  const parts: SchedulePart[] = sched.rows.map((row, i) => ({
    label: cap(row.label),
    count: row.count,
    color: partShade("var(--muted-foreground)", i),
    title:
      row.hint ??
      (row.kept != null ? `${fmtSnapCount(row.kept)} snapshots kept${row.fullCount > 0 ? " · full archive" : ""}` : undefined),
  }));
  // The honest remainder (an absent probe entry proves nothing about what a node keeps) is a
  // part of the same bar, last and faintest, so the bar still sums to the fleet.
  if (sched.unmeasured > 0)
    parts.push({
      label: "Unknown",
      count: sched.unmeasured,
      color: partShade("var(--muted-foreground)", sched.rows.length + 1),
      title: "The probe read nothing from these nodes — what they keep is unknown.",
    });
  return parts;
}

/** The archival schedule while the census is IN FLIGHT — stars in the slot the bar will fill.
 *  (The table this used to draw when the census had landed retired with the stacked bars,
 *  2026-09-26.) */
function ArchivalAcquiring() {
  return (
    <div className="flex items-center gap-2 py-1.5 text-label text-muted-foreground">
      <NodeStars count={4} />
    </div>
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
  // ONE schedule for both seats (the fleet's third group and the DAG's standalone block —
  // review cleanup, 2026-09-11: it was computed twice, once in an inline IIFE): the DAG's
  // chain in the census is "global" and its unmeasured remainder counts against the census's
  // own probed universe (its roster isn't `nodes`); a metagraph counts against its live fleet.
  // Memoized — archiveSchedule walks every census entry with date parsing, and this card
  // re-renders on every poll and hover.
  const hue = cfg.id === UNLISTED_ID ? UNLISTED_HUE : identityHudCss(cfg.id);
  const archSched = useMemo(
    () =>
      archCensus
        ? archiveSchedule(archCensus, cfg.id === "dag" ? "global" : cfg.id, cfg.id === "dag" ? archCensus.total : nodes.length)
        : null,
    [archCensus, cfg.id, nodes.length],
  );
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
  // just not ready yet).
  const states = nodes.map((n) => n.state);
  // Hover pairing (synced 3D hub glow) lives on the OUTER pane (ContextCard's #metapane), not here.
  // The full identity header (avatar + name + ticker) lives in the card HEAD now (MetaTitle via
  // CardHead's title slot, rolled via titleKey) — the body starts at the description.
  return (
    <>
      {/* Keyed on the text so the expand state resets when the subject (or its description
          arriving from /api/metagraphs) changes — an expanded DOR must not leak into DED. */}
      <Desc key={blurb} text={blurb} />
      {(nodes.length > 0 || (cfg.id !== "dag" && cfg.id !== UNLISTED_ID && metagraphById(cfg.id) != null)) && (
        <>
          {/* The skeleton's separator between the lead and the breakdown (user, 2026-10-02). */}
          <Separator className="mt-2.5" />
          {/* THE SCHEDULE FORM (user, 2026-09-10: "both are breakdowns of the same total …
              look at accounting"). Accounting's double-breakdown device is the SCHEDULE: the
              control total LEADS, and each partition follows as a labeled of-which schedule
              under one roof — the grouping, the "by …" labels and the slight inset carry the
              relation that three divider-separated segments lost. This flips the 2026-07-12
              totals-below rule to the band's own later ruling ("a total lives inside its own
              breakdown and LEADS it"); the separators between the partitions retire, and the
              indent keeps two column-aligned tables from reading as ONE summing to twice the
              fleet (the job the middle separator used to do). "by status" ALWAYS renders now
              (user, 2026-09-10 — it retired the 2026-08-18 all-ready-is-silent gate: with
              the groups folded to caption rows, an omitted group reads as a missing section,
              and an all-ready fleet opening to its one Ready row IS the reading). */}
          {/* The CONTROL TOTAL leads in the normal Fact grammar with a divider beneath it
              (user, 2026-09-10, round 2: the larger font read as just a big number — the
              DIVIDER is what says "what follows partitions this"). Shown even at 0 for a
              catalog metagraph (an empty fleet is a reading); the schedules below skip then. */}
          {/* THE TOTAL IS THE DISCLOSURE (user, 2026-09-26, two rounds): the three "by …" rows
              became one open group, and then the "Online nodes" fact became that group's own
              header — the total the schedules partition, with the count right-aligned in the
              Fact grammar, so opening the number shows what it is made of. Mono and bold, like
              the partition counts it totals (`/design`'s sans/mono split). At 0 nodes there is
              nothing to partition, so the fact stands alone (an empty fleet is a reading). */}
          {nodes.length === 0 ? (
            <div className="mt-3">
              <Fact label="Online nodes">
                <b className="font-mono font-bold">0</b>
              </Fact>
            </div>
          ) : (
            <div className="mt-1">
              {/* ONE TABLE, THE SQUARES ARE THE BARS (user, 2026-10-02, `breakdown-2.html` D2): each
                  partition is a group of rows — name, count, one square per node — so the legend
                  and its dots are gone. It replaced the stacked bars below:
                  THREE STACKED BARS, ONE PER PARTITION (design 2026-09-26, `dossier-breakdown` A;
                  the captioned tables under hairlines read as three sections): composition in
                  the network's hue, status in the bucket colours, archive depth in the neutral —
                  each one bar of the same total, its parts named beneath. The chips and the
                  depth tags ride the parts' titles. "Depth" in the column, "Archive depth" on hover (user, 2026-10-02: shorter — the two
                  words wrapped); never the bare "archive" (user: it is
                  how far back each node's archive reaches, not a size). */}
              <ScheduleGroup label="Online nodes" value={<b className="font-mono font-bold">{nodes.length}</b>} defaultOpen>
                <ScheduleTable
                  axis="Composition"
                  parts={compositionRows(nodes).map((r, i) => ({ label: r.label, count: r.count, color: partShade(hue, i), title: r.codes.join(" · ") }))}
                />
                <ScheduleTable axis="Status" parts={statusItems(states).map((it) => ({ label: cap(it.label), count: it.count, color: it.color }))} />
                {archSched != null ? (
                  <ScheduleTable axis="Depth" axisTitle="Archive depth — how far back each node's snapshot archive reaches" parts={archiveParts(archSched)} />
                ) : archAcquiring ? (
                  <ArchivalAcquiring />
                ) : null}
              </ScheduleGroup>
            </div>
          )}
        </>
      )}
      {/* The ZERO-FLEET archival reading — the DAG dossier always lands here (its roster
          isn't `nodes`), and a catalog metagraph whose live fleet reads 0 keeps its census
          data too (review find, 2026-09-11: the old fleet-gated block silently dropped a
          probed chain's archival facts, and the acquiring stars with them, on a fleet dip).
          The SAME by-archival schedule the metagraph dossiers carry (user, 2026-09-10: "missing the archival breakdown for DAG /
          hypergraph; should behave the same" — this absorbs the old single "Full archive
          nodes" fact). Its chain in the census is "global"; the unmeasured remainder counts
          against the census's own probed universe, the global L0 fleet at probe time —
          the DAG core's roster isn't `nodes` (that list is per-metagraph). Deep-kind rows
          ("back to Nov 2023") carry their SPAN as the kept chip — archiveSchedule's rule,
          with the shared-gaps caveat riding the chip's own hover, since the deep archives
          hold the reach, not every ordinal in it. */}
      {nodes.length === 0 && ((archSched?.rows.length ?? 0) > 0 || archAcquiring) && (
        <>
          <Separator className="my-2" />
          <ArchivalGroup sched={archSched} />
        </>
      )}
      {unlistedMembers.map((id, i) => (
        <UnlistedMemberFacts key={id} id={id} last={i === unlistedMembers.length - 1} />
      ))}
      {/* The site reference LAST, where references sit (the node card's reading order). */}
      {site && (
        <div className="mt-2.5">
          <MetaSiteRow site={site} flushFoot={!!footId} />
        </div>
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
          <FootRow label="Id" value={midHash(footId, 25)} title={footId} copy={footId} copyName="network id" />
          {chainSpan?.owner && (
            <FootRow
              label="Owner"
              value={midHash(chainSpan.owner, 21)}
              copyName="owner address"
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
    // The one ticker chip (`TickerChip`). Unlisted stays neutral — same guard as MetaTitle above.
    <TickerChip text={cfg.ticker} hue={cfg.id === UNLISTED_ID ? UNLISTED_HUE : identityHudCss(cfg.id)} />
  );
}

// The dossier's site link as a labelled BODY row (user, 2026-08-08 — the icon-only aside link
// was never used and the aside slot now carries the ticker). References sit last, where
// references sit: domain text + the ExternalLink glyph, in the link language (`text-primary`).
function MetaSiteRow({ site, flushFoot }: { site: string; flushFoot?: boolean }) {
  const domain = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // A DOOR (the card skeleton, 2026-10-02): every way out of a card is the one full-bleed row —
  // it was a fact row holding a link, one of four action forms.
  return (
    <Door label="Site" href={site} glyph={<ExternalLink className="size-3.5" />} flushFoot={flushFoot}>
      {domain}
    </Door>
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
  const signed = useSignedSelected(p.node);
  // The operator's self-registered ALIAS from the delegated-staking registry (user,
  // 2026-08-16 — "those names look informal often": a content attribute, never the title; and
  // "alias" is the user-facing word, "nickname" stays the internal register). The registry
  // keys on a PEER ID, so the name names a keypair — and a host that reuses one keypair
  // across networks (the Upsider pattern) carries it on its metagraph record too, which is
  // why the match runs for every node kind (user, 2026-08-16: "keep it actual"). The row is
  // ALWAYS stated, a dash when nothing resolves. (The registry's other reading — the
  // delegated-staking opt-in — had a row under it until 2026-10-02; see the note in the body.)
  const nickState = useNodeNames();
  const nickname = nodeName(nickState.names, p.node);
  // The three ancestor rungs that can own one of this card's facts.
  const country = useStore((s) => s.country);
  const cohort = useStore((s) => s.cohort);
  // Hosting provider from the node's IP lookup (GeoInfo.isp/asn) — Absent = the lookup didn't
  // know; the line simply doesn't render (honesty: no "Unknown" filler in a facts card).
  const geo = "geo" in p ? p.geo : undefined;
  // The node's make-up: the composition word + its layer codes as squared pills (RoleChips — the
  // same rendering the metagraph card's composition rows use; user 2026-07-12: the joined
  // "L0·cL1" text read as one token). Sentence-cased ("Hybrid" / "Currency") to match the
  // composition rows' label style — text-label is the UPPERCASE lane (labels), word values at
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
  const archReach = archEntry ? archiveReach(archEntry) : null;
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
  // THE LEAD (the card skeleton, 2026-10-02): the relation to the chamber's subject when there is
  // one, then where the node sits and who hosts it — the City / Country / Hosting rows read as one
  // sentence. Each piece still YIELDS to the ancestor card that states it (the pile rule), so
  // under a committed country and provider the lead is the relation alone, or nothing: a card
  // never restates its ancestors to fill a slot.
  const place = [cohort == null ? geo?.city : null, country == null ? geo?.country : null].filter(Boolean).join(", ");
  const leadBits = [place, cohort == null ? geo?.isp : null].filter(Boolean).join(" · ");
  return (
    <>
      {(signed != null || leadBits) && (
        <Lead>
          {signed != null && (
            <span title="This node is among the committed metagraph snapshot's proof signers — a snapshot is signed by the metagraph's own L0 validators.">
              Signed {signed.toLocaleString()}{leadBits ? ". " : "."}
            </span>
          )}
          {/* A host name may end in its own period ("Amazon.com, Inc.") — never two. */}
          {leadBits ? `${leadBits.replace(/\.$/, "")}.` : null}
        </Lead>
      )}
      {/* WHAT IT RUNS, DRAWN (user, 2026-10-02 — `docs/superpowers/design/2026-10-02-node-card`,
          option C). The node card was a lead and six rows of equal weight; a node's two real
          questions are what it runs and how much of its chain it keeps, so those two lead as
          SECTIONS and the look-up facts follow as plain rows. The three layers are three cells,
          lit when the node runs them — so a validator and a data node look different, and what a
          node does NOT run is shown rather than left out. Shown even under a committed
          composition card: the cells are this node's own make-up, and the picture is the card. */}
      {codes && codes.length > 0 && (
        <>
          <Separator className="mb-2" />
          <SectionLabel label="Runs" total={<span className="font-sans font-normal">{comp}</span>} className="mb-1.5" />
          <LayerCells codes={codes} />
        </>
      )}
      {archState.kind !== "none" && (
        <>
          <Separator className="mt-2.5 mb-2" />
          <SectionLabel
            label="Archive"
            total={
              <span className="font-sans font-normal">
                {archState.kind === "value" ? archState.display.value : archState.kind === "acquiring" ? <NodeStars count={4} /> : (
                  <Empty why={archState.kind === "na"
                    ? "A chain's snapshots are served by its L0 validators; this node runs no L0, so it keeps no snapshot archive."
                    : "The archive census (refreshed every few hours) has no reading for this node — it was unreachable at probe time, not Ready then, or joined the cluster since."} />
                )}
              </span>
            }
            className="mb-1"
          />
          {archState.kind === "value" && archEntry && archive && (
            <div
              title={
                archEntry.kind === "genesis"
                  ? "Serves its chain's every snapshot, back to the first"
                  : archEntry.kind === "deep"
                    ? `Serves global snapshots back to the metagraph era (${archive.since}), with some gaps — one of ${archive.archivalCount} archival L0 validators of ${archive.total} probed`
                    : `Serves the most recent ${(archEntry.latest - archEntry.floor).toLocaleString()} snapshots of its chain, back to ordinal ${archEntry.floor.toLocaleString()}; older history is discarded`
              }
            >
              {archReach != null && (
                <span aria-hidden className="block h-[5px] rounded-full bg-wash-strong overflow-hidden">
                  <span
                    className="block h-full ml-auto rounded-full min-w-[2px]"
                    style={{
                      width: `${archReach * 100}%`,
                      background: archState.display.genesis ? "var(--success)" : "var(--muted-foreground)",
                      opacity: archEntry.kind === "deep" ? 0.6 : 1,
                    }}
                  />
                </span>
              )}
              {archState.display.note && <span className="mt-1 block text-label text-muted-foreground">{archState.display.note}</span>}
            </div>
          )}
          {archState.kind === "na" && <span className="block text-label text-muted-foreground">Only an L0 keeps a snapshot archive.</span>}
        </>
      )}
      <Separator className="mt-2.5 mb-2" />
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
            <Empty why="No display name is registered for this node's keys in the Global L0's delegated-staking registry." />
          ) : (
            <Empty why="The delegated-staking registry could not be read — retried on the next visit." />
          ))}
        </Fact>
        {/* The "Delegated staking · Yes/No" row is REMOVED for now (user, 2026-10-02: "what does it
            represent? Remove it for now"). It read the Global L0 registry's opt-in — whether the
            operator REGISTERED as a candidate DAG holders can delegate to — and "Yes" was too easy
            to read as "has stake delegated", which the data does not say. */}
        {/* The provider's NUMBER — its name is in the lead, or is the provider card's title. */}
        {asn && <Fact label="ASN"><span className="font-mono">{asn}</span></Fact>}
        {/* CO-LOCATED — the machine's other tenant networks (see the note above). Each name
            keeps its identity dot: a metagraph's hue is the same everywhere it appears. */}
        <Fact label="Co-located">
          {colo == null ? (
            <NodeStars count={3} />
          ) : colo.length ? (
            <span
              className="inline-flex items-center gap-1.5"
              title="Another network runs its layers at this node's IP — one host answering in more than one cluster."
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
            <Empty why="No other network has a node at this IP." />
          )}
        </Fact>
      </FactGroup>
      {/* The look-up column: this node's own reference, and nothing else — the unique reference
          LAST, where references sit, which falls out of the grammar rather than being a rule of
          its own. Truncated display, full hash on hover. */}
      {p.node?.id && (
        <Foot>
          <FootRow label="Node id" value={midHash(p.node.id, 20)} title={p.node.id} copy={p.node.id} copyName="node id" />
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
  // A QUALIFIER CHIP, like every head's (the card skeleton, 2026-10-02) — still muted, still the
  // subject's own short form.
  return <QualifierChip className="uppercase tracking-[0.02em]">{cc}</QualifierChip>;
}

/** A set of node rows cut BY NETWORK, as the breakdown table's parts: each network in its identity
 *  hue, largest first; rows on no known network roll into one neutral part. One home for the
 *  country and provider cards, so the two can't count a network differently. */
function networkParts(rows: { pick: Parameters<typeof pickNetId>[0] }[]): SchedulePart[] {
  const by = new Map<string, number>();
  let other = 0;
  for (const r of rows) {
    const id = pickNetId(r.pick);
    if (id) by.set(id, (by.get(id) ?? 0) + 1);
    else other++;
  }
  const parts: SchedulePart[] = [...by.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([id, count]) => ({ label: metagraphById(id)?.name || id, count, color: identityHudCss(id) }));
  if (other > 0) parts.push({ label: "Other", count: other, color: "var(--muted-foreground)", title: "Nodes on no known network" });
  return parts;
}

/** A country's nodes cut BY PROVIDER, as the breakdown table's parts: the three largest hosts,
 *  then everything else as one "N others" row, in the neutral ramp (a host carries no identity
 *  hue). Nodes whose lookup named no host are counted with the others, so the parts always sum
 *  to the country's total. */
function providerParts(rows: { pick: PickDescriptor }[]): SchedulePart[] {
  const by = new Map<string, number>();
  let unknown = 0;
  for (const r of rows) {
    const isp = "geo" in r.pick ? r.pick.geo?.isp : undefined;
    if (isp) by.set(isp, (by.get(isp) ?? 0) + 1);
    else unknown++;
  }
  const ranked = [...by.entries()].sort((x, y) => y[1] - x[1]);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const parts: SchedulePart[] = top.map(([label, count], i) => ({ label, count, color: partShade("var(--muted-foreground)", i) }));
  const restCount = rest.reduce((n, [, c]) => n + c, 0) + unknown;
  if (restCount > 0)
    parts.push({
      label: rest.length === 1 && unknown === 0 ? rest[0][0] : rest.length > 0 ? `${rest.length} others` : "Unknown host",
      count: restCount,
      color: partShade("var(--muted-foreground)", 3),
      title: rest.length > 0 ? rest.map(([l, c]) => `${l} ${c}`).join(" · ") : "The lookup named no host for these nodes",
    });
  return parts;
}

export function CountryCard({ cc }: { cc: string }) {
  const selNodes = useStore((s) => s.selNodes);
  const rows = useMemo(() => selNodes.filter((r) => r.cc === cc), [selNodes, cc]);
  const cities = useMemo(() => new Set(rows.map((r) => r.city).filter((c): c is string => !!c)), [rows]);
  const parts = useMemo(() => providerParts(rows), [rows]);
  const share = shareWords(rows.length, selNodes.length);
  return (
    <>
      {/* THE LEAD: what this country is to the selection it sits in, and how spread out it is. */}
      {share && (
        <Lead>
          Hosts {share} of the selection&apos;s nodes{cities.size > 0 ? `, in ${cities.size === 1 ? "one city" : `${cities.size} cities`}` : ""}.
        </Lead>
      )}
      {/* EACH CARD CUTS BY THE NEXT LEVEL DOWN (user, 2026-10-02 — `docs/superpowers/design/
          2026-10-02-country-provider`, option B: "country and provider cards have the same content …
          the node part"). Both cards used to cut their nodes by network, so the provider's table was
          the country's, smaller. The country is cut by PROVIDER now — who hosts here — and the
          provider card below it by NETWORK — whose nodes these are: place → host → network down
          the pile, nothing repeated. */}
      <Separator className="mb-2" />
      <SectionLabel label="Nodes" unit="by provider" total={rows.length} className="mb-1.5" />
      <ScheduleTable parts={parts} />
    </>
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
  if (codes.length === 0) return <Empty why="This group names no layer codes" />;
  return <RoleChips codes={codes} />;
}

export function CompositionCard({ sel }: { sel: CompositionSel }) {
  const selNodes = useStore((s) => s.selNodes);
  const groups = useMemo(() => compositionGroups(selNodes), [selNodes]);
  const members = groups.find((g) => g.key === sel.key)?.rows ?? [];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const share = shareWords(members.length, total);
  const cfg = metagraphById(sel.netId);
  const hue = identityHudCss(sel.netId);
  return (
    <>
    {/* THE LEAD: the group's share of its network — the old "Share of network" fact. */}
    {share && <Lead>{share[0].toUpperCase() + share.slice(1)} of this network&apos;s online nodes.</Lead>}
    {/* The divider every card draws between its lead and what follows (lost when the breakdown
        left this card on 2026-10-02). */}
    {share && <Separator className="mb-2" />}
    {/* A PLAIN FACT CARD (user, 2026-10-02, reversing the same day's `visuals.html` strip + status
        table: "of 3 · 1 makes no sense to a human; remove the status row" — that made Nodes a
        regular row, not a breakdown). The group's share is the lead; its status is each node's own. */}
    <FactGroup>
      <Fact label="Nodes">{members.length}</Fact>
      <Fact label="Network">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <IdentityDot hue={hue} />
          <span className="truncate">{cfg?.name || sel.netId}</span>
        </span>
      </Fact>
    </FactGroup>
    </>
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
    // A fixed cap, not a percentage: the head's aside is content-sized, so a percentage of it
    // resolves against the chip's own width and collapsed "Falkenstein" to "Fal…".
    <QualifierChip className="max-w-[150px]" title={sel.city ?? undefined}>{sel.city ?? "Unlocated"}</QualifierChip>
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
  // The members cut by network — "dag" resolves through metagraphById like every other id.
  const parts = useMemo(() => networkParts(members), [members]);
  // Members of one city×provider cohort share an AS number, so the first member that reports one
  // speaks for the cohort.
  const asn = useMemo(() => {
    for (const r of members) {
      const geo = "geo" in r.pick ? r.pick.geo : undefined;
      if (geo?.asn) return geo.asn;
    }
    return null;
  }, [members]);
  const where = countryDisplayName(sel.cc, selNodes) ?? sel.cc;
  const countryShare = shareWords(members.length, selNodes.filter((r) => r.cc === sel.cc).length);
  return (
    <>
    {/* THE LEAD: this host's share of its country — the figure neither card showed (option B,
        2026-10-02). The city is the head's chip, so the lead does not repeat it. */}
    {countryShare && <Lead>{countryShare[0].toUpperCase() + countryShare.slice(1)} of {where}&apos;s nodes.</Lead>}
    {/* THE BREAKDOWN: the cohort's nodes cut by NETWORK — whose nodes these are — the level below
        the country card's cut by provider. */}
    <Separator className="mb-2" />
    <SectionLabel label="Nodes" unit="by network" total={members.length} className="mb-1.5" />
    {parts.length > 0 && <ScheduleTable parts={parts} />}
    <Separator className="my-2" />
    <FactGroup>
      {/* ASN — the provider's REFERENCE, in the slot the city vacated when it moved to the head
          (user, 2026-08-09). The COUNTRY is deliberately absent: the cohort always sits under a
          committed country, whose own card states it one slot up (user, 2026-08-02 — a facts rail
          shouldn't say the same thing twice). */}
      <Fact label="ASN">{asn ? <span className="font-mono">{asn}</span> : <Empty why="No member of this cohort reports an AS number" />}</Fact>
    </FactGroup>
    </>
  );
}
