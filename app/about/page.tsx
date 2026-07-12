import type { Metadata } from "next";
import Link from "next/link";

// A plain-HTML, crawlable ABOUT page — deliberately GENERIC and non-technical (user, 2026-07-10):
// the app itself is a WebGL canvas with almost no indexable text, so this page carries the
// search-facing prose (what the visualizer is, what the Constellation Network / $DAG /
// metagraphs are in plain words). Server-rendered, static, no store/engine imports.
export const metadata: Metadata = {
  title: "About — DAG Visualizer",
  description:
    "What DAG Visualizer is: a free, browser-based 3D visualizer of the Constellation Network — " +
    "the $DAG hypergraph, its metagraphs, the validator world map, and live snapshot settlement.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  // h-screen + overflow-y-auto: `html, body` are `overflow: hidden` for the fixed-canvas app
  // (globals.css), which would CLIP this tall document page — so it scrolls in its own viewport
  // instead of relying on page scroll. Same fix on /design.
  return (
    <main className="h-screen overflow-y-auto bg-background text-foreground">
      <article className="mx-auto max-w-2xl px-6 py-16 leading-relaxed">
        <p className="text-micro tracking-caps uppercase text-muted-foreground mb-3">About</p>
        <h1 className="text-2xl font-semibold mb-6">
          DAG Visualizer — a live 3D map of the Constellation Network
        </h1>

        <p className="mb-4 text-foreground-dim">
          DAG Visualizer is a free, browser-based visualizer that shows the Constellation
          Network as a living 3D scene. It connects to the network&apos;s public APIs and renders
          what is actually happening right now — real nodes, real locations, real activity.
          Nothing is simulated or made up.
        </p>

        <h2 className="text-lg font-semibold mt-8 mb-3">What is the Constellation Network?</h2>
        <p className="mb-4 text-foreground-dim">
          Constellation is a distributed network whose native token is <strong>$DAG</strong>.
          Instead of one single chain of blocks, it is organised as a <em>hypergraph</em>: a
          base network (the Global L0) that many independent networks plug into. Validator
          nodes run all over the world and cooperate to agree on the network&apos;s state.
        </p>

        <h2 className="text-lg font-semibold mt-8 mb-3">What is a metagraph?</h2>
        <p className="mb-4 text-foreground-dim">
          A metagraph is an application network built on Constellation — each one runs its own
          nodes and produces its own ledger, and periodically anchors that ledger into the
          global network for settlement. You can think of metagraphs as independent economies
          that all settle on the same base layer.
        </p>

        <h2 className="text-lg font-semibold mt-8 mb-3">What can you explore?</h2>
        <ul className="mb-4 list-disc pl-5 text-foreground-dim space-y-2">
          <li>
            <strong>Hypergraph</strong>{" — "}the network&apos;s architecture: the Global L0 core with
            the metagraphs orbiting it, each with its own validator nodes.
          </li>
          <li>
            <strong>Geography</strong> — a world map (a holographic globe) with every validator
            node placed at its real location, and live connections travelling between them.
          </li>
          <li>
            <strong>Snapshots</strong> — the ledger over time: watch metagraph snapshots anchor
            into global snapshots as settlement happens, tick by tick.
          </li>
        </ul>

        <h2 className="text-lg font-semibold mt-8 mb-3">Is this an official Constellation site?</h2>
        <p className="mb-4 text-foreground-dim">
          No. DAG Visualizer is an unofficial, experimental community project and is not
          affiliated with the official Constellation Network. For the official site, see{" "}
          <a
            href="https://constellationnetwork.io"
            className="text-primary underline underline-offset-2"
            rel="noopener"
          >
            constellationnetwork.io
          </a>
          .
        </p>

        <p className="mt-10">
          <Link href="/" className="text-primary underline underline-offset-2">
            Open the visualizer →
          </Link>
        </p>
      </article>
    </main>
  );
}
