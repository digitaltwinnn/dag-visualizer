"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { SELECTED_ROW } from "@/components/selection";
import { useStore } from "@/src/store/store";
import { applyThemePref } from "@/components/ThemeController";
import { cn } from "@/lib/utils";
import { resolveTheme, type ThemePref } from "@/src/theme/resolve";

// The theme rows — SECTION of the SettingsMenu since 2026-09-08 (user: "the right section
// gets busy with many icons"; the standalone popover trigger this file carried retired with
// the consolidation, its history below). It began as an icon cycle button (System → Light →
// Dark) with a note that a popover was "heavy for a set-and-forget preference" — reversed
// (user, 2026-08-30): the cycle's System→Light step is a visual NO-OP whenever the OS already
// resolves light, and a click that changes nothing "feels off". A menu makes every click state
// intent, and the System row names what it currently resolves to, so the three-state model is
// visible instead of inferred.
export const THEME_FACE = { system: Monitor, light: Sun, dark: Moon } as const;
const ROWS: { id: ThemePref; name: string }[] = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export default function ThemeRows({ onDone }: { onDone: () => void }) {
  const pref = useStore((s) => s.themePref);
  // What System currently resolves to — read once per render, never subscribed: the popover
  // only renders on the client (content mounts on open), and ThemeController stays the app's
  // one matchMedia LISTENER.
  const sysTheme = resolveTheme(
    "system",
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  return (
    <>
      {ROWS.map((r) => {
        const RowIcon = THEME_FACE[r.id];
        return (
          <button
            key={r.id}
            type="button"
            aria-current={r.id === pref ? "true" : undefined}
            onClick={() => { applyThemePref(r.id); onDone(); }}
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
    </>
  );
}
