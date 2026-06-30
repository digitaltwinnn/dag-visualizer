"use client";

import { useState } from "react";
import type { MetaCfg, MetaInfo, NodeInfo } from "@/src/data/types";

// Shared building blocks for the inspector cards (the React port of ui.js _cardBody),
// split out so each per-kind card reads as its own small file.

export const ROLE_FR: Record<string, string> = { l0: "L0", cl1: "currency-L1", dl1: "data-L1" };
export const ROLE_SHORT: Record<string, string> = { l0: "L0", cl1: "cL1", dl1: "dL1" };
export const ROLE_ORDER = ["l0", "cl1", "dl1"];

// A node's roles, falling back to its primary layer when the role list is absent.
export const rolesOf = (n: NodeInfo) => (n.roles && n.roles.length ? n.roles : [n.layer!]);

// A colour per node `state` (the lifecycle status from /cluster/info), grouped by stage so the
// status pill reads at a glance: in-consensus (green) → observing (cyan) → waiting (amber) →
// syncing (orange) → starting a session (purple) → leaving/down (red); anything else is neutral.
export function nodeStateColor(state?: string | null): string {
  switch (state) {
    case "Ready":
      return "#36e29a"; // fully in consensus
    case "Observing":
      return "#5ad1ff";
    case "WaitingForReady":
    case "WaitingForObserving":
      return "#ffd166"; // waiting to advance
    case "ReadyToDownload":
    case "WaitingForDownload":
    case "DownloadInProgress":
      return "#ff9f45"; // syncing state
    case "StartingSession":
    case "SessionStarted":
      return "#b18cff"; // (re)joining a session
    case "Leaving":
    case "Offline":
      return "#ff6b6b"; // leaving / down
    default:
      return "#9aa6c2"; // any other / unknown lifecycle state
  }
}

// One pass over a metagraph's nodes → the facts every card needs to describe it.
// (Was computed twice — once for the meta card's rows, once for the meta-node blurb.)
export interface Composition {
  present: string[]; // role keys present, in ROLE_ORDER
  hybrid: number; // nodes running more than one layer
  dedBy: Record<string, number>; // dedicated-node count per role
  parts: string[]; // e.g. ["3 hybrid", "19 dedicated data-L1"]
  total: number;
  hasCurrency: boolean; // runs a currency-L1 cluster → has a real token
}
// The token shown after a metagraph's name: its ticker, or "no token" when it runs no
// currency-L1 (a data metagraph has a symbol but no real token). Rendered as a subtle suffix.
export function metaToken(cfg: MetaCfg, mg: MetaInfo | null): string {
  const hasToken = !!mg && nodeComposition(mg.nodes).hasCurrency;
  return hasToken ? mg!.symbol || cfg.ticker || "no token" : "no token";
}

export function nodeComposition(nodes: NodeInfo[]): Composition {
  const present = ROLE_ORDER.filter((r) => nodes.some((n) => rolesOf(n).includes(r)));
  const hybrid = nodes.filter((n) => rolesOf(n).length > 1).length;
  const dedBy: Record<string, number> = {};
  for (const n of nodes) {
    const r = rolesOf(n);
    if (r.length === 1) dedBy[r[0]!] = (dedBy[r[0]!] || 0) + 1;
  }
  const parts = (hybrid ? [`${hybrid} hybrid`] : []).concat(
    present.filter((r) => dedBy[r]).map((r) => `${dedBy[r]} dedicated ${ROLE_FR[r]}`),
  );
  const total = hybrid + Object.values(dedBy).reduce((a, b) => a + b, 0);
  return { present, hybrid, dedBy, parts, total, hasCurrency: present.includes("cl1") };
}

// The layer(s) a node runs, as small squared tags (L0 / cL1 / dL1). One node can run
// several — a hybrid gets a tag each — so it's always the role *set*, never a single label.
// Shared by the metagraph node-fabric and the geo node browser so they read identically.
export function RoleTags({ roles }: { roles: string[] }) {
  return (
    <span className="role-tags">
      {roles.map((r) => (
        <span className={"role-tag role-tag--" + r} key={r}>
          {ROLE_SHORT[r] || r}
        </span>
      ))}
    </span>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

// Long description with a 3-line clamp + "Show more" (replaces ui.js _descHTML +
// the delegated toggle; here it's just local state).
export function Desc({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length <= 180) return <p>{text}</p>;
  return (
    <>
      <p className={"desc" + (open ? " expanded" : "")}>{text}</p>
      <button type="button" className="desc-more" onClick={() => setOpen((o) => !o)}>
        {open ? "Show less" : "Show more"}
      </button>
    </>
  );
}
