"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useStore } from "@/src/store/store";
import { applyThemePref } from "@/components/ThemeController";
import { cn } from "@/lib/utils";
import type { ThemePref } from "@/src/theme/resolve";

// The theme control — an icon CYCLE button (System → Light → Dark), sitting between the
// PresentationToggle and the NetworkSwitch: a "how it looks" control beside presentation,
// while the network keeps the outermost slot. A popover was considered and dropped — two
// popovers side by side at the bar's edge is heavy for a set-and-forget preference. The icon
// renders from the STORE pref, which boots "system" on both server and client — so hydration
// sees no mismatch (the React-19 data-net trap) and the icon corrects itself when
// ThemeController adopts a stored choice on mount.
const ORDER: ThemePref[] = ["system", "light", "dark"];
const FACE = { system: Monitor, light: Sun, dark: Moon } as const;
const NAME = { system: "System", light: "Light", dark: "Dark" } as const;

export default function ThemeToggle() {
  const pref = useStore((s) => s.themePref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = FACE[pref];
  return (
    <button
      type="button"
      aria-label={`Theme: ${NAME[pref]} — switch to ${NAME[next]}`}
      onClick={() => applyThemePref(next)}
      className={cn(
        "group flex flex-none items-center h-9 py-1.5 px-2.5 rounded-btn! pointer-coarse:min-h-11",
        "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
