import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { METAGRAPHS } from "@/src/engine/config";
import { identityMap } from "@/src/palette/identity";
import CardHeadDemo from "./CardHeadDemo";
import CardSignalsDemo from "./CardSignalsDemo";
import GhostCardDemo from "./GhostCardDemo";
import IconLegend from "./IconLegend";
import StatusDemo from "./StatusDemo";

// Internal styleguide: robots-disallowed; carries its OWN title and no canonical (it would
// point at the marketing root otherwise).
export const metadata: Metadata = {
  title: "Instrument-Glass tokens",
  robots: { index: false, follow: false },
  alternates: { canonical: undefined },
};

// ── /design is a TOKEN REFERENCE, not a component gallery (trimmed 2026-07-12). ──────────────
// It shows only what CANNOT drift from the shipped app: the structural colour lane and the
// identity-hue lane both read the live design system (CSS vars + the palette generator), and
// the type scale renders the live `text-*` classes. So every swatch/row on this page is
// correct BY CONSTRUCTION — there's nothing to keep in sync by hand.
//
// It deliberately does NOT mirror the components. The earlier version hand-re-implemented card
// heads, buttons, the filter picker, etc.; those demos drifted the moment a component changed
// (a maintenance tax with no guarantee) and the gallery was always partial. The real
// verification surface is the RUNNING APP (see CLAUDE.md → "Verifying changes" — the
// chrome-devtools MCP), and the authoritative token source is `app/globals.css`. This page is
// the quick human-readable index of the tokens those two express; nothing verifies against it.
//
// Fully STATIC — no request-time fetch (the old live `/api/metagraphs` call blocked every load
// on a multi-second cluster round-trip just to colour a few swatches; the identity hues come
// from the palette generator at build time instead).

// The structural colour lane (app/globals.css `:root`). `--panel` is the lone structural
// literal (translucent glass fill, no shadcn equivalent); everything else is an oklch token.
const STRUCTURAL: { name: string; var: string }[] = [
  { name: "background", var: "--background" },
  { name: "foreground", var: "--foreground" },
  { name: "muted-foreground", var: "--muted-foreground" },
  { name: "foreground-dim (2nd muted tone)", var: "--foreground-dim" },
  { name: "primary / accent (live cyan)", var: "--primary" },
  { name: "destructive (warn / no-signal)", var: "--destructive" },
  { name: "warn-soft (banner amber)", var: "--warn-soft" },
  { name: "success (ready)", var: "--success" },
  { name: "core (DAG hypergraph-core blue)", var: "--core" },
  { name: "panel (glass fill)", var: "--panel" },
  { name: "panel-light (dock glass)", var: "--panel-light" },
  { name: "wash-soft (accent fill)", var: "--wash-soft" },
];

// The HUD type scale — the four steps every HUD text site snaps to (globals.css `@theme`).
const TYPE_SCALE: { cls: string; px: string; role: string }[] = [
  { cls: "text-micro", px: "10.5px", role: "uppercase eyebrows / tags / axis labels + tiny glyphs" },
  { cls: "text-label", px: "11.5px", role: "secondary / meta — counts, codes, subtitles, hints" },
  { cls: "text-body", px: "12.5px", role: "rows, descriptions, values" },
  { cls: "text-title", px: "15px", role: "card titles" },
];

