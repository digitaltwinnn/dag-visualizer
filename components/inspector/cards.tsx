"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { shortHash, CORE_HEX, getNetwork, metagraphById } from "@/src/data/network";
import { identityHudHex } from "@/src/palette/identity";
import { hex, fmtDag, fmtKB } from "@/src/util/format";
import { relativeAge } from "@/src/util/relativeAge";
import { statusBreakdown } from "@/src/data/nodeStatus";
import type { GlobalSnapshot, MetaCfg, PickDescriptor } from "@/src/data/types";
import AnchoredTags from "./AnchoredTags";
import Odometer from "@/components/Odometer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SonarRing, NodeStars, NoSignalDot } from "@/components/state/StateAtoms";
import { VIEW_ICONS, LAYER_ICON, SNAPSHOT_ICON, COUNTRY_ICON, PROVIDER_ICON, COMPOSITION_ICON, KIND_MARK_CLASS } from "@/components/icons";
import { ExternalLink } from "lucide-react";
import { useMinHold } from "@/components/useMinHold";
import { POLL } from "@/src/engine/config";
import { Desc, StatusMark, CompositionRows, StatusBreakdown, RoleChips, IdentityDot, networkKind } from "./parts";
import { compositionGroups, compositionRows, nodeCompositionLabel } from "@/src/data/composition";
import { ledgerLayerById } from "@/src/data/ledgerLayers";
import { pickNetId } from "@/src/engine/domain/pickActions";
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

// Snapshot title-row aside: live-now dot / coarse relative age / the no-signal state.
export function SnapshotAside({ data: d }: { data: GlobalSnapshot }) {
  const latest = useStore((s) => s.latestSnapshot);
  const live = useStore((s) => s.live);
  const isLive = latest != null && d.ordinal === latest.ordinal;
  // Relative recency for an older pick — coarse (freshness, not a ticking clock). Guarded
  // against an unparseable timestamp (→ no age suffix rather than "NaN").
  const rel = relativeAge(Date.now() - Date.parse(d.timestamp));
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      {!live ? (
        <><NoSignalDot /> no signal</>
      ) : isLive ? (
        <>
          <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
          {" "}live now
        </>
      ) : (
        <>◷ {rel}</>
      )}
    </span>
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
        <span className="inline-flex items-baseline gap-1.5 min-w-0">
          <span className="text-label font-semibold tracking-[0.02em] flex-none" style={{ color: hue }}>{cfg.ticker}</span>
          <span className="text-label font-normal text-muted-foreground truncate">{kind}</span>
        </span>
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

// The node's resolved place ("City, Country") — "" when geolocation hasn't resolved.
function nodePlace(node: NonNullable<ReturnType<typeof inspectedNode>>): string {
  const g = node.geo;
  return g ? `${g.city ? g.city + ", " : ""}${g.country ?? ""}`.trim() : "";
}

// Node title: the Geography view mark (Globe — the Geography view's top-bar icon, same view-glyph
// vocabulary as the snapshot head's Layers; identity-hued) + the node's LOCATION ("City, Country" — user-agreed:
// where the node sits is the headline; its hash is bookkeeping, demoted to the subtitle below).
// Fallback when geolocation hasn't resolved: the truncated id (mono) stays the title, no
// subtitle. The roll-in stays keyed on the node ID — the subject's identity, not the title text
// (a new node in the same city still rolls).
export function GeoLiveTitle() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  const id = node.node?.id;
  const place = nodePlace(node);
  const title = place || (id ? shortHash(id) : node.node?.ip || "Node");
  const color = node.kind === "metanode" ? (node.meta ? identityHudHex(node.meta.id) : undefined) : CORE_HEX;
  const Mark = VIEW_ICONS.geo;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {color && <Mark className={KIND_MARK_CLASS} style={{ color }} aria-hidden />}
      <span key={id ?? title} className={cn("min-w-0 roll-in", !place && "font-mono tabular-nums break-all")}>{title}</span>
    </span>
  );
}

