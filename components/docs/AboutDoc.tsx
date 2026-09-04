"use client";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { VIEW_ICONS } from "@/components/icons";
import { ABOUT } from "@/components/aboutCopy";

// THE ABOUT DOCUMENT — the crawlable, GENERIC, non-technical prose (user, 2026-07-10): the app
// is a WebGL canvas with almost no indexable text, so this carries the search-facing copy (what
// the visualizer is, what the Constellation Network / $DAG / metagraphs are in plain words).
// Since 2026-09-04 it renders INSIDE the app as the DocLayer overlay (user: footer navigation
// must not reboot the engine, and the live scene is the backdrop the page always faked with a
// wash) — the /about route server-renders this same component through AppShell, so the prose is
// still in the route's HTML for crawlers. It also carries the UNOFFICIAL-PROJECT DISCLOSURE
// (user, 2026-08-09), which used to be an always-on ribbon over the command bar.

// The house eyebrow: a bare role word in caps micro, the same register every card head uses.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-micro tracking-caps uppercase text-muted-foreground">{children}</p>;
}

// One glass panel. Not `.ig-panel`: that class carries the rail cards' signal-edge pseudo-element
// machinery (hover pairing, subject pulses) which has no meaning on a static document — reusing it
// here would hang a live signal channel off prose. Same materials, none of the instrument.
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-[var(--panel)] backdrop-blur-md",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_30px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// A view's card in the "what you can explore" grid. The icon is the view's REAL mark from the
// app's own vocabulary (components/icons.tsx → VIEW_ICONS), so the three cards here, the command
// bar's buttons and the footer's view links can't disagree.
function ViewCard({ icon: Icon, name, about }: { icon: LucideIcon; name: string; about: { title: string; lines: string[] } }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-4 text-primary flex-none" />
        <h3 className="text-title font-semibold text-foreground">{name}</h3>
        <span className="text-label text-muted-foreground">· {about.title}</span>
      </div>
      <div className="mt-2 space-y-2">
        {about.lines.map((l, i) => (
          <p key={i} className="text-label text-foreground-dim leading-relaxed">{l}</p>
        ))}
      </div>
    </Panel>
  );
}

// A prose section: the eyebrow/heading grammar plus an inset hairline, the card-head rule at
// document scale. `scroll-mt` keeps an anchored heading clear of the fixed bar.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 border-t border-border" />
      <div className="mt-4 space-y-4 text-foreground-dim leading-relaxed">{children}</div>
    </section>
  );
}

// The overlay's way back into the scene: a real link (middle-click keeps working) whose plain
// click closes the doc layer instead of navigating — a navigation would reboot the engine that
// is literally rendering behind this text.
function CloseIntoScene({ className, children }: { className?: string; children: React.ReactNode }) {
  const setDocPage = useStore((s) => s.setDocPage);
  return (
    <a
      href="/"
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        setDocPage(null);
      }}
    >
      {children}
    </a>
  );
}

