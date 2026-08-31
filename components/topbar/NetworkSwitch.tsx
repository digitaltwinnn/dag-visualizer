"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NET_ICONS } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SELECTED_ROW } from "@/components/selection";
import { cn } from "@/lib/utils";
import { NET } from "@/src/net/current";
import { useStore } from "@/src/store/store";
import type { NetworkId } from "@/src/engine/config";

// A network switch is a hard reload (the network is a page parameter), but the VIEW you were
// on survives it (user, 2026-08-21): each row writes a ONE-SHOT per-tab handoff as the
// navigation starts, and TopBar consumes it on the next boot through the ordinary setMode
// path — the same click a user would make, so the engine simply boots into that view.
// Deliberately NOT a URL param: this repo has no URL deep links into views, and a copied
// /?net= link stays clean; a new tab (middle-click) is a fresh entry and starts at the
// default view, which is exactly what a fresh entry is.
export const NET_SWITCH_VIEW = "dagviz:net-switch-view";

// The network switch — RIGHTMOST in the command bar (multi-network design §5): the right edge
// escalates in scope (…vitals → presentation → network), so the bar reads as a valley with the
// broadest framing at both outer edges (brand = what this app is, network = which chain). The
// face is a fixed-width short code (the filter face's own ticker grammar) with NO identity dot —
// each network's accent IS --primary, and the filter's "all" face already renders a dot at
// var(--primary) two zones left; colour rides the word instead (muted on mainnet, the live
// accent on a dev network — decisions 3(a) and 3(c) in one object at zero extra width). A
// switch is a REAL <a href> hard navigation: the network is a page parameter (src/net/current
// freezes it at first import), so the page reloads and the boot sequence replays in the new
// network's accent — that IS the transient switch signal, no new chrome. Real anchors keep
// middle-click, hover-preview, copy-link and back working (the brand link's own argument).
// ⚠️ This control never hides at any width — "which chain am I looking at" must not go
// missing — on PHONE it moves to the filter strip's second row beside the vitals (measured
// 2026-08-21: in the bar it starved the filter face to 16-36px, the word gone — the strip is
// the bar's one grow-downward mechanism and has a whole row of width). Both mounts render
// this ONE component; TopBar's wrappers pick which is visible at 700px, the same boundary
// breakpointOf owns.
const ROWS: { id: NetworkId; code: string; name: string; href: string }[] = [
  { id: "mainnet", code: "MAIN", name: "MainNet", href: "/" },
  { id: "integrationnet", code: "INT", name: "IntegrationNet", href: "/?net=integrationnet" },
  { id: "testnet", code: "TEST", name: "TestNet", href: "/?net=testnet" },
];

export default function NetworkSwitch() {
  // Render mainnet until mounted, then swap to the page's real network as a normal update.
  // The server cannot know the network, and hydrating different text/attributes makes React
  // 19 regenerate the tree — which strips the pre-paint data-net stamp off <html> and snaps
  // the accent back to cyan (seen live 2026-08-21). suppressHydrationWarning is not the tool:
  // it KEEPS the server value instead of patching. The one-frame MAIN face on a dev network
  // hides under the boot overlay.
  const [net, setNet] = useState<NetworkId>("mainnet");
  useEffect(() => setNet(NET), []);
  const cur = ROWS.find((r) => r.id === net)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Network: ${cur.name} — switch network`}
          className={cn(
            // The view switch's sizing recipe (TopBar's rounded-btn! note), flex-none so the
            // grid's right zone can never squeeze the one control that names the chain.
            "group flex flex-none items-center gap-1.5 h-9 py-1.5 px-2.5 rounded-btn! pointer-coarse:min-h-11",
            "bg-transparent border-0 hover:bg-wash-soft",
            net === "mainnet" ? "text-muted-foreground hover:text-foreground" : "text-[var(--primary)]",
          )}
        >
          {(() => { const FaceIcon = NET_ICONS[net]; return <FaceIcon aria-hidden className="size-3.5" />; })()}
          <span className="text-micro tracking-caps uppercase">{cur.code}</span>
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      {/* Spineless at rest like every card; three rows, one per network. */}
      <PopoverContent align="end" sideOffset={8} className="w-56 p-1.5">
        {ROWS.map((r) => (
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
                (globals.css), exactly so this popover can name all three hues on any network.
                The icon replaces the bare dot (user, 2026-08-30): colour + glyph, one mark. */}
            {(() => { const RowIcon = NET_ICONS[r.id]; return <RowIcon aria-hidden className="size-4 flex-none" style={{ color: `var(--net-${r.id})` }} />; })()}
            <span className="flex-1">{r.name}</span>
            <span className="text-micro tracking-caps uppercase opacity-60">{r.code}</span>
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