// Node subtitle: the truncated id — small/muted/mono, under the location title (CardHead's
// `subtitle` slot supplies the standard block styling). Renders ONLY when the location made it
// to the title; in the no-location fallback the id IS the title.
export function GeoLiveSubtitle() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  // The subtitle = the composition word + its layer codes as squared pills (RoleChips — the
  // same rendering the metagraph card's composition rows use; user 2026-07-12: the joined
  // "L0·cL1" text read as one token). Sentence-cased ("Hybrid") to match the composition
  // rows' label style — the caps RULE: text-micro is the UPPERCASE lane (eyebrows/section
  // tags); word labels at text-label/body are sentence case. The id lives in the body's
  // NODE ID row, last: the reference number sits where references sit.
  const compWord = node.node ? nodeCompositionLabel(node.node) : null;
  const comp = compWord ? compWord.charAt(0).toUpperCase() + compWord.slice(1) : null;
  const codes = node.node ? compositionRows([node.node])[0]?.codes : undefined;
  if (!comp) return null;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span>{comp}</span>
      {codes && codes.length > 0 && <RoleChips codes={codes} />}
    </span>
  );
}

// Node title-row aside: the status pill.
export function GeoLiveAside() {
  const inspect = useStore((s) => s.inspect);
  const node = inspectedNode(inspect);
  if (!node) return null;
  return <StatusMark state={node.node?.state} />;
}

// A clicked Global L0 snapshot: what it anchored and what it settled (fees/size/rewards). Its
// place in the DAG (the Layers mark + ordinal + live/age) is the card HEAD now (SnapshotTitle/SnapshotAside).
export function SnapshotCard({ data: d }: { data: GlobalSnapshot }) {
  // EXACT totals from the raw L0 snapshot (via RawSnapshotBridge) are the ONLY source for the fee
  // + anchored breakdown — authoritative (the true total, incl. unlisted). If they aren't here yet
  // the tick is simply "reading…" (ACQUIRING); there is no polled-floor fallback. Every selectable
  // tick is inside the L0 node's retention window, so exact always resolves.
  const exact = useStore((s) => s.snapshotExact[d.ordinal]);
  const live = useStore((s) => s.live);
  const lastGoodAt = useStore((s) => s.lastGoodAt);
  const awaitingExact = exact == null;
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
          effect on the NEXT one — without the guard this dereferenced `exact.totalFee`. */}
      {feeHold.show || exact == null ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2.5">
            <span className="text-body text-muted-foreground">Fees paid</span>
            <span className={cn("flex flex-col items-end text-body text-foreground tabular-nums", feeHold.fading && "animate-hold-fade-out motion-reduce:animate-none")}><NodeStars count={4} /></span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {exact.totalFee > 0 && (
            <div className="flex items-start justify-between gap-2.5">
              <span className="text-body text-muted-foreground">Fees paid</span>
              <span className="flex flex-col items-end text-body text-foreground tabular-nums">
                <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.totalFee)}</b> DAG</span>
                <span className="text-label text-muted-foreground">{fmtKB(exact.totalSizeKB)} anchored</span>
              </span>
            </div>
          )}
          {exact.rewardsDatum > 0 && (
            <div className="flex items-start justify-between gap-2.5">
              <span className="text-body text-muted-foreground">Rewards out</span>
              <span className="flex flex-col items-end text-body text-foreground tabular-nums">
                <span className="animate-resolve-in motion-reduce:animate-none whitespace-nowrap"><b className="font-bold">{fmtDag(exact.rewardsDatum)}</b> DAG</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The metagraph context pane (top-right "context" slot): identity only — description,
// make-up rows, website. Its live/economic counterpart is the top-bar vitals (filter-aware
// "live activity"), so the dossier stays a stable identity card.
export function MetaCard({ cfg }: { cfg: MetaCfg }) {
  const metaList = useStore((s) => s.metaList);
  const mg = metaList.find((x) => x.id === cfg.id) || null;
  const nodes = mg?.nodes || [];
  const blurb = mg?.description || cfg.blurb;
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
              the old "166 nodes with 3 different compositions" header restated the table. */}
          <div className="mt-3">
            <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground">Composition</span>
            <CompositionRows nodes={nodes} />
          </div>
          <Separator className="my-2" />
          {/* Summary in the snapshot card's "Fees paid" grammar — muted label left, the bold
              TOTAL right (column-aligned with the composition counts it summarizes). */}
          <div className="flex items-start justify-between gap-2.5">
            <span className="text-body text-muted-foreground">Online nodes</span>
            <span className="text-body text-foreground tabular-nums"><b className="font-bold">{nodes.length}</b></span>
          </div>
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
    </>
  );
}

