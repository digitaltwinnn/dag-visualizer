"use client";
import { cn } from "@/lib/utils";
import { METAGRAPHS } from "@/src/net/current";
import { identityMap } from "@/src/palette/identity";
import CardHeadDemo from "@/app/design/CardHeadDemo";
import CardSignalsDemo from "@/app/design/CardSignalsDemo";
import IconLegend from "@/app/design/IconLegend";
import MicroInstrumentsDemo from "@/app/design/MicroInstrumentsDemo";
import StatusDemo from "@/app/design/StatusDemo";
import OdometerDemo from "@/app/design/OdometerDemo";
import EcgDemo from "@/app/design/EcgDemo";
import { NodeStars, NoSignalDot, SonarRing, StandbyHalo } from "@/components/state/StateAtoms";
import { SELECTED_ROW, SelectedRowMark, SCENE_GLASS } from "@/components/selection";
import { RoleChips } from "@/components/inspector/parts";

// THE DESIGN DOCUMENT — rendered inside the app as the DocLayer overlay since 2026-09-04 (the
// same move /about made: no engine reboot, the live scene as the backdrop); the /design route
// server-renders this same component through AppShell and keeps its noindex metadata. The demo
// components stay in app/design/ beside the route that owns them.
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
//
// HOUSE TREATMENT (2026-09-04, user: "no consistency or common elements at all"): the page now
// wears exactly what /about wears — the DocLayer overlay chrome over the live scene, the
// eyebrow/title lead, the Section grammar, and its own chrome is set in the HUD type scale
// it documents (it used to describe `text-label` in `text-sm`, which was the joke writing
// itself). The specimens inside the sections are untouched — they read the live tokens.

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
// No hardcoded px: the sample renders at the live `text-*` class, so the size IS the token
// (the exact px lives in globals.css `--text-*` — the source of truth, not duplicated here).
const TYPE_SCALE: { cls: string; role: string }[] = [
  { cls: "text-micro", role: "uppercase eyebrows / tags / axis labels + tiny glyphs" },
  { cls: "text-label", role: "secondary / meta — counts, codes, subtitles, hints" },
  { cls: "text-body", role: "rows, descriptions, values" },
  { cls: "text-title", role: "card titles" },
];

// The doc-page section grammar, shared with /about: h2 lead + inset hairline + spaced body.
function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 border-t border-border" />
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

// A section's explanatory paragraph: the house label register, muted, measure-capped.
// HUMAN VOICE THROUGHOUT (user, 2026-09-04 — "yes to all" on extending the about-page rule):
// notes speak to a reader, never cite rules or file paths at them. The developer-facing
// authority is unchanged and lives where developers look — components/CLAUDE.md for the
// prohibitions, app/globals.css for the tokens, the section demos' own headers for the code
// names the titles used to carry.
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-label text-muted-foreground leading-relaxed max-w-2xl">{children}</p>;
}

