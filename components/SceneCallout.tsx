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
// per-frame placement — `Engine._syncCallout()` projects the subject's rendered anchor and writes
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
import { useStore } from "@/src/store/store";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { displayNetwork } from "@/src/data/unlisted";
import { filterAccent, shortHash } from "@/src/data/network";
import { SCENE_GLASS } from "@/components/selection";
import { RoleChips } from "@/components/inspector/parts";
// The lead line's codes come from the composition vocabulary's ONE home, rendered by the cards'
// own RoleChips (user, 2026-08-15: "look at my cards — square pills").
import { layerCodesOf } from "@/src/data/composition";
import { useNowTick } from "@/components/useNowTick";
import { relativeAge } from "@/src/util/relativeAge";
import type { GeoInfo } from "@/src/data/types";

// Panel offset from the anchor, up and to the right. The leader spans exactly this diagonal, so
// the three pieces (ring, line, panel corner) stay attached by construction.
const OFF_X = 62;
const OFF_Y = 92;


// What the panel says — one model, filled per view/rung so the JSX below stays single-sourced.
// `aside.hue` absent = muted (the country card's ISO-code rule: a place carries no identity);
// `aside.live` prepends the beating live dot (the global card's aside state, mirrored).
interface Model {
  key: string;
  eyebrow: string;
  title: string;
  aside?: { text: string; hue?: string; live?: boolean };
  ring: string;
  lead?: { text?: string; codes?: string[] };
}

