"use client";
import type { ReactNode } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_ICONS } from "@/components/icons";
import { ABOUT } from "@/components/aboutCopy";
import NetLink from "@/components/NetLink";
import { ROUTED_VIEWS } from "@/components/views";
import { useStore } from "@/src/store/store";
import type { Mode } from "@/src/store/store";

// THE ABOUT DOCUMENT — the crawlable, GENERIC, non-technical prose (user, 2026-07-10): the app
// is a WebGL canvas with almost no indexable text, so this carries the search-facing copy (what
// the visualizer is, what the Constellation Network / $DAG / metagraphs are in plain words).
// Since 2026-09-04 it renders INSIDE the app as the DocLayer overlay (user: footer navigation
// must not reboot the engine, and the live scene is the backdrop the page always faked with a
// wash) — the /about route server-renders this same component through AppShell, so the prose is
// still in the route's HTML for crawlers. It also carries the UNOFFICIAL-PROJECT DISCLOSURE
// (user, 2026-08-09), which used to be an always-on ribbon over the command bar.
//
// THE VIEWS, THEN QUESTIONS (user, 2026-11-03, option B of three in the brainstorming companion:
// the page "feels a bit unorganized"). One "Live data" box carried six topics and the explore
// section mixed the views with how the cards work, so the page is now: the disclosure first (user:
// "move unofficial section to the top"), the title and lead, the views as tiles that open
// them, and everything else as the questions a visitor actually has, one topic each. The answers
// are native `<details>`: folded, they stay in the server-rendered HTML for crawlers, where a
// Radix collapsible would unmount them. No privacy question (user, same day: "drop the privacy
// section"), and the AI question is asked the way a visitor would ask it, before they know the
// product's name.

// One glass panel. Not `.ig-panel`: that class carries the rail cards' signal-edge pseudo-element
// machinery (hover pairing, subject pulses) which has no meaning on a static document — reusing it
// here would hang a live signal channel off prose. Same materials, none of the instrument.
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-[var(--panel)] backdrop-blur-md",
        "[box-shadow:var(--card-ambient)]", // the token, not a restated literal — light casts no drop (Print, 2026-10-09)
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The question each view answers — the tile's line under the view's name. Every routed view has
 *  one, Coming soon included (user, 2026-11-03), and nothing on the page counts them: more will come. */
const VIEW_QUESTION: Record<Mode, string> = {
  hyper: "How is it built?",
  geo: "Where does it run?",
  ledger: "When does it anchor?",
  trend: "How has it changed?",
  soon: "What comes next?",
};

