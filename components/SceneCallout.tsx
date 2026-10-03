"use client";

// The SUBJECT CALLOUT (user, 2026-08-15) — a scene-anchored label naming the committed subject in
// the 3D view itself: an Instrument-Glass mini-panel tied to the subject's rendered position by a
// dashed leader ending in a small identity-hued ring, the same leader language as the ledger's
// ordinal labels. It is a LABEL, not a control (`pointer-events-none` — the subject's controls are
// the rail cards; no ×, by decision: dismissal is the selection's own), and it carries the
// CardHead register at tooltip scale: eyebrow slot noun, title, hued aside, the head hairline,
// one muted lead line with the cards' own RoleChips.
//
// SPLIT OF LABOUR (the spike's conclusion, and the user's own instinct — "furniture can be regular
// threejs object text, subjects more 2d/3d html type of content"): FURNITURE labels are in-scene
// canvas-texture meshes (`makeEdgeLabel` — they bloom on the scene lane and ride shader fades);
// the SUBJECT callout is real HUD DOM, composited crisp over the bloom pass, so it can reuse the
// HUD's tokens and grammar directly. CSS2DRenderer was evaluated and declined: the node chips are
// InstancedMesh instances (nothing to parent a CSS2DObject to), so the per-frame anchor resolution
// must exist in the Engine either way — the renderer would only replace the final projection while
// adding its own overlay container, render pass and a React-portal handshake.
//
// OWNERSHIP: React owns this DOM and its content (from committed store state); the ENGINE owns its
// per-frame placement — `CalloutSync.sync()` projects the subject's rendered anchor and writes
// `transform` + `data-on` straight to `#callout` (the Tooltip discipline: position never triggers
// a React render). `#callout` is therefore a marker contract (CLAUDE.md table) — the wrapper is a
// 0-size ANCHOR at the projected point, and everything inside is laid out relative to it, so the
// engine writes exactly one transform and one flag.
//
// PER-VIEW SUBJECTS (`viewPolicy.callout` gates; the Engine's anchor resolvers mirror this
// table, and `components/calloutBoundary.test.ts` pins the mirroring contracts):
// - THE BOX LEADS everywhere (user, 2026-08-15): the boxed card's rung is preferred when its
//   model and anchor resolve, falling through to the view's default order below — the box is
//   the subject, exactly as the camera answers it (`store.boxedCard`, published by Inspector).
// - hyper: the committed NODE's own bead, else the network's hub or the DAG core. `unlisted`
//   has no anchor — honest absence, no callout.
// - geo: node (its own chip in the stack) > provider cohort > country. The network rung
//   deliberately shows nothing: a filtered fleet is spread across the globe, and a single
//   anchor would lie about where it is.
// - ledger: the pinned metagraph snapshot's own tile (rewind included), else the committed
//   global tick's byte-bar lead.
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { displayNetwork } from "@/src/data/unlisted";
import { coLocatedNetworks, filterAccent, getAnchor, isAnchorSettling, metagraphById } from "@/src/data/network";
import { fmtKB, fmtShareKB, midHash } from "@/src/util/format";
import { iconForPick } from "@/components/icons";
import { SceneMark, type SceneMarkSpec } from "@/components/SceneMark";
import { netKeyOf } from "@/src/engine/domain/pickActions";
import { NODE_ID_GLYPHS } from "@/components/explorer/nodeRow";
import { SCENE_GLASS } from "@/components/selection";
import { QualifierChip, RoleChips, StatusMark, TickerChip } from "@/components/inspector/parts";
// The lead line's codes come from the composition vocabulary's ONE home, rendered by the cards'
// own RoleChips (user, 2026-08-15: "look at my cards — square pills").
import { layerCodesOf } from "@/src/data/composition";
import { nodeStatus } from "@/src/data/nodeStatus";
import { useNowTick } from "@/components/useNowTick";
import { useBreakpoint } from "@/components/useBreakpoint";
import { relativeAge } from "@/src/util/relativeAge";
import { CALLOUT_OFF_X, CALLOUT_OFF_Y, CALLOUT_LEG_INSET } from "@/src/engine/domain/calloutPlacement";
import type { GeoInfo } from "@/src/data/types";
import LiveDot from "@/components/LiveDot";
import { IDENT_INK } from "@/components/identInk";
import { ledgerNetwork } from "@/src/engine/domain/tickNet";