const geoOf = (p: { kind: string }): GeoInfo | undefined =>
  "geo" in p ? (p as { geo?: GeoInfo }).geo : undefined;

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
  const following = useStore((s) => s.following);
  // THE BOX LEADS (user, 2026-08-15 — clicking a committed node's hub re-boxes the metagraph
  // card and "nothing happens in the scene"): the box is the subject (it gets the camera), so
  // the callout mirrors it. Inspector publishes the boxed slot; the Engine's anchor resolvers
  // apply the SAME preference, so label and anchor step up and down together.
  const boxedCard = useStore((s) => s.boxedCard);
  // The global tick's aside is its AGE, ticking (user, 2026-08-15 — "same as card"):
  // SnapshotAside's two states mirrored as a label — `live · Xs` with the beating dot while
  // following, `◷ Xs` on a pin. The card keeps the BUTTON (follow toggle); this is read-only.
  const now = useNowTick(1000);
  if (!VIEW_POLICIES[mode].callout || section !== "scene") return null;

  // The committed NODE's model — shared by hyper and geo (user, 2026-08-15: in hyper too, "the
  // node does not have its callout — clickable, has a card"). City-first like the node card,
  // the network ticker as the hued identity aside, composition as the cards' pills; a node
  // with no place falls back to its short id (mono subjects keep their register elsewhere —
  // here the name is simply the best handle the node offers).
  const nodePick =
    inspect && (inspect.kind === "l0" || inspect.kind === "l1" || inspect.kind === "metanode") ? inspect : null;
  const nodeModel = (): Model | null => {
    if (!nodePick) return null;
    const g = geoOf(nodePick);
    const netId = nodePick.kind === "metanode" ? ((nodePick as { meta?: { id?: string } }).meta?.id ?? null) : "dag";
    const nnet = displayNetwork(netId);
    const codes = layerCodesOf([{ roles: nodePick.roles }]);
    const id = (nodePick as { node?: { id?: string } }).node?.id;
    return {
      key: `node|${id ?? `${g?.lat},${g?.lon}`}`,
      eyebrow: "Node",
      // City-first like the node card (nickname stays a CARD attribute — user, 2026-08-16:
      // the registry handles are informal, a content fact rather than the subject's name).
      title: g?.city ?? g?.country ?? (id ? shortHash(id) : "Node"),
      aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
      ring: nnet?.hue ?? "var(--primary)",
      lead: codes.length ? { codes } : undefined,
    };
  };

  const netModel = (): Model | null => {
    const net = displayNetwork(filter);
    // "all" has no subject; the unlisted set has no 3D anchor (no machines are knowable).
    if (!net || net.virtual) return null;
    const mg = metaList.find((x) => x.id === filter) ?? null;
    const codes = mg ? layerCodesOf(mg.nodes) : [];
    return {
      key: `net|${filter}`,
      eyebrow: filter === "dag" ? "Network" : "Metagraph",
      title: net.name,
      // The aside suppresses itself when it only restates the name (the DAG core's ticker IS
      // its name) — a head must not say the same thing twice (the CardHead aside rule).
      aside: net.ticker !== net.name ? { text: net.ticker, hue: net.hue } : undefined,
      ring: net.hue,
      lead: mg ? { text: `${mg.nodes.length} nodes`, codes } : undefined,
    };
  };

  let m: Model | null = null;
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
        key: `ms|${metaSnap.metaId}|${metaSnap.ordinal}`,
        eyebrow: "Metagraph snapshot",
        title: metaSnap.ordinal.toLocaleString(),
        aside: nnet ? { text: nnet.ticker, hue: nnet.hue } : undefined,
        ring: nnet?.hue ?? "var(--primary)",
      };
    };
    const gsModel = (): Model | null => {
      if (!snap) return null;
      const rel = relativeAge(now - Date.parse(snap.data.timestamp));
      return {
        key: `gs|${snap.data.ordinal}`,
        eyebrow: "Global snapshot",
        title: snap.data.ordinal.toLocaleString(),
        aside: following ? { text: rel ? `live · ${rel}` : "live", live: true } : rel ? { text: `◷ ${rel}` } : undefined,
        // Unfiltered the ring marks the whole bar (core cyan); under a filter the anchor
        // points at the committed network's own SEGMENT, so the ring takes its accent
        // (user, 2026-08-16 — "if filter, select the correct segment of the byte bar").
        ring: filter !== "all" ? filterAccent(filter) : "var(--core)",
        lead:
          typeof snap.data.metagraphSnapshotCount === "number"
            ? { text: `${snap.data.metagraphSnapshotCount} anchors` }
            : undefined,
      };
    };
    // The boxed NODE card leads (user, 2026-08-16 — a tray machine selected via the card
    // stack shows ITS callout); then the boxed global card; then the default finest-first.
    // The boxed METAGRAPH card shows NOTHING (user, 2026-08-16 — like geo's network rung: a
    // network in the chamber is a whole lane, and a single anchor would lie about it).
    if (boxedCard === "context") return null;
    m =
      (boxedCard === "node" ? nodeModel() : null) ??
      (boxedCard === "snap" ? gsModel() : null) ??
      msModel() ??
      gsModel() ??
      nodeModel();
  }
  if (!m) return null;

  return (
    <div
      id="callout"
      data-on="0"
      aria-hidden
      className="fixed left-0 top-0 z-30 pointer-events-none opacity-0 data-[on=1]:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* Anchor ring at the projected point (the wrapper's origin) — the subject mark at the
          scene end of the tie. */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full border-[1.5px]"
        style={{ borderColor: m.ring }}
      />
      {/* Dashed leader from the anchor to the panel's near corner — the ordinal-label language,
          in the SAME ink: the chamber's in-scene anchor lines are structural cyan, and cyan is
          the design's one accent/affordance signal (user, 2026-08-15 — round 2; the neutral grey
          read as chrome, the border token before it was too weak). Moderate opacity, not full —
          it is a tie, not a signal. Identity stays on the anchor RING. */}
      <svg className="co-leader absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
        <line
          x1={6}
          y1={-6}
          x2={OFF_X}
          y2={-OFF_Y + 8}
          stroke="var(--primary)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
      {/* The panel — keyed by subject so the roll-in replays on a change, like a card title. */}
      {/* Position lives in globals.css (`.co-panel` + the data-flip/data-drop mirrors the
          Engine toggles near viewport edges) — inline left/bottom would beat the flip rules. */}
      <div key={m.key} className={`co-panel roll-in absolute whitespace-nowrap ${SCENE_GLASS}`}>
        {/* The identity EDGE SPINE (user, 2026-08-15 — "the rails/hairline effect on the left
            side, attached", then "let it fade into the corners"): the sheets' single-identity-
            cue language at callout scale, as the shared `.edge-spine` recipe (globals.css) — a
            corner-wrapping hue border under a fixed-length fade, so on a panel this short the
            tips spend themselves in the corner curves rather than stopping abruptly. The
            leader flows into its lower run-off. Static and subtle: a resting identity cue. */}
        <span aria-hidden className="edge-spine opacity-70" style={{ ["--spine" as string]: m.ring }} />
        {/* The card eyebrow's own ink (CardHead: EYEBROW + text-accent), not a muted caption —
            this is the same slot noun the rail card wears (user, 2026-08-15). */}
        <div className="text-micro font-bold tracking-[0.1em] uppercase leading-none text-accent mb-1.5">{m.eyebrow}</div>
        {/* No identity dot here (user, 2026-08-15): the hued aside already carries the identity
            on this row, and the anchor ring is the subject mark at the scene end of the tie. */}
        <div className="flex items-center gap-[7px]">
          <span className="text-body font-semibold text-foreground">{m.title}</span>
          {m.aside && (
            <span
              className={
                m.aside.hue
                  ? "text-label font-bold ml-1"
                  : "inline-flex items-center gap-1.5 text-label text-muted-foreground ml-1"
              }
              style={m.aside.hue ? { color: m.aside.hue } : undefined}
            >
              {m.aside.live && (
                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_30%,transparent)] animate-dot-beat motion-reduce:animate-none" />
              )}
              {m.aside.text}
            </span>
          )}
        </div>
        {/* The card grammar's HEAD HAIRLINE at callout scale (user, 2026-08-15 — "cards have an
            underline between header and the rest"): it divides the HEAD (eyebrow + title, whose
            own separation stays colour-only, as in the cards) from the body, and it only exists
            where there IS a body to divide — a lead-less callout stays ruleless, the same gate
            CardHead applies when collapsed. Inside the padded box, so it shares the content
            edge like every resting division. */}
        {m.lead && (
          <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1.5 text-label text-muted-foreground">
            {m.lead.text && <span>{m.lead.text}</span>}
            {m.lead.codes && m.lead.codes.length > 0 && <RoleChips codes={m.lead.codes} />}
          </div>
        )}
      </div>
    </div>
  );
}