// The dossier's site/explorer link (user-agreed: the footer link row was rarely used and ate a
// full row) — an icon-only ghost ExternalLink riding the TITLE row's aside slot. Flush comes
// free now: the title row no longer reserves ×-clearance (CardHead dropped its pr — the row
// sits below the ×), so the aside slot ends AT the card's content edge and the old measured
// `-mr-[30px]` re-occupation hack is gone with it. 16px glyph — matches the × (user,
// 2026-07-12: the 14px mark read too small). The glyph rides `text-primary` (the link-variant
// Button language, softened at rest) so it reads as a LINK at a glance, not muted chrome.
// Domain in the tooltip/aria-label. Rendered by InspectorCard only when the metagraph actually
// has a siteUrl, so link-less dossiers render no aside at all.
export function MetaSiteAction({ site }: { site: string }) {
  const domain = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <Button
      asChild
      variant="ghost"
      size="icon-xs"
      className="size-auto rounded-md py-1 px-0 leading-none cursor-pointer text-primary/70 hover:bg-transparent hover:text-primary dark:hover:bg-transparent"
    >
      <a href={site} target="_blank" rel="noopener noreferrer" aria-label={domain} title={domain}>
        <ExternalLink aria-hidden className="size-4" />
      </a>
    </Button>
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
    return (
      <p className="text-muted-foreground text-label mt-[2px] mb-0">
        Click a node on the globe, or in the explorer.
      </p>
    );
  }
  return <GeoLiveNode p={node} />;
}

// The selected-node block. The node's LOCATION + id + status pill are all the card HEAD now
// (GeoLiveTitle/GeoLiveSubtitle/GeoLiveAside above) — the old IP and "Location" body rows are
// gone (the IP entirely, user-agreed; the location because it IS the title). The body is what
// remains that the globe can't show: the node's layer composition. The slot eyebrow reads
// "Selected node"; the × is CardHead's shared close (the outer pane).
function GeoLiveNode({ p }: { p: PickOf<"l0" | "l1" | "metanode"> }) {
  // Hosting provider from the node's IP lookup (GeoInfo.isp/asn) — the one machine fact the
  // globe can't show. Absent = the lookup didn't know; the line simply doesn't render
  // (honesty: no "Unknown" filler in a facts card).
  const geo = "geo" in p ? p.geo : undefined;
  // NB: the hover pairing (synced 3D glow) lives on the OUTER pane (Inspector.CardPane), not here,
  // so the glow lights the card's rounded edge.
  return (
    <>
      {geo?.isp && (
        <div className="my-2">
          <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground">Hosting</span>
          <div className="text-body text-foreground-dim mt-0.5">
            {geo.isp}
            {geo.asn && <span className="font-mono text-label text-muted-foreground"> · {geo.asn}</span>}
          </div>
        </div>
      )}
      {/* The unique reference sits LAST — a labelled row like HOSTING (the reading order is
          place → health → role → host → reference). Truncated display, full hash on hover. */}
      {p.node?.id && (
        <div className="my-2">
          <span className="text-micro tracking-[0.1em] uppercase text-muted-foreground">Node id</span>
          <div className="font-mono tabular-nums text-label text-foreground-dim mt-0.5" title={p.node.id}>
            {shortHash(p.node.id)}
          </div>
        </div>
      )}
    </>
  );
}

// ── The LAYER card (Snapshots · anchoring-stack layer) ─────────────────────────────────────
// Selected from the Snapshots·Explore panel (LedgerPanel): each layer of the anchoring stack is a
// clickable subject whose card = what the layer IS (the pick carries the panel's description) plus
// its LIVE footprint right now, derived from data already in the store — node counts from the
// metagraph list (a hybrid counts in every layer it runs, matching the top-bar vitals taxonomy),
// activity rates from store.activity (the vitals' source). No new fetches, nothing fabricated.

// Head title: the layer's single-plane mark + its name (same view-vocabulary pattern as the
// snapshot head's Layers mark).
export function LayerTitle({ p }: { p: PickOf<"layer"> }) {
  const Icon = LAYER_ICON; // the dedicated single-plane mark — same glyph as its tray icon
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {/* Tints with the filter identity like every subject mark (--filter-accent; cyan on "all"). */}
      <Icon className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} aria-hidden />
      {/* The pick carries only the id; the display copy resolves through src/data/ledgerLayers. */}
      <span className="truncate">{ledgerLayerById(p.layerId)?.name ?? p.layerId}</span>
    </span>
  );
}