export default function DesignPage() {
  // Identity hues straight from the palette generator (config pins overlaid with baked brand
  // hues) — the SAME source /api/metagraphs and the scene use, resolved at build time so the
  // page stays static. `hudOklch` is the HUD-lane hue (flat on glass); `hueDeg` is its wheel
  // position.
  const hues = identityMap(METAGRAPHS.map((m) => m.id));
  const identity = METAGRAPHS.map((m) => ({ ticker: m.ticker, hue: hues.get(m.id) }));

  return (
    <main className="h-screen overflow-y-auto bg-background text-foreground p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Instrument-Glass tokens</h1>
      <p className="text-muted-foreground mb-2 max-w-2xl">
        The design system&apos;s TOKENS — the colour lanes and the type scale, read live from{" "}
        <code className="font-mono">app/globals.css</code> and the palette generator, so every
        value here is correct by construction.
      </p>
      <p className="text-sm text-muted-foreground/80 mb-8 max-w-2xl">
        The tokens are the durable, drift-proof part; below them are the app&apos;s SIGNATURE
        design elements — the card states + the signal language — shown via the REAL components
        (not rebuilds), so they can&apos;t drift either. It is not a full component gallery;
        component behaviour is verified against the running app (see{" "}
        <code className="font-mono">CLAUDE.md</code>), and <code className="font-mono">app/globals.css</code>{" "}
        is the authoritative token source.
      </p>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Structural lane
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Structural cyan (<code className="font-mono">--primary</code>) is the SOLE
          accent/affordance signal; warn/ready use <code className="font-mono">--destructive</code>/
          <code className="font-mono">--success</code>; the DAG core is{" "}
          <code className="font-mono">--core</code>. These are never repointed at an identity hue.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STRUCTURAL.map((t) => (
            <div key={t.var} className="ig-panel p-3">
              <div className="h-10 rounded-md mb-2" style={{ background: `var(${t.var})` }} />
              <div className="text-xs font-mono text-muted-foreground">{t.name}</div>
              <div className="text-xs font-mono">{t.var}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          HUD type scale
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Four steps every HUD text site snaps to (globals.css <code className="font-mono">@theme</code>{" "}
          <code className="font-mono">--text-*</code>). Tokens first — an arbitrary{" "}
          <code className="font-mono">text-[..px]</code> is only acceptable for a true one-off (e.g. a
          control glyph), documented inline. <code className="font-mono">text-micro</code> is for
          uppercase eyebrows/tags/axis + glyphs, never readable body copy.
        </p>
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="ig-panel p-3 flex items-baseline gap-4">
              <span className={cn(t.cls, "text-foreground font-semibold w-40 flex-none")}>
                The quick brown fox
              </span>
              <code className="font-mono text-xs text-primary flex-none">{t.cls}</code>
              <span className="font-mono text-xs text-muted-foreground flex-none">{t.px}</span>
              <span className="text-xs text-muted-foreground">{t.role}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Identity lane — generated hues
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Identity hues are deterministic per metagraph (<code className="font-mono">src/palette/</code>):
          brand hue (baked) &gt; config colour &gt; hash fallback, snapped into non-colliding zones.
          They appear ONLY on subject marks (dots, threads, chips), matched by metagraph id
          everywhere — never on structural chrome.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {identity.map((m) => (
            <div key={m.ticker} className="ig-panel p-3" style={{ ["--spine" as string]: m.hue?.hudOklch }}>
              <div className="h-10 rounded-md mb-2" style={{ background: m.hue?.hudOklch }} />
              <div className="text-xs font-mono">{m.ticker}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {m.hue ? `${Math.round(m.hue.hueDeg)}°` : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <h2 className="text-xs uppercase tracking-[0.2em] text-primary/70 mt-14 mb-4 border-t border-border pt-6">
        Signature elements — the bespoke design language
      </h2>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Object marks — <code className="font-mono">components/icons.tsx</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          ONE icon system: monochrome <code className="font-mono">lucide-react</code> glyphs via{" "}
          <code className="font-mono">currentColor</code> (so the accent/identity tint inherits),
          never emoji. Each SUBJECT kind has a mark (<code className="font-mono">iconForPick</code>),
          each VIEW its switch icon (<code className="font-mono">VIEW_ICONS</code>), shared by the
          card heads, the view switch, and the dock trays — read here from the real map, so it
          can&apos;t drift.
        </p>
        <IconLegend />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Card states — <code className="font-mono">Card</code> + <code className="font-mono">CardHead</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Every rail card is the design-system <code className="font-mono">Card</code> (the{" "}
          <code className="font-mono">.ig-panel</code> glass recipe) led by the one shared{" "}
          <code className="font-mono">CardHead</code> (eyebrow / title / inset hairline / body).
          Cards are SPINELESS AT REST — the resting identity cue lives in the rail thread, not a
          per-card edge. A card has three states: the GHOST hint (below), the ACTIVE populated
          card, and COLLAPSED (the whole head is the disclosure toggle → eyebrow + title only).
          Rendered here with the real component, so it can&apos;t drift.
        </p>
        <CardHeadDemo />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Ghost (hint) card — <code className="font-mono">Inspector.GhostCard</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          A right-rail slot&apos;s empty state: every card the view CAN produce stays visible —
          populated when its subject is selected, else this quiet dashed one-liner (kind mark ·
          slot label · instruction). Availability + copy derive from the rail manifest
          (<code className="font-mono">railCards.ts</code>); shown here via the real{" "}
          <code className="font-mono">GhostCard</code>.
        </p>
        <GhostCardDemo />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Node status — <code className="font-mono">nodeStatus.ts</code> + the status pills
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Node health resolves to four buckets, each with its own colour (a LITERAL palette in{" "}
          <code className="font-mono">nodeStatus.ts</code>, separate from the structural tokens):
          ready green, in-progress amber, down red, unknown grey. Everything renders as ONE quiet
          pill language — the node card&apos;s status mark and the dossier&apos;s rolled-up
          breakdown (shown via the real <code className="font-mono">StatusMark</code> /{" "}
          <code className="font-mono">StatusBreakdown</code>).
        </p>
        <StatusDemo />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Signal language — <code className="font-mono">EdgePulse.tsx</code> + the edge recipes
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          <strong>Thread = resting identity cue; card edge = purely transient signal channel.</strong>{" "}
          The edge lights ONLY as a signal, always on the SCENE-FACING edge, in a strict hierarchy:
          grey pointer-hover whisper &lt; identity-hued hover pairing (<code className="font-mono">.subject-paired</code>)
          &lt; the subject-change PULSE (<code className="font-mono">useEdgePulse</code> — a bright
          gradient-tipped segment sweeps the edge, ~1.2s, synced with the title roll-in). Driven
          here by the real <code className="font-mono">PulseEdge</code>; reduced motion → one static
          blink.
        </p>
        <CardSignalsDemo />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Instrument ruler — <code className="font-mono">--thread-*</code> / <code className="font-mono">--axis-hairlines</code>
        </h2>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          One ruler spec threads the whole HUD: a neutral baseline with combed hairline ticks
          (minor every <code className="font-mono">--thread-tick-pitch</code>, a taller/brighter
          major every 4th). It appears as the two rails&apos; <code className="font-mono">RailThread</code>{" "}
          (a mirrored fixed SVG in the 26px margin, with an identity-hued spine + a node-dot at each
          card&apos;s middle — the RESTING identity cue the spineless cards defer to), the
          tablet/phone sheet edges (<code className="font-mono">.ig-sheet-edge</code> /{" "}
          <code className="font-mono">.ig-sheet-topruler</code>), and the bar-chart axis. The strip
          below renders the live <code className="font-mono">--axis-hairlines</code> recipe (reads
          the same tokens, so it can&apos;t drift). The 3D ledger station dials bend this same ruler
          into a hexagon — not shown (same spec, different medium).
        </p>
        <div className="ig-panel p-4 max-w-2xl">
          <div className="h-3 w-full" style={{ background: "var(--axis-hairlines)" }} aria-hidden />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono text-muted-foreground">
            <span>--thread-tick (minor)</span>
            <span>--thread-tick-major (every 4th)</span>
            <span>--thread-tick-pitch (spacing)</span>
            <span>--thread-line (spine base)</span>
          </div>
        </div>
      </section>
    </main>
  );
}
