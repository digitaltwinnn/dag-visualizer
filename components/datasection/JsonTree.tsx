"use client";
// A bespoke, token-styled JSON tree — the raw layer's payload viewer (item 9, 2026-08-06;
// replaced the flat `<pre>{JSON.stringify(...)}` dump). Deliberately in-house rather than a
// dependency: the tree is ~100 lines, styles with the design tokens (mono, muted keys,
// type-tinted values, hairline indent guides), and needs no theme fighting.
//
// Objects/arrays collapse per node (chevron rows; open to one level by default), primitives
// render inline. Long strings truncate with the full value on hover — the tree is a reading
// instrument, not an export format.
//
// `cmd` is the whole-tree broadcast behind the RAW JSON header's expand/collapse-all control
// (user, 2026-09-11): a fresh object per click, so every mounted node syncs once per press —
// "expand" opens everything (children cascade as they mount under their opening parents),
// "collapse" restores the DEFAULT reading state (root open one level), never a fully shut
// root the reader would have to reopen to see anything at all.
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface JsonTreeCmd {
  mode: "expand" | "collapse";
  /** A fresh number per press — the object identity is what re-fires the sync. */
  epoch: number;
}

const MAX_STR = 120;

function Val({ v }: { v: unknown }) {
  if (v === null) return <span className="text-muted-foreground italic">null</span>;
  switch (typeof v) {
    case "string": {
      const long = v.length > MAX_STR;
      return (
        <span className="text-foreground-dim break-all" title={long ? v : undefined}>
          &quot;{long ? v.slice(0, MAX_STR) + "…" : v}&quot;
        </span>
      );
    }
    case "number":
      return <span className="text-[var(--primary)] tabular-nums">{String(v)}</span>;
    case "boolean":
      return <span className="text-warn-soft">{String(v)}</span>;
    default:
      return <span className="text-muted-foreground">{String(v)}</span>;
  }
}

function Node({ k, v, depth, cmd }: { k: string | null; v: unknown; depth: number; cmd?: JsonTreeCmd | null }) {
  const isObj = v !== null && typeof v === "object";
  const [open, setOpen] = useState(depth < 1);
  // The broadcast sync — also fires on MOUNT, which is what cascades an expand-all down the
  // tree: children mount as their parent opens and immediately obey the standing command.
  useEffect(() => {
    if (cmd) setOpen(cmd.mode === "expand" ? true : depth < 1);
  }, [cmd, depth]);
  if (!isObj) {
    return (
      <div className="flex items-baseline gap-1.5 py-px pl-[18px]">
        {k != null && <span className="text-muted-foreground flex-none">{k}:</span>}
        <Val v={v} />
      </div>
    );
  }
  const entries: [string, unknown][] = Array.isArray(v)
    ? v.map((x, i) => [String(i), x] as [string, unknown])
    : Object.entries(v as Record<string, unknown>);
  const summary = Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    // Radix owns the open state, the trigger↔panel aria pairing and the mount lifetime; the row
    // keeps every class it had. `asChild` is what preserves that — without it Radix would render
    // its own <button> around ours.
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-1 py-px w-full text-left cursor-pointer rounded-xs",
          "hover:bg-wash-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3 flex-none text-muted-foreground transition-transform duration-150", open && "rotate-90")}
        />
        {k != null && <span className="text-foreground">{k}</span>}
        <span className="text-muted-foreground">{summary}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="disclose-panel">
        <div className="ml-[5px] pl-2 border-l border-border/60">
          {entries.map(([ck, cv]) => (
            <Node key={ck} k={ck} v={cv} depth={depth + 1} cmd={cmd} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function JsonTree({ data, cmd }: { data: unknown; cmd?: JsonTreeCmd | null }) {
  return (
    <div className="font-mono text-label leading-relaxed">
      <Node k={null} v={data} depth={0} cmd={cmd} />
    </div>
  );
}