export function LayerCard({ p }: { p: PickOf<"layer"> }) {
  const metaList = useStore((s) => s.metaList);
  const nodes = useStore((s) => s.nodes);
  const activity = useStore((s) => s.activity);
  const latestOrdinal = useStore((s) => s.latestOrdinal);
  const filter = useStore((s) => s.filter);
  // store.activity is FILTER-SCOPED (a metagraph selection reads ITS own snapshot stream —
  // production cadence + the distinct global ticks it anchored into; see api.getActivity).
  // The GLOBAL layers' facts must not silently become metagraph figures under a filter, so the
  // gl0/msnap global rates read the UNFILTERED activity straight from the network singleton.
  const globalActivity = getNetwork()?.getActivity() ?? null;
  const metaCfg = metagraphById(filter);

  // Role tallies over the LIVE metagraph set (excluding the DAG root — its layers are the
  // hypergraph rows below). A node counts in every layer it runs (roles), like the vitals.
  const metas = metaList.filter((m) => !m.isRoot);
  const roleCount = (role: string) =>
    metas.reduce((sum, m) => sum + m.nodes.filter((n) => (n.roles ?? []).includes(role)).length, 0);
  const metasRunning = (roles: string[]) =>
    metas.filter((m) => m.nodes.some((n) => (n.roles ?? []).some((r) => roles.includes(r)))).length;

  // The layer's live fact rows, by id (matches LedgerPanel's LAYERS / LedgerView's floors).
  const facts: { label: string; value: string }[] = [];
  const perHour = (n: number) => `${Math.round(n).toLocaleString()} / hr`;
  switch (p.layerId) {
    case "ml1":
      facts.push(
        { label: "Currency-L1 nodes", value: String(roleCount("cl1")) },
        { label: "Data-L1 nodes", value: String(roleCount("dl1")) },
        { label: "Metagraphs running it", value: String(metasRunning(["cl1", "dl1"])) },
      );
      break;
    case "ml0":
      facts.push(
        { label: "L0 nodes", value: String(roleCount("l0")) },
        { label: "Metagraphs running it", value: String(metasRunning(["l0"])) },
      );
      break;
    case "msnap":
      // Filtered: the selected metagraph's OWN stream — its production cadence and how many
      // distinct global snapshots it anchored into (batching makes that ≤ production).
      if (metaCfg && activity) {
        facts.push(
          { label: `${metaCfg.ticker || metaCfg.name} snapshots`, value: perHour(activity.snapsPerHour) },
          { label: "Anchored to global snapshots", value: perHour(activity.anchorsPerHour) },
        );
      } else if (globalActivity) {
        facts.push({ label: "Snapshots anchored", value: perHour(globalActivity.anchorsPerHour) });
      }
      break;
    case "hypl0":
      facts.push({ label: "Global validators", value: String(nodes.l0) });
      break;
    case "hypl1":
      facts.push({ label: "$DAG L1 nodes", value: String(nodes.l1) });
      break;
    case "gl0":
      // Always the GLOBAL cadence (unfiltered) — under a metagraph filter store.activity would be
      // that metagraph's own rate, which is not what this layer is about.
      if (globalActivity) facts.push({ label: "Global snapshots", value: perHour(globalActivity.snapsPerHour) });
      if (latestOrdinal != null) facts.push({ label: "Latest ordinal", value: latestOrdinal.toLocaleString() });
      break;
  }

  return (
    <>
      <Desc text={ledgerLayerById(p.layerId)?.desc ?? ""} />
      {facts.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-start justify-between gap-2.5">
              <span className="text-body text-muted-foreground">{f.label}</span>
              <span className="text-body text-foreground tabular-nums">{f.value}</span>
            </div>
          ))}
        </div>
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