export default function AboutDoc() {
  return (
    <article className="pt-14">
      <Eyebrow>About</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] leading-tight">
        A live 3D map of the Constellation Network
      </h1>
      <p className="mt-5 text-base text-foreground-dim leading-relaxed">
        DAG Visualizer is a free, browser-based visualizer that shows the Constellation
        Network as a living 3D scene. It connects to the network&apos;s public APIs and renders
        what is actually happening right now: real nodes, real locations, real activity.
      </p>

      {/* The honesty rule, stated as the product's one promise. It earns a panel because it is
          the claim everything else on the page rests on. */}
      <Panel className="mt-6 py-4 px-5">
        <Eyebrow>The one rule</Eyebrow>
        <p className="mt-2 text-base text-foreground leading-relaxed">
          Every number on screen, and every shape that carries one, is read from live data.
          Nothing is estimated, and nothing is filled in with a plausible-looking placeholder.
        </p>
        <p className="mt-2 text-label text-muted-foreground leading-relaxed">
          When a feed is unavailable, the instrument says so, with <span className="font-mono">NO SIGNAL</span>,{" "}
          <span className="font-mono">acquiring</span> or <span className="font-mono">standby</span>, instead of
          showing a number it does not have.
        </p>
        {/* ⚠️ THE ARCS ARE THE ONE EXCEPTION AND THE PAGE MUST SAY SO (2026-08-12). The geo blurb
            below used to promise "live traffic travelling between them" — `domain/arcSim.ts` is a
            pure simulation: real node endpoints, invented motion, targets picked at random. On the
            one page that promised "Nothing is simulated", that was the sharpest possible false
            claim — and stating the exception underneath an unchanged promise would only have put
            the contradiction inside one panel. So the promise is now scoped to what it is actually
            true of, READINGS (a number, and the geometry that encodes one), and the exception names
            the one thing on screen that carries no reading. Both halves had to move; fixing only
            the blurb would have left the false sentence sitting in the louder type. */}
        <p className="mt-2 text-label text-muted-foreground leading-relaxed">
          The one thing carrying no reading is the motion: the packets travelling between nodes
          on the globe are a stand-in for nodes talking to each other, not a measured feed. The
          nodes they travel between are real.
        </p>
      </Panel>

      <Section id="explore" title="What you can explore">
        <p>
          Three views of the same network, each answering a different question: who and what,
          where, and when.
        </p>
        {/* ONE HOME for the per-view copy (user, 2026-08-13 — "can't we re-use the about
            card?"): these cards render the SAME lines the in-app About cards carry
            (components/aboutCopy.ts), so the two surfaces can't drift. Each card leads with the
            About TITLE (the orientation headline) under the view's NAME, exactly the pairing the
            command bar's caption strip makes in-app. Single column: three paragraphs per view
            read as prose, not as grid tiles. */}
        <div className="grid gap-3">
          <ViewCard icon={VIEW_ICONS.hyper} name="Hypergraph" about={ABOUT.hyper} />
          <ViewCard icon={VIEW_ICONS.geo} name="Geography" about={ABOUT.geo} />
          <ViewCard icon={VIEW_ICONS.ledger} name="Snapshots" about={ABOUT.ledger} />
        </div>
        {/* The card-adaptation principle, stated for the reader (user, 2026-08-15) — the same
            text CLAUDE.md and the README carry in their own registers. */}
        <p>
          Everything you select gets a card, and the cards <strong>tell the story rather than
          recite a record</strong>: the same subject is presented as the current scene sees it.
          Select a node while a snapshot is pinned and its card leads with the relation —
          signed, and by which layer — while routine facts step back; facts an ancestor card
          already states aren&apos;t repeated below it; and the label floating in the scene
          follows whichever card you expand, exactly as the camera does.
        </p>
      </Section>

      <Section id="constellation" title="What is the Constellation Network?">
        <p>
          Constellation is a distributed network whose native token is <strong>$DAG</strong>.
          Instead of one single chain of blocks, it is organised as a <em>hypergraph</em>: a
          base network (the Global L0) that many independent networks plug into. Validator
          nodes run all over the world and cooperate to agree on the network&apos;s state.
        </p>
      </Section>

      <Section id="metagraph" title="What is a metagraph?">
        <p>
          A metagraph is an application network built on Constellation. Each one runs its own
          nodes and produces its own ledger, and periodically <em>anchors</em> that ledger into
          the global network. You can think of metagraphs as independent economies that all
          come together on the same base layer.
        </p>
        <p>
          Anchoring is what the Snapshots view shows: a metagraph publishes a snapshot of its
          state, that snapshot is carried into a global snapshot, and it pays a fee in $DAG for
          the privilege. Metagraphs snapshot independently of each other and faster than the
          global layer, so a single global tick can carry anywhere from one to a hundred of
          them.
        </p>
      </Section>

      <Section id="data" title="Where the data comes from">
        <p>
          Everything on screen is read from Constellation&apos;s own public endpoints: the
          global snapshot stream, each metagraph&apos;s cluster info, and each node&apos;s
          status. Node locations come from geolocating their public IP addresses, so
          they are accurate to a city and a hosting provider, not to a street.
        </p>
        <p>
          There is no database behind this site and no account to create. The page holds a
          rolling window of recent snapshots in memory while it is open, and forgets it when
          you close the tab.
        </p>
      </Section>

      {/* The disclosure that used to be the always-on banner. Amber `--warn-soft` is the
          advisory register — deliberately NOT --destructive: nothing here is an error.
          The border is amber at low ALPHA, not a mix with --border: that token is itself a
          translucent blue (#5a8cff38), so mixing 28% amber into it landed at hue 214 and the
          panel read cyan — the one colour reserved for affordances. */}
      <section id="unofficial" className="mt-12 scroll-mt-24">
        <Panel className="py-4 px-5 border-[color-mix(in_oklch,var(--warn-soft)_30%,transparent)]">
          <div className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-3.5 text-warn-soft opacity-85 flex-none" />
            <h2 className="text-micro tracking-caps uppercase font-bold text-warn-soft">
              Unofficial, experimental
            </h2>
          </div>
          <p className="mt-3 text-foreground-dim leading-relaxed">
            DAG Visualizer is an independent community project. It is{" "}
            <strong className="text-foreground">not affiliated with, endorsed by, or operated by</strong>{" "}
            Constellation Network or any of the metagraph projects it displays. Their names,
            tickers and brand colours appear here only to identify what is being shown.
          </p>
          <p className="mt-3 text-foreground-dim leading-relaxed">
            It is also a work in progress: views arrive unfinished, readings can be wrong, and
            a feed can go quiet without warning. Nothing here is financial advice or an
            official record of the network. For anything that matters, use the official
            sources.
          </p>
          <p className="mt-3 text-label text-muted-foreground">
            For the official project, see{" "}
            <a
              href="https://constellationnetwork.io"
              className="text-primary underline underline-offset-2"
              rel="noopener"
            >
              constellationnetwork.io
            </a>
            .
          </p>
        </Panel>
      </section>

      <footer className="mt-14 pt-6 border-t border-border flex flex-wrap items-center gap-x-5 gap-y-2">
        <CloseIntoScene className="text-primary no-underline hover:underline underline-offset-2">
          Open the visualizer →
        </CloseIntoScene>
        <span className="text-label text-muted-foreground">
          Built entirely from Constellation&apos;s public data. No account, nothing to sign up for.
        </span>
      </footer>
    </article>
  );
}