export default function DesignDoc() {
  // Identity hues straight from the palette generator (config pins overlaid with baked brand
  // hues) — the SAME source /api/metagraphs and the scene use. `hudOklch` is the HUD-lane hue
  // (flat on glass); `hueDeg` is its wheel position. Pure and cheap, so computing it client-side
  // in the overlay costs nothing; the /design route still statically renders the result.
  const hues = identityMap(METAGRAPHS.map((m) => m.id));
  const identity = METAGRAPHS.map((m) => ({ ticker: m.ticker, hue: hues.get(m.id) }));

  return (
    <article className="pt-14">
          <p className="text-micro tracking-caps uppercase text-muted-foreground">Design</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] leading-tight">
            Instrument-Glass
          </h1>
          {/* HUMAN VOICE (user, 2026-09-04 — the about-page rule reaches here too: "for humans to
              read, not a technical brief"). The technical claims the old intro made still hold and
              live where developers look: app/globals.css is the one token source, the swatches read
              it live, and the specimens below render through the real components — which is exactly
              what the second sentence promises the reader in plain words. */}
          <p className="mt-5 text-base text-foreground-dim leading-relaxed max-w-2xl">
            This page shows the visual language the visualizer is built from — its colours, its
            type, and the small signature elements you&apos;ll recognise from every corner of the
            app.
          </p>
          <p className="mt-3 text-label text-muted-foreground leading-relaxed max-w-2xl">
            Nothing on it is a mock-up: everything here is drawn by the same styles and components
            the app itself uses, so what you see on this page is always exactly what the app looks
            like right now.
          </p>

          <Section title="Structural colours">
            <Note>
              A small set of colours does all the structural work. Cyan is the app&apos;s one
              accent — anything glowing cyan is live or clickable. Red warns, green says ready,
              and the deep blue belongs to the DAG core itself. These jobs are theirs alone: a
              metagraph&apos;s own colour never takes them over.
            </Note>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STRUCTURAL.map((t) => (
                <div key={t.var} className="ig-panel p-3">
                  <div className="h-10 rounded-md mb-2" style={{ background: `var(${t.var})` }} />
                  <div className="text-label font-mono text-muted-foreground">{t.name}</div>
                  <div className="text-label font-mono">{t.var}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Type scale">
            <Note>
              Four text sizes cover the whole interface — tiny uppercase tags, small labels,
              body rows, and card titles. Every piece of text snaps to one of them, which is a
              large part of why the panels read as one calm instrument rather than a collage.
            </Note>
            <div className="flex flex-col gap-3">
              {TYPE_SCALE.map((t) => (
                <div key={t.cls} className="ig-panel p-3 flex items-baseline gap-4">
                  <span className={cn(t.cls, "text-foreground font-semibold w-40 flex-none")}>
                    The quick brown fox
                  </span>
                  <code className="font-mono text-label text-primary flex-none">{t.cls}</code>
                  <span className="text-label text-muted-foreground">{t.role}</span>
                </div>
              ))}
            </div>
            {/* Two typefaces, split by PURPOSE — no web font (native stacks: instant, no FOUT). */}
            <Note>
              Two typefaces, split by role: a proportional sans for everything you read — titles,
              descriptions, labels — and a monospace for machine data: hashes, counts, codes,
              $DAG amounts, snapshot numbers. Fixed-width digits line up in columns, roll
              cleanly on the odometer, and make a hash scannable character by character.
            </Note>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-2xl">
              <div className="ig-panel p-3">
                <div className="text-title text-foreground">The quick brown fox 0123</div>
                <div className="text-micro font-mono text-muted-foreground mt-1">sans · system-ui — reading UI (prose, labels)</div>
              </div>
              <div className="ig-panel p-3">
                <div className="text-title font-mono tabular-nums text-foreground">DAG · a2be…69a9</div>
                <div className="text-micro font-mono text-muted-foreground mt-1">mono · font-mono · tabular-nums — data (ids, counts, codes)</div>
              </div>
            </div>
          </Section>

          <Section title="Identity colours">
            <Note>
              Every metagraph gets its own colour, and it is the same everywhere, every time —
              on its dot, its thread, its chips. A project&apos;s real brand colour wins where one
              exists; otherwise a hue is derived from its identity and spaced so no two
              neighbours collide. Identity colours mark subjects only — the app&apos;s own chrome
              never wears them.
            </Note>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {identity.map((m) => (
                <div key={m.ticker} className="ig-panel p-3" style={{ ["--spine" as string]: m.hue?.hudOklch }}>
                  <div className="h-10 rounded-md mb-2" style={{ background: m.hue?.hudOklch }} />
                  <div className="text-label font-mono">{m.ticker}</div>
                  <div className="text-micro font-mono text-muted-foreground">
                    {m.hue ? `${Math.round(m.hue.hueDeg)}°` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <h2 className="text-micro uppercase tracking-caps text-primary/70 mt-14 mb-4 border-t border-border pt-6">
            Signature elements — the bespoke design language
          </h2>

          <Section title="Object marks">
            <Note>
              Every kind of thing on screen — a node, a country, a snapshot, a view — has one
              mark, drawn in a single monochrome style that takes on whatever colour its
              surroundings give it. Wherever you meet the same kind of thing, you meet the same
              mark. The legend below is read from the app&apos;s own icon map.
            </Note>
            <IconLegend />
          </Section>

          <Section title="The heartbeat and the odometer">
            <Note>
              The little ECG trace in the top-left corner is the app&apos;s pulse — it beats while
              the data flows. And numbers that change while you watch roll over like an odometer
              instead of snapping, so you can see them move. Both run live below.
            </Note>
            <div className="ig-panel p-4 flex flex-wrap items-center gap-8">
              <span className="flex items-center gap-2 text-body">
                <EcgDemo /> <span className="text-muted-foreground text-label">EcgMark — heartbeat</span>
              </span>
              <span className="flex items-center gap-2">
                <OdometerDemo /> <span className="text-muted-foreground text-label">Odometer — digit roll</span>
              </span>
            </div>
          </Section>

          <Section title="Card states">
            <Note>
              Every card in the side rails is the same glass panel with the same header: a small
              tag, a title, a hairline, then the facts. Left to right below: an empty slot
              quietly showing what could live there, a full card, a collapsed one (the whole
              header is the toggle), and a closed one — the × clears the selection and returns
              the slot to its hint.
            </Note>
            <CardHeadDemo />
          </Section>

          <Section title="Node status pills">
            <Note>
              A node&apos;s health lands in one of four buckets — ready in green, in progress in
              amber, down in red, unknown in grey — and always appears as the same quiet pill,
              whether it describes a single node or rolls a whole fleet up into one line.
            </Note>
            <StatusDemo />
          </Section>

          <Section title="When data is missing">
            <Note>
              When something hasn&apos;t arrived yet — or can&apos;t be reached at all — the screen says
              so with one of these small instrument states, never a generic spinner and never a
              made-up number. These are the four you&apos;ll meet.
            </Note>
            <div className="ig-panel p-4 flex flex-wrap items-center gap-8 text-label text-muted-foreground">
              <span className="flex items-center gap-2"><NodeStars /> acquiring</span>
              <span className="flex items-center gap-2"><NoSignalDot /> no signal (dot)</span>
              <span className="flex items-center gap-2"><SonarRing /> no signal (sonar)</span>
              <span className="flex items-center gap-2"><StandbyHalo /> standby</span>
            </div>
          </Section>

          <Section title="Micro-instruments">
            <Note>
              The little charts in the bottom band follow two rules: shares of a whole become a
              donut, sizes become bars — and every slice and bar is named, so colour is never
              the only clue to what you&apos;re reading.
            </Note>
            <MicroInstrumentsDemo />
          </Section>

          <Section title="Selection">
            <Note>
              Anything you have committed to — a filter, a chosen node, a drilled country —
              wears the same treatment: a soft wash, a thin ring, and a check mark at the end of
              the row. One look, everywhere, so you always know what is selected.
            </Note>
            <div className="ig-panel p-2 max-w-[320px] flex flex-col gap-0.5">
              <div className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 pr-7 text-body text-foreground-dim">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--muted-foreground)" }} />
                Unselected row
              </div>
              <div className={cn("relative flex items-center gap-2 rounded-sm px-2 py-1.5 pr-7 text-body text-foreground", SELECTED_ROW)}>
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--primary)" }} />
                Selected row
                <SelectedRowMark className="absolute right-2" />
              </div>
            </div>
          </Section>

          <Section title="Scene labels">
            <Note>
              When you hover or select something in the 3D scene, a small glass label stands
              beside it and points at it with a dashed leader. It speaks the cards&apos; own
              grammar at tooltip scale — the tag, the title, the coloured ticker, a hairline of
              the subject&apos;s colour along its edge. The example below is deliberately made up:
              this page teaches the shape, not today&apos;s data.
            </Note>
            <div className="relative h-[190px]">
              {/* Static specimen at the anchor-wrapper geometry the live callout uses. */}
              {/* GENERIC content on purpose (user, 2026-08-16): no real network names, tickers or
                  locations in specimens — this page teaches the grammar, not today's data. The hue
                  is a made-up identity, not a brand's. */}
              <div className="absolute left-[60px] top-[160px]">
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full border-[1.5px]"
                  style={{ borderColor: "#c9824f" }}
                />
                <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
                  <line x1={6} y1={-6} x2={62} y2={-84} stroke="var(--primary)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 4" />
                </svg>
                <div className={cn("absolute whitespace-nowrap", SCENE_GLASS)} style={{ left: 62, bottom: 92 }}>
                  <span aria-hidden className="edge-spine opacity-70" style={{ ["--spine" as string]: "#c9824f" }} />
                  <div className="text-micro font-bold tracking-[0.1em] uppercase leading-none text-accent mb-1.5">Metagraph</div>
                  <div className="flex items-center gap-[7px]">
                    <span className="text-body font-semibold text-foreground">Metagraph name</span>
                    <span className="text-label font-bold ml-1" style={{ color: "#c9824f" }}>TICKER</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1.5 text-label text-muted-foreground">
                    <span>12 nodes</span>
                    <RoleChips codes={["L0", "cL1", "dL1"]} />
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Edge signals">
            <Note>
              A card&apos;s inner edge only lights up when something is happening, and the three
              signals keep a strict order of loudness: a faint grey shimmer under your pointer,
              a coloured glow when a card and its object in the scene are paired, and —
              brightest of all — a travelling pulse when the card&apos;s subject changes. All three
              run live below; with reduced motion on, the pulse becomes a single quiet blink.
            </Note>
            <CardSignalsDemo />
          </Section>

          <Section title="The instrument ruler">
            <Note>
              The thin ruled line with its comb of ticks — every fourth one a touch taller — is
              the interface&apos;s signature instrument. You&apos;ll find it running down both edges of
              the screen (with a coloured spine and a dot for every open card), along the panel
              edges on smaller screens, under the bar charts, and even bent into a hexagon
              around the dials of the 3D snapshot chamber. One ruler, drawn wherever the
              interface needs an edge.
            </Note>
            <div className="ig-panel p-4 max-w-2xl">
              <div className="h-3 w-full" style={{ background: "var(--axis-hairlines)" }} aria-hidden />
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-micro font-mono text-muted-foreground">
                <span>--thread-tick (minor)</span>
                <span>--thread-tick-major (every 4th)</span>
                <span>--thread-tick-pitch (spacing)</span>
                <span>--thread-line (spine base)</span>
              </div>
            </div>
          </Section>

          {/* No article footer — /about's own rule (2026-09-04): the site footer below the
              overlay is the page's real foot. The retired line's claims live in this file's
              header comment. */}
        </article>
  );
}
