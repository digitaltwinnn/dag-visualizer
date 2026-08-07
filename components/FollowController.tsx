"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";
import { metagraphById } from "@/src/data/network";

// Drives the "live" (auto-advancing) snapshot card. While following, re-point the inspector at
// the latest relevant snapshot on each new global snapshot and as the anchor index fills in. The
// snapshot card is LEDGER-SCOPED (spec 2026-08-01) and opt-in (2026-08-02): following starts when
// the user asks for it (the live tip, the card's live switch) and stops on leaving the ledger,
// where the pin is cleared too (Engine.setMode). Renders nothing.
export default function FollowController() {
  useEffect(() => {
    const net = getNetwork();
    if (!net) return;
    const tick = () => {
      if (useStore.getState().following) followLatest();
    };
    let raf = 0;
    const onAnchor = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    net.on("global", tick);
    net.on("anchor", onAnchor);
    return () => {
      net.off("global", tick);
      net.off("anchor", onAnchor);
      cancelAnimationFrame(raf);
    };
  }, []);

  const mode = useStore((s) => s.mode);
  const following = useStore((s) => s.following);
  const filter = useStore((s) => s.filter);
  const setFollowing = useStore((s) => s.setFollowing);

  // Live-following (the snapshot card auto-advancing to the tip) is a *ledger* behaviour, and
  // since 2026-08-02 an OPT-IN one: entering the ledger no longer opens the snapshot card by
  // itself — the card is a picked subject like every other one (a bar, a chamber tile, or the
  // card's own live switch — `followToggleActions`). Leaving the ledger clears the card
  // (Engine.setMode) and stops following here, so the controller's tick bails gracefully.
  useEffect(() => {
    if (mode !== "ledger") setFollowing(false);
    // LIVE METAGRAPH MODE (user, 2026-08-07): arriving in the ledger with a metagraph committed
    // — or committing one while here — turns live mode ON for that network (the card chain rides
    // the heartbeat). Browsing/pinning drops it (any pin sets following false); leaving clears
    // everything, so coming back starts live again. "all"/"dag" keep the opt-in idle entry.
    else if (metagraphById(filter)) setFollowing(true);
  }, [mode, filter, setFollowing]);

  // When following (enter ledger) or the filter changes while in it, jump to the
  // latest relevant snapshot for the selection.
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