// The panel's standoff from the anchor lives in `src/engine/domain/calloutPlacement.ts`, with the
// reach thresholds derived from it and the placement rules that read them. It used to be a local
// pair here plus two derived constants in `CalloutSync`, under a comment asking the next
// reader to "change all four together" — one concern, so now one home. The leader below spans
// exactly this diagonal, so the three pieces (ring, line, panel corner) stay attached by
// construction.
//
// The standoff is longer than the panel is TALL (user, 2026-08-18 — "the call-out card sits on the
// actual selection instead of at the end of the connecting line"). At the original 62/92 the tie was
// ~111px against an ~82px panel, so the card landed inside its own subject's neighbourhood — in
// hyper, squarely on the validator shells the selected bead sits on — and the leader read as a stub
// under it rather than as the thing the card hangs from.


// What the panel says — one model, filled per view/rung so the JSX below stays single-sourced.
// `aside.hue` absent = muted (the country card's ISO-code rule: a place carries no identity);
// `aside.live` prepends the beating live dot (the global card's aside state, mirrored).
export interface CalloutModel {
  /** The title is an id (a node's), set in the mono register ids wear everywhere else. */
  titleMono?: boolean;
  key: string;
  eyebrow: string;
  title: string;
  /** `chip` is a second, separate fact beside the state — an age — never a clause after a dot. */
  aside?: { text: string; hue?: string; live?: boolean; chip?: string };
  ring: string;
  /** THE MARK THE SUBJECT'S CARD WEARS before its title (user, 2026-10-03 — suggestion 4 of
   *  `docs/superpowers/design/2026-10-03-callout-cards`): the cube, the stacked cubes, the globe,
   *  the pin, the server — or a network's logo. A label and its card were tied only by reading
   *  both; with the same mark they pair at a glance. Same glyph home (`iconForPick`), same hue
   *  rule as the card head: a kind mark takes the filter's accent, a subject's own mark its hue. */
  mark?: SceneMarkSpec;
  /** `ident` leads the row in its identity hue (the aside's hued-ticker idiom, one register).
   *  `also` closes it with the OTHER networks sharing this subject's machine — same idiom,
   *  one hued ticker each (user, 2026-08-18). */
  lead?: {
    ident?: { text: string; hue: string };
    text?: string;
    codes?: string[];
    /** The node's raw lifecycle state, set only when MEASURED (the scene's status fill
     *  channel hollows a not-ready chip, so the label names the state beside it — user,
     *  2026-09-11); `unknown` stays absent, the callout's unmeasured-means-no-line rule. */
    status?: string;
    also?: { text: string; hue: string }[];
    /** A second measure of the same subject, on the right — a size beside a count. */
    chip?: string;
  };
}
type Model = CalloutModel;

// THE LEADER'S STRENGTH IS PER GROUND (user, 2026-10-03: "the callout line is not very easy to
// see in light mode"). The bare accent at 0.55 is a glow on the dark ground and a pale thread on
// paper, where nothing blooms and the page is its own bright field — the History tether's
// finding the same week (`TrendTether`), and the same answer: on paper the line takes the
// accent's INK (`--primary-ink`) at 0.85; dark keeps what it had. `light-dark()` resolves
// colours only, so the alpha rides the colour rather than `strokeOpacity`.
const LEADER_STROKE = {
  stroke: "light-dark(color-mix(in oklch, var(--primary-ink) 85%, transparent), color-mix(in oklch, var(--primary) 55%, transparent))",
} as const;

const geoOf = (p: { kind: string }): GeoInfo | undefined =>
  "geo" in p ? (p as { geo?: GeoInfo }).geo : undefined;


/** The callout PANEL alone — the eyebrow / title+aside / lead grammar on SCENE_GLASS — shared
 *  with the LiveStrip's bar hover (user, 2026-08-16: "fully re-use the one from the scene"),
 *  which wraps it in its own cursor-follow box instead of the Engine-anchored `.co-panel`. */