// Head title: the country mark + display name (rolls via titleKey=cc, synced with the
// edge pulse) — same "kind mark leads the title" grammar as every other card head.
export function CountryTitle({ cc }: { cc: string }) {
  const selNodes = useStore((s) => s.selNodes);
  // No countryName(cc) lookup exists anywhere in the app — the display name only ever arrives
  // on a NodeRow (copied verbatim off the geo-IP lookup), so it's read off a matching row here,
  // same as GeoExplore's own leaderboard rows resolve their name.
  const name = selNodes.find((r) => r.cc === cc)?.country ?? cc;
  const Mark = COUNTRY_ICON;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      <span className="truncate">{name}</span>
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
    <div className="flex flex-col gap-2">
      {facts.map((f) => (
        <div key={f.label} className="flex items-start justify-between gap-2.5">
          <span className="text-body text-muted-foreground">{f.label}</span>
          <span className="text-body text-foreground tabular-nums">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── The COMPOSITION card (Hypergraph · make-up group) ───────────────────────────────────────
// Hyper's rung between a network and a node (`store.composition`, a `CompositionSel`
// {netId, key}): the machines in one network that run the SAME set of layers — the metagraph
// card's own composition vocabulary (Hybrid / Data / …), promoted from a browse-only grouping to
// a committable subject (2026-08-02). Members are re-resolved LIVE from `selNodes` through the
// shared `compositionGroups` helper — the same dedupe-to-machines the explorer rows use, so the
// count here and the count on the row can't disagree. The label + layer codes come from the KEY,
// so the head still reads correctly for a group that has momentarily emptied out.
const parseCompKey = (key: string): { label: string; codes: string[] } => {
  const [label = key, codeStr = ""] = key.split("|");
  return { label, codes: codeStr ? codeStr.split("·") : [] };
};

export function CompositionTitle({ sel }: { sel: CompositionSel }) {
  const Mark = COMPOSITION_ICON;
  const { label } = parseCompKey(sel.key);
  return (
    <span className="flex items-center gap-2 min-w-0 max-w-full">
      <Mark aria-hidden className={cn(KIND_MARK_CLASS, "text-[var(--filter-accent,var(--primary))]")} />
      <span className="truncate min-w-0">{label}</span>
    </span>
  );
}

export function CompositionCard({ sel }: { sel: CompositionSel }) {
  const selNodes = useStore((s) => s.selNodes);
  const { codes } = parseCompKey(sel.key);
  const groups = useMemo(() => compositionGroups(selNodes), [selNodes]);
  const members = groups.find((g) => g.key === sel.key)?.rows ?? [];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const share = total > 0 ? Math.round((members.length / total) * 100) : 0;
  const cfg = metagraphById(sel.netId);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground flex-none">Runs</span>
        <span className="flex flex-wrap justify-end items-center gap-1 min-w-0">
          {codes.length === 0 ? <span className="text-body text-foreground">—</span> : <RoleChips codes={codes} />}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground">Machines</span>
        <span className="text-body text-foreground tabular-nums">{members.length}</span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground">Share of network</span>
        <span className="text-body text-foreground tabular-nums">{share}%</span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground flex-none">Network</span>
        <span className="inline-flex items-center gap-1.5 text-body text-foreground min-w-0">
          <IdentityDot hue={sel.netId === "dag" ? CORE_HEX : identityHudHex(sel.netId)} />
          <span className="truncate">{cfg?.name || sel.netId}</span>
        </span>
      </div>
    </div>
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
      <span className="truncate min-w-0">
        {sel.city ?? "Unlocated"} · {sel.isp ?? "Unknown provider"}
      </span>
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
  const firstGeo = members[0] && "geo" in members[0].pick ? members[0].pick.geo : undefined;
  const countryName = selNodes.find((r) => r.cc === sel.cc)?.country ?? sel.cc;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground">Nodes</span>
        <span className="text-body text-foreground tabular-nums">{members.length}</span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground flex-none">Networks</span>
        <span className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 min-w-0">
          {networkIds.length === 0 ? (
            <span className="text-body text-foreground">—</span>
          ) : (
            networkIds.map((id) => {
              const cfg = metagraphById(id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5 text-body text-foreground">
                  <IdentityDot hue={identityHudHex(id)} />
                  {cfg?.ticker || cfg?.name || id}
                </span>
              );
            })
          )}
        </span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground">ASN</span>
        <span className="text-body text-foreground tabular-nums">{firstGeo?.asn ?? "—"}</span>
      </div>
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-body text-muted-foreground">Country</span>
        <span className="text-body text-foreground">{countryName}</span>
      </div>
    </div>
  );
}
