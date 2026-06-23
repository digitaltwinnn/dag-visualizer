"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import PanelHead from "@/components/PanelHead";

const STEPS = [
  {
    id: "overview",
    title: "The Hypergraph",
    body: "Constellation isn't a blockchain — it's a Hypergraph. Instead of one chain of blocks, data is organized as a DAG (Directed Acyclic Graph), letting many parts of the network process in parallel. That's how it scales horizontally and stays feeless for users.",
  },
  {
    id: "l0",
    title: "Layer 0 — the backbone",
    body: "The Global L0 is the security and settlement layer. The ~160 validators forming the shell around the core run PRO consensus to bundle activity into global snapshots — the live stream along the bottom. Each snapshot references the previous one, forming the DAG.",
  },
  {
    id: "l1",
    title: "Layer 1 — transactions & data",
    body: "L1 nodes accept transactions and application data, validate them, and feed them up into L0 to be finalized. Separating L1 from L0 means apps can move fast without bloating the secure base layer.",
  },
  {
    id: "metagraphs",
    title: "Metagraphs — networks of their own",
    body: "The orbiting clusters are metagraphs: independent, customizable networks (their own L0 + L1) that anchor their state into the Global L0 for security. Each can have its own token, rules and data — yet they all share the Hypergraph's trust.",
  },
] as const;

const TOUR_ORDER = ["overview", "l0", "l1", "metagraphs"];

// "Understand the network" — clicking a topic frames it in the 3D scene and dims the
// rest (via store.learnFocus → engine). Guided tour auto-advances through the topics.
// Hypergraph view only (ports ui.js learn panel + _startTour).
export default function LearnPanel() {
  const learnFocus = useStore((s) => s.learnFocus);
  const setLearnFocus = useStore((s) => s.setLearnFocus);
  const [collapsed, setCollapsed] = useState(false);
  const [touring, setTouring] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleStep = (id: string) => setLearnFocus(learnFocus === id ? null : id);

  // Guided tour: step through the topics, then clear.
  useEffect(() => {
    if (!touring) return;
    let i = 0;
    const next = () => {
      if (i >= TOUR_ORDER.length) {
        setLearnFocus(null);
        setTouring(false);
        return;
      }
      setLearnFocus(TOUR_ORDER[i]);
      i++;
      timer.current = setTimeout(next, 4200);
    };
    next();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [touring, setLearnFocus]);

  return (
    <aside id="learn" className={"panel" + (collapsed ? " collapsed" : "")}>
      <PanelHead
        title="Understand the network"
        eyebrow="Hypergraph · explore"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="learn-body panel-body">
        {STEPS.map((s) => (
          // role="button" rather than a real <button> — the step contains an <h3>,
          // which isn't valid inside a button. Enter/Space toggle it like a button.
          <div
            key={s.id}
            className={"learn-step" + (learnFocus === s.id ? " active" : "")}
            role="button"
            tabIndex={0}
            aria-expanded={learnFocus === s.id}
            onClick={() => toggleStep(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleStep(s.id);
              }
            }}
          >
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
      <div className="learn-nav panel-body">
        <button className="primary" onClick={() => setTouring(true)} disabled={touring}>
          ▶ Guided tour
        </button>
        <button
          onClick={() => {
            setTouring(false);
            setLearnFocus(null);
          }}
        >
          Reset view
        </button>
      </div>
    </aside>
  );
}