export function CalloutPanel({ m, className }: { m: CalloutModel; className?: string }) {
  return (
    <div key={m.key} className={cn("roll-in whitespace-nowrap", SCENE_GLASS, className)}>
      {/* The identity EDGE SPINE (user, 2026-08-15 — "the rails/hairline effect on the left
          side, attached", then "let it fade into the corners"): the sheets' single-identity-
          cue language at callout scale, as the shared `.edge-spine` recipe (globals.css) — a
          corner-wrapping hue border under a fixed-length fade, so on a panel this short the
          tips spend themselves in the corner curves rather than stopping abruptly. The
          leader flows into its lower run-off. Static and subtle: a resting identity cue. */}
      <span aria-hidden className="edge-spine opacity-70" style={{ ["--spine" as string]: m.ring }} />
      {/* The card eyebrow's own ink (CardHead: EYEBROW + text-primary-ink), not a muted caption —
          this is the same slot noun the rail card wears (user, 2026-08-15). It follows the card
          to the accent's INK (2026-10-02): the bare accent measured 4.2:1 here on paper. */}
      <div className="text-label font-bold tracking-[0.1em] uppercase leading-none text-primary-ink mb-1.5">{m.eyebrow}</div>
      {/* No identity dot here (user, 2026-08-15): the hued aside already carries the identity
          on this row, and the anchor ring is the subject mark at the scene end of the tie. */}
      <div className="flex items-center gap-[7px]">
        {m.mark && <SceneMark mark={m.mark} />}
        <span className={cn("text-body font-semibold text-foreground", m.titleMono && "font-mono tabular-nums")}>{m.title}</span>
        {/* A hued aside is a TICKER beside a title, so it is the card head's own chip
            (`TickerChip`, 2026-10-02); the un-hued one is a state line and stays text. */}
        {m.aside && m.aside.hue ? (
          <TickerChip text={m.aside.text} hue={m.aside.hue} className="ml-1" />
        ) : m.aside ? (
          // Age, then state — the order the card's own head reads (2026-10-03).
          <span className="inline-flex items-center gap-1.5 text-label text-muted-foreground ml-1">
            {m.aside.chip && <QualifierChip className="mr-0.5 tabular-nums">{m.aside.chip}</QualifierChip>}
            {m.aside.live && <LiveDot />}
            {m.aside.text}
          </span>
        ) : null}
      </div>
      {/* The card grammar's HEAD HAIRLINE at callout scale (user, 2026-08-15 — "cards have an
          underline between header and the rest"): it divides the HEAD (eyebrow + title, whose
          own separation stays colour-only, as in the cards) from the body, and it only exists
          where there IS a body to divide — a lead-less callout stays ruleless, the same gate
          CardHead applies when collapsed. Inside the padded box, so it shares the content
          edge like every resting division. */}
      {m.lead && (
        <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1.5 text-label text-muted-foreground">
          {m.lead.ident && (
            <span className={cn("font-bold", IDENT_INK)} style={{ color: m.lead.ident.hue }}>
              {m.lead.ident.text}
            </span>
          )}
          {m.lead.text && <span>{m.lead.text}</span>}
          {m.lead.codes && m.lead.codes.length > 0 && <RoleChips codes={m.lead.codes} />}
          {/* STATUS — the cards' one status chrome (colour = bucket, text = exact stage), here
              because the scene itself now speaks status (the fill channel hollows a not-ready
              chip, 2026-09-10) and the label beside the shell should name what it shows (user,
              2026-09-11). After the composition (what it runs), before the co-tenant addendum
              (who else runs here); rendered for every MEASURED state, ready included — a status
              readout that only spoke up for trouble would be an alarm, not a reading. */}
          {m.lead.status && <StatusMark state={m.lead.status} />}
          {/* CO-TENANTS — the other networks running on this same machine, each as its own
              hued ticker (user, 2026-08-18). It closes the lead because the node card reads
              place → role → host → co-located, and the chips to its left are this node's own
              composition: the `+` says these are additional networks, not more of its layers.
              Rendered only when the fact is MEASURED — the builder passes nothing while both
              cluster sides aren't live, so the callout never guesses a co-tenancy. */}
          {m.lead.also && m.lead.also.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="opacity-60">+</span>
              {m.lead.also.map((t) => (
                <span key={t.text} className={cn("font-bold", IDENT_INK)} style={{ color: t.hue }}>
                  {t.text}
                </span>
              ))}
            </span>
          )}
          {m.lead.chip && (
            <>
              <span className="flex-1 min-w-1.5" />
              <QualifierChip className="tabular-nums">{m.lead.chip}</QualifierChip>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SceneCallout() {
  const mode = useStore((s) => s.mode);
  const filter = useStore((s) => s.filter);
  const section = useStore((s) => s.section);
  const metaList = useStore((s) => s.metaList);
  const inspect = useStore((s) => s.inspect);
  const cohort = useStore((s) => s.cohort);
  const country = useStore((s) => s.country);
  const selNodes = useStore((s) => s.selNodes);
  const metaSnap = useStore((s) => s.metaSnap);
  const snap = useStore((s) => s.snap);
  const tickNet = useStore((s) => s.tickNet);
  const exact = useStore((s) => (s.snap ? s.snapshotExact[s.snap.data.ordinal] : undefined));
  const following = useStore((s) => s.following);
  const liveFeed = useStore((s) => s.live);
  // THE BOX LEADS (user, 2026-08-15 — clicking a committed node's hub re-boxes the metagraph
  // card and "nothing happens in the scene"): the box is the subject (it gets the camera), so
  // the callout mirrors it. Inspector publishes the boxed slot; the Engine's anchor resolvers
  // apply the SAME preference, so label and anchor step up and down together.
  const boxedCard = useStore((s) => s.boxedCard);
  // The global tick's aside is its AGE, ticking (user, 2026-08-15 — "same as card"):
  // The card's two states mirrored as a label — `live · Xs` with the beating dot while
  // following, `pinned · Xs` on a pin, in the card's own words (2026-10-02, B1: the callout is the
  // ONE mirror of the state now that the explorer's pill is gone, so it says the word the card
  // says rather than a bare clock glyph). The card keeps the BUTTON (follow toggle); this is
  // read-only.
  const now = useNowTick(1000);
  // NOT ON A PHONE (user, 2026-08-18) — the reasoning lives with the Engine's mirrored gate in
  // `_syncCallout`: the label's value is co-location, and under 700px the panel's reach can't
  // deliver it. `breakpointOf` is the one home for the tier, so both owners answer the same call.
  const bp = useBreakpoint();
  if (!VIEW_POLICIES[mode].callout || section !== "scene" || bp === "phone") return null;

  // The committed NODE's model — shared by hyper and geo (user, 2026-08-15: in hyper too, "the
  // node does not have its callout — clickable, has a card"). Titled by its id like the node
  // card (2026-09-29), the network ticker as the hued identity aside, composition as the cards'
  // pills.
  const nodePick =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const nodeModel = (): Model | null => {
    if (!nodePick) return null;
    const g = geoOf(nodePick);
    const netId = nodePick.kind === "metanode" ? ((nodePick as { meta?: { id?: string } }).meta?.id ?? null) : "dag";
    const nnet = displayNetwork(netId);
    const codes = layerCodesOf([{ roles: nodePick.roles }]);
    const id = (nodePick as { node?: { id?: string } }).node?.id;
    // CO-LOCATION — the same reading the node card's own Co-located fact takes, from the one
    // home (`coLocatedNetworks`) and behind the same `coloReady` gate: both cluster sides must
    // be live, or a machine that simply hasn't been polled yet would read as single-tenant.
    // Unmeasured means NO line, not a "none" — the callout is a label, and rule 10's absent-
    // data instrument states belong to the card that has room to state them.
    const ip = (nodePick as { node?: { ip?: string } }).node?.ip;
    const coloReady = metaList.some((x) => x.isRoot) && metaList.some((x) => !x.isRoot);
    const colo = coloReady ? coLocatedNetworks(ip, netId, metaList) : [];
    const also = colo.map((c) => ({ text: displayNetwork(c.id)?.ticker ?? c.name, hue: filterAccent(c.id) }));
    // Status: only a MEASURED state gets the mark (unknown = no line, like co-location above).
    const state = (nodePick as { node?: { state?: string | null } }).node?.state;
    const status = state != null && nodeStatus(state).bucket !== "unknown" ? state : undefined;
    return {
      key: `node|${id ?? `${g?.lat},${g?.lon}`}`,
      eyebrow: "Node",
      // Titled by the node's id like the node card and the explorer row (user, 2026-09-29 — it was
      // city-first). Nickname stays a CARD attribute (user, 2026-08-16: the registry handles are
      // informal, a content fact rather than the subject's name).
      title: id ? midHash(id, NODE_ID_GLYPHS) : g?.city ?? "Node",
      titleMono: !!id,
      aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
      ring: nnet?.hue ?? "var(--primary)",
      mark: { icon: iconForPick("metanode"), hue: nnet?.hue ?? "var(--primary)" },
      lead: codes.length || also.length || status ? { codes, status, also } : undefined,
    };
  };

  const netModel = (id: string = filter): Model | null => {
    const net = displayNetwork(id);
    // "all" has no subject; the unlisted set has no 3D anchor (no machines are knowable).
    if (!net || net.virtual) return null;
    const mg = metaList.find((x) => x.id === id) ?? null;
    const codes = mg ? layerCodesOf(mg.nodes) : [];
    return {
      key: `net|${id}`,
      eyebrow: id === "dag" ? "Network" : "Metagraph",
      title: net.name,
      // The aside suppresses itself when it only restates the name (the DAG core's ticker IS
      // its name) — a head must not say the same thing twice (the CardHead aside rule).
      aside: net.ticker !== net.name ? { text: net.ticker, hue: net.hue } : undefined,
      ring: net.hue,
      // The dossier's own logo (the live metagraph's icon, else the catalog's bundled one).
      mark: { logo: mg?.iconUrl || metagraphById(id)?.iconUrl, monogram: net.ticker || net.name, hue: net.hue },
      lead: mg ? { text: `${mg.nodes.length} nodes`, codes } : undefined,
    };
  };

  let m: Model | null = null;
  let m2: Model | null = null;
  if (mode === "hyper") {
    m = boxedCard === "context" ? (netModel() ?? nodeModel()) : (nodeModel() ?? netModel());
    if (!m) return null;
  } else if (mode === "geo") {
    const g = nodePick ? geoOf(nodePick) : undefined;
    // The builders, ordered by the BOX first (the Engine's anchor resolvers mirror this), then
    // the default finest-first ladder.
    const geoNodeModel = (): Model | null => (nodePick && g?.lat != null && g?.lon != null ? nodeModel() : null);
    const cohortModel = (): Model | null => {
      if (!cohort) return null;
      // PROVIDER — the provider card's title IS the isp; the city rides muted (a place carries
      // no identity). The ring takes the active filter's accent, like every card-head mark.
      const n = selNodes.filter((r) => {
        const rg = geoOf(r.pick);
        return !!rg && rg.cc === cohort.cc && (rg.city || null) === cohort.city && (rg.isp || null) === cohort.isp;
      }).length;
      return {
        key: `cohort|${cohort.cc}|${cohort.city}|${cohort.isp}`,
        eyebrow: "Provider",
        title: cohort.isp ?? "Unknown provider",
        aside: cohort.city ? { text: cohort.city } : undefined,
        ring: filterAccent(filter),
        mark: { icon: iconForPick("cohort"), hue: filterAccent(filter) },
        lead: n > 0 ? { text: `${n} nodes` } : undefined,
      };
    };
    const countryModel = (): Model | null => {
      if (!country) return null;
      // COUNTRY — display name with the ISO code as the muted aside, suppressed when the name
      // is unknown and the title already fell back to the code (the country card's own rule).
      const members = selNodes.filter((r) => geoOf(r.pick)?.cc === country);
      const name = members.map((r) => geoOf(r.pick)?.country).find(Boolean) ?? null;
      return {
        key: `cc|${country}`,
        eyebrow: "Country",
        title: name ?? country,
        aside: name ? { text: country } : undefined,
        ring: filterAccent(filter),
        mark: { icon: iconForPick("country"), hue: filterAccent(filter) },
        lead: members.length > 0 ? { text: `${members.length} nodes` } : undefined,
      };
    };
    m =
      (boxedCard === "cohort" ? cohortModel() : null) ??
      (boxedCard === "country" ? countryModel() : null) ??
      geoNodeModel() ??
      cohortModel() ??
      countryModel();
  } else if (mode === "ledger") {
    // The pinned SNAPSHOT — metagraph snapshot over the global tick (the finer subject wins,
    // like the rail's slot order) — unless the GLOBAL card is the box. Titles are bare
    // ordinals (no `#`, the ordinal rule); the unlisted lane keeps its deliberate neutral
    // gray — identity is not a state.
    const msModel = (): Model | null => {
      if (!metaSnap) return null;
      const nnet = displayNetwork(metaSnap.metaId);
      return {
        // ⚠️ WHILE FOLLOWING, THE SUBJECT IS THE LIVE LANE, NOT THE ORDINAL (user, 2026-09-11:
        // "it re-draws the card while the subject is the same — only the contents changed").
        // The wrapper is keyed by subject so the entrance choreography replays as one unit —
        // but a follow advances the ordinal every anchored tick, and keying on it replayed
        // the whole roll-in + leader draw per heartbeat. Same guard the Inspector's
        // selectionKey applies to both live-advancing cards. A pin keys by ordinal: that IS
        // a new subject, and the replay is the acknowledgement.
        key: following ? `ms|${metaSnap.metaId}|live` : `ms|${metaSnap.metaId}|${metaSnap.ordinal}`,
        eyebrow: "Metagraph snapshot",
        title: metaSnap.ordinal.toLocaleString(),
        aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
        ring: nnet?.hue ?? "var(--primary)",
        mark: { icon: iconForPick("metaSnap"), hue: nnet?.hue ?? "var(--primary)" },
      };
    };
    const gsModel = (): Model | null => {
      if (!snap) return null;
      const rel = relativeAge(now - Date.parse(snap.data.timestamp));
      // A COMMITTED METAGRAPH RE-READS THE LEAD (user, 2026-08-18 — the filter reached the
      // strip's bars but not the same card in the scene). The ring already points at that
      // network's own segment of the byte bar, so the count under it must be that segment's
      // too: the hued ticker answering "whose x?", then `x of y anchors` — the strip's tooltip
      // form verbatim, since a strip bar and this callout are the same subject read twice.
      // Gate and source are the strip's own (`metagraphById`, the anchor index's per-id
      // counts), so a lane the catalog can't name — "all", the DAG itself, unlisted — keeps
      // the tick-wide total rather than guessing a share of it.
      // THE NETWORK THE CHAMBER RESOLVES AGAINST (2026-10-02): the one picked inside this tick,
      // else the filter — the callout used to read the filter alone, so with Dor picked inside a
      // tick it still ringed the whole bar.
      const net = ledgerNetwork({ filter, tickNet, snapOrdinal: snap.data.ordinal });
      const cfg = metagraphById(net);
      const mine = cfg && net !== "all" && net !== "dag" ? cfg : null;
      const total = snap.data.metagraphSnapshotCount;
      // ⚠ A SHARE THAT HASN'T FOLDED IN YET IS NOT A ZERO (rule 10). A tick's `total` is final
      // the instant it arrives, but the per-metagraph stamps land over the next seconds and the
      // poll needs a cycle to fold them in — so a bare `?? 0` states a hard `0 of N` for a network
      // that DID anchor here, and then silently corrects itself. `isAnchorSettling` is that
      // lifecycle's one home (src/data/network.ts, CLAUDE.md → "The tick lifecycle"); while it
      // holds, this falls back to the tick-wide form — the SAME answer the comment above already
      // gives a lane the catalog can't name. The ring keeps the network's hue, so the identity is
      // not lost, and the share appears the moment it is real. (The strip's own `?? 0` one surface
      // over drives a BAR HEIGHT, where an absent count is an honest gap, not a stated numeral.)
      const share = mine ? getAnchor(snap.data.timestamp)?.metaCounts?.get(net) : undefined;
      // THE LABEL NAMES BOTH THINGS THE BAR SHOWS (user, 2026-10-03 — suggestion 1). The ring
      // points at this network's band, and a band's LENGTH is bytes (`domain/ledgerBands`) — the
      // label only counted. The count now says "snapshots", the card's word, and the size rides
      // the right as a chip. MEASURED OR ABSENT (rule 10): the bytes come from the exact read
      // alone, so the chip appears when that read has landed and never as an estimate. A network
      // that changed address is summed across its ids (`netKeyOf`).
      let mineKB: number | null = null;
      if (mine && exact) {
        let bytes = 0;
        let any = false;
        for (const [addr, v] of Object.entries(exact.perMeta)) {
          if (netKeyOf(addr) !== net) continue;
          bytes += v.bytes;
          any = true;
        }
        if (any) mineKB = bytes / 1024;
      }
      const settling = mine != null && share == null && isAnchorSettling(snap.data.timestamp, typeof total === "number" ? total : null);
      return {
        // The live-lane key rule — see msModel above (the follow advances this ordinal ~every
        // tick; only a PIN is a new subject).
        key: following ? "gs|live" : `gs|${snap.data.ordinal}`,
        eyebrow: "Global snapshot",
        title: snap.data.ordinal.toLocaleString(),
        // The card's THIRD state, mirrored too (test pass, 2026-10-03): with the feed down the
        // card's follow control says "no signal", and this label went on saying "live · 58s ago"
        // behind a beating dot — two surfaces a hand's width apart disagreeing about whether the
        // network was answering. A pin is unaffected: a held snapshot is not a claim about now.
        aside: following
          ? liveFeed
            ? { text: "live", live: true, chip: rel || undefined }
            : { text: "no signal" }
          : { text: "pinned", chip: rel || undefined },
        // Unneted the ring marks the whole bar (core cyan); under a filter the anchor
        // points at the committed network's own SEGMENT, so the ring takes its accent
        // (user, 2026-08-16 — "if filter, select the correct segment of the byte bar").
        ring: net !== "all" ? filterAccent(net) : "var(--core)",
        mark: { icon: iconForPick("snapshot"), hue: filterAccent(filter) },
        lead:
          typeof total !== "number"
            ? undefined
            : mine && !settling
              ? {
                  ident: { text: mine.ticker || mine.name, hue: filterAccent(net) },
                  text: `${share ?? 0} of ${total} snapshots`,
                  chip: mineKB != null && exact ? fmtShareKB(mineKB, exact.totalSizeKB) : undefined,
                }
              : { text: `${total} snapshots`, chip: exact ? fmtKB(exact.totalSizeKB) : undefined },
      };
    };
    // THE NETWORK'S OWN LABEL, on its lane (user, 2026-10-03: "the dossier on snapshots page has
    // no callout on the scene"). A boxed Metagraph card used to clear the scene of labels — the
    // 2026-08-16 rule was that a network in the chamber is a whole lane and one anchor would lie
    // about it. With a label on each snapshot, that silence read as a card the scene had
    // forgotten: every other card you open is pointed at. The label stands at the head of the
    // network's lane, which is where that lane is read from. It is the hyper dossier's own
    // model (logo, name, ticker, nodes and layers); the DAG and the unlisted set have no lane
    // of their own to point at, as in hyper. `ledgerNetwork` is the chamber's own resolver —
    // the network picked inside this global snapshot, else the filter.
    const lnet = ledgerNetwork({ filter, tickNet, snapOrdinal: snap?.data.ordinal ?? null });
    const laneModel = (): Model | null => (lnet === "all" || lnet === "dag" ? null : netModel(lnet));
    // The boxed NODE card leads, alone (user, 2026-08-16 — a tray node selected via the card
    // stack shows ITS callout).
    const node = nodeModel();
    if (boxedCard === "node" && node) m = node;
    else {
      // THE PAIR GETS TWO CALLOUTS (user, 2026-10-03: asked "should snapshot view have two
      // callouts, one for global- and one for metagraph snapshot?" — "2 callouts"). A committed
      // metagraph snapshot always stands with the global snapshot it is read against, and one
      // label could only name one of them: the tile, with nothing saying which bar it fell
      // into, or the bar, with the tile unnamed.
      // ⚠️ EACH HAS ITS OWN ANCHOR, FIXED: the global snapshot is always the second
      // (`callout-2`), whichever card is boxed. The first cut handed the subject's anchor to the
      // boxed card and the other to the second — so re-boxing swapped the two, both wrappers
      // remounted, and both labels replayed their whole entrance over two subjects that had
      // not changed (the 2026-09-11 complaint, "it re-draws the card while the subject is the
      // same"). The subject's anchor (`callout`) is the upper storey's: the metagraph snapshot's
      // tile, or its network's lane when the Metagraph card is the box or no snapshot of that
      // network is committed — the two stand at the same end of the same lane, so they share
      // the one anchor rather than stack two labels on it. CalloutSync mirrors this exactly.
      m = boxedCard === "context" ? (laneModel() ?? msModel()) : (msModel() ?? laneModel() ?? (snap ? null : node));
      m2 = gsModel();
    }
  }
  if (!m && !m2) return null;

  return (
    <>
      {m && <CalloutMark m={m} id="callout" multi />}
      {m2 && <CalloutMark m={m2} id="callout-2" />}
    </>
  );
}

/** One callout: the 0-size anchor wrapper CalloutSync positions, its ring, leader and panel.
 *  `id` is the marker the engine queries (`callout` for the subject, `callout-2` for the global
 *  snapshot in Snapshots); `multi` mounts the hyper node's extra legs, which only the subject's
 *  callout ever draws. */
function CalloutMark({ m, id, multi }: { m: Model; id: "callout" | "callout-2"; multi?: boolean }) {
  // One mask per mark: an SVG `url(#…)` resolves to the FIRST element with that id in the
  // document, so two marks sharing one id would both be revealed by the first one's draw.
  const maskId = `${id}-draw-mask`;
  return (
    <div
      id={id}
      // Keyed by SUBJECT (user, 2026-09-05 — the leader was already drawn while the panel was
      // still rolling in): a subject change remounts the whole wrapper, so the entrance
      // choreography below (panel roll → leader draw → ring landing) replays as one unit, and
      // CalloutSync's documented assumptions hold by construction — fresh `data-on="0"`, and a
      // fresh element for its multi-leg ref cache. The animations are PAUSED until the Engine
      // flips `data-on` (globals.css), so after a camera flight the entrance plays when the
      // callout actually appears instead of finishing invisibly mid-flight.
      key={m.key}
      data-on="0"
      aria-hidden
      className="fixed left-0 top-0 z-[5] pointer-events-none opacity-0 data-[on=1]:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* Anchor ring at the projected point (the wrapper's origin) — the subject mark at the
          scene end of the tie. `.co-tip` lands it when the drawing leader arrives. */}
      <span
        // A CASING IN THE GROUND'S COLOUR (2026-10-03): the ring wears its subject's hue and
        // lands on a block of that same hue — the Dor ring on Dor's lit bar read as nothing.
        // A thin ground-coloured line outside and inside it is what a map puts round a symbol.
        className="co-tip absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full border-[1.5px] [box-shadow:0_0_0_1.5px_color-mix(in_oklch,var(--background)_78%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--background)_78%,transparent)]"
        style={{ borderColor: m.ring }}
      />
      {/* Dashed leader from the anchor to the panel's near corner — the ordinal-label language,
          in the SAME ink: the chamber's in-scene anchor lines are structural cyan, and cyan is
          the design's one accent/affordance signal (user, 2026-08-15 — round 2; the neutral grey
          read as chrome, the border token before it was too weak). Moderate opacity, not full —
          it is a tie, not a signal. Identity stays on the anchor RING.
          It DRAWS panel→anchor once the panel's roll-in lands (user, 2026-09-05): the mask's
          `.co-draw` ink line runs the same span from the PANEL corner with `pathLength=1`, and
          globals.css animates its dash offset — revealing the dashes progressively without the
          dash pattern itself crawling. White stroke is mask luminance, not a palette hue. */}
      <svg className="co-leader absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-20} y={-CALLOUT_OFF_Y - 40} width={CALLOUT_OFF_X + 60} height={CALLOUT_OFF_Y + 60}>
          <line
            className="co-draw"
            x1={CALLOUT_OFF_X}
            y1={-(CALLOUT_OFF_Y - CALLOUT_LEG_INSET)}
            x2={6}
            y2={-6}
            pathLength={1}
            stroke="white"
            strokeWidth="8"
          />
        </mask>
        {/* The leader's CASING, under the dashes and drawn by the same mask: over lit geometry
            (a bar, a ribbon) the dashed line alone disappeared on dark and fought the ribbon on
            paper. Ground colour, so it is a dark line here and a pale one there. */}
        <line
          mask={`url(#${maskId})`}
          x1={6}
          y1={-6}
          x2={CALLOUT_OFF_X}
          y2={-(CALLOUT_OFF_Y - CALLOUT_LEG_INSET)}
          stroke="var(--background)"
          strokeOpacity="0.6"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <line
          mask={`url(#${maskId})`}
          x1={6}
          y1={-6}
          x2={CALLOUT_OFF_X}
          y2={-(CALLOUT_OFF_Y - CALLOUT_LEG_INSET)}
          style={LEADER_STROKE}
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
      {/* MULTI-LEADER (user, 2026-08-30): a machine's callout points at EACH of its layer beads
          — up to two extra dashed legs from the anchor to the non-primary shells, written per
          frame by CalloutSync's multi-leader (the Tooltip discipline: position never renders
          React). Same leader ink; each leg ends in a smaller identity ring. Hidden until the
          Engine reveals a leg, and only the hyper node anchor ever does. The svg fades in on
          the primary leader's draw window (globals.css) — legs fan from the same panel corner,
          so they arrive with the tie rather than pre-drawn (their per-frame geometry can't
          ride the mask draw itself). */}
      {multi && (
        <svg className="co-multi absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
          {[0, 1].map((i) => (
            <g key={i} className="co-mleg" visibility="hidden">
              <line x1={0} y1={0} x2={0} y2={0} style={LEADER_STROKE} strokeWidth="1.5" strokeDasharray="4 4" />
              <circle cx={0} cy={0} r={3.5} fill="none" strokeWidth={1.5} stroke={m.ring} />
            </g>
          ))}
        </svg>
      )}
      {/* The panel — keyed by subject so the roll-in replays on a change, like a card title. */}
      {/* Position lives in globals.css (`.co-panel` + the data-flip/data-drop mirrors the
          Engine toggles near viewport edges) — inline left/bottom would beat the flip rules. */}
      <CalloutPanel m={m} className="co-panel absolute" />
    </div>
  );
}
