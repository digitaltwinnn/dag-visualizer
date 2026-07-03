"use client";
import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { hex } from "@/src/util/format";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";

// The expanded filter body: a compact, searchable identity-selection menu. `All · whole network`
// pinned on top (the clear/default), then one row per core — a small identity-hue DOT + name +
// ticker + node count — SORTED by located-node count desc, so 0-located metagraphs sink to the
// bottom (shown greyed with their real count, never hidden). No logo tiles (they ate width and
// read as heavy chrome); the dot carries identity, matching the collapsed filter face + the rail.
// Current pick marked with a quiet left accent; hovering a row PREVIEWS its dim in the scene
// (setHoverFilter); leaving the list clears the preview.
export default function FilterPicker({ onPick }: { onPick?: () => void }) {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const setHoverFilter = useStore((s) => s.setHoverFilter);
  const metaList = useStore((s) => s.metaList);

  // Sort by located desc, so 0-located metagraphs sink to the bottom.
  const rows = useMemo(
    () => [...metaList].sort((a, b) => (b.located ?? 0) - (a.located ?? 0)),
    [metaList],
  );
  const totalNodes = useMemo(() => rows.reduce((s, m) => s + (m.located ?? 0), 0), [rows]);
  // Only count mapped cores (located > 0) — matches what's actually plotted/pickable below;
  // the 0-located rows are greyed and excluded so the headline stays consistent with the list.
  const mappedCount = useMemo(() => rows.filter((m) => (m.located ?? 0) > 0).length, [rows]);

  const pick = (id: string) => {
    setFilter(id);
    onPick?.();
  };

  return (
    <Command className="fp" onMouseLeave={() => setHoverFilter(null)}>
      <CommandInput placeholder="Search metagraphs…" />
      <CommandList>
        <CommandEmpty>No metagraph found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="all whole network"
            onSelect={() => pick("all")}
            className={filter === "all" ? "fp-row fp-active" : "fp-row"}
            onMouseEnter={() => setHoverFilter("all")}
          >
            <span className="fp-dot" style={{ background: "var(--primary)" }} />
            <span className="fp-name">All</span>
            <span className="fp-sub">whole network</span>
            <span className="fp-count">{mappedCount} · {totalNodes} nodes</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup>
          {rows.map((m) => {
            const off = (m.located ?? 0) === 0;
            const hue = hex(m.color);
            return (
              <CommandItem
                key={m.id}
                value={`${m.name} ${m.symbol ?? ""} ${m.id}`}
                onSelect={() => pick(m.id)}
                className={
                  "fp-row" + (filter === m.id ? " fp-active" : "") + (off ? " fp-off" : "")
                }
                onMouseEnter={() => setHoverFilter(m.id)}
              >
                <span className="fp-dot" style={{ background: hue }} />
                <span className="fp-name">{m.name}</span>
                <span className="fp-ticker" style={{ color: hue }}>{m.symbol}</span>
                <span className="fp-count">{off ? "0 · located" : m.located}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
