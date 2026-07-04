"use client";
import { useMemo } from "react";
import { useStore } from "@/src/store/store";
import { hex } from "@/src/util/format";
import { cn } from "@/lib/utils";
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

  // Shared row grid — one dot + name + (optional sub-label under the name) + a right-aligned
  // count column. The committed pick gets a quiet left accent bar; a 0-located metagraph sinks
  // visually via reduced opacity. Command's own `data-[selected=true]` hover/keyboard highlight
  // is overridden to a faint neutral wash (the bright accent fill washed the row text out to
  // unreadable).
  const rowClass = (active: boolean, off: boolean) =>
    cn(
      "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5",
      "data-[selected=true]:bg-[rgba(255,255,255,0.05)] data-[selected=true]:text-foreground",
      active && "shadow-[inset_2px_0_0_var(--sel-border)]",
      off && "opacity-45",
    );

  return (
    <Command
      className="bg-transparent max-w-[360px] **:data-[slot=command-input-wrapper]:border-b-border"
      onMouseLeave={() => setHoverFilter(null)}
    >
      <CommandInput placeholder="Search metagraphs…" />
      <CommandList className="cmd-list-scroll max-h-[320px] overscroll-contain">
        <CommandEmpty>No metagraph found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="all whole network"
            onSelect={() => pick("all")}
            className={rowClass(filter === "all", false)}
            onMouseEnter={() => setHoverFilter("all")}
          >
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: "var(--primary)" }} />
            <span className="text-[13px] text-foreground">All</span>
            <span className="col-start-2 text-muted-foreground text-[11px]">whole network</span>
            <span className="text-[11px] text-muted-foreground tabular-nums text-right">{mappedCount} · {totalNodes} nodes</span>
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
                className={rowClass(filter === m.id, off)}
                onMouseEnter={() => setHoverFilter(m.id)}
              >
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: hue }} />
                <span className="text-[13px] text-foreground">{m.name}</span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: hue }}>{m.symbol}</span>
                {off ? (
                  // Honest, non-numeric tag (Task 13): these are real metagraphs with no
                  // locatable node right now — still clickable (selectable in hyper/ledger), but
                  // a "0" count read as a broken value. A small muted lowercase tag, matching the
                  // squared tag idiom (RoleTags in inspector/parts.tsx).
                  <span className="justify-self-end rounded-[4px] px-[5px] py-[3px] text-[9.5px] leading-none tracking-[0.02em] text-muted-foreground bg-white/[0.035]">
                    not located
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground tabular-nums text-right">{m.located}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
