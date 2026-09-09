"use client";

import { NET_ICONS } from "@/components/icons";
import { SELECTED_ROW } from "@/components/selection";
import { cn } from "@/lib/utils";
import { useStore } from "@/src/store/store";
import { useNet } from "@/components/topbar/useNet";
import type { NetworkId } from "@/src/engine/config";

// A network switch is a hard reload (the network is a page parameter), but the VIEW you were
// on survives it (user, 2026-08-21): each row writes a ONE-SHOT per-tab handoff as the
// navigation starts, and TopBar consumes it on the next boot through the ordinary setMode
// path — the same click a user would make, so the engine simply boots into that view.
// Deliberately NOT a URL param: this repo has no URL deep links into views, and a copied
// /?net= link stays clean; a new tab (middle-click) is a fresh entry and starts at the
// default view, which is exactly what a fresh entry is.
export const NET_SWITCH_VIEW = "dagviz:net-switch-view";

// The network rows — SECTION of the SettingsMenu since 2026-09-08 (user consolidation; the
// standalone rightmost trigger retired with it). ⚠️ "Which chain am I looking at" must not go
// missing (the old face's rule): the SettingsMenu trigger carries the network CODE in the live
// accent whenever the page is NOT mainnet — absence means the default chain, presence shouts
// the dev one — so the consolidation hides the switch, never the state. A switch is a REAL
// <a href> hard navigation: the network is a page parameter (src/net/current freezes it at
// first import), so the page reloads and the boot sequence replays in the new network's
// accent — that IS the transient switch signal, no new chrome. Real anchors keep middle-click,
// hover-preview, copy-link and back working.
export const NET_ROWS: { id: NetworkId; code: string; name: string; href: string }[] = [
  { id: "mainnet", code: "MAIN", name: "MainNet", href: "/" },
  { id: "integrationnet", code: "INT", name: "IntegrationNet", href: "/?net=integrationnet" },
  { id: "testnet", code: "TEST", name: "TestNet", href: "/?net=testnet" },
];

export default function NetworkRows() {
  const net = useNet();
  return (
    <>
      {NET_ROWS.map((r) => (
        <a
          key={r.id}
          href={r.href}
          aria-current={r.id === net ? "page" : undefined}
          onClick={() => {
            try {
              sessionStorage.setItem(NET_SWITCH_VIEW, useStore.getState().mode);
            } catch {
              /* storage unavailable (private mode) — the switch still works, view resets */
            }
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-label",
            "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
            r.id === net && SELECTED_ROW,
          )}
        >
          {/* Each network's mark in its own accent token — defined in :root ALWAYS
              (globals.css), exactly so this menu can name all three hues on any network.
              The icon replaces the bare dot (user, 2026-08-30): colour + glyph, one mark. */}
          {(() => { const RowIcon = NET_ICONS[r.id]; return <RowIcon aria-hidden className="size-4 flex-none" style={{ color: `var(--net-${r.id})` }} />; })()}
          <span className="flex-1">{r.name}</span>
          <span className="text-micro tracking-caps uppercase opacity-60">{r.code}</span>
        </a>
      ))}
    </>
  );
}
