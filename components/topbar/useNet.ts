"use client";

import { useEffect, useState } from "react";
import { NET } from "@/src/net/current";
import type { NetworkId } from "@/src/engine/config";

/** The page's network, hydration-safe — ONE home (2026-09-08, split out of NetworkSwitch for
 *  the SettingsMenu trigger). Renders mainnet until mounted, then swaps to the real network as
 *  a normal update: the server cannot know the network, and hydrating different text makes
 *  React 19 regenerate the tree — which strips the pre-paint data-net stamp off <html> and
 *  snaps the accent back to cyan (seen live 2026-08-21). suppressHydrationWarning is not the
 *  tool: it KEEPS the server value instead of patching. The one-frame MAIN face on a dev
 *  network hides under the boot overlay. */
export function useNet(): NetworkId {
  const [net, setNet] = useState<NetworkId>("mainnet");
  useEffect(() => setNet(NET), []);
  return net;
}
