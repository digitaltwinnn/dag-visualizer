"use client";

import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SELECTED_ROW } from "@/components/selection";
import { useStore } from "@/src/store/store";
import { applyThemePref } from "@/components/ThemeController";
import { cn } from "@/lib/utils";
import type { ThemePref } from "@/src/theme/resolve";

// The theme control — a POPOVER MENU in the NetworkSwitch's idiom, sitting between the
// PresentationToggle and the NetworkSwitch. It began as an icon cycle button (System → Light →
// Dark) with a note here that a popover was "heavy for a set-and-forget preference" — reversed
// (user, 2026-08-30): the cycle's System→Light step is a visual NO-OP whenever the OS already
// resolves light, and a click that changes nothing "feels off". A menu makes every click state
// intent, and the System row names what it currently resolves to, so the three-state model is
// visible instead of inferred. Same corner, same idiom as the network menu one slot right.
//
// The trigger icon renders from the STORE pref, which boots "system" on both server and
// client — so hydration sees no mismatch (the React-19 data-net trap) and the icon corrects
// itself when ThemeController adopts a stored choice on mount.
const FACE = { system: Monitor, light: Sun, dark: Moon } as const;
const ROWS: { id: ThemePref; name: string }[] = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export default function ThemeToggle() {
  const pref = useStore((s) => s.themePref);
  const Icon = FACE[pref];
  // What System currently resolves to — read once per render, never subscribed: the popover
  // only renders on the client (content mounts on open), and ThemeController stays the app's
  // one matchMedia LISTENER.
  const sysTheme =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Theme: ${ROWS.find((r) => r.id === pref)!.name}`}
          className={cn(
            "group flex flex-none items-center gap-1 h-9 py-1.5 px-2.5 rounded-btn! pointer-coarse:min-h-11",
            "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
          )}
        >
          <Icon aria-hidden className="size-4" />
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      {/* Spineless at rest like every card; three rows, the current one checked. */}
      <PopoverContent align="end" sideOffset={8} className="w-56 p-1.5">
        {ROWS.map((r) => {
          const RowIcon = FACE[r.id];
          return (
            <button
              key={r.id}
              type="button"
              aria-current={r.id === pref ? "true" : undefined}
              onClick={() => applyThemePref(r.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-label",
                "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
                r.id === pref && SELECTED_ROW,
              )}
            >
              <RowIcon aria-hidden className="size-4 flex-none opacity-80" />
              <span className="flex-1 text-left">{r.name}</span>
              {/* System states its resolution — the row that would otherwise read as a dead
                  click says what picking it means right now. */}
              {r.id === "system" && (
                <span className="text-micro tracking-caps uppercase opacity-60">{sysTheme}</span>
              )}
              {r.id === pref && <Check aria-hidden className="size-3.5 flex-none opacity-70" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
