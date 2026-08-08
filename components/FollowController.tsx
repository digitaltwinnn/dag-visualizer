"use client";

import { useEffect } from "react";
import { getNetwork } from "@/src/data/network";
import { useStore } from "@/src/store/store";
import { followLatest } from "@/src/data/follow";

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
    // LIVE IS THE DEFAULT on ENTRY (user, 2026-08-07): arriving in the ledger — with ANY
    // filter — starts live mode. Deliberately keyed on MODE alone (2026-08-08, review fix):
    // a FILTER dependency here fired after any pin whose actions included a filter change
    // (the release rule's step-to-"all", a cross-network pin's filter-first) and stomped the
    // fresh pin back to live. Filter COMMITS re-enter live via the executor's ordered filter
    // effect instead (applyClickActions), where a later pin action in the same click wins.
    else setFollowing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, setFollowing]);

  // When following (enter ledger) or the filter changes while in it, jump to the
  // latest relevant snapshot for the selection.
  useEffect(() => {
    if (following) followLatest();
  }, [following, filter]);

  return null;
}