// A view's tile: its REAL mark (VIEW_ICONS, so the tiles, the command bar and the footer can't
// disagree), its name and its question. A real link to the view's route, switched in place the way
// the footer's view links are, so the engine never reboots and a crawler still follows it.
function ViewTile({ id, name, slug, soon }: { id: Mode; name: string; slug: string; soon?: boolean }) {
  const setMode = useStore((s) => s.setMode);
  const Icon = VIEW_ICONS[id];
  return (
    <NetLink
      href={`/${slug}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        setMode(id);
      }}
      className="group block rounded-lg focus-visible:outline-1 focus-visible:outline-ring/60"
    >
      {/* A view still to come wears the ghost card's dashed edge and a dimmed mark — nothing to
          show yet, the bar's dimmed "Coming soon" entry in the same voice. */}
      <Panel className={cn("h-full p-4 transition-colors duration-150 group-hover:border-[color-mix(in_oklch,var(--primary)_45%,transparent)] motion-reduce:transition-none", soon && "border-dashed")}>
        <Icon aria-hidden className={cn("size-5", soon ? "text-muted-foreground" : "text-primary")} />
        <h2 className="mt-2.5 text-title font-semibold text-foreground">{name}</h2>
        <p className="mt-1 text-body text-muted-foreground">{VIEW_QUESTION[id]}</p>
      </Panel>
    </NetLink>
  );
}

// One question, folded: the summary is the question, the body its answer. The fold mark is the
// app's own (the AI card's rows fold on the same chevron).
function Question({ q, open, children }: { q: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-b border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-title font-semibold text-foreground [&::-webkit-details-marker]:hidden focus-visible:outline-1 focus-visible:outline-ring/60 rounded-sm">
        <h3 className="m-0 [font:inherit] text-inherit">{q}</h3>
        <ChevronDown aria-hidden className="size-4 flex-none text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="-mt-1 pb-5 space-y-3 text-prose text-foreground-dim">{children}</div>
    </details>
  );
}

const B = ({ children }: { children: ReactNode }) => <strong className="text-foreground font-semibold">{children}</strong>;

export default function AboutDoc() {
  return (
    <article className="pt-14">
      {/* The disclosure that used to be the always-on banner, FIRST (user, 2026-11-03). Amber
          `--warn-soft` is the advisory register — deliberately NOT --destructive: nothing here is an
          error. The border is amber at low ALPHA, not a mix with --border: that token is itself a
          translucent blue, so mixing amber into it landed at hue 214 and the panel read cyan — the
          one colour reserved for affordances. */}
      <section id="unofficial" className="scroll-mt-24">
        <Panel className="py-3.5 px-5 border-[color-mix(in_oklch,var(--warn-soft)_30%,transparent)]">
          <div className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-3.5 text-warn-soft opacity-85 flex-none" />
            {/* A label, not a heading: the page's title stays its first heading. */}
            <p className="text-label tracking-caps uppercase font-bold text-warn-soft">Unofficial, experimental</p>
          </div>
          <p className="mt-2 text-prose text-foreground-dim">
            An independent community project, <B>not affiliated with, endorsed by, or operated by</B> Constellation
            Network or any of the metagraph projects it shows; their names, tickers and colours appear only to identify
            them. It is a work in progress: views arrive unfinished and readings can be wrong. Nothing here is financial
            advice or an official record. For the official project, see{" "}
            <a href="https://constellationnetwork.io" className="text-primary-ink underline underline-offset-2" rel="noopener">
              constellationnetwork.io
            </a>
            .
          </p>
        </Panel>
      </section>

      <p className="mt-10 text-label tracking-caps uppercase text-muted-foreground">About</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em] leading-tight">A live 3D map of the Constellation Network</h1>
      <p className="mt-5 text-lg text-foreground-dim leading-relaxed">
        DAG Visualizer is a free, browser-based visualizer that shows the Constellation Network as a living 3D scene. It
        connects to the network&apos;s public APIs and renders what is actually happening right now: real nodes, real
        locations, real activity.
      </p>
      {/* The making-of, one line (user, 2026-10-18; "integrated" 2026-11-03 — the notes on the cards are
          Gate AI's too). A fact about the site, not a claim about the network. */}
      <p className="mt-3 text-prose text-muted-foreground">
        Designed, built and integrated with Gate AI, Constellation&apos;s own AI product.
      </p>

      <section id="explore" aria-label="The views" className="mt-8 grid grid-cols-5 gap-3 max-[900px]:grid-cols-3 max-[700px]:grid-cols-2">
        {ROUTED_VIEWS.map((v) => (
          <ViewTile key={v.id} id={v.id} name={v.name} slug={v.slug} soon={v.soon} />
        ))}
      </section>

      <section id="questions" aria-label="Questions" className="mt-10 border-t border-border">
        {/* WHERE IT COMES FROM, said generally (user, 2026-11-03: "rewrite and generalize this section
            saying we use public resources"; the location-accuracy and NO SIGNAL questions folded away
            with it). Still scoped to NUMBERS being live: the arcs are simulated motion (2026-08-12),
            so don't widen the claim to "everything". */}
        <Question q="Where does the data come from?" open>
          <p>
            Only from public sources: the Constellation Network&apos;s own public endpoints, and public lookups for where
            each node runs. Every number is live, drawn as it comes in.
          </p>
          <p>
            The one exception is a written note on a card, which is made from those same figures a little earlier and says
            which stretch of time it covers.
          </p>
        </Question>

        {/* ONE HOME for the per-view copy (components/aboutCopy.ts), shared with the in-app About row. */}
        <Question q="What does each view show?">
          {ROUTED_VIEWS.map((v) => (
            <p key={v.id}>
              <B>{v.name}</B> — {ABOUT[v.id].title.toLowerCase()}. {ABOUT[v.id].text}
            </p>
          ))}
        </Question>

        {/* Short sentences, one idea each, a bold lead to scan by (user, 2026-11-03: "make it easier
            to read"). The pinned-snapshot example and the "records" detail were cut: a first-time
            reader meets them on screen. */}
        <Question q="How do I find my way around?">
          <p>
            <B>Every view follows your pick.</B> Choose a network in the Hypergraph, then switch views: the globe, the
            snapshots and the charts all open on that network.
          </p>
          <p>
            <B>Each pick gets its own card</B> on the right. The cards fit what you&apos;re looking at, and a fact the card
            above already shows isn&apos;t repeated.
          </p>
          <p>
            <B>RAW shows what&apos;s underneath.</B> Every view has a RAW switch that opens the actual records behind it,
            starting where you were looking.
          </p>
        </Question>

        {/* Asked the way a visitor would, before they know the product (user, 2026-11-03: the Gate
            AI section "should be more generic as user won't know yet what that is"); the answer
            names it. It keeps the feature's two promises: the figures are the view's own, and a note
            they can't back never shows. */}
        <Question q="Who writes the short notes on the cards?">
          <p>
            An AI does, and the card always says so. Each view has one note at the top of the cards on the right, written by{" "}
            <B>Gate AI</B>, Constellation&apos;s own AI product. It reads the same measured figures the view shows and writes,
            in a few sentences, what changed and by how much — or, when nothing moved, what the view is showing right now.
          </p>
          <p>
            A note with a number the figures can&apos;t back is thrown away, so it never passes for a measurement. Pick a
            country, a hosting provider, a kind of node or a stretch of time on a chart, and its own card carries a note of
            its own.
          </p>
        </Question>

        <Question q="New to Constellation?">
          <p>
            Constellation is a distributed network whose native token is <B>$DAG</B>; the independent application networks
            that plug into it are called <em>metagraphs</em> — the same names you&apos;ll see all over this visualizer. For
            the full story, straight from the source, see the official documentation at{" "}
            <a href="https://docs.constellationnetwork.io" className="text-primary-ink underline underline-offset-2" rel="noopener">
              docs.constellationnetwork.io
            </a>
            .
          </p>
        </Question>
      </section>

      {/* No article footer at all (user, 2026-09-04, two rounds): the site footer below the
          overlay is the page's real foot — a second one inside the document was furniture. */}
    </article>
  );
}
